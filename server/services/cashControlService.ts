import crypto from 'crypto';
import type { CashDrawerSession, CashDrawerTransaction, DenominationCounts, Sale } from '../db.ts';
import { LocalDb } from '../localDb.ts';
import { AuditService } from './auditService.ts';
import { ExpenseService } from './employeeService.ts';

export class CashControlService {
  /**
   * Get active open cash drawer session for the store, along with all shift transactions and last closed session.
   */
  static async getCurrentSession(storeId: string): Promise<{
    session: CashDrawerSession | null;
    transactions: CashDrawerTransaction[];
    lastClosedSession: CashDrawerSession | null;
  }> {
    const session = await LocalDb.getActiveCashDrawerSession(storeId);
    const lastClosedSession = await LocalDb.getLastClosedCashDrawerSession(storeId);

    if (!session) {
      return { session: null, transactions: [], lastClosedSession };
    }

    const transactions = await LocalDb.getCashDrawerTransactions(session.id);

    // Compute live expected amount:
    // Opening float + Cash Sales + Cash In - Cash Out (Expenses)
    const expected = Number(
      (
        Number(session.opening_amount || 0) +
        Number(session.cash_sales_amount || 0) +
        Number(session.cash_in_amount || 0) -
        Number(session.cash_out_amount || 0)
      ).toFixed(2)
    );

    if (session.expected_amount !== expected) {
      await LocalDb.updateCashDrawerSession(session.id, { expected_amount: expected });
      session.expected_amount = expected;
    }

    return { session, transactions, lastClosedSession };
  }

  /**
   * Open a new cash drawer shift session.
   * If openingAmount is not provided, it automatically inherits the closing balance of the last session.
   */
  static async openSession(
    storeId: string,
    userId: string,
    userName: string,
    payload: {
      openingAmount?: number;
      denominations?: DenominationCounts;
      notes?: string;
    }
  ): Promise<{
    session: CashDrawerSession;
    transaction: CashDrawerTransaction;
  }> {
    const existing = await LocalDb.getActiveCashDrawerSession(storeId);
    if (existing) {
      throw new Error('A cash drawer shift is already OPEN for this counter. Please close the active shift first.');
    }

    const lastClosed = await LocalDb.getLastClosedCashDrawerSession(storeId);
    let openingAmount = payload.openingAmount !== undefined && payload.openingAmount !== null
      ? Number(payload.openingAmount)
      : (lastClosed ? Number(lastClosed.closing_amount || 0) : 0);

    if (isNaN(openingAmount) || openingAmount < 0) {
      throw new Error('Opening cash amount must be zero or a positive number');
    }

    let denominations = payload.denominations;
    if (!denominations && lastClosed?.closing_denominations_json) {
      try {
        denominations = JSON.parse(lastClosed.closing_denominations_json);
      } catch (_) {}
    }

    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const denominationsJson = JSON.stringify(denominations || {});

    const session = await LocalDb.createCashDrawerSession({
      id: sessionId,
      store_id: storeId,
      opened_by: userId,
      opened_by_name: userName || 'Cashier',
      opened_at: now,
      opening_amount: openingAmount,
      opening_denominations_json: denominationsJson,
      opening_notes: payload.notes?.trim() || (lastClosed ? `Carried forward from last shift (₹${Number(lastClosed.closing_amount || 0).toFixed(2)})` : ''),
      expected_amount: openingAmount,
      cash_sales_amount: 0,
      cash_in_amount: 0,
      cash_out_amount: 0,
      difference: 0,
      status: 'OPEN',
    } as any);

    const transaction = await LocalDb.createCashDrawerTransaction({
      session_id: session.id,
      store_id: storeId,
      type: 'OPENING_FLOAT',
      amount: openingAmount,
      category: 'Float',
      reason: lastClosed ? `Shift Opening Float (Carried forward from last shift ₹${Number(lastClosed.closing_amount || 0).toFixed(2)})` : 'Shift Opening Float',
      performed_by: userId,
      performed_by_name: userName || 'Cashier',
      notes: payload.notes?.trim() || 'Initial cash in counter drawer',
    });

    AuditService.log({
      storeId,
      userId,
      userName,
      action: 'CASH_DRAWER_OPENED',
      entityType: 'CASH_DRAWER',
      entityId: session.id,
      afterData: {
        openingAmount,
        denominations,
        notes: payload.notes,
        carriedForwardFromSessionId: lastClosed?.id,
      },
    });

    return { session, transaction };
  }

