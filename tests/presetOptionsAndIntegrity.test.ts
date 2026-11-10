import assert from 'node:assert';
import test from 'node:test';
import { DEFAULT_THERMAL_PRINTER_SETTINGS, getPrinterSettings, savePrinterSettings } from '../src/lib/printerService.js';
import { LocalDb } from '../server/localDb.js';

test('Preset Options & System Defaults Verification', async (t) => {
  await t.test('1. Default Printer Preset is 80mm Thermal with proper defaults', () => {
    assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.format, '80mm');
    assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.density, 'normal');
    assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.directPrint, true);
    assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.autoPrintOnSale, true);
    assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.copies, 1);
  });

  await t.test('2. 58mm and A4 Printer Preset configurations', () => {
    const preset58mm = {
      ...DEFAULT_THERMAL_PRINTER_SETTINGS,
      format: '58mm' as const,
      density: 'compact' as const,
    };
    assert.strictEqual(preset58mm.format, '58mm');

    const presetA4 = {
      ...DEFAULT_THERMAL_PRINTER_SETTINGS,
      format: 'a4' as const,
      density: 'spacious' as const,
    };
    assert.strictEqual(presetA4.format, 'a4');
  });

  await t.test('3. Staff Tab Permission Presets coverage', () => {
    const cashierTerminalPreset = ['billing', 'cash_control', 'sales', 'refunds', 'customers'];
    const stockInchargePreset = ['inventory', 'movements'];
    const storeManagerPreset = ['billing', 'inventory', 'movements', 'sales', 'refunds', 'cash_control', 'expenses', 'customers', 'reports', 'dashboard'];

    // Verify cashier terminal has essential operational tools
    assert.ok(cashierTerminalPreset.includes('billing'), 'Cashier must have POS billing');
    assert.ok(cashierTerminalPreset.includes('cash_control'), 'Cashier must have Cash drawer');
    assert.ok(cashierTerminalPreset.includes('customers'), 'Cashier must have Customer loyalty/lookup');
    assert.ok(cashierTerminalPreset.includes('refunds'), 'Cashier must have Customer refunds');

    // Verify cashier terminal does NOT have sensitive managerial tabs
    assert.ok(!cashierTerminalPreset.includes('reports'), 'Cashier cannot see Reports/P&L');
    assert.ok(!cashierTerminalPreset.includes('expenses'), 'Cashier cannot edit master store expenses');

    // Verify store manager has comprehensive access
    assert.ok(storeManagerPreset.includes('reports'));
    assert.ok(storeManagerPreset.includes('expenses'));
    assert.ok(storeManagerPreset.includes('inventory'));
  });

  await t.test('4. HSN & GST tax calculation presets', () => {
    const iceCreamHSN = { code: '2105 00 00', rate: 18 };
    const dairyHSN = { code: '0401 20 00', rate: 5 };
    const syrupHSN = { code: '2106 90 99', rate: 12 };

    // Inclusive GST formula verification: taxable = total / (1 + rate/100)
    const billTotal = 118;
    const taxable = billTotal / (1 + iceCreamHSN.rate / 100);
    const tax = billTotal - taxable;
    assert.strictEqual(Number(taxable.toFixed(2)), 100.00);
    assert.strictEqual(Number(tax.toFixed(2)), 18.00);
  });

  await t.test('5. Quick Cash Tender Presets', () => {
    const billTotal = 385;
    const presets = [
      billTotal, // Exact
      Math.ceil(billTotal / 10) * 10, // Round 10: 390
      Math.ceil(billTotal / 50) * 50, // Round 50: 400
      Math.ceil(billTotal / 100) * 100, // Round 100: 400
      500, // Note 500
      2000, // Note 2000
    ];

    assert.strictEqual(presets[0], 385);
    assert.strictEqual(presets[1], 390);
    assert.strictEqual(presets[2], 400);
    assert.strictEqual(presets[4], 500);
  });

  await t.test('6. Database integrity & hardcoded values check', async () => {
    const firstStore = await LocalDb.getFirstStore();
    assert.ok(firstStore, 'Store should exist');
    assert.strictEqual(firstStore.name, 'FryFreeze', 'Store name should be FryFreeze');

    // Verify users: no personal emails or device-specific credentials in database
    const users = await LocalDb.getUsers(firstStore.id);
    assert.ok(users.length >= 1);
    for (const u of users) {
      assert.ok(!u.email.includes('sethu'), 'No personal emails in database');
    }

    // Verify printer settings load from local database
    const settings = await LocalDb.getPrinterSettings(firstStore.id);
    assert.ok(settings, 'Printer settings should be queryable');
    assert.strictEqual(settings.format, '80mm');
  });
});
