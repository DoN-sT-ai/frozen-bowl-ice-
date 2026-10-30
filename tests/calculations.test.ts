import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rupeesToPaise,
  paiseToRupees,
  formatMoney,
  calculatePackBreakdown,
  calculateReceivedBaseQuantity,
  calculateWeightedAverageCost,
  calculateLineFinancials,
} from '../src/shared/calculations.ts';

test('Currency conversions: rupeesToPaise and paiseToRupees', () => {
  assert.equal(rupeesToPaise(150.5), 15050);
  assert.equal(rupeesToPaise('₹150.50'), 15050);
  assert.equal(rupeesToPaise('0.10'), 10);
  assert.equal(rupeesToPaise(0), 0);
  assert.equal(rupeesToPaise(-25.75), -2575);

  assert.equal(paiseToRupees(15050), 150.5);
  assert.equal(paiseToRupees(1025), 10.25);
  assert.equal(paiseToRupees(0), 0);
  assert.equal(paiseToRupees(-500), -5);
});

test('Currency formatting: formatMoney', () => {
  assert.equal(formatMoney(15050), '₹150.50');
  assert.equal(formatMoney(100000), '₹1,000.00');
  assert.equal(formatMoney(0), '₹0.00');
  assert.equal(formatMoney(75), '₹0.75');
  assert.equal(formatMoney(-15050), '-₹150.50');
});

test('Pack breakdown calculations', () => {
  // 16,200g with pack size of 5,000g (e.g. 5kg tubs)
  const breakdown1 = calculatePackBreakdown(16200, 5000);
  assert.equal(breakdown1.fullPacks, 3);
  assert.equal(breakdown1.looseRemainder, 1200);
  assert.equal(breakdown1.displayString, '3 packs + 1200 loose');

  // Exact pack match
  const breakdown2 = calculatePackBreakdown(10000, 5000);
  assert.equal(breakdown2.fullPacks, 2);
  assert.equal(breakdown2.looseRemainder, 0);
  assert.equal(breakdown2.displayString, '2 packs');

  // Single pack
  const breakdown3 = calculatePackBreakdown(5000, 5000);
  assert.equal(breakdown3.fullPacks, 1);
  assert.equal(breakdown3.looseRemainder, 0);
  assert.equal(breakdown3.displayString, '1 pack');

  // Zero stock
  const breakdown4 = calculatePackBreakdown(0, 5000);
  assert.equal(breakdown4.fullPacks, 0);
  assert.equal(breakdown4.looseRemainder, 0);
  assert.equal(breakdown4.displayString, '0 packs');
});

test('Received base quantity calculation', () => {
  // 4 tubs of 5,000g
  assert.equal(calculateReceivedBaseQuantity(4, 5000), 20000);
  // Zero handling
  assert.equal(calculateReceivedBaseQuantity(0, 5000), 0);
  assert.equal(calculateReceivedBaseQuantity(2, 0), 2); // Minimum pack size 1
});

test('Moving Weighted Average Costing (WAC)', () => {
  // Specification Test Case 3:
  // Initial stock: 5,000g at 20 paise/g (total: 100,000 paise)
  // Received: 5,000g at 30 paise/g (total: 150,000 paise)
  // New WAC: (100,000 + 150,000) / 10,000 = 25 paise/g
  const wac = calculateWeightedAverageCost(5000, 20, 5000, 30);
  assert.equal(wac, 25);

  // If initial stock is 0, new WAC is received cost
  const wacZero = calculateWeightedAverageCost(0, 0, 4000, 15);
  assert.equal(wacZero, 15);

  // Unequal quantities
  // 1,000g @ 10 paise = 10,000
  // 3,000g @ 20 paise = 60,000
  // Total: 70,000 / 4,000 = 17.5 -> 18 paise rounded
  assert.equal(calculateWeightedAverageCost(1000, 10, 3000, 20), 18);
});

test('Line Financial Calculations: Tax Exclusive', () => {
  // Unit price: ₹100.00 (10000 paise), Qty: 2, Discount: ₹20.00 (2000 paise), Tax: 5%
  // Gross = 20,000
  // Taxable = 18,000
  // Tax = round(18,000 * 0.05) = 900
  // FinalLineTotal = 18,900
  const result = calculateLineFinancials({
    unitPriceMinor: 10000,
    quantity: 2,
    discountMinor: 2000,
    taxRatePercent: 5.0,
    isTaxInclusive: false,
  });

  assert.equal(result.grossLineMinor, 20000);
  assert.equal(result.discountMinor, 2000);
  assert.equal(result.taxableAmountMinor, 18000);
  assert.equal(result.taxAmountMinor, 900);
  assert.equal(result.finalLineTotalMinor, 18900);
});

test('Line Financial Calculations: Tax Inclusive', () => {
  // Selling price ₹105.00 (10500 paise), Qty: 1, Discount: 0, Tax: 5%
  // Gross = 10500
  // Discounted = 10500
  // Taxable = round(10500 / 1.05) = 10000
  // Tax = 10500 - 10000 = 500
  // FinalLineTotal = 10500
  const result = calculateLineFinancials({
    unitPriceMinor: 10500,
    quantity: 1,
    discountMinor: 0,
    taxRatePercent: 5.0,
    isTaxInclusive: true,
  });

  assert.equal(result.grossLineMinor, 10500);
  assert.equal(result.discountMinor, 0);
  assert.equal(result.taxableAmountMinor, 10000);
  assert.equal(result.taxAmountMinor, 500);
  assert.equal(result.finalLineTotalMinor, 10500);
});

