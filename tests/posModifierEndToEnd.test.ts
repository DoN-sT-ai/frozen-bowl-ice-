import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { InventoryLedgerEngine } from '../server/services/inventoryLedgerEngine.ts';
import { seedIceCreamParlourData } from '../server/services/iceCreamSeed.ts';

test('End-to-End POS checkout with Ice Cream Parlour modifiers and BOM depletion', async () => {
  // Use in-memory SQLite
  const sqlite = new DatabaseSync(':memory:');
  const engine = new InventoryLedgerEngine(sqlite);
  seedIceCreamParlourData(sqlite);

  // Check initial stock for Belgian Chocolate Base (10,000g), Waffle Cones (150 pieces), Chips (3,000g)
  const chocoBefore = sqlite.prepare("SELECT current_stock_base FROM inventory_items WHERE sku = 'ING-CHOC-01'").get() as any;
  const coneBefore = sqlite.prepare("SELECT current_stock_base FROM inventory_items WHERE sku = 'ING-CONE-01'").get() as any;
  const chipsBefore = sqlite.prepare("SELECT current_stock_base FROM inventory_items WHERE sku = 'ING-CHIP-01'").get() as any;

  assert.equal(chocoBefore.current_stock_base, 10000);
  assert.equal(coneBefore.current_stock_base, 150);
  assert.equal(chipsBefore.current_stock_base, 3000);

  // Retrieve Belgian Chocolate Scoop product and modifiers
  const scoop = sqlite.prepare("SELECT * FROM bom_products WHERE name = 'Belgian Chocolate Scoop'").get() as any;
  assert.ok(scoop);

  const coneMod = sqlite.prepare("SELECT * FROM modifiers WHERE name = 'Crispy Waffle Cone'").get() as any;
  const chipsMod = sqlite.prepare("SELECT * FROM modifiers WHERE name = 'Belgian Chocolate Chips'").get() as any;
  assert.ok(coneMod);
  assert.ok(chipsMod);

  // Execute checkout via processPosCheckout (which is the ACID financial engine)
  const checkoutResult = engine.processPosCheckout({
    idempotencyKey: 'test-pos-e2e-1',
    cashierId: 'cashier-1',
    discountMinor: 0,
    paymentMethod: 'cash',
    amountPaidMinor: 40000,
    cartItems: [
      {
        productId: scoop.id,
        quantity: 2,
        selectedModifiers: [
          { modifierId: coneMod.id, quantity: 1 },
          { modifierId: chipsMod.id, quantity: 1 },
        ],
      },
    ],
  });

  assert.ok(checkoutResult.sale);
  assert.equal(checkoutResult.sale.bill_number.startsWith('FB-'), true);

  // Stock depletion verification:
  // 2 scoops @ 100g = 200g Belgian Chocolate Base deducted -> 10000 - 200 = 9800g
  // 2 scoops * 1 cone = 2 cones deducted -> 150 - 2 = 148 pieces
  // 2 scoops * 1 chips (10g) = 20g chips deducted -> 3000 - 20 = 2980g
  const chocoAfter = sqlite.prepare("SELECT current_stock_base FROM inventory_items WHERE sku = 'ING-CHOC-01'").get() as any;
  const coneAfter = sqlite.prepare("SELECT current_stock_base FROM inventory_items WHERE sku = 'ING-CONE-01'").get() as any;
  const chipsAfter = sqlite.prepare("SELECT current_stock_base FROM inventory_items WHERE sku = 'ING-CHIP-01'").get() as any;

  assert.equal(chocoAfter.current_stock_base, 9800);
  assert.equal(coneAfter.current_stock_base, 148);
  assert.equal(chipsAfter.current_stock_base, 2980);

  // Audit Ledger Integrity check: sum(movements) MUST strictly equal current_stock
  const integrityDiscrepancies = engine.checkLedgerIntegrity();
  // An audit-clean database returns 0 items with discrepancies
  assert.equal(integrityDiscrepancies.length, 0);

  // Verify financial totals:
  // Base scoop: ₹80 (8000 paise) + Cone: ₹15 (1500 paise) + Chips: ₹15 (1500 paise) = ₹110 (11000 paise)
  // 2 items * 11000 = 22000 paise Gross
  // Tax 5% exclusive = 1100 paise
  // Total = 23100 paise (₹231.00)
  assert.equal(checkoutResult.sale.subtotal_minor, 22000);
  assert.equal(checkoutResult.sale.tax_total_minor, 1100);
  assert.equal(checkoutResult.sale.grand_total_minor, 23100);
});
