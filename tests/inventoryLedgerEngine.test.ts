import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { InventoryLedgerEngine } from '../server/services/inventoryLedgerEngine.ts';

function createTestEngine(): InventoryLedgerEngine {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  return new InventoryLedgerEngine(db);
}

test('Test Case 1: Shared Ingredient Depletion', () => {
  const engine = createTestEngine();

  // Setup: Inventory item Chocolate Base with 10,000 g stock
  const chocBase = engine.createInventoryItem({
    sku: 'RAW-CHOC-BASE',
    name: 'Chocolate Base',
    baseUnitCode: 'g',
    initialStockBase: 10000,
    initialUnitCostMinor: 25, // 25 paise/g
  });

  // Product A: Belgian Chocolate Scoop (recipe: 100 g)
  const productA = engine.createProduct({
    sku: 'PROD-SCOOP-CHOC',
    name: 'Belgian Chocolate Scoop',
    sellingPriceMinor: 12000, // ₹120.00
  });
  engine.createRecipeVersion({
    productId: productA.id,
    ingredients: [
      { inventoryItemId: chocBase.id, quantityPerServingBase: 100 },
    ],
  });

  // Product B: Chocolate Milkshake (recipe: 150 g)
  const productB = engine.createProduct({
    sku: 'PROD-CHOC-SHAKE',
    name: 'Chocolate Milkshake',
    sellingPriceMinor: 18000, // ₹180.00
  });
  engine.createRecipeVersion({
    productId: productB.id,
    ingredients: [
      { inventoryItemId: chocBase.id, quantityPerServingBase: 150 },
    ],
  });

  // Action: Sell 2 scoops of Product A and 1 milkshake of Product B in a single bill
  const result = engine.processPosCheckout({
    idempotencyKey: 'test-shared-depletion-01',
    cartItems: [
      { productId: productA.id, quantity: 2 },
      { productId: productB.id, quantity: 1 },
    ],
    paymentMethod: 'cash',
  });

  assert.equal(result.isDuplicate, false);

  // Expected Result:
  // Required = (2 * 100) + (1 * 150) = 350 g.
  // Resulting stock = 9,650 g.
  const updatedChocBase = engine.getInventoryItem(chocBase.id)!;
  assert.equal(updatedChocBase.current_stock_base, 9650);

  // Exactly one sale_consumption movement recorded for this item with quantityDeltaBase: -350
  const movements = engine.getMovements({
    inventoryItemId: chocBase.id,
    movementType: 'sale_consumption',
  });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantity_delta_base, -350);
  assert.equal(movements[0].resulting_quantity_base, 9650);

  // Verify Ledger Integrity Audit (Zero drift)
  const audit = engine.checkLedgerIntegrity();
  assert.equal(audit.length, 0);
});

test('Test Case 2: Modifier Stock Depletion', () => {
  const engine = createTestEngine();

  // Setup: Choco chips inventory item with 500 g stock
  const chocoChips = engine.createInventoryItem({
    sku: 'RAW-CHOCO-CHIPS',
    name: 'Choco Chips',
    baseUnitCode: 'g',
    initialStockBase: 500,
    initialUnitCostMinor: 50,
  });

  const product = engine.createProduct({
    sku: 'PROD-VANILLA-SCOOP',
    name: 'Vanilla Scoop',
    sellingPriceMinor: 10000,
  });

  const modGroup = engine.createModifierGroup({
    name: 'Toppings',
  });

  const modifier = engine.createModifier({
    modifierGroupId: modGroup.id,
    name: 'Belgian Choco Chips',
    additionalPriceMinor: 2000,
    ingredients: [
      { inventoryItemId: chocoChips.id, quantityPerModifierBase: 10 },
    ],
  });

  // Action: Sell 3 scoops with the modifier selected
  engine.processPosCheckout({
    idempotencyKey: 'test-modifier-depletion-01',
    cartItems: [
      {
        productId: product.id,
        quantity: 3,
        selectedModifiers: [{ modifierId: modifier.id, quantity: 1 }],
      },
    ],
  });

  // Expected Result:
  // Choco Chips Item stock decreases by exactly 30 g (10g * 3 scoops)
  const updatedChips = engine.getInventoryItem(chocoChips.id)!;
  assert.equal(updatedChips.current_stock_base, 470);

  // Check ledger movement
  const movements = engine.getMovements({
    inventoryItemId: chocoChips.id,
    movementType: 'sale_consumption',
  });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantity_delta_base, -30);
  assert.equal(movements[0].resulting_quantity_base, 470);
});

