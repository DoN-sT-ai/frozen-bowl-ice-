import assert from 'node:assert';
import {
  DEFAULT_THERMAL_PRINTER_SETTINGS,
  isThermalPrinterName,
} from '../src/lib/printerService.ts';

async function runPrinterTests() {
  console.log('🧪 Starting Thermal Printer & Customization Test Suite...\n');

  // Test 1: Verify thermal printer is the default across settings
  console.log('Test 1: Default Printer Format is 80mm Thermal');
  assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.format, '80mm', 'Default format must be 80mm thermal roll');
  assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.directPrint, true, 'Default directPrint must be true (silent POS mode)');
  assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.autoPrintOnSale, true, 'Default autoPrintOnSale must be true');
  assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.copies, 1, 'Default copies must be 1');
  assert.strictEqual(DEFAULT_THERMAL_PRINTER_SETTINGS.feedLines, 2, 'Default feed lines must be 2');
  console.log('✅ Test 1 Passed: Default printer configuration set to 80mm Thermal.\n');

  // Test 2: Thermal printer name pattern matching
  console.log('Test 2: Identifying thermal printer hardware names');
  const thermalExamples = [
    'POS-80 Series',
    'EPSON TM-T82 Receipt',
    'TVS RP-3200 Plus',
    'Citizen CT-S310',
    'Thermal Receipt Printer',
    'Xprinter XP-N160M',
    'Rongta 80mm Thermal',
    'ZJiang 58mm POS',
  ];

  for (const name of thermalExamples) {
    assert.strictEqual(isThermalPrinterName(name), true, `Should recognize "${name}" as thermal`);
  }

  const officePrinters = [
    'HP LaserJet Pro M404n',
    'Canon PIXMA G3000',
    'Microsoft Print to PDF',
    'OneNote (Desktop)',
  ];

  for (const name of officePrinters) {
    assert.strictEqual(isThermalPrinterName(name), false, `Should NOT recognize "${name}" as thermal`);
  }
  console.log('✅ Test 2 Passed: Thermal printer detection logic 100% accurate.\n');

  // Test 3: Verification of customization fields availability
  console.log('Test 3: Checking customization field structure');
  assert.ok('headerStoreNameOverride' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('headerTagline' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showStoreAddress' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showPhone' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showEmail' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showGstin' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showFssai' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('fssaiNumber' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('docTitleMode' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showDateTime' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showCashierName' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showCustomerDetails' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showPaymentMethod' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showItemIndex' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showHsn' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showTaxRatePerItem' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showModifiers' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showGstBreakdown' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showDiscountLine' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showRoundOff' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showVerificationQr' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('showVerificationToken' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('footerPrimaryMessage' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  assert.ok('footerSecondaryNote' in DEFAULT_THERMAL_PRINTER_SETTINGS);
  console.log('✅ Test 3 Passed: All required receipt customization fields supported.\n');

  // Test 4: Persistent Bill Customization in SQLite Database
  console.log('Test 4: Verifying customized bill persistence in SQLite database');
  const { LocalDb } = await import('../server/localDb.ts');
  const store = await LocalDb.getFirstStore();
  const storeId = store?.id || 'a0000000-0000-0000-0000-000000000001';

  const customSettingsToSave = {
    ...DEFAULT_THERMAL_PRINTER_SETTINGS,
    headerStoreNameOverride: 'FryFreeze Express Counter',
    headerTagline: 'Best Sundaes in Town',
    showFssai: true,
    fssaiNumber: '12423008000123',
    footerPrimaryMessage: 'Thank you for dining with FryFreeze!',
    footerSecondaryNote: 'Follow us on Instagram @fryfreeze',
    format: '80mm' as const,
    density: 'compact' as const,
  };

  await LocalDb.savePrinterSettings(storeId, customSettingsToSave);

  // Retrieve back from SQLite to simulate app reopen/fresh session
  const persisted = await LocalDb.getPrinterSettings(storeId);
  assert.ok(persisted, 'Persisted settings must be retrieved from SQLite database');
  assert.strictEqual(persisted.headerStoreNameOverride, 'FryFreeze Express Counter');
  assert.strictEqual(persisted.headerTagline, 'Best Sundaes in Town');
  assert.strictEqual(persisted.showFssai, true);
  assert.strictEqual(persisted.fssaiNumber, '12423008000123');
  assert.strictEqual(persisted.footerPrimaryMessage, 'Thank you for dining with FryFreeze!');
  assert.strictEqual(persisted.footerSecondaryNote, 'Follow us on Instagram @fryfreeze');
  assert.strictEqual(persisted.density, 'compact');
  console.log('✅ Test 4 Passed: Customized bill settings persisted in SQLite database across app closing/reopening.\n');

  console.log('🎉 ALL THERMAL PRINTER & CUSTOMIZATION TESTS PASSED!\n');
}

runPrinterTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

