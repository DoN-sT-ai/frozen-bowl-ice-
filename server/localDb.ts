import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type {
  Store,
  User,
  Category,
  Product,
  StockMovement,
  Sale,
  SaleItem,
  Expense,
  AuditLog,
  CashDrawerSession,
  CashDrawerTransaction,
  EmployeeTabPermissions,
} from './db.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ensureUuid(val?: string | null): string {
  if (val && UUID_REGEX.test(val)) return val;
  return crypto.randomUUID();
}
function nullableUuid(val?: string | null): string | null {
  if (val && UUID_REGEX.test(val)) return val;
  return null;
}

// Ensure data directory exists
// When running inside a packaged Electron app, DATA_DIR is set by main.cjs
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_FILE_PATH = path.resolve(DATA_DIR, 'ledgerstore.db');

class LocalDatabaseManager {
  private db: DatabaseSync;
  private initialized = false;

  constructor() {
    this.db = new DatabaseSync(DB_FILE_PATH);
    this.initPragmas();
    this.initSchema();
    this.seedDefaultStoreAndAdmin();
  }

  public getRawDb(): DatabaseSync {
    return this.db;
  }

  private initPragmas() {
    try {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA busy_timeout = 5000;');
      this.db.exec('PRAGMA wal_autocheckpoint = 100;');
    } catch (err) {
      console.warn('SQLite PRAGMA initialization notice:', err);
    }
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        address TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        gstin TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'INR',
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        invoice_prefix TEXT NOT NULL DEFAULT 'INV',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE', 'DEVELOPER')),
        active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS developer_configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT NOT NULL,
        hsn_code TEXT DEFAULT '',
        description TEXT DEFAULT '',
        purchase_price REAL NOT NULL DEFAULT 0.00,
        purchase_tax_type TEXT DEFAULT 'EXCLUSIVE',
        selling_price REAL NOT NULL DEFAULT 0.00,
        tax_rate REAL NOT NULL DEFAULT 0.00,
        tax_type TEXT DEFAULT 'EXCLUSIVE',
        current_stock REAL NOT NULL DEFAULT 0.00,
        minimum_stock REAL NOT NULL DEFAULT 0.00,
        unit TEXT NOT NULL DEFAULT 'piece',
        package_info TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(store_id, sku),
        UNIQUE(store_id, barcode)
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        user_id TEXT,
        user_name TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity REAL NOT NULL,
        before_stock REAL NOT NULL,
        after_stock REAL NOT NULL,
        reason TEXT DEFAULT '',
        reference_type TEXT,
        reference_id TEXT,
        purchase_cost REAL,
        tax_rate REAL,
        tax_amount REAL,
        supplier_invoice TEXT,
        supplier_gstin TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        bill_number TEXT NOT NULL UNIQUE,
        verification_token TEXT NOT NULL UNIQUE,
        employee_id TEXT,
        employee_name TEXT NOT NULL,
        subtotal REAL NOT NULL DEFAULT 0.00,
        discount REAL NOT NULL DEFAULT 0.00,
        tax REAL NOT NULL DEFAULT 0.00,
        cgst REAL NOT NULL DEFAULT 0.00,
        sgst REAL NOT NULL DEFAULT 0.00,
        igst REAL NOT NULL DEFAULT 0.00,
        gst_type TEXT DEFAULT 'INTRA_STATE',
        tax_mode TEXT DEFAULT 'INCLUSIVE',
        round_off REAL DEFAULT 0.00,
        customer_name TEXT,
        customer_phone TEXT,
        customer_gstin TEXT,
        total REAL NOT NULL DEFAULT 0.00,
        payment_method TEXT NOT NULL DEFAULT 'UPI',
        status TEXT NOT NULL DEFAULT 'COMPLETED',
        notes TEXT,
        created_at TEXT NOT NULL,
        voided_at TEXT,
        voided_by TEXT,
        voided_by_name TEXT,
        void_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        product_name_snapshot TEXT NOT NULL,
        sku_snapshot TEXT NOT NULL,
        barcode_snapshot TEXT NOT NULL,
        hsn_snapshot TEXT,
        quantity REAL NOT NULL DEFAULT 1.00,
        unit_price REAL NOT NULL DEFAULT 0.00,
        purchase_price_snapshot REAL NOT NULL DEFAULT 0.00,
        tax_rate REAL NOT NULL DEFAULT 0.00,
        tax_amount REAL NOT NULL DEFAULT 0.00,
        tax_type_snapshot TEXT DEFAULT 'EXCLUSIVE',
        taxable_value REAL DEFAULT 0.00,
        cgst_amount REAL DEFAULT 0.00,
        sgst_amount REAL DEFAULT 0.00,
        igst_amount REAL DEFAULT 0.00,
        discount REAL DEFAULT 0.00,
        line_total REAL NOT NULL DEFAULT 0.00,
        modifiers_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        created_by TEXT,
        created_by_name TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0.00,
        description TEXT DEFAULT '',
        expense_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        user_id TEXT,
        user_name TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        before_data TEXT,
        after_data TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bill_sequences (
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (store_id, year)
      );

      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
      CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
      CREATE INDEX IF NOT EXISTS idx_sales_bill_number ON sales(bill_number);
      CREATE INDEX IF NOT EXISTS idx_sales_verification_token ON sales(verification_token);
      CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
      CREATE INDEX IF NOT EXISTS idx_sales_customer_phone ON sales(store_id, customer_phone);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_store_date ON expenses(store_id, expense_date);

      CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        opened_by TEXT,
        opened_by_name TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        opening_amount REAL NOT NULL DEFAULT 0.00,
        opening_denominations_json TEXT DEFAULT '{}',
        opening_notes TEXT DEFAULT '',
        closed_by TEXT,
        closed_by_name TEXT,
        closed_at TEXT,
        closing_amount REAL,
        closing_denominations_json TEXT DEFAULT '{}',
        closing_notes TEXT DEFAULT '',
        expected_amount REAL NOT NULL DEFAULT 0.00,
        cash_sales_amount REAL NOT NULL DEFAULT 0.00,
        cash_in_amount REAL NOT NULL DEFAULT 0.00,
        cash_out_amount REAL NOT NULL DEFAULT 0.00,
        difference REAL DEFAULT 0.00,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cash_drawer_transactions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES cash_drawer_sessions(id) ON DELETE CASCADE,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('OPENING_FLOAT', 'CASH_IN', 'CASH_OUT', 'SALE', 'REFUND')),
        amount REAL NOT NULL,
        category TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        reference_id TEXT DEFAULT '',
        performed_by TEXT,
        performed_by_name TEXT NOT NULL,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS employee_tab_permissions (
        user_id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        permissions_json TEXT NOT NULL DEFAULT '["billing","inventory","sales","movements","cash_control"]',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS store_printer_settings (
        store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cash_sessions_store_status ON cash_drawer_sessions(store_id, status);
      CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON cash_drawer_sessions(opened_at);
      CREATE INDEX IF NOT EXISTS idx_cash_tx_session ON cash_drawer_transactions(session_id);
      CREATE INDEX IF NOT EXISTS idx_cash_tx_store_created ON cash_drawer_transactions(store_id, created_at);
    `);

    try {
      this.db.exec("ALTER TABLE users ADD COLUMN permissions_json TEXT DEFAULT ''");
    } catch {
      // Column may already exist
    }

    try {
      this.db.exec("ALTER TABLE sale_items ADD COLUMN modifiers_json TEXT DEFAULT '[]'");
    } catch {
      // Column may already exist
    }

    try {
      this.db.exec("ALTER TABLE products ADD COLUMN package_info TEXT DEFAULT ''");
    } catch {
      // Column may already exist
    }

    // Ensure users table supports 'DEVELOPER' role without constraint failure
    try {
      const userTableSql = (this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as any)?.sql || '';
      if (userTableSql && !userTableSql.includes('DEVELOPER')) {
        this.db.exec('PRAGMA foreign_keys = OFF;');
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS users_new (
            id TEXT PRIMARY KEY,
            store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE', 'DEVELOPER')),
            active INTEGER NOT NULL DEFAULT 1,
            last_login_at TEXT,
            created_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          INSERT INTO users_new (id, store_id, name, email, password_hash, salt, role, active, last_login_at, created_by, created_at, updated_at)
            SELECT id, store_id, name, email, password_hash, salt, role, active, last_login_at, created_by, created_at, updated_at FROM users;
          DROP TABLE users;
          ALTER TABLE users_new RENAME TO users;
        `);
        this.db.exec('PRAGMA foreign_keys = ON;');
      }
    } catch (migErr) {
      console.warn('Users table migration notice:', migErr);
    }

    // Ensure stock_movements supports both finished products and bulk raw ingredients
    try {
      const fkList = this.db.prepare('PRAGMA foreign_key_list(stock_movements)').all() as any[];
      if (fkList.some(fk => fk.table === 'products')) {
        this.db.exec('PRAGMA foreign_keys = OFF;');
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS stock_movements_new (
            id TEXT PRIMARY KEY,
            store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            product_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            user_id TEXT,
            user_name TEXT NOT NULL,
            type TEXT NOT NULL,
            quantity REAL NOT NULL,
            before_stock REAL NOT NULL,
            after_stock REAL NOT NULL,
            reason TEXT DEFAULT '',
            reference_type TEXT,
            reference_id TEXT,
            purchase_cost REAL,
            tax_rate REAL,
            tax_amount REAL,
            supplier_invoice TEXT,
            supplier_gstin TEXT,
            created_at TEXT NOT NULL
          );
          INSERT INTO stock_movements_new SELECT * FROM stock_movements;
          DROP TABLE stock_movements;
          ALTER TABLE stock_movements_new RENAME TO stock_movements;
          CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
        `);
        this.db.exec('PRAGMA foreign_keys = ON;');
      }
    } catch (_) {}

    // Backfill any bulk purchase receipts from inventory ledger into stock movements
    try {
      const firstStore = this.db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
      const storeId = firstStore ? firstStore.id : 'a0000000-0000-0000-0000-000000000001';
      this.db.exec(`
        INSERT INTO stock_movements (
          id, store_id, product_id, product_name, user_id, user_name,
          type, quantity, before_stock, after_stock, reason,
          reference_type, reference_id, purchase_cost, supplier_invoice, created_at
        )
        SELECT 
          im.id,
          '${storeId}',
          ii.id,
          ii.name || ' (' || ii.base_unit_code || ')',
          NULL,
          'Bulk Delivery',
          'PURCHASE',
          im.quantity_delta_base,
          (im.resulting_quantity_base - im.quantity_delta_base),
          im.resulting_quantity_base,
          COALESCE(im.reason, 'Bulk Purchase Receipt'),
          'purchase',
          im.reference_id,
          ROUND(CAST(im.unit_cost_snapshot AS REAL) / 100.0, 2),
          COALESCE(p.invoice_reference, p.purchase_number),
          im.created_at
        FROM inventory_movements im
        JOIN inventory_items ii ON im.inventory_item_id = ii.id
        LEFT JOIN purchases p ON im.reference_id = p.id
        WHERE im.movement_type = 'purchase_receipt'
          AND NOT EXISTS (
            SELECT 1 FROM stock_movements sm WHERE sm.reference_id = im.reference_id AND sm.product_id = ii.id
          );
      `);
    } catch (_) {}

    // Ensure default developer configs for Supabase Cloud Authentication are present if configured
    try {
      const now = new Date().toISOString();
      const insertDefaultConfig = this.db.prepare(
        'INSERT OR IGNORE INTO developer_configs (key, value, updated_at) VALUES (?, ?, ?)'
      );
      if (process.env.SUPABASE_URL) {
        insertDefaultConfig.run('SUPABASE_URL', process.env.SUPABASE_URL.trim(), now);
      }
      if (process.env.SUPABASE_ANON_KEY) {
        insertDefaultConfig.run('SUPABASE_ANON_KEY', process.env.SUPABASE_ANON_KEY.trim(), now);
      }
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        insertDefaultConfig.run('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), now);
      }
    } catch (_) {}
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check if store table has any rows
    const storeCount = (this.db.prepare('SELECT COUNT(*) as count FROM stores').get() as any)?.count || 0;

    if (storeCount === 0) {
      console.log('🌱 Seeding FryFreeze into local SQLite database...');
      const { seedIceCreamParlourData } = await import('./services/iceCreamSeed.ts');
      seedIceCreamParlourData(this.db);
    }

    this.initialized = true;
    console.log(`✅ Local SQLite database active at: ${DB_FILE_PATH}`);
  }

  private seedDefaultStoreAndAdmin() {
    const now = new Date().toISOString();
    const defaultStoreId = 'a0000000-0000-0000-0000-000000000001';

    this.db.prepare(`
      INSERT OR IGNORE INTO stores (id, name, code, address, phone, email, gstin, currency, timezone, invoice_prefix, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      defaultStoreId,
      'FryFreeze',
      'FRYFREEZE-01',
      '123 Main Commercial Street',
      '+91 9876543210',
      'orders@fryfreeze.com',
      '',
      'INR',
      'Asia/Kolkata',
      'FF',
      now,
      now
    );

    // Also support STORE-01 alias as a valid store foreign key
    this.db.prepare(`
      INSERT OR IGNORE INTO stores (id, name, code, address, phone, email, gstin, currency, timezone, invoice_prefix, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'STORE-01',
      'FryFreeze',
      'STORE-01-CODE',
      '123 Main Commercial Street',
      '+91 9876543210',
      'orders@fryfreeze.com',
      '',
      'INR',
      'Asia/Kolkata',
      'FF',
      now,
      now
    );

    // Developer profile is stored locally in SQLite (never in cloud)
    try {
      const hasDev = (this.db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'DEVELOPER'").get() as any)?.c || 0;
      if (hasDev === 0) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync('Developer@123', salt, 64).toString('hex');
        this.db.prepare(`
          INSERT OR REPLACE INTO users (id, store_id, name, email, password_hash, salt, role, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'dev-0000-0000-0000-000000000001',
          defaultStoreId,
          'developer',
          'developer@fryfreeze.com',
          hash,
          salt,
          'DEVELOPER',
          1,
          now,
          now
        );
      }
    } catch (devErr) {
      console.warn('[Seed] Notice initializing developer account:', devErr);
    }

    // Seed default categories
    const categories = [
      { name: 'Groceries', description: 'Daily household groceries' },
      { name: 'Beverages', description: 'Packaged drinks and juices' },
      { name: 'Snacks', description: 'Packaged snack foods' },
      { name: 'Personal Care', description: 'Soaps, shampoos, cosmetics' },
      { name: 'Dairy & Bakery', description: 'Milk, bread, bakery products' },
      { name: 'Household Essentials', description: 'Cleaning and home items' },
    ];

    const insertCat = this.db.prepare(`
      INSERT OR IGNORE INTO categories (id, store_id, name, description, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);

    for (const c of categories) {
      insertCat.run(crypto.randomUUID(), defaultStoreId, c.name, c.description, now, now);
    }
  }
}

export const localDbManager = new LocalDatabaseManager();

// ============================================================
// LOCAL DB API IMPLEMENTATION (1:1 drop-in replacement for SupabaseDb)
// ============================================================

export class LocalDb {
  public static getRawDb(): DatabaseSync {
    return localDbManager.getRawDb();
  }

  private static get db(): DatabaseSync {
    return localDbManager.getRawDb();
  }

  static resolveValidStoreId(storeId?: string): string {
    if (storeId) {
      const exists = this.db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId);
      if (exists) return storeId;
    }
    const firstStore = this.db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
    return firstStore ? firstStore.id : 'a0000000-0000-0000-0000-000000000001';
  }

  // STORE
  static async getStore(storeId: string): Promise<Store | null> {
    const row = this.db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
    if (!row) return null;
    return row as Store;
  }

  static async getFirstStore(): Promise<Store | null> {
    const row = this.db.prepare('SELECT * FROM stores LIMIT 1').get() as any;
    if (!row) return null;
    return row as Store;
  }

  static async updateStore(storeId: string, updates: Partial<Store>): Promise<Store | null> {
    const now = new Date().toISOString();
    const current = await this.getStore(storeId);
    if (!current) throw new Error('Store not found');

    const updated: Store = {
      ...current,
      ...updates,
      updated_at: now,
    };

    this.db.prepare(`
      UPDATE stores
      SET name = ?, code = ?, address = ?, phone = ?, email = ?, gstin = ?, currency = ?, timezone = ?, invoice_prefix = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.code,
      updated.address || '',
      updated.phone || '',
      updated.email || '',
      updated.gstin || '',
      updated.currency || 'INR',
      updated.timezone || 'Asia/Kolkata',
      updated.invoice_prefix || 'INV',
      updated.updated_at,
      storeId
    );

    return updated;
  }

  static async getPrinterSettings(storeId?: string): Promise<any | null> {
    const validStoreId = this.resolveValidStoreId(storeId);
    try {
      const row = this.db.prepare('SELECT settings_json FROM store_printer_settings WHERE store_id = ?').get(validStoreId) as any;
      if (!row || !row.settings_json) return null;
      return JSON.parse(row.settings_json);
    } catch {
      return null;
    }
  }

  static async savePrinterSettings(storeId: string, settings: any): Promise<any> {
    const validStoreId = this.resolveValidStoreId(storeId);
    const now = new Date().toISOString();
    const settingsJson = JSON.stringify(settings);
    this.db.prepare(`
      INSERT INTO store_printer_settings (store_id, settings_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(store_id) DO UPDATE SET
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
    `).run(validStoreId, settingsJson, now);
    return settings;
  }

  static async syncStoreFromCloud(storeData: {
    id?: string;
    name: string;
    code?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    currency?: string;
    invoice_prefix?: string;
  }): Promise<Store> {
    const rawDb = this.getRawDb();
    const now = new Date().toISOString();

    // Check if store already exists in SQLite by exact ID, code, or name
    let existing: Store | null = null;
    if (storeData.id) {
      existing = await this.getStore(storeData.id);
    }
    if (!existing && storeData.code) {
      const row = rawDb.prepare('SELECT * FROM stores WHERE LOWER(code) = LOWER(?)').get(storeData.code) as any;
      if (row) existing = row as Store;
    }
    if (!existing && storeData.name) {
      const row = rawDb.prepare('SELECT * FROM stores WHERE LOWER(name) = LOWER(?)').get(storeData.name) as any;
      if (row) existing = row as Store;
    }

    if (existing) {
      rawDb.prepare(`
        UPDATE stores
        SET name = ?,
            code = COALESCE(?, code),
            address = COALESCE(?, address),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            gstin = COALESCE(?, gstin),
            currency = COALESCE(?, currency),
            invoice_prefix = COALESCE(?, invoice_prefix),
            updated_at = ?
        WHERE id = ?
      `).run(
        storeData.name,
        storeData.code || null,
        storeData.address || null,
        storeData.phone || null,
        storeData.email || null,
        storeData.gstin || null,
        storeData.currency || null,
        storeData.invoice_prefix || null,
        now,
        existing.id
      );
      return (await this.getStore(existing.id))!;
    } else {
      const targetId = storeData.id || crypto.randomUUID();
      const code = storeData.code || storeData.name.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 10);
      rawDb.prepare(`
        INSERT INTO stores (id, name, code, address, phone, email, gstin, currency, timezone, invoice_prefix, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetId,
        storeData.name,
        code,
        storeData.address || '',
        storeData.phone || '',
        storeData.email || '',
        storeData.gstin || '',
        storeData.currency || 'INR',
        'Asia/Kolkata',
        storeData.invoice_prefix || 'INV-',
        now,
        now
      );

      // Seed starter categories for this distinct shop
      this.seedDefaultCategories(targetId, [
        { name: 'Specialties', description: 'House specialty recipes' },
        { name: 'Beverages', description: 'Drinks & beverages' },
        { name: 'Desserts', description: 'Desserts & frozen items' },
      ]);

      return (await this.getStore(targetId))!;
    }
  }

  // USERS
  static async getUsers(storeId: string): Promise<User[]> {
    const rows = this.db.prepare('SELECT * FROM users WHERE store_id = ? ORDER BY created_at DESC').all(storeId) as any[];
    return rows.map(r => ({
      ...r,
      active: Boolean(r.active),
    })) as User[];
  }

  static async getUserByEmail(emailOrUsername: string): Promise<User | null> {
    const clean = emailOrUsername.trim().toLowerCase();
    const row = this.db.prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(name) = ?').get(clean, clean) as any;
    if (!row) return null;
    return {
      ...row,
      active: Boolean(row.active),
    } as User;
  }

  static async getDeveloperConfig(key: string): Promise<string | null> {
    const row = this.db.prepare('SELECT value FROM developer_configs WHERE key = ?').get(key) as any;
    return row ? row.value : null;
  }

  static async setDeveloperConfig(key: string, value: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare('INSERT OR REPLACE INTO developer_configs (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, now);
  }

  static async getAllDeveloperConfigs(): Promise<Record<string, string>> {
    const rows = this.db.prepare('SELECT key, value FROM developer_configs').all() as any[];
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }

  static async createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<User> {
    const now = new Date().toISOString();
    const id = ensureUuid(user.id);
    const createdBy = nullableUuid(user.created_by);

    this.db.prepare(`
      INSERT INTO users (id, store_id, name, email, password_hash, salt, role, active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      user.store_id,
      user.name,
      user.email,
      user.password_hash,
      user.salt,
      user.role,
      user.active ? 1 : 0,
      createdBy,
      now,
      now
    );

    return {
      id,
      store_id: user.store_id,
      name: user.name,
      email: user.email,
      password_hash: user.password_hash,
      salt: user.salt,
      role: user.role,
      active: Boolean(user.active),
      created_by: createdBy || undefined,
      created_at: now,
      updated_at: now,
    };
  }

  static async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const current = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!current) throw new Error('User not found');

    const now = new Date().toISOString();
    const updated: User = {
      ...current,
      ...updates,
      active: updates.active !== undefined ? Boolean(updates.active) : Boolean(current.active),
      updated_at: now,
    };

    this.db.prepare(`
      UPDATE users
      SET name = ?, email = ?, password_hash = ?, salt = ?, role = ?, active = ?, last_login_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.email,
      updated.password_hash,
      updated.salt,
      updated.role,
      updated.active ? 1 : 0,
      updated.last_login_at || null,
      updated.updated_at,
      userId
    );

    return updated;
  }

  static async deleteUser(userId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return true;
  }

  // CATEGORIES
  static async getCategories(storeId: string): Promise<Category[]> {
    const rows = this.db.prepare('SELECT * FROM categories WHERE store_id = ? ORDER BY name ASC').all(storeId) as any[];
    return rows.map(r => ({
      ...r,
      active: Boolean(r.active),
    })) as Category[];
  }

  static async createCategory(category: Omit<Category, 'id' | 'created_at' | 'updated_at'>): Promise<Category> {
    const id = ensureUuid((category as any).id);
    const storeId = this.resolveValidStoreId(category.store_id);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO categories (id, store_id, name, description, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      storeId,
      category.name,
      category.description || '',
      category.active ? 1 : 0,
      now,
      now
    );

    return {
      id,
      store_id: storeId,
      name: category.name,
      description: category.description || '',
      active: Boolean(category.active),
      created_at: now,
      updated_at: now,
    };
  }

  static async deleteCategory(storeId: string, categoryId: string): Promise<boolean> {
    // Detach from products first
    this.db.prepare(`
      UPDATE products SET category_id = NULL, updated_at = ? WHERE store_id = ? AND category_id = ?
    `).run(new Date().toISOString(), storeId, categoryId);

    this.db.prepare('DELETE FROM categories WHERE store_id = ? AND id = ?').run(storeId, categoryId);
    return true;
  }

  static async seedDefaultCategories(storeId: string, defaults: Array<{ name: string; description: string }>): Promise<Category[]> {
    const now = new Date().toISOString();
    const results: Category[] = [];

    const stmt = this.db.prepare(`
      INSERT INTO categories (id, store_id, name, description, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);

    for (const d of defaults) {
      const id = crypto.randomUUID();
      stmt.run(id, storeId, d.name, d.description || '', now, now);
      results.push({
        id,
        store_id: storeId,
        name: d.name,
        description: d.description || '',
        active: true,
        created_at: now,
        updated_at: now,
      });
    }

    return results;
  }

  // PRODUCTS
  static async getProducts(storeId: string): Promise<Product[]> {
    const rows = this.db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY name ASC').all(storeId) as any[];
    return rows.map(r => ({
      ...r,
      purchase_price: Number(r.purchase_price) || 0,
      selling_price: Number(r.selling_price) || 0,
      tax_rate: Number(r.tax_rate) || 0,
      current_stock: Number(r.current_stock) || 0,
      minimum_stock: Number(r.minimum_stock) || 0,
      package_info: r.package_info || '',
      active: Boolean(r.active),
    })) as Product[];
  }

  static async createProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> {
    const id = ensureUuid((product as any).id);
    let categoryId = nullableUuid(product.category_id);
    if (categoryId) {
      const exists = this.db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
      if (!exists) categoryId = null;
    }
    let storeId = product.store_id;
    const storeExists = this.db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId);
    if (!storeExists) {
      const firstStore = this.db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
      if (firstStore) storeId = firstStore.id;
    }
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO products (
        id, store_id, category_id, name, sku, barcode, hsn_code, description,
        purchase_price, purchase_tax_type, selling_price, tax_rate, tax_type,
        current_stock, minimum_stock, unit, package_info, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      storeId,
      categoryId,
      product.name,
      product.sku,
      product.barcode,
      product.hsn_code || '',
      product.description || '',
      Number(product.purchase_price) || 0,
      product.purchase_tax_type || 'EXCLUSIVE',
      Number(product.selling_price) || 0,
      Number(product.tax_rate) || 0,
      product.tax_type || 'EXCLUSIVE',
      Number(product.current_stock) || 0,
      Number(product.minimum_stock) || 0,
      product.unit || 'piece',
      product.package_info || '',
      product.active ? 1 : 0,
      now,
      now
    );

    return {
      id,
      store_id: product.store_id,
      category_id: categoryId || undefined,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      hsn_code: product.hsn_code || '',
      description: product.description || '',
      purchase_price: Number(product.purchase_price) || 0,
      purchase_tax_type: product.purchase_tax_type || 'EXCLUSIVE',
      selling_price: Number(product.selling_price) || 0,
      tax_rate: Number(product.tax_rate) || 0,
      tax_type: product.tax_type || 'EXCLUSIVE',
      current_stock: Number(product.current_stock) || 0,
      minimum_stock: Number(product.minimum_stock) || 0,
      unit: product.unit || 'piece',
      package_info: product.package_info || '',
      active: Boolean(product.active),
      created_at: now,
      updated_at: now,
    };
  }

  static async updateProduct(productId: string, updates: Partial<Product>): Promise<Product> {
    const current = this.db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
    if (!current) throw new Error('Product not found');

    const now = new Date().toISOString();
    const updated: Product = {
      ...current,
      ...updates,
      purchase_price: updates.purchase_price !== undefined ? Number(updates.purchase_price) : Number(current.purchase_price),
      selling_price: updates.selling_price !== undefined ? Number(updates.selling_price) : Number(current.selling_price),
      tax_rate: updates.tax_rate !== undefined ? Number(updates.tax_rate) : Number(current.tax_rate),
      current_stock: updates.current_stock !== undefined ? Number(updates.current_stock) : Number(current.current_stock),
      minimum_stock: updates.minimum_stock !== undefined ? Number(updates.minimum_stock) : Number(current.minimum_stock),
      package_info: updates.package_info !== undefined ? updates.package_info : current.package_info,
      active: updates.active !== undefined ? Boolean(updates.active) : Boolean(current.active),
      updated_at: now,
    };

    const categoryId = 'category_id' in updates ? nullableUuid(updates.category_id) : current.category_id;

    this.db.prepare(`
      UPDATE products
      SET category_id = ?, name = ?, sku = ?, barcode = ?, hsn_code = ?, description = ?,
          purchase_price = ?, purchase_tax_type = ?, selling_price = ?, tax_rate = ?, tax_type = ?,
          current_stock = ?, minimum_stock = ?, unit = ?, package_info = ?, active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      categoryId,
      updated.name,
      updated.sku,
      updated.barcode,
      updated.hsn_code || '',
      updated.description || '',
      updated.purchase_price,
      updated.purchase_tax_type || 'EXCLUSIVE',
      updated.selling_price,
      updated.tax_rate,
      updated.tax_type || 'EXCLUSIVE',
      updated.current_stock,
      updated.minimum_stock,
      updated.unit || 'piece',
      updated.package_info || '',
      updated.active ? 1 : 0,
      updated.updated_at,
      productId
    );

    return updated;
  }

  static async deleteProduct(productId: string): Promise<boolean> {
    this.db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    return true;
  }

  // STOCK MOVEMENTS
  static async getStockMovements(storeId: string, limit = 150): Promise<StockMovement[]> {
    const rows = this.db.prepare(`
      SELECT * FROM stock_movements WHERE store_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(storeId, limit) as any[];

    return rows.map(r => ({
      ...r,
      quantity: Number(r.quantity) || 0,
      before_stock: Number(r.before_stock) || 0,
      after_stock: Number(r.after_stock) || 0,
      purchase_cost: r.purchase_cost != null ? Number(r.purchase_cost) : undefined,
      tax_rate: r.tax_rate != null ? Number(r.tax_rate) : undefined,
      tax_amount: r.tax_amount != null ? Number(r.tax_amount) : undefined,
    })) as StockMovement[];
  }

  static async createStockMovement(movement: Omit<StockMovement, 'id' | 'created_at'>): Promise<StockMovement> {
    const id = ensureUuid((movement as any).id);
    const storeId = this.resolveValidStoreId(movement.store_id);
    const userId = nullableUuid(movement.user_id);
    const refId = nullableUuid(movement.reference_id);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO stock_movements (
        id, store_id, product_id, product_name, user_id, user_name, type,
        quantity, before_stock, after_stock, reason, reference_type, reference_id,
        purchase_cost, tax_rate, tax_amount, supplier_invoice, supplier_gstin, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      storeId,
      movement.product_id,
      movement.product_name,
      userId,
      movement.user_name || '',
      movement.type,
      Number(movement.quantity) || 0,
      Number(movement.before_stock) || 0,
      Number(movement.after_stock) || 0,
      movement.reason || '',
      movement.reference_type || null,
      refId,
      movement.purchase_cost ?? null,
      movement.tax_rate ?? null,
      movement.tax_amount ?? null,
      movement.supplier_invoice || null,
      movement.supplier_gstin || null,
      now
    );

    return {
      ...movement,
      id,
      created_at: now,
    } as StockMovement;
  }

  static async createStockMovementsBatch(movements: Array<Omit<StockMovement, 'id' | 'created_at'>>): Promise<void> {
    if (movements.length === 0) return;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO stock_movements (
        id, store_id, product_id, product_name, user_id, user_name, type,
        quantity, before_stock, after_stock, reason, reference_type, reference_id,
        purchase_cost, tax_rate, tax_amount, supplier_invoice, supplier_gstin, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const m of movements) {
      const storeId = this.resolveValidStoreId(m.store_id);
      stmt.run(
        crypto.randomUUID(),
        storeId,
        m.product_id,
        m.product_name,
        nullableUuid(m.user_id),
        m.user_name || '',
        m.type,
        Number(m.quantity) || 0,
        Number(m.before_stock) || 0,
        Number(m.after_stock) || 0,
        m.reason || '',
        m.reference_type || null,
        nullableUuid(m.reference_id),
        m.purchase_cost ?? null,
        m.tax_rate ?? null,
        m.tax_amount ?? null,
        m.supplier_invoice || null,
        m.supplier_gstin || null,
        now
      );
    }
  }

  // SALES
  static async getSales(storeId: string, limit = 200): Promise<Sale[]> {
    const salesRows = this.db.prepare(`
      SELECT * FROM sales WHERE store_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(storeId, limit) as any[];

    if (salesRows.length === 0) return [];

    const saleIds = salesRows.map(s => s.id);
    const placeholders = saleIds.map(() => '?').join(',');
    const itemsRows = this.db.prepare(`
      SELECT * FROM sale_items WHERE sale_id IN (${placeholders}) ORDER BY created_at ASC
    `).all(...saleIds) as any[];

    const itemsBySaleId = new Map<string, SaleItem[]>();
    for (const item of itemsRows) {
      const parsedItem: SaleItem = {
        ...item,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        purchase_price_snapshot: Number(item.purchase_price_snapshot) || 0,
        tax_rate: Number(item.tax_rate) || 0,
        tax_amount: Number(item.tax_amount) || 0,
        taxable_value: item.taxable_value != null ? Number(item.taxable_value) : undefined,
        cgst_amount: item.cgst_amount != null ? Number(item.cgst_amount) : undefined,
        sgst_amount: item.sgst_amount != null ? Number(item.sgst_amount) : undefined,
        igst_amount: item.igst_amount != null ? Number(item.igst_amount) : undefined,
        discount: Number(item.discount) || 0,
        line_total: Number(item.line_total) || 0,
        selected_modifiers: item.modifiers_json ? (() => { try { return JSON.parse(item.modifiers_json); } catch { return undefined; } })() : undefined,
      };
      if (!itemsBySaleId.has(item.sale_id)) {
        itemsBySaleId.set(item.sale_id, []);
      }
      itemsBySaleId.get(item.sale_id)!.push(parsedItem);
    }

    return salesRows.map(s => ({
      ...s,
      subtotal: Number(s.subtotal) || 0,
      discount: Number(s.discount) || 0,
      tax: Number(s.tax) || 0,
      cgst: s.cgst != null ? Number(s.cgst) : undefined,
      sgst: s.sgst != null ? Number(s.sgst) : undefined,
      igst: s.igst != null ? Number(s.igst) : undefined,
      round_off: s.round_off != null ? Number(s.round_off) : undefined,
      total: Number(s.total) || 0,
      items: itemsBySaleId.get(s.id) || [],
    })) as Sale[];
  }

  static async getSaleByVerificationToken(token: string): Promise<Sale | null> {
    const saleRow = this.db.prepare('SELECT * FROM sales WHERE verification_token = ?').get(token.trim()) as any;
    if (!saleRow) return null;

    const itemsRows = this.db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY created_at ASC').all(saleRow.id) as any[];

    return {
      ...saleRow,
      subtotal: Number(saleRow.subtotal) || 0,
      discount: Number(saleRow.discount) || 0,
      tax: Number(saleRow.tax) || 0,
      cgst: saleRow.cgst != null ? Number(saleRow.cgst) : undefined,
      sgst: saleRow.sgst != null ? Number(saleRow.sgst) : undefined,
      igst: saleRow.igst != null ? Number(saleRow.igst) : undefined,
      round_off: saleRow.round_off != null ? Number(saleRow.round_off) : undefined,
      total: Number(saleRow.total) || 0,
      items: itemsRows.map(item => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        purchase_price_snapshot: Number(item.purchase_price_snapshot) || 0,
        tax_rate: Number(item.tax_rate) || 0,
        tax_amount: Number(item.tax_amount) || 0,
        taxable_value: item.taxable_value != null ? Number(item.taxable_value) : undefined,
        cgst_amount: item.cgst_amount != null ? Number(item.cgst_amount) : undefined,
        sgst_amount: item.sgst_amount != null ? Number(item.sgst_amount) : undefined,
        igst_amount: item.igst_amount != null ? Number(item.igst_amount) : undefined,
        discount: Number(item.discount) || 0,
        line_total: Number(item.line_total) || 0,
        selected_modifiers: item.modifiers_json ? (() => { try { return JSON.parse(item.modifiers_json); } catch { return undefined; } })() : undefined,
      })),
    } as Sale;
  }

  static async getSaleById(id: string): Promise<Sale | null> {
    const saleRow = this.db.prepare('SELECT * FROM sales WHERE id = ?').get(id.trim()) as any;
    if (!saleRow) return null;

    const itemsRows = this.db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY created_at ASC').all(saleRow.id) as any[];

    return {
      ...saleRow,
      subtotal: Number(saleRow.subtotal) || 0,
      discount: Number(saleRow.discount) || 0,
      tax: Number(saleRow.tax) || 0,
      cgst: saleRow.cgst != null ? Number(saleRow.cgst) : undefined,
      sgst: saleRow.sgst != null ? Number(saleRow.sgst) : undefined,
      igst: saleRow.igst != null ? Number(saleRow.igst) : undefined,
      round_off: saleRow.round_off != null ? Number(saleRow.round_off) : undefined,
      total: Number(saleRow.total) || 0,
      items: itemsRows.map(item => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        purchase_price_snapshot: Number(item.purchase_price_snapshot) || 0,
        tax_rate: Number(item.tax_rate) || 0,
        tax_amount: Number(item.tax_amount) || 0,
        taxable_value: item.taxable_value != null ? Number(item.taxable_value) : undefined,
        cgst_amount: item.cgst_amount != null ? Number(item.cgst_amount) : undefined,
        sgst_amount: item.sgst_amount != null ? Number(item.sgst_amount) : undefined,
        igst_amount: item.igst_amount != null ? Number(item.igst_amount) : undefined,
        discount: Number(item.discount) || 0,
        line_total: Number(item.line_total) || 0,
        selected_modifiers: item.modifiers_json ? (() => { try { return JSON.parse(item.modifiers_json); } catch { return undefined; } })() : undefined,
      })),
    } as Sale;
  }

  static async getCustomerByPhone(storeId: string, phone: string): Promise<{ customer_name: string; customer_phone: string; customer_gstin?: string } | null> {
    const validStoreId = this.resolveValidStoreId(storeId);
    const row = this.db.prepare(`
      SELECT customer_name, customer_phone, customer_gstin
      FROM sales
      WHERE store_id = ? AND customer_phone = ? AND customer_name IS NOT NULL AND TRIM(customer_name) != ''
      ORDER BY created_at DESC LIMIT 1
    `).get(validStoreId, phone.trim()) as any;
    if (!row) return null;
    return {
      customer_name: row.customer_name,
      customer_phone: row.customer_phone,
      customer_gstin: row.customer_gstin || undefined,
    };
  }

  static async searchCustomers(
    storeId: string,
    query: string,
    limit = 8
  ): Promise<Array<{
    customer_name: string;
    customer_phone: string;
    customer_gstin?: string;
    visit_count: number;
    total_spend: number;
    last_visit: string;
  }>> {
    const validStoreId = this.resolveValidStoreId(storeId);
    const cleanQ = (query || '').trim();
    if (!cleanQ) return [];

    const pattern = `%${cleanQ}%`;
    const rows = this.db.prepare(`
      SELECT 
        customer_phone,
        COALESCE(MAX(CASE WHEN customer_name IS NOT NULL AND TRIM(customer_name) != '' THEN customer_name END), 'Customer') as customer_name,
        MAX(customer_gstin) as customer_gstin,
        COUNT(*) as visit_count,
        ROUND(SUM(total), 2) as total_spend,
        MAX(created_at) as last_visit
      FROM sales
      WHERE store_id = ? 
        AND customer_phone IS NOT NULL 
        AND TRIM(customer_phone) != ''
        AND (customer_phone LIKE ? OR customer_name LIKE ?)
      GROUP BY customer_phone
      ORDER BY 
        CASE WHEN customer_phone LIKE ? THEN 0 ELSE 1 END,
        visit_count DESC,
        last_visit DESC
      LIMIT ?
    `).all(validStoreId, pattern, pattern, `${cleanQ}%`, limit) as any[];

    return rows.map(r => ({
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      customer_gstin: r.customer_gstin || undefined,
      visit_count: Number(r.visit_count) || 1,
      total_spend: Number(r.total_spend) || 0,
      last_visit: r.last_visit,
    }));
  }

  static async getCustomerAnalytics(storeId: string): Promise<{
    summary: {
      total_unique_customers: number;
      repeat_customers: number;
      repeat_rate: number;
      total_spend: number;
      avg_spend_per_customer: number;
      visits_this_week: number;
      visits_last_week: number;
      new_customers_this_week: number;
    };
    customers: Array<{
      customer_name: string;
      customer_phone: string;
      customer_gstin?: string;
      total_visits: number;
      total_spend: number;
      avg_bill_value: number;
      first_visit: string;
      last_visit: string;
      tier: 'VIP' | 'REGULAR' | 'NEW';
      favorite_items: string[];
    }>;
    weekly_trends: Array<{
      date: string;
      day_name: string;
      visit_count: number;
      revenue: number;
    }>;
  }> {
    const validStoreId = this.resolveValidStoreId(storeId);

    // Fetch grouped customer records
    const customerRows = this.db.prepare(`
      SELECT 
        customer_phone,
        COALESCE(MAX(CASE WHEN customer_name IS NOT NULL AND TRIM(customer_name) != '' THEN customer_name END), 'Customer') as customer_name,
        MAX(customer_gstin) as customer_gstin,
        COUNT(*) as total_visits,
        ROUND(SUM(total), 2) as total_spend,
        ROUND(AVG(total), 2) as avg_bill_value,
        MIN(created_at) as first_visit,
        MAX(created_at) as last_visit
      FROM sales
      WHERE store_id = ? 
        AND customer_phone IS NOT NULL 
        AND TRIM(customer_phone) != ''
      GROUP BY customer_phone
      ORDER BY total_visits DESC, total_spend DESC
    `).all(validStoreId) as any[];

    // Fetch favorite items for all customers
    const favoriteItemsRows = this.db.prepare(`
      SELECT 
        s.customer_phone,
        si.product_name_snapshot,
        SUM(si.quantity) as total_qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.store_id = ? AND s.customer_phone IS NOT NULL AND TRIM(s.customer_phone) != ''
      GROUP BY s.customer_phone, si.product_name_snapshot
      ORDER BY s.customer_phone, total_qty DESC
    `).all(validStoreId) as any[];

    const customerFavMap = new Map<string, string[]>();
    for (const row of favoriteItemsRows) {
      const list = customerFavMap.get(row.customer_phone) || [];
      if (list.length < 3 && row.product_name_snapshot) {
        list.push(row.product_name_snapshot);
        customerFavMap.set(row.customer_phone, list);
      }
    }

    const customers = customerRows.map(c => {
      const visits = Number(c.total_visits) || 1;
      let tier: 'VIP' | 'REGULAR' | 'NEW' = 'NEW';
      if (visits >= 5) tier = 'VIP';
      else if (visits >= 2) tier = 'REGULAR';

      return {
        customer_name: c.customer_name,
        customer_phone: c.customer_phone,
        customer_gstin: c.customer_gstin || undefined,
        total_visits: visits,
        total_spend: Number(c.total_spend) || 0,
        avg_bill_value: Number(c.avg_bill_value) || 0,
        first_visit: c.first_visit,
        last_visit: c.last_visit,
        tier,
        favorite_items: customerFavMap.get(c.customer_phone) || [],
      };
    });

    const totalUnique = customers.length;
    const repeatCount = customers.filter(c => c.total_visits > 1).length;
    const repeatRate = totalUnique > 0 ? Math.round((repeatCount / totalUnique) * 1000) / 10 : 0;
    const totalSpend = customers.reduce((acc, c) => acc + c.total_spend, 0);
    const avgSpendPerCustomer = totalUnique > 0 ? Math.round((totalSpend / totalUnique) * 100) / 100 : 0;

    // Weekly visits comparison
    const weekStats = this.db.prepare(`
      SELECT 
        COUNT(CASE WHEN created_at >= date('now', '-7 days') THEN 1 END) as this_week,
        COUNT(CASE WHEN created_at >= date('now', '-14 days') AND created_at < date('now', '-7 days') THEN 1 END) as last_week,
        COUNT(CASE WHEN created_at >= date('now', '-7 days') AND customer_phone IN (
          SELECT customer_phone FROM sales WHERE store_id = ? GROUP BY customer_phone HAVING MIN(created_at) >= date('now', '-7 days')
        ) THEN 1 END) as new_this_week
      FROM sales
      WHERE store_id = ? AND customer_phone IS NOT NULL AND TRIM(customer_phone) != ''
    `).get(validStoreId, validStoreId) as any;

    // Last 7 days breakdown for visual chart (normalized to exactly 7 days)
    const dailyRows = this.db.prepare(`
      SELECT 
        strftime('%Y-%m-%d', created_at) as day_date,
        COUNT(*) as visit_count,
        ROUND(SUM(total), 2) as revenue
      FROM sales
      WHERE store_id = ? 
        AND customer_phone IS NOT NULL 
        AND TRIM(customer_phone) != ''
        AND created_at >= date('now', '-7 days')
      GROUP BY strftime('%Y-%m-%d', created_at)
      ORDER BY day_date ASC
    `).all(validStoreId) as any[];

    const dailyMap = new Map<string, { visit_count: number; revenue: number }>();
    for (const r of dailyRows) {
      dailyMap.set(r.day_date, {
        visit_count: Number(r.visit_count) || 0,
        revenue: Number(r.revenue) || 0,
      });
    }

    const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyTrends = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const isoDate = d.toISOString().slice(0, 10);
      const stats = dailyMap.get(isoDate) || { visit_count: 0, revenue: 0 };
      weeklyTrends.push({
        date: isoDate,
        day_name: daysMap[d.getDay()],
        visit_count: stats.visit_count,
        revenue: stats.revenue,
      });
    }

    return {
      summary: {
        total_unique_customers: totalUnique,
        repeat_customers: repeatCount,
        repeat_rate: repeatRate,
        total_spend: totalSpend,
        avg_spend_per_customer: avgSpendPerCustomer,
        visits_this_week: Number(weekStats?.this_week) || 0,
        visits_last_week: Number(weekStats?.last_week) || 0,
        new_customers_this_week: Number(weekStats?.new_this_week) || 0,
      },
      customers,
      weekly_trends: weeklyTrends,
    };
  }

  static async getCustomerHistory(storeId: string, phone: string): Promise<{
    customer: {
      customer_name: string;
      customer_phone: string;
      customer_gstin?: string;
      total_visits: number;
      total_spend: number;
    } | null;
    sales: Sale[];
  }> {
    const validStoreId = this.resolveValidStoreId(storeId);
    const cleanPhone = (phone || '').trim();
    if (!cleanPhone) return { customer: null, sales: [] };

    const saleRows = this.db.prepare(`
      SELECT id FROM sales
      WHERE store_id = ? AND customer_phone = ?
      ORDER BY created_at DESC
    `).all(validStoreId, cleanPhone) as any[];

    const sales: Sale[] = [];
    for (const r of saleRows) {
      const s = await this.getSaleById(r.id);
      if (s) sales.push(s);
    }

    const customerSummary = this.db.prepare(`
      SELECT 
        customer_phone,
        COALESCE(MAX(CASE WHEN customer_name IS NOT NULL AND TRIM(customer_name) != '' THEN customer_name END), 'Customer') as customer_name,
        MAX(customer_gstin) as customer_gstin,
        COUNT(*) as total_visits,
        ROUND(SUM(total), 2) as total_spend
      FROM sales
      WHERE store_id = ? AND customer_phone = ?
      GROUP BY customer_phone
    `).get(validStoreId, cleanPhone) as any;

    return {
      customer: customerSummary ? {
        customer_name: customerSummary.customer_name,
        customer_phone: customerSummary.customer_phone,
        customer_gstin: customerSummary.customer_gstin || undefined,
        total_visits: Number(customerSummary.total_visits) || 0,
        total_spend: Number(customerSummary.total_spend) || 0,
      } : null,
      sales,
    };
  }

  static async createSale(
    sale: Omit<Sale, 'id' | 'created_at' | 'items'>,
    items: Omit<SaleItem, 'id' | 'sale_id' | 'created_at'>[]
  ): Promise<Sale> {
    const saleId = ensureUuid((sale as any).id);
    const storeId = this.resolveValidStoreId(sale.store_id);
    const now = new Date().toISOString();
    const employeeId = nullableUuid(sale.employee_id);
    const voidedBy = nullableUuid(sale.voided_by);

    this.db.prepare(`
      INSERT INTO sales (
        id, store_id, bill_number, verification_token, employee_id, employee_name,
        subtotal, discount, tax, cgst, sgst, igst, gst_type, tax_mode, round_off,
        customer_name, customer_phone, customer_gstin, total, payment_method, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saleId,
      storeId,
      sale.bill_number,
      sale.verification_token,
      employeeId,
      sale.employee_name || '',
      Number(sale.subtotal) || 0,
      Number(sale.discount) || 0,
      Number(sale.tax) || 0,
      sale.cgst != null ? Number(sale.cgst) : 0,
      sale.sgst != null ? Number(sale.sgst) : 0,
      sale.igst != null ? Number(sale.igst) : 0,
      sale.gst_type || 'INTRA_STATE',
      sale.tax_mode || 'INCLUSIVE',
      Number(sale.round_off) || 0,
      sale.customer_name || null,
      sale.customer_phone || null,
      sale.customer_gstin || null,
      Number(sale.total) || 0,
      sale.payment_method || 'UPI',
      sale.status || 'COMPLETED',
      sale.notes || null,
      now
    );

    const insertItemStmt = this.db.prepare(`
      INSERT INTO sale_items (
        id, sale_id, product_id, product_name_snapshot, sku_snapshot, barcode_snapshot,
        hsn_snapshot, quantity, unit_price, purchase_price_snapshot, tax_rate, tax_amount,
        tax_type_snapshot, taxable_value, cgst_amount, sgst_amount, igst_amount, discount, line_total, modifiers_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedItems: SaleItem[] = [];

    for (const item of items) {
      const itemId = ensureUuid((item as any).id);
      const prodId = nullableUuid(item.product_id);

      insertItemStmt.run(
        itemId,
        saleId,
        prodId,
        item.product_name_snapshot,
        item.sku_snapshot,
        item.barcode_snapshot,
        item.hsn_snapshot || null,
        Number(item.quantity) || 1,
        Number(item.unit_price) || 0,
        Number(item.purchase_price_snapshot) || 0,
        Number(item.tax_rate) || 0,
        Number(item.tax_amount) || 0,
        item.tax_type_snapshot || 'EXCLUSIVE',
        item.taxable_value != null ? Number(item.taxable_value) : 0,
        item.cgst_amount != null ? Number(item.cgst_amount) : 0,
        item.sgst_amount != null ? Number(item.sgst_amount) : 0,
        item.igst_amount != null ? Number(item.igst_amount) : 0,
        Number(item.discount) || 0,
        Number(item.line_total) || 0,
        JSON.stringify(item.selected_modifiers || []),
        now
      );

      insertedItems.push({
        ...item,
        id: itemId,
        sale_id: saleId,
        product_id: prodId || undefined,
        created_at: now,
      } as SaleItem);
    }

    return {
      ...sale,
      id: saleId,
      created_at: now,
      items: insertedItems,
    } as Sale;
  }

  static async voidSale(saleId: string, voidedBy: string, voidedByName: string, reason: string): Promise<Sale> {
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE sales
      SET status = 'VOIDED', voided_at = ?, voided_by = ?, voided_by_name = ?, void_reason = ?
      WHERE id = ?
    `).run(
      now,
      voidedBy,
      voidedByName,
      reason,
      saleId
    );

    const saleRow = this.db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any;
    const itemsRows = this.db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId) as any[];

    return {
      ...saleRow,
      items: itemsRows,
    } as Sale;
  }

  // EXPENSES
  static async getExpenses(storeId: string): Promise<Expense[]> {
    const rows = this.db.prepare('SELECT * FROM expenses WHERE store_id = ? ORDER BY created_at DESC').all(storeId) as any[];
    return rows.map(r => ({
      ...r,
      amount: Number(r.amount) || 0,
    })) as Expense[];
  }

  static async createExpense(expense: Omit<Expense, 'id' | 'created_at'>): Promise<Expense> {
    const id = ensureUuid((expense as any).id);
    const storeId = this.resolveValidStoreId(expense.store_id);
    const now = new Date().toISOString();
    const createdBy = nullableUuid(expense.created_by);

    this.db.prepare(`
      INSERT INTO expenses (id, store_id, created_by, created_by_name, category, amount, description, expense_date, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      storeId,
      createdBy,
      expense.created_by_name || '',
      expense.category,
      Number(expense.amount) || 0,
      expense.description || '',
      expense.expense_date,
      expense.status || 'ACTIVE',
      now
    );

    return {
      ...expense,
      store_id: storeId,
      id,
      created_at: now,
    } as Expense;
  }

  static async voidExpense(expenseId: string): Promise<Expense> {
    this.db.prepare("UPDATE expenses SET status = 'VOIDED' WHERE id = ?").run(expenseId);
    const row = this.db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId) as any;
    return row as Expense;
  }

  // AUDIT LOGS
  static async getAuditLogs(storeId: string, limit = 300): Promise<AuditLog[]> {
    const rows = this.db.prepare(`
      SELECT * FROM audit_logs WHERE store_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(storeId, limit) as any[];

    return rows.map(r => ({
      ...r,
      before_data: r.before_data ? JSON.parse(r.before_data) : undefined,
      after_data: r.after_data ? JSON.parse(r.after_data) : undefined,
    })) as AuditLog[];
  }

  static async createAuditLog(log: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog> {
    const id = crypto.randomUUID();
    const storeId = this.resolveValidStoreId(log.store_id);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO audit_logs (id, store_id, user_id, user_name, action, entity_type, entity_id, before_data, after_data, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      storeId,
      nullableUuid(log.user_id),
      log.user_name || '',
      log.action,
      log.entity_type,
      nullableUuid(log.entity_id),
      log.before_data ? JSON.stringify(log.before_data) : null,
      log.after_data ? JSON.stringify(log.after_data) : null,
      log.ip_address || null,
      log.user_agent || null,
      now
    );

    return {
      ...log,
      id,
      created_at: now,
    } as AuditLog;
  }

  // SEQUENCES & BILL NUMBER GENERATION
  static async getNextBillNumber(storeId: string): Promise<string> {
    const store = await this.getStore(storeId);
    if (!store) throw new Error('Store not found');

    const year = new Date().getFullYear();
    const cleanPrefix = (store.invoice_prefix && store.invoice_prefix !== 'INV' && store.invoice_prefix !== 'INV-' ? store.invoice_prefix : 'BILL').replace(/-+$/, '');
    const billPrefix = `${cleanPrefix}-${year}-`;

    // Atomic increment in SQLite
    this.db.prepare(`
      INSERT INTO bill_sequences (store_id, year, last_number)
      VALUES (?, ?, 1)
      ON CONFLICT(store_id, year)
      DO UPDATE SET last_number = last_number + 1
    `).run(storeId, year);

    const seqRow = this.db.prepare(`
      SELECT last_number FROM bill_sequences WHERE store_id = ? AND year = ?
    `).get(storeId, year) as any;

    const nextVal = seqRow?.last_number || 1;
    const formattedNum = String(nextVal).padStart(6, '0');
    return `${billPrefix}${formattedNum}`;
  }

  static getNextBillNumberSync(storeId: string): string {
    const storeRow = this.db.prepare('SELECT invoice_prefix FROM stores WHERE id = ?').get(storeId) as any;
    const year = new Date().getFullYear();
    const cleanPrefix = (storeRow?.invoice_prefix && storeRow.invoice_prefix !== 'INV' && storeRow.invoice_prefix !== 'INV-' ? storeRow.invoice_prefix : 'BILL').replace(/-+$/, '');
    const billPrefix = `${cleanPrefix}-${year}-`;

    this.db.prepare(`
      INSERT INTO bill_sequences (store_id, year, last_number)
      VALUES (?, ?, 1)
      ON CONFLICT(store_id, year)
      DO UPDATE SET last_number = last_number + 1
    `).run(storeId, year);

    const seqRow = this.db.prepare(`
      SELECT last_number FROM bill_sequences WHERE store_id = ? AND year = ?
    `).get(storeId, year) as any;

    const nextVal = seqRow?.last_number || 1;
    const formattedNum = String(nextVal).padStart(6, '0');
    return `${billPrefix}${formattedNum}`;
  }

  // ==========================================
  // CASH DRAWER CONTROL & SESSIONS
  // ==========================================

  static async getActiveCashDrawerSession(storeId: string): Promise<CashDrawerSession | null> {
    const validStoreId = this.resolveValidStoreId(storeId);
    const row = this.db.prepare(`
      SELECT * FROM cash_drawer_sessions
      WHERE store_id = ? AND status = 'OPEN'
      ORDER BY opened_at DESC LIMIT 1
    `).get(validStoreId) as any;

    if (!row) return null;
    return {
      ...row,
      opening_amount: Number(row.opening_amount) || 0,
      closing_amount: row.closing_amount !== null && row.closing_amount !== undefined ? Number(row.closing_amount) : undefined,
      expected_amount: Number(row.expected_amount) || 0,
      cash_sales_amount: Number(row.cash_sales_amount) || 0,
      cash_in_amount: Number(row.cash_in_amount) || 0,
      cash_out_amount: Number(row.cash_out_amount) || 0,
      difference: row.difference !== null && row.difference !== undefined ? Number(row.difference) : undefined,
    } as CashDrawerSession;
  }

  static async getLastClosedCashDrawerSession(storeId: string): Promise<CashDrawerSession | null> {
    const validStoreId = this.resolveValidStoreId(storeId);
    const row = this.db.prepare(`
      SELECT * FROM cash_drawer_sessions
      WHERE store_id = ? AND status = 'CLOSED'
      ORDER BY closed_at DESC, opened_at DESC LIMIT 1
    `).get(validStoreId) as any;

    if (!row) return null;
    return {
      ...row,
      opening_amount: Number(row.opening_amount) || 0,
      closing_amount: row.closing_amount !== null && row.closing_amount !== undefined ? Number(row.closing_amount) : 0,
      expected_amount: Number(row.expected_amount) || 0,
      cash_sales_amount: Number(row.cash_sales_amount) || 0,
      cash_in_amount: Number(row.cash_in_amount) || 0,
      cash_out_amount: Number(row.cash_out_amount) || 0,
      difference: row.difference !== null && row.difference !== undefined ? Number(row.difference) : 0,
    } as CashDrawerSession;
  }

  static async getCashDrawerSession(sessionId: string): Promise<CashDrawerSession | null> {
    const row = this.db.prepare(`
      SELECT * FROM cash_drawer_sessions WHERE id = ?
    `).get(sessionId) as any;

    if (!row) return null;
    return {
      ...row,
      opening_amount: Number(row.opening_amount) || 0,
      closing_amount: row.closing_amount !== null && row.closing_amount !== undefined ? Number(row.closing_amount) : undefined,
      expected_amount: Number(row.expected_amount) || 0,
      cash_sales_amount: Number(row.cash_sales_amount) || 0,
      cash_in_amount: Number(row.cash_in_amount) || 0,
      cash_out_amount: Number(row.cash_out_amount) || 0,
      difference: row.difference !== null && row.difference !== undefined ? Number(row.difference) : undefined,
    } as CashDrawerSession;
  }

  static async createCashDrawerSession(session: Omit<CashDrawerSession, 'id' | 'created_at' | 'updated_at'>): Promise<CashDrawerSession> {
    const id = ensureUuid((session as any).id);
    const storeId = this.resolveValidStoreId(session.store_id);
    const now = new Date().toISOString();
    const openedBy = nullableUuid(session.opened_by);

    this.db.prepare(`
      INSERT INTO cash_drawer_sessions (
        id, store_id, opened_by, opened_by_name, opened_at,
        opening_amount, opening_denominations_json, opening_notes,
        closed_by, closed_by_name, closed_at,
        closing_amount, closing_denominations_json, closing_notes,
        expected_amount, cash_sales_amount, cash_in_amount, cash_out_amount,
        difference, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      storeId,
      openedBy,
      session.opened_by_name || 'Cashier',
      session.opened_at || now,
      Number(session.opening_amount) || 0,
      session.opening_denominations_json || '{}',
      session.opening_notes || '',
      session.closed_by || null,
      session.closed_by_name || null,
      session.closed_at || null,
      session.closing_amount !== undefined ? Number(session.closing_amount) : null,
      session.closing_denominations_json || '{}',
      session.closing_notes || '',
      Number(session.expected_amount) || Number(session.opening_amount) || 0,
      Number(session.cash_sales_amount) || 0,
      Number(session.cash_in_amount) || 0,
      Number(session.cash_out_amount) || 0,
      session.difference !== undefined ? Number(session.difference) : 0,
      session.status || 'OPEN',
      now,
      now
    );

    return (await this.getCashDrawerSession(id))!;
  }

  static async updateCashDrawerSession(sessionId: string, updates: Partial<CashDrawerSession>): Promise<CashDrawerSession> {
    const existing = await this.getCashDrawerSession(sessionId);
    if (!existing) throw new Error('Cash drawer session not found');

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.closed_by !== undefined) { fields.push('closed_by = ?'); values.push(nullableUuid(updates.closed_by)); }
    if (updates.closed_by_name !== undefined) { fields.push('closed_by_name = ?'); values.push(updates.closed_by_name); }
    if (updates.closed_at !== undefined) { fields.push('closed_at = ?'); values.push(updates.closed_at); }
    if (updates.closing_amount !== undefined) { fields.push('closing_amount = ?'); values.push(Number(updates.closing_amount)); }
    if (updates.closing_denominations_json !== undefined) { fields.push('closing_denominations_json = ?'); values.push(updates.closing_denominations_json); }
    if (updates.closing_notes !== undefined) { fields.push('closing_notes = ?'); values.push(updates.closing_notes); }
    if (updates.expected_amount !== undefined) { fields.push('expected_amount = ?'); values.push(Number(updates.expected_amount)); }
    if (updates.cash_sales_amount !== undefined) { fields.push('cash_sales_amount = ?'); values.push(Number(updates.cash_sales_amount)); }
    if (updates.cash_in_amount !== undefined) { fields.push('cash_in_amount = ?'); values.push(Number(updates.cash_in_amount)); }
    if (updates.cash_out_amount !== undefined) { fields.push('cash_out_amount = ?'); values.push(Number(updates.cash_out_amount)); }
    if (updates.difference !== undefined) { fields.push('difference = ?'); values.push(Number(updates.difference)); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }

    values.push(sessionId);
    this.db.prepare(`UPDATE cash_drawer_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return (await this.getCashDrawerSession(sessionId))!;
  }

  static async listCashDrawerSessions(storeId: string, limit = 50): Promise<CashDrawerSession[]> {
    const validStoreId = this.resolveValidStoreId(storeId);
    const rows = this.db.prepare(`
      SELECT * FROM cash_drawer_sessions
      WHERE store_id = ?
      ORDER BY opened_at DESC
      LIMIT ?
    `).all(validStoreId, limit) as any[];

    return rows.map(r => ({
      ...r,
      opening_amount: Number(r.opening_amount) || 0,
      closing_amount: r.closing_amount !== null && r.closing_amount !== undefined ? Number(r.closing_amount) : undefined,
      expected_amount: Number(r.expected_amount) || 0,
      cash_sales_amount: Number(r.cash_sales_amount) || 0,
      cash_in_amount: Number(r.cash_in_amount) || 0,
      cash_out_amount: Number(r.cash_out_amount) || 0,
      difference: r.difference !== null && r.difference !== undefined ? Number(r.difference) : undefined,
    })) as CashDrawerSession[];
  }

  static async createCashDrawerTransaction(tx: Omit<CashDrawerTransaction, 'id' | 'created_at'>): Promise<CashDrawerTransaction> {
    const id = ensureUuid((tx as any).id);
    const storeId = this.resolveValidStoreId(tx.store_id);
    const now = new Date().toISOString();
    const performedBy = nullableUuid(tx.performed_by);

    this.db.prepare(`
      INSERT INTO cash_drawer_transactions (
        id, session_id, store_id, type, amount, category, reason, reference_id, performed_by, performed_by_name, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tx.session_id,
      storeId,
      tx.type,
      Number(tx.amount) || 0,
      tx.category || '',
      tx.reason || '',
      tx.reference_id || '',
      performedBy,
      tx.performed_by_name || 'Staff',
      tx.notes || '',
      now
    );

    return {
      ...tx,
      id,
      store_id: storeId,
      performed_by: performedBy || undefined,
      created_at: now,
    } as CashDrawerTransaction;
  }

  static async getCashDrawerTransactions(sessionId: string): Promise<CashDrawerTransaction[]> {
    const rows = this.db.prepare(`
      SELECT * FROM cash_drawer_transactions
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(sessionId) as any[];

    return rows.map(r => ({
      ...r,
      amount: Number(r.amount) || 0,
    })) as CashDrawerTransaction[];
  }

  // ==========================================
  // EMPLOYEE TAB PERMISSIONS
  // ==========================================

  static async getEmployeePermissions(userId: string, storeId: string): Promise<string[]> {
    try {
      const row = this.db.prepare('SELECT permissions_json FROM employee_tab_permissions WHERE user_id = ?').get(userId) as any;
      if (row?.permissions_json) {
        return JSON.parse(row.permissions_json);
      }
      const userRow = this.db.prepare('SELECT permissions_json FROM users WHERE id = ?').get(userId) as any;
      if (userRow?.permissions_json) {
        return JSON.parse(userRow.permissions_json);
      }
    } catch (_) {}
    return ['billing', 'inventory', 'sales', 'movements', 'cash_control'];
  }

  static async setEmployeePermissions(userId: string, storeId: string, permissions: string[]): Promise<void> {
    const now = new Date().toISOString();
    const json = JSON.stringify(permissions);

    this.db.prepare(`
      INSERT INTO employee_tab_permissions (user_id, store_id, permissions_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET permissions_json = excluded.permissions_json, updated_at = excluded.updated_at
    `).run(userId, storeId, json, now);

    try {
      this.db.prepare('UPDATE users SET permissions_json = ? WHERE id = ?').run(json, userId);
    } catch (_) {}
  }

  // EXPORT BACKUP
  static exportBackup(storeId?: string) {
    const db = this.db;
    const stores = (storeId ? db.prepare('SELECT * FROM stores WHERE id = ?').all(storeId) : db.prepare('SELECT * FROM stores').all()) as any[];
    const users = (storeId ? db.prepare('SELECT * FROM users WHERE store_id = ?').all(storeId) : db.prepare('SELECT * FROM users').all()) as any[];
    const categories = (storeId ? db.prepare('SELECT * FROM categories WHERE store_id = ?').all(storeId) : db.prepare('SELECT * FROM categories').all()) as any[];
    const products = (storeId ? db.prepare('SELECT * FROM products WHERE store_id = ?').all(storeId) : db.prepare('SELECT * FROM products').all()) as any[];
    const stock_movements = (storeId ? db.prepare('SELECT * FROM stock_movements WHERE store_id = ?').all(storeId) : db.prepare('SELECT * FROM stock_movements').all()) as any[];
    const sales = (storeId ? db.prepare('SELECT * FROM sales WHERE store_id = ?').all(storeId) : db.prepare('SELECT * FROM sales').all()) as any[];
    const sale_items = db.prepare('SELECT * FROM sale_items').all() as any[];
    const expenses = (storeId ? db.prepare('SELECT * FROM expenses WHERE store_id = ?').all(storeId) : db.prepare('SELECT * FROM expenses').all()) as any[];
    const audit_logs = (storeId ? db.prepare('SELECT * FROM audit_logs WHERE store_id = ?').all(storeId) : db.prepare('SELECT * FROM audit_logs').all()) as any[];
    const bill_sequences = (storeId ? db.prepare('SELECT * FROM bill_sequences WHERE store_id = ?').all(storeId) : db.prepare('SELECT * FROM bill_sequences').all()) as any[];

    return {
      version: '1.0',
      system: 'LedgerStore',
      exported_at: new Date().toISOString(),
      stats: {
        stores: stores.length,
        users: users.length,
        categories: categories.length,
        products: products.length,
        stock_movements: stock_movements.length,
        sales: sales.length,
        sale_items: sale_items.length,
        expenses: expenses.length,
        audit_logs: audit_logs.length,
        bill_sequences: bill_sequences.length,
        total_records: stores.length + users.length + categories.length + products.length + stock_movements.length + sales.length + sale_items.length + expenses.length + audit_logs.length + bill_sequences.length,
      },
      data: {
        stores,
        users,
        categories,
        products,
        stock_movements,
        sales,
        sale_items,
        expenses,
        audit_logs,
        bill_sequences,
      }
    };
  }

  // IMPORT BACKUP (Atomic Transaction Rollback)
  static importBackup(payload: any): { success: boolean; counts: Record<string, number> } {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid backup file: payload is not a valid JSON object');
    }
    const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;

    if (!Array.isArray(data.stores) || data.stores.length === 0) {
      throw new Error('Invalid backup file: missing required stores table');
    }

    const db = this.db;
    try {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('BEGIN TRANSACTION;');

      // Wipe tables cleanly
      db.exec('DELETE FROM sale_items;');
      db.exec('DELETE FROM sales;');
      db.exec('DELETE FROM stock_movements;');
      db.exec('DELETE FROM expenses;');
      db.exec('DELETE FROM audit_logs;');
      db.exec('DELETE FROM products;');
      db.exec('DELETE FROM categories;');
      db.exec('DELETE FROM bill_sequences;');
      db.exec('DELETE FROM users;');
      db.exec('DELETE FROM stores;');

      // Stores
      const insertStore = db.prepare(`
        INSERT INTO stores (id, name, code, address, phone, email, gstin, currency, timezone, invoice_prefix, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of data.stores || []) {
        insertStore.run(
          s.id, s.name, s.code, s.address || '', s.phone || '', s.email || '',
          s.gstin || '', s.currency || 'INR', s.timezone || 'Asia/Kolkata',
          s.invoice_prefix || 'BILL', s.created_at || new Date().toISOString(), s.updated_at || new Date().toISOString()
        );
      }

      // Users
      const insertUser = db.prepare(`
        INSERT INTO users (id, store_id, name, email, password_hash, salt, role, active, last_login_at, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const u of data.users || []) {
        insertUser.run(
          u.id, u.store_id, u.name, u.email, u.password_hash, u.salt,
          u.role || 'EMPLOYEE', u.active !== undefined ? (u.active ? 1 : 0) : 1,
          u.last_login_at || null, u.created_by || null,
          u.created_at || new Date().toISOString(), u.updated_at || new Date().toISOString()
        );
      }

      // Categories
      const insertCategory = db.prepare(`
        INSERT INTO categories (id, store_id, name, description, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of data.categories || []) {
        insertCategory.run(
          c.id, c.store_id, c.name, c.description || '',
          c.active !== undefined ? (c.active ? 1 : 0) : 1,
          c.created_at || new Date().toISOString(), c.updated_at || new Date().toISOString()
        );
      }

      // Products
      const insertProduct = db.prepare(`
        INSERT INTO products (id, store_id, category_id, name, sku, barcode, hsn_code, description, purchase_price, purchase_tax_type, selling_price, tax_rate, tax_type, current_stock, minimum_stock, unit, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of data.products || []) {
        insertProduct.run(
          p.id, p.store_id, p.category_id || null, p.name, p.sku, p.barcode,
          p.hsn_code || '', p.description || '',
          Number(p.purchase_price) || 0, p.purchase_tax_type || 'EXCLUSIVE',
          Number(p.selling_price) || 0, Number(p.tax_rate) || 0,
          p.tax_type || 'EXCLUSIVE', Number(p.current_stock) || 0,
          Number(p.minimum_stock) || 0, p.unit || 'piece',
          p.active !== undefined ? (p.active ? 1 : 0) : 1,
          p.created_at || new Date().toISOString(), p.updated_at || new Date().toISOString()
        );
      }

      // Stock movements
      const insertStockMovement = db.prepare(`
        INSERT INTO stock_movements (id, store_id, product_id, product_name, user_id, user_name, type, quantity, before_stock, after_stock, reason, reference_type, reference_id, purchase_cost, tax_rate, tax_amount, supplier_invoice, supplier_gstin, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const sm of data.stock_movements || []) {
        insertStockMovement.run(
          sm.id, sm.store_id, sm.product_id, sm.product_name || '', sm.user_id || null,
          sm.user_name || '', sm.type, Number(sm.quantity) || 0,
          Number(sm.before_stock) || 0, Number(sm.after_stock) || 0,
          sm.reason || '', sm.reference_type || null, sm.reference_id || null,
          sm.purchase_cost != null ? Number(sm.purchase_cost) : null,
          sm.tax_rate != null ? Number(sm.tax_rate) : null,
          sm.tax_amount != null ? Number(sm.tax_amount) : null,
          sm.supplier_invoice || null, sm.supplier_gstin || null,
          sm.created_at || new Date().toISOString()
        );
      }

      // Sales
      const insertSale = db.prepare(`
        INSERT INTO sales (id, store_id, bill_number, verification_token, employee_id, employee_name, subtotal, discount, tax, cgst, sgst, igst, gst_type, tax_mode, round_off, customer_name, customer_phone, customer_gstin, total, payment_method, status, notes, created_at, voided_at, voided_by, voided_by_name, void_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of data.sales || []) {
        insertSale.run(
          s.id, s.store_id, s.bill_number, s.verification_token,
          s.employee_id || null, s.employee_name || '',
          Number(s.subtotal) || 0, Number(s.discount) || 0, Number(s.tax) || 0,
          Number(s.cgst) || 0, Number(s.sgst) || 0, Number(s.igst) || 0,
          s.gst_type || 'INTRA_STATE', s.tax_mode || 'INCLUSIVE',
          Number(s.round_off) || 0, s.customer_name || null, s.customer_phone || null,
          s.customer_gstin || null, Number(s.total) || 0,
          s.payment_method || 'UPI', s.status || 'COMPLETED', s.notes || null,
          s.created_at || new Date().toISOString(), s.voided_at || null,
          s.voided_by || null, s.voided_by_name || null, s.void_reason || null
        );
      }

      // Sale items
      const insertSaleItem = db.prepare(`
        INSERT INTO sale_items (id, sale_id, product_id, product_name_snapshot, sku_snapshot, barcode_snapshot, hsn_snapshot, quantity, unit_price, purchase_price_snapshot, tax_rate, tax_amount, tax_type_snapshot, taxable_value, cgst_amount, sgst_amount, igst_amount, discount, line_total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const si of data.sale_items || []) {
        insertSaleItem.run(
          si.id, si.sale_id, si.product_id || null, si.product_name_snapshot || '',
          si.sku_snapshot || '', si.barcode_snapshot || '', si.hsn_snapshot || null,
          Number(si.quantity) || 1, Number(si.unit_price) || 0,
          Number(si.purchase_price_snapshot) || 0, Number(si.tax_rate) || 0,
          Number(si.tax_amount) || 0, si.tax_type_snapshot || 'EXCLUSIVE',
          Number(si.taxable_value) || 0, Number(si.cgst_amount) || 0,
          Number(si.sgst_amount) || 0, Number(si.igst_amount) || 0,
          Number(si.discount) || 0, Number(si.line_total) || 0,
          si.created_at || new Date().toISOString()
        );
      }

      // Expenses
      const insertExpense = db.prepare(`
        INSERT INTO expenses (id, store_id, created_by, created_by_name, category, amount, description, expense_date, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const exp of data.expenses || []) {
        insertExpense.run(
          exp.id, exp.store_id, exp.created_by || null, exp.created_by_name || '',
          exp.category, Number(exp.amount) || 0, exp.description || '',
          exp.expense_date, exp.status || 'ACTIVE', exp.created_at || new Date().toISOString()
        );
      }

      // Audit logs
      const insertAuditLog = db.prepare(`
        INSERT INTO audit_logs (id, store_id, user_id, user_name, action, entity_type, entity_id, before_data, after_data, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const al of data.audit_logs || []) {
        insertAuditLog.run(
          al.id, al.store_id, al.user_id || null, al.user_name || null,
          al.action, al.entity_type, al.entity_id || null,
          typeof al.before_data === 'object' ? JSON.stringify(al.before_data) : (al.before_data || null),
          typeof al.after_data === 'object' ? JSON.stringify(al.after_data) : (al.after_data || null),
          al.ip_address || null, al.user_agent || null, al.created_at || new Date().toISOString()
        );
      }

      // Bill sequences
      const insertSeq = db.prepare(`
        INSERT INTO bill_sequences (store_id, year, last_number)
        VALUES (?, ?, ?)
      `);
      for (const bs of data.bill_sequences || []) {
        insertSeq.run(bs.store_id, bs.year, Number(bs.last_number) || 0);
      }

      db.exec('COMMIT;');
      db.exec('PRAGMA foreign_keys = ON;');

      return {
        success: true,
        counts: {
          stores: (data.stores || []).length,
          users: (data.users || []).length,
          categories: (data.categories || []).length,
          products: (data.products || []).length,
          stock_movements: (data.stock_movements || []).length,
          sales: (data.sales || []).length,
          sale_items: (data.sale_items || []).length,
          expenses: (data.expenses || []).length,
          audit_logs: (data.audit_logs || []).length,
          bill_sequences: (data.bill_sequences || []).length,
        }
      };
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch (_) {}
      try { db.exec('PRAGMA foreign_keys = ON;'); } catch (_) {}
      throw err;
    }
  }

  // DIAGNOSTICS & STATS
  static getStats() {
    return {
      dbPath: DB_FILE_PATH,
      fileSizeBytes: fs.existsSync(DB_FILE_PATH) ? fs.statSync(DB_FILE_PATH).size : 0,
      counts: {
        stores: (this.db.prepare('SELECT COUNT(*) as c FROM stores').get() as any)?.c || 0,
        users: (this.db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0,
        categories: (this.db.prepare('SELECT COUNT(*) as c FROM categories').get() as any)?.c || 0,
        products: (this.db.prepare('SELECT COUNT(*) as c FROM products').get() as any)?.c || 0,
        stock_movements: (this.db.prepare('SELECT COUNT(*) as c FROM stock_movements').get() as any)?.c || 0,
        sales: (this.db.prepare('SELECT COUNT(*) as c FROM sales').get() as any)?.c || 0,
        sale_items: (this.db.prepare('SELECT COUNT(*) as c FROM sale_items').get() as any)?.c || 0,
        expenses: (this.db.prepare('SELECT COUNT(*) as c FROM expenses').get() as any)?.c || 0,
        audit_logs: (this.db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any)?.c || 0,
      }
    };
  }
}
