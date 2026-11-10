import { db } from '../db.ts';
import { SupabaseDb } from '../supabaseDb.ts';

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export class ReportService {
  static getSalesReport(storeId: string, options?: { from?: string; to?: string; employeeId?: string; paymentMethod?: string; status?: string }) {
    let sales = db.sales.filter(s => s.store_id === storeId);

    if (options?.from) {
      sales = sales.filter(s => s.created_at >= options.from!);
    }
    if (options?.to) {
      sales = sales.filter(s => s.created_at <= options.to! + 'T23:59:59.999Z');
    }
    if (options?.employeeId) {
      sales = sales.filter(s => s.employee_id === options.employeeId);
    }
    if (options?.paymentMethod) {
      sales = sales.filter(s => s.payment_method === options.paymentMethod);
    }
    if (options?.status) {
      sales = sales.filter(s => s.status === options.status);
    }

    // 1. Invoices (Positive immutable accounting records)
    const invoiceRows = sales.map(s => {
      const items = db.sale_items.filter(si => si.sale_id === s.id);
      const cogs = round2(items.reduce((sum, i) => sum + (i.quantity * (i.purchase_price_snapshot || 0)), 0));
      return {
        id: s.id,
        recordType: 'INVOICE' as const,
        voucherNumber: s.bill_number,
        referenceInvoiceNumber: '-',
        date: s.created_at,
        cashier: s.employee_name,
        customerName: s.customer_name || 'Walk-in Customer',
        customerPhone: s.customer_phone || '',
        subtotal: round2(s.subtotal),
        discount: round2(s.discount),
        tax: round2(s.tax),
        total: round2(s.total),
        amount: round2(s.total),
        refundStatus: s.refund_status || 'NONE',
        refundedAmount: s.refunded_amount || 0,
        netTotal: round2(s.total), // Original invoice remains immutable per statutory law
        lastCreditNoteNumber: s.last_credit_note_number,
        cogs,
        grossMargin: s.status === 'COMPLETED' ? round2(s.total - cogs) : 0,
        paymentMethod: s.payment_method,
        status: s.status,
        notes: s.notes || '',
        itemCount: items.length,
        billNumber: s.bill_number,
      };
    });

    // 2. Credit Notes (Independent negative/credit deduction records)
    let creditNotes = (db.credit_notes || []).filter(cn => cn.store_id === storeId);
    if (options?.from) {
      creditNotes = creditNotes.filter(cn => cn.created_at >= options.from!);
    }
    if (options?.to) {
      creditNotes = creditNotes.filter(cn => cn.created_at <= options.to! + 'T23:59:59.999Z');
    }

    const creditNoteRows = creditNotes.map(cn => {
      const taxAmount = round2(cn.refund_tax || 0);
      const subtotalAmount = round2(cn.refund_amount - taxAmount);
      return {
        id: cn.id,
        recordType: 'CREDIT_NOTE' as const,
        voucherNumber: cn.credit_note_number,
        referenceInvoiceNumber: cn.bill_number,
        date: cn.created_at,
        cashier: cn.created_by_name || 'Staff',
        customerName: cn.customer_name || 'Walk-in Customer',
        customerPhone: cn.customer_phone || '',
        subtotal: -subtotalAmount,
        discount: 0,
        tax: -taxAmount,
        total: -round2(cn.refund_amount),
        amount: -round2(cn.refund_amount), // Negative credit entry in ledger
        refundStatus: 'FULL',
        refundedAmount: 0,
        netTotal: -round2(cn.refund_amount),
        lastCreditNoteNumber: cn.credit_note_number,
        cogs: 0,
        grossMargin: 0,
        paymentMethod: cn.refund_method,
        status: 'ISSUED',
        notes: cn.reason || 'Customer Refund',
        itemCount: (cn.items || []).length,
        billNumber: cn.credit_note_number,
      };
    });

    // Combined unified ledger (Chronological order)
    const ledgerRows = [...invoiceRows, ...creditNoteRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const totalGrossRevenue = round2(invoiceRows.filter(r => r.status === 'COMPLETED').reduce((sum, r) => sum + r.total, 0));
    const totalRefunds = round2(creditNotes.reduce((sum, cn) => sum + cn.refund_amount, 0));
    const netRevenue = round2(Math.max(0, totalGrossRevenue - totalRefunds));
    const totalTax = round2(invoiceRows.filter(r => r.status === 'COMPLETED').reduce((sum, r) => sum + r.tax, 0));
    const totalRefundTax = round2(creditNotes.reduce((sum, cn) => sum + (cn.refund_tax || 0), 0));
    const netTax = round2(Math.max(0, totalTax - totalRefundTax));
    const totalDiscount = round2(invoiceRows.filter(r => r.status === 'COMPLETED').reduce((sum, r) => sum + r.discount, 0));

    return {
      rows: ledgerRows,
      invoices: invoiceRows,
      creditNotes,
      summary: {
        totalRevenue: netRevenue,
        grossRevenue: totalGrossRevenue,
        totalRefunds,
        netRevenue,
        totalTax: netTax,
        grossTax: totalTax,
        totalDiscount,
        totalBills: invoiceRows.length,
        completedBills: invoiceRows.filter(r => r.status === 'COMPLETED').length,
        refundedBills: invoiceRows.filter(r => r.refundStatus === 'PARTIAL' || r.refundStatus === 'FULL').length,
        voidedBills: invoiceRows.filter(r => r.status === 'VOIDED').length,
        creditNotesCount: creditNotes.length,
      },
    };
  }

  static getInventoryReport(storeId: string) {
    const products = db.products.filter(p => p.store_id === storeId);
    const categoriesMap = new Map(db.categories.map(c => [c.id, c.name]));

    let totalPurchaseValuation = 0;
    let totalRetailValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const rows = products.map(p => {
      const purchaseVal = round2(p.current_stock * p.purchase_price);
      const retailVal = round2(p.current_stock * p.selling_price);

      totalPurchaseValuation = round2(totalPurchaseValuation + purchaseVal);
      totalRetailValuation = round2(totalRetailValuation + retailVal);

      let status = 'IN_STOCK';
      if (p.current_stock <= 0) {
        status = 'OUT_OF_STOCK';
        outOfStockCount++;
      } else if (p.current_stock <= p.minimum_stock) {
        status = 'LOW_STOCK';
        lowStockCount++;
      }

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category_id ? categoriesMap.get(p.category_id) || 'Uncategorized' : 'Uncategorized',
        currentStock: p.current_stock,
        minimumStock: p.minimum_stock,
        unit: p.unit,
        purchasePrice: p.purchase_price,
        sellingPrice: p.selling_price,
        purchaseValuation: purchaseVal,
        retailValuation: retailVal,
        status,
        active: p.active,
      };
    });

    return {
      rows,
      summary: {
        totalProducts: products.length,
        totalPurchaseValuation,
        totalRetailValuation,
        estimatedGrossProfitPotential: round2(totalRetailValuation - totalPurchaseValuation),
        lowStockCount,
        outOfStockCount,
      },
    };
  }

  static getProfitReport(storeId: string, options?: { from?: string; to?: string }) {
    const salesReport = this.getSalesReport(storeId, { from: options?.from, to: options?.to, status: 'COMPLETED' });
    const revenue = salesReport.summary.totalRevenue;
    const totalCOGS = round2(salesReport.rows.reduce((sum, r) => sum + r.cogs, 0));
    const grossProfit = round2(revenue - totalCOGS);
    const grossMarginPercent = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;

    let expenses = db.expenses.filter(e => e.store_id === storeId && e.status === 'ACTIVE');
    if (options?.from) expenses = expenses.filter(e => e.expense_date >= options.from!);
    if (options?.to) expenses = expenses.filter(e => e.expense_date <= options.to!);

    const totalExpenses = round2(expenses.reduce((sum, e) => sum + e.amount, 0));
    const netProfit = round2(grossProfit - totalExpenses);
    const netMarginPercent = revenue > 0 ? round2((netProfit / revenue) * 100) : 0;

    return {
      summary: {
        revenue,
        cogs: totalCOGS,
        grossProfit,
        grossMarginPercent,
        totalExpenses,
        netProfit,
        netMarginPercent,
        billsCount: salesReport.summary.completedBills,
      },
    };
  }

  static async getEmployeeReport(storeId: string, options?: { from?: string; to?: string }) {
    let staffList: Array<{ id: string; name: string; email: string; role: string }> = [];

    // 1. Fetch cloud employees if Supabase is connected
    try {
      const cloudEmployees = await SupabaseDb.listEmployees(storeId).catch(() => []);
      if (Array.isArray(cloudEmployees) && cloudEmployees.length > 0) {
        staffList = cloudEmployees.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        }));
      }
    } catch (_) {}

    // 2. Merge local non-developer users
    const localNonDevs = db.users.filter(u =>
      u.store_id === storeId &&
      u.role !== 'DEVELOPER' &&
      (u.name || '').toLowerCase() !== 'developer' &&
      !(u.email || '').toLowerCase().includes('developer')
    );

    const knownIds = new Set(staffList.map(s => s.id));
    for (const u of localNonDevs) {
      if (!knownIds.has(u.id)) {
        staffList.push({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        });
        knownIds.add(u.id);
      }
    }

    // 3. Strict guard: Developer must never appear in staff performance
    staffList = staffList.filter(u =>
      u.role !== 'DEVELOPER' &&
      (u.name || '').toLowerCase() !== 'developer' &&
      !(u.email || '').toLowerCase().includes('developer')
    );

    let sales = db.sales.filter(s => s.store_id === storeId && s.status === 'COMPLETED');

    if (options?.from) sales = sales.filter(s => s.created_at >= options.from!);
    if (options?.to) sales = sales.filter(s => s.created_at <= options.to! + 'T23:59:59.999Z');

    const empMap = new Map<string, { employeeName: string; email: string; role: string; billsCount: number; totalSales: number; itemsSold: number }>();

    staffList.forEach(emp => {
      empMap.set(emp.id, {
        employeeName: emp.name,
        email: emp.email,
        role: emp.role,
        billsCount: 0,
        totalSales: 0,
        itemsSold: 0,
      });
    });

    sales.forEach(s => {
      // Exclude developer billed sales from staff performance table
      if ((s.employee_name || '').toLowerCase() === 'developer') {
        return;
      }

      const entry = empMap.get(s.employee_id);
      if (entry) {
        entry.billsCount += 1;
        entry.totalSales = round2(entry.totalSales + s.total);
        const items = db.sale_items.filter(si => si.sale_id === s.id);
        entry.itemsSold += items.reduce((sum, i) => sum + i.quantity, 0);
      }
    });

    return Array.from(empMap.values());
  }
}