test('Test Case 3: Moving Weighted Average Cost Update', () => {
  const engine = createTestEngine();

  // Setup: Initial stock = 5,000 g at 20 paise/g (total value: ₹1,000 / 100,000 paise)
  const item = engine.createInventoryItem({
    sku: 'RAW-MILK-POWDER',
    name: 'Milk Powder',
    baseUnitCode: 'g',
    initialStockBase: 5000,
    initialUnitCostMinor: 20,
  });

  // Action: Receive purchase of 5,000 g at 30 paise/g (total value: ₹1,500 / 150,000 paise)
  // 1 pack of 5,000 g with total minor = 150,000 paise
  const purchase = engine.receivePurchase({
    invoiceReference: 'INV-TEST-001',
    lines: [
      {
        inventoryItemId: item.id,
        purchaseUnit: 'kg',
        packsReceived: 1,
        quantityPerPackBase: 5000,
        lineTotalMinor: 150000,
      },
    ],
  });

  assert.equal(purchase.status, 'received');

  // Expected Result:
  // New total stock = 10,000 g.
  // New Weighted Average Unit Cost = (100,000 + 150,000) / 10,000 = 25 paise/g.
  const updatedItem = engine.getInventoryItem(item.id)!;
  assert.equal(updatedItem.current_stock_base, 10000);
  assert.equal(updatedItem.weighted_average_unit_cost_minor, 25);

  // Verify Ledger Integrity Audit (Zero drift)
  const audit = engine.checkLedgerIntegrity();
  assert.equal(audit.length, 0);
});

test('Test Case 4: Idempotency Protection', () => {
  const engine = createTestEngine();

  const item = engine.createInventoryItem({
    sku: 'RAW-CONE',
    name: 'Waffle Cone',
    baseUnitCode: 'piece',
    initialStockBase: 100,
    initialUnitCostMinor: 500,
  });

  const product = engine.createProduct({
    sku: 'PROD-CONE-SCOOP',
    name: 'Waffle Cone Scoop',
    sellingPriceMinor: 8000,
  });

  engine.createRecipeVersion({
    productId: product.id,
    ingredients: [
      { inventoryItemId: item.id, quantityPerServingBase: 1 },
    ],
  });

  const payload = {
    idempotencyKey: 'idemp-duplicate-test-999',
    cartItems: [{ productId: product.id, quantity: 2 }],
  };

  // First call: Deducts stock
  const firstCall = engine.processPosCheckout(payload);
  assert.equal(firstCall.isDuplicate, false);
  assert.equal(engine.getInventoryItem(item.id)!.current_stock_base, 98);

  // Second call: Exact same payload and idempotency key
  const secondCall = engine.processPosCheckout(payload);
  assert.equal(secondCall.isDuplicate, true);
  assert.equal(secondCall.sale.id, firstCall.sale.id);

  // Stock must NOT be deducted a second time
  assert.equal(engine.getInventoryItem(item.id)!.current_stock_base, 98);

  // Only 1 sale movement should exist
  const movements = engine.getMovements({
    inventoryItemId: item.id,
    movementType: 'sale_consumption',
  });
  assert.equal(movements.length, 1);
});