  /**
   * Add cash to counter drawer (Float top-up).
   */
  static async addCashIn(
    storeId: string,
    userId: string,
    userName: string,
    payload: {
      amount: number;
      reason?: string;
      notes?: string;
    }
  ): Promise<{
    session: CashDrawerSession;
    transaction: CashDrawerTransaction;
  }> {
    const session = await LocalDb.getActiveCashDrawerSession(storeId);
    if (!session) {
      throw new Error('No active cash drawer session is open. Please open a shift first.');
    }

    const amt = Number(payload.amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error('Cash In amount must be greater than zero');
    }

    const newCashIn = Number((Number(session.cash_in_amount || 0) + amt).toFixed(2));
    const newExpected = Number((Number(session.expected_amount || 0) + amt).toFixed(2));

    const updatedSession = await LocalDb.updateCashDrawerSession(session.id, {
      cash_in_amount: newCashIn,
      expected_amount: newExpected,
    });

    const transaction = await LocalDb.createCashDrawerTransaction({
      session_id: session.id,
      store_id: storeId,
      type: 'CASH_IN',
      amount: amt,
      category: 'Float In',
      reason: payload.reason?.trim() || 'Cash Float Addition',
      performed_by: userId,
      performed_by_name: userName || 'Staff',
      notes: payload.notes?.trim() || '',
    });

    AuditService.log({
      storeId,
      userId,
      userName,
      action: 'CASH_DRAWER_CASH_IN',
      entityType: 'CASH_DRAWER',
      entityId: session.id,
      afterData: { amount: amt, reason: payload.reason, newExpected },
    });

    return { session: updatedSession, transaction };
  }

  /**
   * Remove cash from counter drawer for expenses (Petty cash / vendor payments / local supplies).
   * Automatically creates an entry in the store's expenses table.
   */
  static async addCashOut(
    storeId: string,
    userId: string,
    userName: string,
    payload: {
      amount: number;
      category?: string;
      reason?: string;
      notes?: string;
    }
  ): Promise<{
    session: CashDrawerSession;
    transaction: CashDrawerTransaction;
    expense?: any;
  }> {
    const session = await LocalDb.getActiveCashDrawerSession(storeId);
    if (!session) {
      throw new Error('No active cash drawer session is open. Please open a shift first.');
    }

    const amt = Number(payload.amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error('Cash Out amount must be greater than zero');
    }

    const currentExpected = Number(session.expected_amount || 0);
    if (amt > currentExpected) {
      // Warn but don't strictly prevent if emergency, though generally we should validate
      console.warn(`[CashControl] Cash out ₹${amt} exceeds expected counter cash ₹${currentExpected}`);
    }

    const newCashOut = Number((Number(session.cash_out_amount || 0) + amt).toFixed(2));
    const newExpected = Number((Number(session.expected_amount || 0) - amt).toFixed(2));

    const updatedSession = await LocalDb.updateCashDrawerSession(session.id, {
      cash_out_amount: newCashOut,
      expected_amount: newExpected,
    });

    const category = payload.category?.trim() || 'Counter Expense';
    const reason = payload.reason?.trim() || 'Cash Payout from Drawer';

    // 1. Record drawer transaction
    const transaction = await LocalDb.createCashDrawerTransaction({
      session_id: session.id,
      store_id: storeId,
      type: 'CASH_OUT',
      amount: amt,
      category,
      reason,
      performed_by: userId,
      performed_by_name: userName || 'Staff',
      notes: payload.notes?.trim() || '',
    });

    // 2. Automatically sync with store expenses ledger
    let expenseRecord = null;
    try {
      expenseRecord = await ExpenseService.createExpense(storeId, userId, userName, {
        category,
        amount: amt,
        description: `[Counter Drawer Cash Out] ${reason}${payload.notes ? ` - ${payload.notes}` : ''}`,
        expenseDate: new Date().toISOString().split('T')[0],
      });
    } catch (expErr) {
      console.error('[CashControl] Failed to auto-create expense record:', expErr);
    }

    AuditService.log({
      storeId,
      userId,
      userName,
      action: 'CASH_DRAWER_CASH_OUT',
      entityType: 'CASH_DRAWER',
      entityId: session.id,
      afterData: {
        amount: amt,
        category,
        reason,
        notes: payload.notes,
        newExpected,
        expenseId: expenseRecord?.id,
      },
    });

    return { session: updatedSession, transaction, expense: expenseRecord };
  }

