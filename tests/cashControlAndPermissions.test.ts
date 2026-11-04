import assert from 'node:assert';
import crypto from 'crypto';
import { LocalDb } from '../server/localDb.ts';
import { CashControlService } from '../server/services/cashControlService.ts';
import { EmployeeService } from '../server/services/employeeService.ts';
import { BillingService } from '../server/services/billingService.ts';
import { safeUser, getPermissionsSync } from '../server/services/authService.ts';
import type { User } from '../server/db.ts';

async function runTests() {
  console.log('🧪 Starting Cash Control & Employee Tab Permissions Test Suite...\n');

  const defaultStore = await LocalDb.getFirstStore();
  const storeId = defaultStore?.id || 'a0000000-0000-0000-0000-000000000001';
  const testUserId = crypto.randomUUID();
  const testUserName = 'Test Cashier';

  // Cleanup any lingering open sessions for clean test state
  const rawDb = LocalDb.getRawDb();
  rawDb.prepare("UPDATE cash_drawer_sessions SET status = 'CLOSED' WHERE store_id = ? AND status = 'OPEN'").run(storeId);

  // -------------------------------------------------------------
  // Test 1: Open Cash Drawer Session with Denominations
  // -------------------------------------------------------------
  console.log('Test 1: Opening cash drawer shift with ₹2,500 float');
  const openRes = await CashControlService.openSession(storeId, testUserId, testUserName, {
    openingAmount: 2500,
    denominations: { '500': 4, '200': 2, '100': 1 },
    notes: 'Morning shift opening float',
  });

  assert.strictEqual(openRes.session.status, 'OPEN', 'Session should be OPEN');
  assert.strictEqual(openRes.session.opening_amount, 2500, 'Opening amount should be 2500');
  assert.strictEqual(openRes.session.expected_amount, 2500, 'Initial expected amount should be 2500');
  assert.strictEqual(openRes.transaction.type, 'OPENING_FLOAT', 'Transaction type should be OPENING_FLOAT');
  console.log('✅ Test 1 Passed: Cash drawer session successfully opened.\n');

  // -------------------------------------------------------------
  // Test 2: Prevent duplicate open sessions
  // -------------------------------------------------------------
  console.log('Test 2: Verifying duplicate shift open is prevented');
  let duplicateError = false;
  try {
    await CashControlService.openSession(storeId, testUserId, testUserName, {
      openingAmount: 1000,
    });
  } catch (err: any) {
    duplicateError = true;
    assert.match(err.message, /already OPEN/i);
  }
  assert.strictEqual(duplicateError, true, 'Should reject opening another shift while one is active');
  console.log('✅ Test 2 Passed: Duplicate shift opening blocked.\n');

  // -------------------------------------------------------------
  // Test 3: Cash In (Float Top-up)
  // -------------------------------------------------------------
  console.log('Test 3: Adding ₹500 float (Cash In)');
  const cashInRes = await CashControlService.addCashIn(storeId, testUserId, testUserName, {
    amount: 500,
    reason: 'Change top-up for 50s and 20s',
  });

  assert.strictEqual(cashInRes.session.cash_in_amount, 500, 'Cash in should be 500');
  assert.strictEqual(cashInRes.session.expected_amount, 3000, 'Expected cash should now be 3000 (2500 + 500)');
  assert.strictEqual(cashInRes.transaction.type, 'CASH_IN', 'Transaction type should be CASH_IN');
  console.log('✅ Test 3 Passed: Cash In recorded correctly.\n');

  // -------------------------------------------------------------
  // Test 4: Record Cash Sale Integration
  // -------------------------------------------------------------
  console.log('Test 4: Recording a CASH sale in active session');
  const fakeSale: any = {
    id: crypto.randomUUID(),
    bill_number: 'TEST-BILL-001',
    total: 350,
    payment_method: 'CASH',
    items: [{ id: 'item-1', name: 'Chocolate Cone', quantity: 2 }],
  };

  await CashControlService.recordSaleIfSessionOpen(storeId, fakeSale, testUserId, testUserName);

  const currentAfterSale = await CashControlService.getCurrentSession(storeId);
  assert.strictEqual(currentAfterSale.session?.cash_sales_amount, 350, 'Cash sales should be 350');
  assert.strictEqual(currentAfterSale.session?.expected_amount, 3350, 'Expected cash should be 3350 (3000 + 350)');

  const saleTx = currentAfterSale.transactions.find(t => t.type === 'SALE');
  assert.ok(saleTx, 'Sale transaction should exist');
  assert.strictEqual(saleTx.amount, 350);
  console.log('✅ Test 4 Passed: Cash sale correctly linked to drawer session.\n');

  // -------------------------------------------------------------
  // Test 5: Non-Cash Sale (UPI) Should NOT Affect Cash Drawer
  // -------------------------------------------------------------
  console.log('Test 5: Verifying UPI/Card sale does NOT affect cash drawer');
  const upiSale: any = {
    id: crypto.randomUUID(),
    bill_number: 'TEST-UPI-002',
    total: 999,
    payment_method: 'UPI',
  };
  await CashControlService.recordSaleIfSessionOpen(storeId, upiSale, testUserId, testUserName);

  const currentAfterUpi = await CashControlService.getCurrentSession(storeId);
  assert.strictEqual(currentAfterUpi.session?.expected_amount, 3350, 'Expected cash MUST remain 3350, excluding UPI');
  console.log('✅ Test 5 Passed: Non-cash payments strictly excluded from cash drawer.\n');

  // -------------------------------------------------------------
  // Test 6: Cash Out / Counter Expense with Auto Store Expense Creation
  // -------------------------------------------------------------
  console.log('Test 6: Taking cash out (₹250 for milk) and auto-syncing with expenses');
  const cashOutRes = await CashControlService.addCashOut(storeId, testUserId, testUserName, {
    amount: 250,
    category: 'Dairy Supplies',
    reason: 'Bought 3 packets of milk for counter',
  });

  assert.strictEqual(cashOutRes.session.cash_out_amount, 250, 'Cash out should be 250');
  assert.strictEqual(cashOutRes.session.expected_amount, 3100, 'Expected cash should be 3100 (3350 - 250)');
  assert.strictEqual(cashOutRes.transaction.type, 'CASH_OUT', 'Transaction should be CASH_OUT');

  // Verify that store expense was auto-created
  assert.ok(cashOutRes.expense, 'Store expense should be created automatically');
  assert.strictEqual(cashOutRes.expense.amount, 250);
  assert.strictEqual(cashOutRes.expense.category, 'Dairy Supplies');

  // Verify in SQLite expenses table
  const expRow = rawDb.prepare('SELECT * FROM expenses WHERE id = ?').get(cashOutRes.expense.id) as any;
  assert.ok(expRow, 'Expense must exist in local SQLite expenses table');
  assert.strictEqual(Number(expRow.amount), 250);
  console.log('✅ Test 6 Passed: Counter expense deducted from drawer and created in store expenses ledger.\n');

  // -------------------------------------------------------------
  // Test 7: Close Shift & Reconciliation
  // -------------------------------------------------------------
  console.log('Test 7: Closing shift with actual counted cash of ₹3,100 (Balanced)');
  const closeRes = await CashControlService.closeSession(storeId, testUserId, testUserName, {
    closingAmount: 3100,
    denominations: { '500': 6, '100': 1 },
    notes: 'Shift balanced, all cash reconciled',
  });

  assert.strictEqual(closeRes.session.status, 'CLOSED', 'Session should now be CLOSED');
  assert.strictEqual(closeRes.session.closing_amount, 3100, 'Closing amount should be 3100');
  assert.strictEqual(closeRes.session.difference, 0, 'Difference should be 0 (Balanced)');
  assert.strictEqual(closeRes.reconciliation.status, 'BALANCED', 'Reconciliation status should be BALANCED');
  console.log('✅ Test 7 Passed: Shift closed and balanced reconciliation confirmed.\n');

  // -------------------------------------------------------------
  // Test 7b: Carry Forward - Closing amount of last session shows as opening balance of next session
  // -------------------------------------------------------------
  console.log('Test 7b: Verifying last closed session amount (₹3,100) carries forward as opening balance of next session');
  const currentStatus = await CashControlService.getCurrentSession(storeId);
  assert.strictEqual(currentStatus.session, null, 'No active session should be open');
  assert.ok(currentStatus.lastClosedSession, 'lastClosedSession must be returned');
  assert.strictEqual(currentStatus.lastClosedSession.closing_amount, 3100, 'Last closed session amount must be 3100');

  // Open next session without explicit openingAmount (auto carry-forward)
  const nextSessionRes = await CashControlService.openSession(storeId, testUserId, testUserName, {});
  assert.strictEqual(nextSessionRes.session.opening_amount, 3100, 'Next session opening amount must be 3100');
  assert.strictEqual(nextSessionRes.session.expected_amount, 3100, 'Next session expected amount must start at 3100');

  // Close next session so test leaves clean state
  await CashControlService.closeSession(storeId, testUserId, testUserName, { closingAmount: 3100 });
  console.log('✅ Test 7b Passed: Carry forward of closing balance to next shift opening verified.\n');

  // -------------------------------------------------------------
  // Test 8: Employee Tab Permissions Management
  // -------------------------------------------------------------
  console.log('Test 8: Employee Tab Permissions Configuration');
  const sampleEmployeeId = crypto.randomUUID();

  // Initial default permissions for new employee
  const initialPerms = await EmployeeService.getEmployeePermissions(storeId, sampleEmployeeId);
  assert.deepStrictEqual(
    initialPerms,
    ['billing', 'inventory', 'sales', 'movements', 'cash_control'],
    'Default permissions should contain core cashier tabs'
  );

  // Admin toggles access to only billing & cash_control
  console.log('Setting restricted permissions: ["billing", "cash_control"]');
  const updateRes = await EmployeeService.updateEmployeePermissions(
    storeId,
    testUserId,
    'Admin User',
    sampleEmployeeId,
    ['billing', 'cash_control']
  );

  assert.strictEqual(updateRes.success, true);
  assert.deepStrictEqual(updateRes.permissions, ['billing', 'cash_control']);

  // Fetch updated permissions
  const updatedPerms = await EmployeeService.getEmployeePermissions(storeId, sampleEmployeeId);
  assert.deepStrictEqual(updatedPerms, ['billing', 'cash_control'], 'Stored permissions should match update');

  // Verify getPermissionsSync & safeUser
  const testUser: User = {
    id: sampleEmployeeId,
    store_id: storeId,
    name: 'Cashier Alice',
    email: 'alice@store.com',
    password_hash: 'hash',
    salt: 'salt',
    role: 'EMPLOYEE',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const safe = safeUser(testUser);
  assert.deepStrictEqual(
    safe.permissions,
    ['billing', 'cash_control'],
    'safeUser must attach employee custom tab permissions'
  );

  // Admin and Developer users must always have all tabs
  const adminUser: User = { ...testUser, id: crypto.randomUUID(), role: 'ADMIN' };
  const safeAdmin = safeUser(adminUser);
  assert.ok(safeAdmin.permissions.includes('settings'), 'Admin must have settings tab');
  assert.ok(safeAdmin.permissions.includes('dashboard'), 'Admin must have dashboard tab');
  assert.ok(safeAdmin.permissions.includes('reports'), 'Admin must have reports tab');
  assert.ok(safeAdmin.permissions.includes('cash_control'), 'Admin must have cash_control tab');

  console.log('✅ Test 8 Passed: Employee tab permissions correctly persisted, retrieved and enforced.\n');

  console.log('🎉 ALL 8 TESTS PASSED SUCCESSFULLY! Cash Control & Employee Permissions 100% Operational.\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