test('Test Case 5: Stock Out-of-Stock Guardrail', () => {
  const engine = createTestEngine();

  // Setup: Item stock = 50 g. Product recipe requires 100 g.
  const item = engine.createInventoryItem({
    sku: 'RAW-PISTACHIO',
    name: 'Pistachio Paste',
    baseUnitCode: 'g',
    initialStockBase: 50,
    initialUnitCostMinor: 80,
  });

  const product = engine.createProduct({
    sku: 'PROD-PISTA-SCOOP',
    name: 'Pistachio Scoop',
    sellingPriceMinor: 15000,
  });

  engine.createRecipeVersion({
    productId: product.id,
    ingredients: [
      { inventoryItemId: item.id, quantityPerServingBase: 100 },
    ],
  });

  // Action: Attempt POS checkout with allowNegativeStockSales = false
  assert.throws(
    () => {
      engine.processPosCheckout({
        idempotencyKey: 'test-oos-01',
        cartItems: [{ productId: product.id, quantity: 1 }],
        allowNegativeStockSales: false,
      });
    },
    (err: any) => {
      assert.match(err.message, /Insufficient stock for "Pistachio Paste"/);
      return true;
    }
  );

  // Stock remains unchanged at 50 g
  assert.equal(engine.getInventoryItem(item.id)!.current_stock_base, 50);

  // No sale movements created
  const movements = engine.getMovements({
    inventoryItemId: item.id,
    movementType: 'sale_consumption',
  });
  assert.equal(movements.length, 0);
});

test('Test Case 6: Spoilage & Wastage Tracking', () => {
  const engine = createTestEngine();

  const milk = engine.createInventoryItem({
    sku: 'RAW-MILK',
    name: 'Fresh Dairy Milk',
    baseUnitCode: 'ml',
    initialStockBase: 5000,
    initialUnitCostMinor: 6, // 6 paise per ml (₹60/L)
  });

  // Record 1500 ml spoiled
  const wastage = engine.recordWastage({
    inventoryItemId: milk.id,
    quantityBase: 1500,
    reason: 'spoiled',
    notes: 'Freezer malfunction overnight',
  });

  assert.equal(wastage.reason, 'spoiled');
  assert.equal(engine.getInventoryItem(milk.id)!.current_stock_base, 3500);

  const movements = engine.getMovements({
    inventoryItemId: milk.id,
    movementType: 'wastage',
  });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantity_delta_base, -1500);
  assert.equal(movements[0].resulting_quantity_base, 3500);

  // Audit query must still have 0 discrepancy
  assert.equal(engine.checkLedgerIntegrity().length, 0);
});

test('Test Case 7: Physical Stock Count & Variance Reconciliation', () => {
  const engine = createTestEngine();

  const item = engine.createInventoryItem({
    sku: 'RAW-STRAWBERRY',
    name: 'Strawberry Puree',
    baseUnitCode: 'g',
    initialStockBase: 4000,
    initialUnitCostMinor: 15,
  });

  // Staff counts 3800 g (200 g shortage)
  const draftCount = engine.createStockCount({
    notes: 'Weekly Sunday physical count',
    lines: [
      {
        inventoryItemId: item.id,
        countedQuantityBase: 3800,
      },
    ],
  });

  assert.equal(draftCount.status, 'draft');
  assert.equal(draftCount.lines[0].expected_quantity_base, 4000);
  assert.equal(draftCount.lines[0].variance_quantity_base, -200);

  // Stock remains 4000 until manager approval
  assert.equal(engine.getInventoryItem(item.id)!.current_stock_base, 4000);

  // Manager approves
  const approval = engine.approveStockCount(draftCount.id, 'MANAGER_ALICE');
  assert.equal(approval.success, true);

  // Digital stock updated to counted reality (3800 g)
  assert.equal(engine.getInventoryItem(item.id)!.current_stock_base, 3800);

  const movements = engine.getMovements({
    inventoryItemId: item.id,
    movementType: 'physical_adjustment',
  });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantity_delta_base, -200);
  assert.equal(movements[0].resulting_quantity_base, 3800);

  // Audit query has 0 discrepancy
  assert.equal(engine.checkLedgerIntegrity().length, 0);
});

