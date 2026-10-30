import { strict as assert } from 'assert';
import http from 'http';
import { startServer, EmbeddedServerInstance } from '../server/embeddedServer.ts';

const PORT = 9876;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function isServerListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(400, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function req(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runFullSoftwareAudit() {
  let serverInstance: EmbeddedServerInstance | null = null;
  const alreadyUp = await isServerListening(PORT);
  if (!alreadyUp) {
    serverInstance = await startServer({ port: PORT });
  }

  console.log('\n=============================================================');
  console.log('🚀 FRYFREEZE FULL SYSTEM & FUNCTIONALITY TEST SUITE');
  console.log('=============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  let devToken = '';
  let adminToken = '';
  let createdProductId = '';
  let createdBillToken = '';
  let createdBillNumber = '';

  // 1. AUTHENTICATION & DEVELOPER LOCAL STORAGE
  await test('1. Developer login authenticates LOCALLY without cloud reliance', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'developer', password: 'Developer@123' }),
    });
    devToken = res.data?.token || '';
    assert.equal(res.status, 200, 'Developer login should return HTTP 200');
    assert.equal(res.data.user.role, 'DEVELOPER', 'Role should be DEVELOPER');
    assert.equal(res.data.store.name, 'FryFreeze', 'Store name should be FryFreeze');
    assert.equal(res.data.store.invoice_prefix, 'FF', 'Store invoice prefix should be FF');
    assert.ok(devToken, 'Developer session token should exist');
  });

  await test('2. Cloud Admin login authenticates successfully', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'frozon', password: 'admin' }),
    });
    adminToken = res.data?.token || '';
    assert.equal(res.status, 200, 'Admin login should return HTTP 200');
    assert.equal(res.data.user.role, 'ADMIN', 'Role should be ADMIN');
    assert.ok(adminToken, 'Admin session token should exist');
  });

  await test('3. Invalid credentials correctly rejected', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'developer', password: 'WrongPassword999' }),
    });
    assert.equal(res.status, 401, 'Invalid credentials should return 401');
  });

  // 2. DEVELOPER CONSOLE & LOCAL STORAGE TEST
  await test('4. Developer Console GET /api/developer/config loads local settings', async () => {
    const res = await req('/api/developer/config', {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.database.path.includes('ledgerstore.db'), 'Database path should point to local SQLite ledgerstore.db');
    assert.ok(Array.isArray(res.data.endpoints), 'Should provide REST API catalog');
    assert.ok(res.data.endpoints.length >= 10, 'Should have at least 10 documented endpoints');
  });

  await test('5. Developer Console live cloud database ping test', async () => {
    const res = await req('/api/developer/test-connection', {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(typeof res.data.latencyMs === 'number', 'Latency in ms should be measured');
  });

  await test('6. Developer settings update saves locally to SQLite and .env', async () => {
    const res = await req('/api/developer/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({ appUrl: 'http://127.0.0.1:9876', port: 9876 }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  // 3. PRODUCT CATALOG CRUD & UNITS / PACK SIZES
  await test('7. Fetch active FryFreeze products', async () => {
    const res = await req('/api/products', {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data), 'Products should be an array');
  });

  await test('8. Create FryFreeze product with pack breakdown (box, pieces, weight)', async () => {
    const payload = {
      name: 'FryFreeze Crispy Chicken Bucket',
      sku: `FF-CHK-${Date.now().toString().slice(-4)}`,
      barcode: `890${Date.now().toString().slice(-9)}`,
      purchasePrice: 200,
      sellingPrice: 350,
      taxRate: 5,
      taxType: 'INCLUSIVE',
      currentStock: 50,
      minimumStock: 5,
      unit: 'box',
      packageInfo: '{"boxCount":10,"piecesPerBox":8,"weightPerPiece":75,"weightUnit":"g"}',
    };
    const res = await req('/api/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 201, 'Product created successfully');
    assert.equal(res.data.name, payload.name);
    assert.equal(res.data.unit, 'box');
    createdProductId = res.data.id;
  });

  // 4. POS BILLING & ORDER CHECKOUT
  await test('9. Create POS checkout invoice with real-time tax and ledger depletion', async () => {
    const salePayload = {
      items: [
        {
          productId: createdProductId,
          quantity: 2,
          unitPrice: 350,
          discount: 0,
        },
      ],
      paymentMethod: 'UPI',
      customerName: 'Loyal Foodie',
      customerPhone: '9876543210',
    };

    const res = await req('/api/sales', {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}` },
      body: JSON.stringify(salePayload),
    });

    assert.equal(res.status, 201, 'Sale should be created with 201');
    assert.ok(res.data.bill_number.startsWith('FF-'), `Bill number ${res.data.bill_number} must start with FF- prefix`);
    assert.ok(res.data.verification_token, 'Cryptographic verification token must be returned');
    assert.equal(res.data.total, 700);

    createdBillNumber = res.data.bill_number;
    createdBillToken = res.data.verification_token;
  });

  // 5. INVENTORY LEDGER STOCK DEPLETION VERIFICATION
  await test('10. Inventory stock depleted accurately in ACID SQLite database', async () => {
    const res = await req(`/api/products/${createdProductId}`, {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(res.status, 200);
    // Started at 50, sold 2 -> must be 48
    assert.equal(res.data.current_stock, 48, 'Stock should decrease from 50 to 48');
  });

  // 6. CRYPTOGRAPHIC BILL VERIFICATION PORTAL
  await test('11. Public Bill Verification with cryptographic UUID token', async () => {
    const res = await req(`/api/verify/${createdBillToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.valid, true, 'Bill verification token must be VALID');
    assert.equal(res.data.bill.billNumber, createdBillNumber);
    assert.equal(res.data.bill.total, 700);
  });

  // 7. STOCK MOVEMENTS & WASTAGE LOGGING
  await test('12. Record inventory movement adjustment (Damaged stock write-off)', async () => {
    const res = await req('/api/inventory/adjust', {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}` },
      body: JSON.stringify({
        productId: createdProductId,
        type: 'DAMAGE',
        quantityDifference: -1,
        reason: 'Kitchen handling drop',
      }),
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.movement?.id, 'Movement record should be created');
    assert.equal(res.data.product?.current_stock, 47, 'Stock should decrease from 48 to 47');
  });

  // 8. STAFF & OPERATOR MANAGEMENT (Local Developer + Cloud Admin separation)
  await test('13. Staff list hides developer profile from store Admins', async () => {
    // Store Admin request: developer profile must NOT be exposed to admins
    const adminRes = await req('/api/employees', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminRes.status, 200);
    const devExposedToAdmin = adminRes.data.find((e: any) => e.role === 'DEVELOPER');
    assert.equal(devExposedToAdmin, undefined, 'Store Admins must NOT see or know about the developer account');

    // Developer request: developer sees their profile seamlessly
    const devRes = await req('/api/employees', {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(devRes.status, 200);
    const devFound = devRes.data.find((e: any) => e.role === 'DEVELOPER');
    assert.ok(devFound, 'Developer can see their own account when logged in');
  });

  // 9. DASHBOARD SUMMARY & REPORTING
  await test('14. Dashboard summary and revenue metrics calculations', async () => {
    const res = await req('/api/dashboard/summary', {
      headers: { Authorization: `Bearer ${devToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(typeof res.data.today?.revenue === 'number', 'Today revenue must be numeric');
    assert.ok(typeof res.data.today?.billsCount === 'number', 'Today bills count must be numeric');
    assert.ok(Array.isArray(res.data.recentBills), 'Recent bills must be an array');
  });

  // 10. BULK RECEIVE & STOCK MOVEMENTS AUDIT VERIFICATION
  await test('15. Bulk Receive purchase delivery creates audit entry visible in Stock Movements', async () => {
    // 1. Get initial inventory items to find an item ID
    const itemsRes = await req('/api/inventory/items');
    assert.equal(itemsRes.status, 200);
    assert.ok(Array.isArray(itemsRes.data) && itemsRes.data.length > 0, 'Inventory items must exist');
    const targetItem = itemsRes.data[0];

    // 2. Perform Bulk Receive purchase
    const invRef = `INV-E2E-${Date.now().toString().slice(-4)}`;
    const purchaseRes = await req('/api/purchases', {
      method: 'POST',
      body: JSON.stringify({
        invoiceReference: invRef,
        lines: [
          {
            inventoryItemId: targetItem.id,
            purchaseUnit: targetItem.default_purchase_unit || 'pack',
            packsReceived: 2,
            quantityPerPackBase: 50,
            lineTotalMinor: 5000,
          },
        ],
      }),
    });
    assert.equal(purchaseRes.status, 201, 'Bulk Receive should return HTTP 201');

    // 3. Query Stock Movements
    const movRes = await req('/api/inventory/movements?limit=20', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(movRes.status, 200, 'GET /api/inventory/movements should return HTTP 200');
    assert.ok(Array.isArray(movRes.data), 'Movements should be an array');

    const matchedMovement = movRes.data.find(
      (m: any) => m.product_id === targetItem.id && m.supplier_invoice === invRef
    );
    assert.ok(matchedMovement, `Stock movement with invoice ${invRef} must be listed in Stock Movements`);
    assert.equal(matchedMovement.type, 'PURCHASE', 'Movement type must be PURCHASE');
    assert.equal(matchedMovement.quantity, 100, 'Movement quantity must equal 2 * 50 = 100');
    assert.ok(matchedMovement.after_stock > matchedMovement.before_stock, 'After stock must be greater than before stock');
  });

  // Clean up test product
  try {
    await req(`/api/products/${createdProductId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${devToken}` },
    });
  } catch (_) {}

  console.log('\n=============================================================');
  console.log(`🏁 AUDIT COMPLETE: ${passed} / ${total} FUNCTIONAL TESTS PASSED!`);
  console.log('=============================================================\n');

  if (serverInstance) {
    await serverInstance.close();
  }

  if (passed !== total) {
    process.exit(1);
  }
}

runFullSoftwareAudit().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
