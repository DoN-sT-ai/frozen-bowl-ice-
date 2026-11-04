import assert from 'node:assert';
import crypto from 'crypto';
import { LocalDb } from '../server/localDb.ts';
import { BillingService } from '../server/services/billingService.ts';

async function runCustomerBillingTests() {
  console.log('🧪 Starting Customer Details & Phone Lookup Test Suite...\n');

  const defaultStore = await LocalDb.getFirstStore();
  const storeId = defaultStore?.id || 'a0000000-0000-0000-0000-000000000001';
  const testUserId = crypto.randomUUID();
  const testUserName = 'Billing Cashier';

  // Fetch or ensure a product exists to create a bill
  const products = await LocalDb.getProducts(storeId);
  assert.ok(products.length > 0, 'Should have at least one active product');
  const targetProduct = products[0];

  const testPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
  const testCustomerName = 'Priya Rajendran';
  const testCustomerGstin = '33AABCP1234F1Z9';

  // -------------------------------------------------------------
  // Test 1: Create a sale with customer phone, name and GSTIN
  // -------------------------------------------------------------
  console.log(`Test 1: Creating bill for customer "${testCustomerName}" with mobile ${testPhone}`);
  const createdSale = await BillingService.createSale({
    storeId,
    userId: testUserId,
    userName: testUserName,
    payload: {
      items: [{ productId: targetProduct.id, quantity: 2 }],
      discount: 10,
      paymentMethod: 'UPI',
      customerName: testCustomerName,
      customerPhone: testPhone,
      customerGstin: testCustomerGstin,
      notes: 'Customer requested WhatsApp receipt',
    },
  });

  assert.ok(createdSale.id, 'Sale ID must be generated');
  assert.strictEqual(createdSale.customer_name, testCustomerName, 'Customer name must be saved on sale model');
  assert.strictEqual(createdSale.customer_phone, testPhone, 'Customer phone must be saved on sale model');
  assert.strictEqual(createdSale.customer_gstin, testCustomerGstin, 'Customer GSTIN must be saved on sale model');
  console.log('✅ Test 1 Passed: Customer details captured in billing payload.\n');

  // -------------------------------------------------------------
  // Test 2: Verify persistence in raw SQLite sales table
  // -------------------------------------------------------------
  console.log('Test 2: Verifying persistence in SQLite `sales` table');
  const rawDb = LocalDb.getRawDb();
  const dbRow = rawDb.prepare('SELECT customer_name, customer_phone, customer_gstin FROM sales WHERE id = ?').get(createdSale.id) as any;
  assert.ok(dbRow, 'Sale record must exist in SQLite database');
  assert.strictEqual(dbRow.customer_name, testCustomerName, 'customer_name in SQLite matches');
  assert.strictEqual(dbRow.customer_phone, testPhone, 'customer_phone in SQLite matches');
  assert.strictEqual(dbRow.customer_gstin, testCustomerGstin, 'customer_gstin in SQLite matches');
  console.log('✅ Test 2 Passed: SQLite sales table confirms ACID persistence of customer details.\n');

  // -------------------------------------------------------------
  // Test 3: Customer Lookup by Phone
  // -------------------------------------------------------------
  console.log(`Test 3: Querying customer by phone: ${testPhone}`);
  const lookedUp = await LocalDb.getCustomerByPhone(storeId, testPhone);
  assert.ok(lookedUp, 'Lookup should return customer record');
  assert.strictEqual(lookedUp.customer_name, testCustomerName);
  assert.strictEqual(lookedUp.customer_phone, testPhone);
  assert.strictEqual(lookedUp.customer_gstin, testCustomerGstin);
  console.log('✅ Test 3 Passed: Customer lookup successfully found returning customer.\n');

  // -------------------------------------------------------------
  // Test 4: Walk-in customer (no phone or name) persists gracefully
  // -------------------------------------------------------------
  console.log('Test 4: Creating walk-in bill without customer details');
  const walkInSale = await BillingService.createSale({
    storeId,
    userId: testUserId,
    userName: testUserName,
    payload: {
      items: [{ productId: targetProduct.id, quantity: 1 }],
      paymentMethod: 'CASH',
    },
  });

  const walkInDbRow = rawDb.prepare('SELECT customer_name, customer_phone FROM sales WHERE id = ?').get(walkInSale.id) as any;
  assert.strictEqual(walkInDbRow.customer_name, null, 'Walk-in customer name is null');
  assert.strictEqual(walkInDbRow.customer_phone, null, 'Walk-in customer phone is null');
  console.log('✅ Test 4 Passed: Walk-in customers proceed without errors.\n');

  // -------------------------------------------------------------
  // Test 5: Customer Auto-Suggestion Search (`searchCustomers`)
  // -------------------------------------------------------------
  console.log('Test 5: Testing customer search suggestions while typing');
  // Substring match on phone
  const phoneSuggestions = await LocalDb.searchCustomers(storeId, testPhone.slice(0, 4), 10);
  assert.ok(phoneSuggestions.length > 0, 'Should find at least 1 customer by phone prefix');
  const foundByPhone = phoneSuggestions.find(s => s.customer_phone === testPhone);
  assert.ok(foundByPhone, 'Must suggest the created customer');
  assert.strictEqual(foundByPhone.customer_name, testCustomerName);

  // Substring match on name
  const nameSuggestions = await LocalDb.searchCustomers(storeId, 'Priya', 10);
  assert.ok(nameSuggestions.length > 0, 'Should find customer by partial name');
  assert.ok(nameSuggestions.some(s => s.customer_phone === testPhone));
  console.log('✅ Test 5 Passed: Customer search suggestions match by phone prefix and customer name.\n');

  // -------------------------------------------------------------
  // Test 6: Repeat Visitor Billing & Analytics (`getCustomerAnalytics`)
  // -------------------------------------------------------------
  console.log('Test 6: Creating 2nd bill for repeat customer and verifying analytics');
  await BillingService.createSale({
    storeId,
    userId: testUserId,
    userName: testUserName,
    payload: {
      items: [{ productId: targetProduct.id, quantity: 3 }],
      paymentMethod: 'CASH',
      customerName: testCustomerName,
      customerPhone: testPhone,
    },
  });

  const analytics = await LocalDb.getCustomerAnalytics(storeId);
  assert.ok(analytics.summary.total_unique_customers >= 1, 'Summary has total unique customers');
  assert.ok(analytics.summary.repeat_customers >= 1, 'Summary counts repeat customers with 2+ visits');
  assert.ok(analytics.summary.repeat_rate > 0, 'Repeat rate % is calculated');
  assert.strictEqual(analytics.weekly_trends.length, 7, 'Weekly trends includes 7 daily points');

  const customerInList = analytics.customers.find(c => c.customer_phone === testPhone);
  assert.ok(customerInList, 'Customer must be present in customer analytics list');
  assert.ok(customerInList.total_visits >= 2, 'Total visits must be at least 2');
  assert.strictEqual(customerInList.tier, 'REGULAR', '2 visits gives REGULAR tier');
  assert.ok(customerInList.favorite_items.length > 0, 'Favorite items array is populated');
  console.log('✅ Test 6 Passed: Customer analytics accurately aggregates repeat visits, tiers and weekly trends.\n');

  // -------------------------------------------------------------
  // Test 7: Customer Past Bills History (`getCustomerHistory`)
  // -------------------------------------------------------------
  console.log(`Test 7: Fetching bill history for phone ${testPhone}`);
  const history = await LocalDb.getCustomerHistory(storeId, testPhone);
  assert.ok(history.customer, 'Customer summary object exists');
  assert.strictEqual(history.customer.customer_phone, testPhone);
  assert.ok(history.sales.length >= 2, 'History contains both bills created for this customer');
  assert.ok(history.sales[0].items && history.sales[0].items.length > 0, 'Each sale in history includes items');
  console.log('✅ Test 7 Passed: Customer history retrieves previous invoices and items.\n');

  console.log('🎉 ALL CUSTOMER BILLING, LOOKUP & ANALYTICS TESTS PASSED SUCCESSFULLY!\n');
}

runCustomerBillingTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