test('Test Case 8: Refund Restock vs Discarded Guardrail', () => {
  const engine = createTestEngine();

  const item = engine.createInventoryItem({
    sku: 'RAW-MANGO',
    name: 'Alphonso Mango Pulp',
    baseUnitCode: 'g',
    initialStockBase: 1000,
    initialUnitCostMinor: 30,
  });

  const product = engine.createProduct({
    name: 'Mango Sorbet',
    sellingPriceMinor: 14000,
  });

  engine.createRecipeVersion({
    productId: product.id,
    ingredients: [
      { inventoryItemId: item.id, quantityPerServingBase: 150 },
    ],
  });

  // Make sale of 1 sorbet (deducts 150g -> 850g)
  const checkout = engine.processPosCheckout({
    idempotencyKey: 'sale-mango-01',
    cartItems: [{ productId: product.id, quantity: 1 }],
  });

  assert.equal(engine.getInventoryItem(item.id)!.current_stock_base, 850);
  const saleItemId = checkout.sale.saleItems[0].id;

  // Scenario A: Refund with discarded (e.g. food was served) -> Stock does NOT restore
  const refundDiscarded = engine.processRefund({
    saleId: checkout.sale.id,
    amountMinor: 14000,
    reason: 'Customer disliked flavor',
    lines: [
      {
        saleItemId,
        quantityRefunded: 1,
        amountMinor: 14000,
        restockDecision: 'discarded',
      },
    ],
  });
  assert.equal(refundDiscarded.status, 'completed');
  assert.equal(engine.getInventoryItem(item.id)!.current_stock_base, 850);

  // Make another sale of 1 sorbet (deducts 150g -> 700g)
  const checkout2 = engine.processPosCheckout({
    idempotencyKey: 'sale-mango-02',
    cartItems: [{ productId: product.id, quantity: 1 }],
  });
  assert.equal(engine.getInventoryItem(item.id)!.current_stock_base, 700);
  const saleItemId2 = checkout2.sale.saleItems[0].id;

  // Scenario B: Refund with restocked (customer cancelled before scoop preparation)
  const refundRestocked = engine.processRefund({
    saleId: checkout2.sale.id,
    amountMinor: 14000,
    reason: 'Cancelled before prep',
    lines: [
      {
        saleItemId: saleItemId2,
        quantityRefunded: 1,
        amountMinor: 14000,
        restockDecision: 'restocked',
      },
    ],
  });
  assert.equal(refundRestocked.status, 'completed');
  // Stock restored by +150g (700 + 150 = 850g)
  assert.equal(engine.getInventoryItem(item.id)!.current_stock_base, 850);

  // Movement ledger has return_restock entry
  const restockMovements = engine.getMovements({
    inventoryItemId: item.id,
    movementType: 'return_restock',
  });
  assert.equal(restockMovements.length, 1);
  assert.equal(restockMovements[0].quantity_delta_base, 150);

  // Audit query passes with 0 discrepancy
  assert.equal(engine.checkLedgerIntegrity().length, 0);
});

test('Test Case 9: Ledger Integrity Detection on Unauthorized Direct DB Update', () => {
  const engine = createTestEngine();

  const item = engine.createInventoryItem({
    sku: 'RAW-ALMOND',
    name: 'Almonds',
    baseUnitCode: 'g',
    initialStockBase: 1000,
  });

  // Legitimate ledger check: 0 discrepancy
  assert.equal(engine.checkLedgerIntegrity().length, 0);

  // Simulate unauthorized direct UPDATE without ledger entry (violating system invariant)
  (engine as any).db.prepare(`
    UPDATE inventory_items SET current_stock_base = 9999 WHERE id = ?
  `).run(item.id);

  // Integrity audit query MUST catch the drift!
  const discrepancies = engine.checkLedgerIntegrity();
  assert.equal(discrepancies.length, 1);
  assert.equal(discrepancies[0].id, item.id);
  assert.equal(discrepancies[0].cached_stock, 9999);
  assert.equal(discrepancies[0].calculated_ledger_stock, 1000);
  assert.equal(discrepancies[0].drift_discrepancy, 8999);
});