  /**
   * Record a CASH sale in the active drawer session.
   * Called automatically from billingService.ts when payment_method === 'CASH'.
   */
  static async recordSaleIfSessionOpen(
    storeId: string,
    sale: Sale,
    userId: string,
    userName: string
  ): Promise<void> {
    if (sale.payment_method !== 'CASH') return;

    try {
      const session = await LocalDb.getActiveCashDrawerSession(storeId);
      if (!session) return; // If shift is not opened, don't block sale

      const saleAmount = Number(sale.total) || 0;
      const newCashSales = Number((Number(session.cash_sales_amount || 0) + saleAmount).toFixed(2));
      const newExpected = Number((Number(session.expected_amount || 0) + saleAmount).toFixed(2));

      await LocalDb.updateCashDrawerSession(session.id, {
        cash_sales_amount: newCashSales,
        expected_amount: newExpected,
      });

      await LocalDb.createCashDrawerTransaction({
        session_id: session.id,
        store_id: storeId,
        type: 'SALE',
        amount: saleAmount,
        category: 'Cash Sale',
        reason: `Bill #${sale.bill_number}`,
        reference_id: sale.id,
        performed_by: userId,
        performed_by_name: userName || 'Cashier',
        notes: `Items: ${sale.items?.length || 1}`,
      });
    } catch (err) {
      console.error('[CashControl] Error recording cash sale to drawer session:', err);
    }
  }

  /**
   * Record a CASH refund/void in the active drawer session.
   */
  static async recordVoidIfSessionOpen(
    storeId: string,
    sale: Sale,
    userId: string,
    userName: string,
    reason: string
  ): Promise<void> {
    if (sale.payment_method !== 'CASH') return;

    try {
      const session = await LocalDb.getActiveCashDrawerSession(storeId);
      if (!session) return;

      const refundAmount = Number(sale.total) || 0;
      const newCashSales = Number((Number(session.cash_sales_amount || 0) - refundAmount).toFixed(2));
      const newExpected = Number((Number(session.expected_amount || 0) - refundAmount).toFixed(2));

      await LocalDb.updateCashDrawerSession(session.id, {
        cash_sales_amount: newCashSales,
        expected_amount: newExpected,
      });

      await LocalDb.createCashDrawerTransaction({
        session_id: session.id,
        store_id: storeId,
        type: 'REFUND',
        amount: -refundAmount,
        category: 'Cash Refund',
        reason: `Voided Bill #${sale.bill_number}: ${reason || 'Customer refund'}`,
        reference_id: sale.id,
        performed_by: userId,
        performed_by_name: userName || 'Cashier',
        notes: `Bill #${sale.bill_number}`,
      });
    } catch (err) {
      console.error('[CashControl] Error recording cash void to drawer session:', err);
    }
  }

