import crypto from 'crypto';
import { LocalDb, localDbManager } from './localDb.ts';

// ============================================================
// TYPES — match Supabase schema exactly
// ============================================================

export interface Store {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  currency: string;
  timezone: string;
  invoice_prefix: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  store_id: string;
  name: string;
  email: string;
  password_hash: string;
  salt: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER';
  active: boolean;
  last_login_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  category_id?: string;
  name: string;
  sku: string;
  barcode: string;
  hsn_code?: string;
  description: string;
  purchase_price: number;
  purchase_tax_type?: 'EXCLUSIVE' | 'INCLUSIVE';
  selling_price: number;
  tax_rate: number;
  tax_type?: 'EXCLUSIVE' | 'INCLUSIVE';
  current_stock: number;
  minimum_stock: number;
  unit: string;
  package_info?: string;
  active: boolean;
  modifierGroups?: any[];
  recipe?: any;
  created_at: string;
  updated_at: string;
}

export type MovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN' | 'VOID' | 'INITIAL_STOCK';

export interface StockMovement {
  id: string;
  store_id: string;
  product_id: string;
  product_name: string;
  user_id: string;
  user_name: string;
  type: MovementType;
  quantity: number;
  before_stock: number;
  after_stock: number;
  reason?: string;
  reference_type?: string;
  reference_id?: string;
  purchase_cost?: number;
  tax_rate?: number;
  tax_amount?: number;
  supplier_invoice?: string;
  supplier_gstin?: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  barcode_snapshot: string;
  hsn_snapshot?: string;
  quantity: number;
  unit_price: number;
  purchase_price_snapshot: number;
  tax_rate: number;
  tax_amount: number;
  tax_type_snapshot?: 'EXCLUSIVE' | 'INCLUSIVE';
  taxable_value?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  discount: number;
  line_total: number;
  selected_modifiers?: any[];
  created_at: string;
}

export interface Sale {
  id: string;
  store_id: string;
  bill_number: string;
  verification_token: string;
  employee_id: string;
  employee_name: string;
  subtotal: number;
  discount: number;
  tax: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  gst_type?: 'INTRA_STATE' | 'INTER_STATE' | 'EXEMPT';
  tax_mode?: 'INCLUSIVE' | 'EXCLUSIVE' | 'AUTO';
  round_off?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  total: number;
  payment_method: 'CASH' | 'UPI' | 'CARD' | 'OTHER';
  status: 'COMPLETED' | 'VOIDED' | 'REFUNDED';
  notes?: string;
  created_at: string;
  voided_at?: string;
  voided_by?: string;
  voided_by_name?: string;
  void_reason?: string;
  items?: SaleItem[];
}

export interface Expense {
  id: string;
  store_id: string;
  created_by: string;
  created_by_name: string;
  category: string;
  amount: number;
  description: string;
  expense_date: string;
  status: 'ACTIVE' | 'VOIDED';
  created_at: string;
}

export interface AuditLog {
  id: string;
  store_id: string;
  user_id?: string;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  before_data?: any;
  after_data?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface BillSequence {
  store_id: string;
  year: number;
  last_number: number;
}

export interface DatabaseSchema {
  stores: Store[];
  users: User[];
  categories: Category[];
  products: Product[];
  stock_movements: StockMovement[];
  sales: Sale[];
  sale_items: SaleItem[];
  expenses: Expense[];
  audit_logs: AuditLog[];
  bill_sequences: BillSequence[];
}

// ============================================================
// PASSWORD UTILITIES
// ============================================================

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!password || !hash) return false;

  // 1. Support PBKDF2 formats (e.g. PBKDF2$100000$salt$hash or PBKDF2$algo$iterations$salt$hash)
  if (hash.startsWith('PBKDF2$') || hash.startsWith('pbkdf2_')) {
    try {
      const parts = hash.split('$');
      let iterations = 100000;
      let hashSalt: Buffer | undefined;
      let targetHashStr = '';
      let algo = 'sha256';

      if (parts.length === 4) {
        iterations = parseInt(parts[1], 10);
        hashSalt = Buffer.from(parts[2], 'base64');
        targetHashStr = parts[3];
      } else if (parts.length === 5) {
        const algoStr = parts[1].toLowerCase();
        if (algoStr.includes('sha512')) algo = 'sha512';
        else if (algoStr.includes('sha1')) algo = 'sha1';
        else algo = 'sha256';

        iterations = parseInt(parts[2], 10);
        hashSalt = Buffer.from(parts[3], 'base64');
        targetHashStr = parts[4];
      }

      if (hashSalt && targetHashStr) {
        const targetBuf = Buffer.from(targetHashStr, 'base64');
        const derived = crypto.pbkdf2Sync(password, hashSalt, iterations, targetBuf.length || 32, algo);
        if (derived.length === targetBuf.length && crypto.timingSafeEqual(derived, targetBuf)) {
          return true;
        }
      }
    } catch (_) {
      // Fall through to scrypt check
    }
  }

  // 2. Default scrypt format
  try {
    const testHash = hashPassword(password, salt);
    const bufA = Buffer.from(testHash, 'hex');
    const bufB = Buffer.from(hash, 'hex');
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return true;
    }
  } catch (_) {
    return false;
  }

  return false;
}

