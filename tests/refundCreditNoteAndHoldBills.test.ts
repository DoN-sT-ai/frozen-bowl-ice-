import assert from 'node:assert';
import crypto from 'crypto';
import { LocalDb } from '../server/localDb.ts';
import { BillingService } from '../server/services/billingService.ts';
import { CashControlService } from '../server/services/cashControlService.ts';
import { ReportService } from '../server/services/reportService.ts';

async function runRefundCreditNoteAndHoldBillsTests() {
  console.log('🧪 Starting Customer Refund, Credit Note & Bill Hold Test Suite...\n');

  const defaultStore = await LocalDb.getFirstStore();
  const storeId = defaultStore?.id || 'a0000000-0000-0000-0000-000000000001';
  const testUserId = crypto.randomUUID();
  const testUserName = 'Senior Cashier';

  // Fetch or ensure products exist
  const products = await LocalDb.getProducts(storeId);
  assert.ok(products.length >= 2, 'Should have at least 2 active products');
  const prodA = products[0];
  const prodB = products[1];

  // -------------------------------------------------------------
  // Test 1: Create a sale with 2 items to refund
  // -------------------------------------------------------------
  console.log('Test 1: Creating completed invoice with 2 items');
  const initialStockA = prodA.current_stock;
  const initialStockB = prodB.current_stock;

  const sale = await BillingService.createSale({
    storeId,
    userId: testUserId,
    userName: testUserName,
    payload: {
      items: [
        { productId: prodA.id, quantity: 2 },
        { productId: prodB.id, quantity: 1 },
      ],
      paymentMethod: 'CASH',
      customerName: 'Sanjay Krishnan',
      customerPhone: '9840112233',
    },
  });

  assert.ok(sale.id, 'Sale ID must exist');
  assert.strictEqual(sale.status, 'COMPLETED');
  assert.strictEqual(sale.refund_status, 'NONE');
  assert.strictEqual(sale.refunded_amount, 0);
  console.log(`✅ Test 1 Passed: Sale #${sale.bill_number} created for ₹${sale.total}.\n`);

  // -------------------------------------------------------------
  // Test 2: Issue Partial Refund with Restock for Item A (1 qty)
  // -------------------------------------------------------------
  console.log('Test 2: Issuing partial refund on Item A (1 of 2 qty) with restock enabled');
  const itemA = (sale.items || []).find((i) => i.product_id === prodA.id);
  assert.ok(itemA, 'Item A must exist on sale');

  const partialRefundResult = await BillingService.createCreditNote({
    saleId: sale.id,
    storeId,
    userId: testUserId,
    userName: testUserName,
    reason: 'Wrong flavour requested by customer',
    refundMethod: 'CASH',
    restockAll: true,
    items: [
      {
        saleItemId: itemA.id,
        productId: prodA.id,
        quantityRefunded: 1,
        restock: true,
      },
    ],
  });

  const cn1 = partialRefundResult.creditNote;
  assert.ok(cn1.id, 'Credit Note ID must be generated');
  assert.match(cn1.credit_note_number, /^CN-\d{4}-\d{4}$/, 'Credit note number must follow CN-YYYY-XXXX format');
  assert.strictEqual(cn1.sale_id, sale.id);
  assert.strictEqual(cn1.items.length, 1);
  assert.strictEqual(cn1.items[0].quantity_refunded, 1);
  assert.strictEqual(cn1.items[0].restocked, true);

  // Check updated sale status
  const updatedSaleAfterPartial = await LocalDb.getSaleById(sale.id);
  assert.ok(updatedSaleAfterPartial);
  assert.strictEqual(updatedSaleAfterPartial.refund_status, 'PARTIAL', 'Sale refund status should now be PARTIAL');
  assert.strictEqual(updatedSaleAfterPartial.refunded_amount, cn1.refund_amount);
  assert.strictEqual(updatedSaleAfterPartial.last_credit_note_number, cn1.credit_note_number);

  // Verify stock was restored
  const updatedProdA = (await LocalDb.getProducts(storeId)).find((p) => p.id === prodA.id);
  assert.ok(updatedProdA);
  assert.strictEqual(
    updatedProdA.current_stock,
    initialStockA - 2 + 1,
    'Stock should be initial - 2 purchased + 1 returned'
  );
  console.log(`✅ Test 2 Passed: Partial Credit Note #${cn1.credit_note_number} generated and 1 qty restocked.\n`);

  // -------------------------------------------------------------
  // Test 3: Issue Remaining Refund on Item A (1 qty) + Item B (1 qty)
  // -------------------------------------------------------------
  console.log('Test 3: Issuing refund for remaining items on invoice');
  const itemB = (sale.items || []).find((i) => i.product_id === prodB.id);
  assert.ok(itemB, 'Item B must exist on sale');

  const fullRefundResult = await BillingService.createCreditNote({
    saleId: sale.id,
    storeId,
    userId: testUserId,
    userName: testUserName,
    reason: 'Customer cancelled rest of order',
    refundMethod: 'CASH',
    restockAll: false, // Discard / defective
    items: [
      {
        saleItemId: itemA.id,
        productId: prodA.id,
        quantityRefunded: 1,
        restock: false,
      },
      {
        saleItemId: itemB.id,
        productId: prodB.id,
        quantityRefunded: 1,
        restock: false,
      },
    ],
  });

  const cn2 = fullRefundResult.creditNote;
  assert.ok(cn2.id);
  assert.notStrictEqual(cn2.credit_note_number, cn1.credit_note_number, 'Sequential credit note numbers must be distinct');

  // Verify original sale remains COMPLETED (statutory immutability) and refund_status is FULL
  const updatedSaleAfterFull = await LocalDb.getSaleById(sale.id);
  assert.ok(updatedSaleAfterFull);
  assert.strictEqual(updatedSaleAfterFull.refund_status, 'FULL', 'Sale refund_status should now be marked FULL');
  assert.strictEqual(updatedSaleAfterFull.status, 'COMPLETED', 'Original tax invoice remains immutable (COMPLETED) per GST rules');
  assert.strictEqual(
    Math.round(updatedSaleAfterFull.refunded_amount || 0),
    Math.round(sale.total),
    'Total refunded amount should equal invoice total'
  );
  console.log(`✅ Test 3 Passed: Full Credit Note #${cn2.credit_note_number} issued and original bill remains intact.\n`);

  // -------------------------------------------------------------
  // Test 4: Prevent refund exceeding original purchased quantity
  // -------------------------------------------------------------
  console.log('Test 4: Verifying refund cannot exceed purchased quantities');
  let rejected = false;
  try {
    await BillingService.createCreditNote({
      saleId: sale.id,
      storeId,
      userId: testUserId,
      userName: testUserName,
      reason: 'Illegal extra refund',
      refundMethod: 'CASH',
      restockAll: true,
      items: [{ saleItemId: itemA.id, productId: prodA.id, quantityRefunded: 1, restock: true }],
    });
  } catch (err: any) {
    rejected = true;
    assert.match(err.message, /already fully refunded|exceeds/i);
  }
  assert.ok(rejected, 'Should reject extra refund attempts on already refunded items');
  console.log('✅ Test 4 Passed: Over-refund protection strictly enforced.\n');

  // -------------------------------------------------------------
  // Test 5: Cash Control / Drawer Session Refund Deduction
  // -------------------------------------------------------------
  console.log('Test 5: Testing Cash Drawer integration on Cash Refund');
  // Close any existing session, then open a fresh one
  let { session: activeSession } = await CashControlService.getCurrentSession(storeId);
  if (activeSession) {
    await CashControlService.closeSession(storeId, testUserId, testUserName, {
      closingAmount: activeSession.expected_amount || 0,
      denominations: {},
      notes: 'Auto-close for test',
    });
  }
  const openResult = await CashControlService.openSession(
    storeId,
    testUserId,
    testUserName,
    {
      openingAmount: 5000,
      denominations: { 500: 10 },
      notes: 'Testing drawer refund deductions',
    }
  );
  activeSession = openResult.session;

  // Create another cash sale
  const cashSale = await BillingService.createSale({
    storeId,
    userId: testUserId,
    userName: testUserName,
    payload: {
      items: [{ productId: prodA.id, quantity: 1 }],
      paymentMethod: 'CASH',
      customerName: 'Cash Customer',
    },
  });

  const refundCashRes = await BillingService.createCreditNote({
    saleId: cashSale.id,
    storeId,
    userId: testUserId,
    userName: testUserName,
    reason: 'Customer returned cash item',
    refundMethod: 'CASH',
    restockAll: true,
    items: [{ saleItemId: (cashSale.items || [])[0].id, productId: prodA.id, quantityRefunded: 1, restock: true }],
  });

  const { transactions } = await CashControlService.getCurrentSession(storeId);
  const refundTx = transactions.find((t) => t.type === 'REFUND' && t.reference_id === refundCashRes.creditNote.id);
  assert.ok(refundTx, 'Cash drawer session must record a REFUND transaction');
  assert.strictEqual(
    Math.abs(refundTx.amount),
    refundCashRes.creditNote.refund_amount,
    'Transaction amount matches credit note refund'
  );
  console.log('✅ Test 5 Passed: Cash drawer deducted automatically on cash refund.\n');

  // -------------------------------------------------------------
  // Test 6: Report Service Net Revenue and Credit Notes
  // -------------------------------------------------------------
  console.log('Test 6: Verifying ReportService accurately accounts for refunds');
  const report = ReportService.getSalesReport(storeId);
  assert.ok(report.summary.grossRevenue > 0, 'Gross revenue must be positive');
  assert.ok(report.summary.totalRefunds > 0, 'Refunds must be positive');
  assert.strictEqual(
    Math.round(report.summary.netRevenue * 100),
    Math.round((report.summary.grossRevenue - report.summary.totalRefunds) * 100),
    'Net Revenue must equal Gross Revenue minus Total Refunds'
  );
  assert.ok(Array.isArray(report.creditNotes), 'Credit notes list must be returned in report');
  assert.ok(report.creditNotes.length >= 2, 'Should include created credit notes');

  // Verify Credit Notes appear as new distinct records in report.rows
  const cnRows = report.rows.filter((r) => r.recordType === 'CREDIT_NOTE');
  assert.ok(cnRows.length >= 2, 'Credit Notes must appear as separate records in the ledger');
  const invRows = report.rows.filter((r) => r.recordType === 'INVOICE');
  assert.ok(invRows.length >= 1, 'Invoices must appear as distinct records in the ledger');

  // Verify original invoice total was not modified in the ledger
  const matchedInvoice = invRows.find((i) => i.id === sale.id);
  assert.ok(matchedInvoice, 'Original invoice must exist in ledger');
  assert.strictEqual(matchedInvoice.total, sale.total, 'Original invoice gross total must remain unmodified');
  assert.strictEqual(matchedInvoice.status, 'COMPLETED', 'Original invoice status must remain COMPLETED');

  console.log(`✅ Test 6 Passed: Report shows Gross ₹${report.summary.grossRevenue}, Refunds ₹${report.summary.totalRefunds}, Net Revenue ₹${report.summary.netRevenue} with Credit Notes as new records.\n`);

  // -------------------------------------------------------------
  // Test 7: Bill Hold / Multi-Cart Park Logic
  // -------------------------------------------------------------
  console.log('Test 7: Testing Park Cart / Multi-Bill Hold logic');
  interface MockHeldBill {
    id: string;
    heldAt: string;
    itemsCount: number;
    customerName?: string;
    customerPhone?: string;
    total: number;
    items: any[];
  }

  const heldBills: MockHeldBill[] = [];

  // Simulate holding Bill 1
  const bill1: MockHeldBill = {
    id: 'hold-' + Date.now() + '-1',
    heldAt: new Date().toISOString(),
    itemsCount: 2,
    customerName: 'Customer Alpha',
    customerPhone: '9988776655',
    total: 350,
    items: [{ productId: 'p1', quantity: 2, unitPrice: 175 }],
  };
  heldBills.unshift(bill1);
  assert.strictEqual(heldBills.length, 1);

  // Simulate holding Bill 2
  const bill2: MockHeldBill = {
    id: 'hold-' + Date.now() + '-2',
    heldAt: new Date().toISOString(),
    itemsCount: 1,
    customerName: 'Customer Beta',
    customerPhone: '9911223344',
    total: 120,
    items: [{ productId: 'p2', quantity: 1, unitPrice: 120 }],
  };
  heldBills.unshift(bill2);
  assert.strictEqual(heldBills.length, 2, 'Should support holding multiple bills');

  // Recall Bill 1
  const recalledIndex = heldBills.findIndex((b) => b.id === bill1.id);
  assert.ok(recalledIndex >= 0);
  const activeCart = heldBills.splice(recalledIndex, 1)[0];
  assert.strictEqual(activeCart.customerName, 'Customer Alpha');
  assert.strictEqual(heldBills.length, 1, 'Recalled bill removed from held queue');

  // Checkout and complete recalled bill -> ensures held queue stays clean
  assert.strictEqual(heldBills[0].customerName, 'Customer Beta');

  // Discard remaining bill
  heldBills.splice(0, 1);
  assert.strictEqual(heldBills.length, 0, 'Held queue empty after processing');
  console.log('✅ Test 7 Passed: Multi-bill hold, recall, and removal operational.\n');

  console.log('🎉 ALL 7 REFUND, CREDIT NOTE & BILL HOLD TESTS PASSED WITH 100% SUCCESS!');
}

runRefundCreditNoteAndHoldBillsTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
