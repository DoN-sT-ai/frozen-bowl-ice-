import { DatabaseSync } from 'node:sqlite';
import { seedIceCreamParlourData } from '../server/services/iceCreamSeed.ts';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve('data', 'ledgerstore.db');

console.log('🧹 Starting Complete Database Sanitization on:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('Database file does not exist at:', dbPath);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

try {
  // Step 1: Run the authoritative FryFreeze catalog and product seeder
  console.log('1️⃣ Running authoritative FryFreeze catalog seeder...');
  seedIceCreamParlourData(db);

  // Step 2: Ensure clean stores table with FryFreeze profile
  console.log('2️⃣ Normalizing store profile...');
  db.prepare(`
    UPDATE stores SET 
      name = 'FryFreeze',
      code = 'FRYFREEZE-01',
      address = '42 Richmond Road, Central Arcade, Bengaluru, KA 560025',
      phone = '+91 98450 12345',
      email = 'orders@fryfreeze.com',
      gstin = '29AABCU9603R1ZM',
      currency = 'INR',
      timezone = 'Asia/Kolkata',
      invoice_prefix = 'FF',
      updated_at = datetime('now')
    WHERE id = 'a0000000-0000-0000-0000-000000000001'
  `).run();

  db.prepare(`
    DELETE FROM stores WHERE id != 'a0000000-0000-0000-0000-000000000001'
  `).run();

  // Step 3: Purge all local device transactional data, customer data, and test logs
  console.log('3️⃣ Purging all transaction logs, sales, customers, drawer shifts, and local test configs...');
  db.exec(`
    DELETE FROM sales;
    DELETE FROM sale_items;
    DELETE FROM credit_notes;
    DELETE FROM pos_sales;
    DELETE FROM pos_sale_items;
    DELETE FROM pos_sale_item_modifiers;
    DELETE FROM pos_payments;
    DELETE FROM pos_refunds;
    DELETE FROM pos_refund_lines;
    DELETE FROM stock_counts;
    DELETE FROM stock_count_lines;
    DELETE FROM wastage_records;
    DELETE FROM audit_logs;
    DELETE FROM cash_drawer_sessions;
    DELETE FROM cash_drawer_transactions;
    DELETE FROM expenses;
    DELETE FROM developer_configs;
    DELETE FROM store_printer_settings;
    DELETE FROM employee_tab_permissions;
    DELETE FROM stock_movements;

    DELETE FROM bill_sequences;
    INSERT INTO bill_sequences (store_id, year, last_number) 
    VALUES ('a0000000-0000-0000-0000-000000000001', CAST(strftime('%Y', 'now') AS INTEGER), 0);

    DELETE FROM users WHERE id != 'dev-0000-0000-0000-000000000001';
  `);

  // Ensure default developer user exists
  const devUser = db.prepare("SELECT COUNT(*) as c FROM users WHERE id = 'dev-0000-0000-0000-000000000001'").get() as any;
  if (!devUser || devUser.c === 0) {
    db.prepare(`
      INSERT INTO users (id, store_id, name, email, password_hash, salt, role, active, created_at, updated_at)
      VALUES (
        'dev-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'developer',
        'developer@fryfreeze.com',
        '87ff636402ec9da0cfcb9c3941d3d6aa39a6e625a65324545fe56fa769ebff2a613589b9409ce24d1a29367fc9b57ef4e4b77f11c81ef9325c78fc23f66c0d02',
        'e8f00dbd06a9ca8c950ebc4d7ec62f1c',
        'DEVELOPER',
        1,
        datetime('now'),
        datetime('now')
      )
    `).run();
  }

  // Step 4: Truncate WAL and VACUUM
  console.log('4️⃣ Checkpointing WAL and compacting database...');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  db.exec('VACUUM;');

  console.log('✅ Database sanitization complete!');
} catch (error) {
  console.error('❌ Sanitization failed:', error);
  process.exit(1);
} finally {
  db.close();
}