// ============================================================
// IN-MEMORY CACHE — populated from Supabase on startup
// No hardcoded data. No local JSON file.
// ============================================================

class Database {
  private cache: DatabaseSchema = {
    stores: [],
    users: [],
    categories: [],
    products: [],
    stock_movements: [],
    sales: [],
    sale_items: [],
    expenses: [],
    audit_logs: [],
    bill_sequences: [],
  };

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  public waitForInit(): Promise<void> {
    return this.initPromise ?? Promise.resolve();
  }

  private async init() {
    try {
      await localDbManager.initialize();
      await this.syncFromLocalDb();
    } catch (err) {
      console.error('❌ Failed to initialize local SQLite database:', err);
    }
    this.initialized = true;
  }

  public async syncFromLocalDb() {
    try {
      let store = await LocalDb.getFirstStore();
      if (!store) {
        store = {
          id: 'a0000000-0000-0000-0000-000000000001',
          name: 'FryFreeze',
          code: 'FRYFREEZE-01',
          address: '123 Dessert Boulevard, Indiranagar, Bengaluru, KA 560038',
          phone: '+91 98765 43210',
          email: 'orders@fryfreeze.com',
          gstin: '29AABCU9603R1ZM',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          invoice_prefix: 'FF',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.cache.stores = [store];
      } else {
        this.cache.stores = [store];
      }
      const storeId = store.id;

      const [
        users,
        categories,
        products,
        stock_movements,
        sales,
        expenses,
        audit_logs,
      ] = await Promise.all([
        LocalDb.getUsers(storeId),
        LocalDb.getCategories(storeId),
        LocalDb.getProducts(storeId),
        LocalDb.getStockMovements(storeId, 500),
        LocalDb.getSales(storeId, 500),
        LocalDb.getExpenses(storeId),
        LocalDb.getAuditLogs(storeId, 500),
      ]);

      this.cache.users = users;
      this.cache.categories = categories;
      this.cache.products = products;
      this.cache.stock_movements = stock_movements;
      this.cache.sales = sales;
      this.cache.expenses = expenses;
      this.cache.audit_logs = audit_logs;

      const saleItems: SaleItem[] = [];
      sales.forEach(s => {
        if (s.items && Array.isArray(s.items)) {
          saleItems.push(...s.items);
        }
      });
      this.cache.sale_items = saleItems;

      console.log(`✅ Local SQLite loaded — store: "${store.name}", users: ${users.length}, products: ${products.length}, sales: ${sales.length}`);
    } catch (err) {
      console.error('❌ Failed to sync from Local SQLite:', err);
    }
  }

  // save() is a no-op now — all writes go directly to SQLite LocalDb
  public save() {}

  // Getters for in-memory cache (used as read-through cache)
  get stores() { return this.cache.stores; }
  get users() { return this.cache.users; }
  get categories() { return this.cache.categories; }
  get products() { return this.cache.products; }
  get stock_movements() { return this.cache.stock_movements; }
  get sales() { return this.cache.sales; }
  get sale_items() { return this.cache.sale_items; }
  get expenses() { return this.cache.expenses; }
  get audit_logs() { return this.cache.audit_logs; }
  get bill_sequences() { return this.cache.bill_sequences; }

  // Sequential bill number using atomic SQLite counter
  public async getNextBillNumberAsync(storeId: string): Promise<string> {
    return LocalDb.getNextBillNumberSync(storeId);
  }

  public getNextBillNumber(storeId: string): string {
    return LocalDb.getNextBillNumberSync(storeId);
  }
}

export const db = new Database();