  /**
   * Record a CASH refund / Credit Note payout in the active drawer session.
   */
  static async recordRefundIfSessionOpen(
    storeId: string,
    creditNote: { id: string; credit_note_number: string; bill_number: string; refund_amount: number; refund_method: string; reason: string },
    userId: string,
    userName: string
  ): Promise<void> {
    if (creditNote.refund_method !== 'CASH') return;

    try {
      const session = await LocalDb.getActiveCashDrawerSession(storeId);
      if (!session) return;

      const refundAmount = Number(creditNote.refund_amount) || 0;
      const newCashSales = Number((Number(session.cash_sales_amount || 0) - refundAmount).toFixed(2));
      const newExpected = Number((Number(session.expected_amount || 0) - refundAmount).toFixed(2));

      await LocalDb.updateCashDrawerSession(session.id, {
        cash_sales_amount: newCashSales,
        expected_amount: newExpected,
      });

      await LocalDb.createCashDrawerTransaction({
        session_id: session.id,
        store_id: storeId,
        type: 'REFUND',
        amount: -refundAmount,
        category: 'Cash Refund',
        reason: `Credit Note #${creditNote.credit_note_number} (Bill #${creditNote.bill_number}): ${creditNote.reason || 'Customer refund'}`,
        reference_id: creditNote.id,
        performed_by: userId,
        performed_by_name: userName || 'Cashier',
        notes: `Credit Note #${creditNote.credit_note_number}`,
      });
    } catch (err) {
      console.error('[CashControl] Error recording credit note cash refund to drawer session:', err);
    }
  }

  /**
   * End shift and close the cash drawer with actual physical denomination count.
   */
  static async closeSession(
    storeId: string,
    userId: string,
    userName: string,
    payload: {
      closingAmount: number;
      denominations?: DenominationCounts;
      notes?: string;
    }
  ): Promise<{
    session: CashDrawerSession;
    reconciliation: {
      expectedAmount: number;
      closingAmount: number;
      difference: number;
      status: 'BALANCED' | 'SURPLUS' | 'SHORTAGE';
    };
  }> {
    const session = await LocalDb.getActiveCashDrawerSession(storeId);
    if (!session) {
      throw new Error('No active cash drawer session is open to close.');
    }

    const countedAmount = Number(payload.closingAmount);
    if (isNaN(countedAmount) || countedAmount < 0) {
      throw new Error('Closing cash amount must be zero or a positive number');
    }

    const now = new Date().toISOString();
    const expected = Number(
      (
        Number(session.opening_amount || 0) +
        Number(session.cash_sales_amount || 0) +
        Number(session.cash_in_amount || 0) -
        Number(session.cash_out_amount || 0)
      ).toFixed(2)
    );

    const difference = Number((countedAmount - expected).toFixed(2));
    const denominationsJson = JSON.stringify(payload.denominations || {});

    const closedSession = await LocalDb.updateCashDrawerSession(session.id, {
      closed_by: userId,
      closed_by_name: userName || 'Cashier',
      closed_at: now,
      closing_amount: countedAmount,
      closing_denominations_json: denominationsJson,
      closing_notes: payload.notes?.trim() || '',
      expected_amount: expected,
      difference,
      status: 'CLOSED',
    });

    const reconStatus = difference === 0 ? 'BALANCED' : difference > 0 ? 'SURPLUS' : 'SHORTAGE';

    AuditService.log({
      storeId,
      userId,
      userName,
      action: 'CASH_DRAWER_CLOSED',
      entityType: 'CASH_DRAWER',
      entityId: session.id,
      afterData: {
        expected,
        countedAmount,
        difference,
        status: reconStatus,
        denominations: payload.denominations,
        notes: payload.notes,
      },
    });

    return {
      session: closedSession,
      reconciliation: {
        expectedAmount: expected,
        closingAmount: countedAmount,
        difference,
        status: reconStatus,
      },
    };
  }

  /**
   * List past shift sessions for audit and reconciliation logs.
   */
  static async listSessions(storeId: string, limit = 50): Promise<CashDrawerSession[]> {
    return LocalDb.listCashDrawerSessions(storeId, limit);
  }

  /**
   * Get full session details by ID, including its transaction history.
   */
  static async getSessionDetails(storeId: string, sessionId: string): Promise<{
    session: CashDrawerSession | null;
    transactions: CashDrawerTransaction[];
  }> {
    const session = await LocalDb.getCashDrawerSession(sessionId);
    if (!session || session.store_id !== storeId) {
      return { session: null, transactions: [] };
    }
    const transactions = await LocalDb.getCashDrawerTransactions(sessionId);
    return { session, transactions };
  }
}

