import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  rupeesToPaise,
  paiseToRupees,
  formatMoney,
  calculatePackBreakdown,
  calculateReceivedBaseQuantity,
  calculateWeightedAverageCost,
  calculateLineFinancials,
} from '../../src/shared/calculations.ts';
import { localDbManager } from '../localDb.ts';
import { db } from '../db.ts';

// ============================================================
// DATA MODELS & INTERFACES (Strictly typed integer minor units)
// ============================================================

export interface Unit {
  id: string;
  code: string; // g, ml, piece, kg, l
  display_name: string;
  dimension: 'mass' | 'volume' | 'count';
  base_unit_code: string; // g, ml, piece
  conversion_factor: number; // e.g. kg -> 1000
  precision_scale: number;
  is_active: number;
}

export interface InventoryItem {
  id: string;
  sku: string | null;
  name: string;
  category_id: string | null;
  base_unit_code: string; // g, ml, piece
  default_purchase_unit: string;
  default_pack_quantity_base: number;
  reorder_level_base: number;
  target_stock_level_base: number | null;
  costing_method: string; // weighted_average
  weighted_average_unit_cost_minor: number; // paise per 1 base unit
  current_stock_base: number; // Single scalar base unit
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryLot {
  id: string;
  inventory_item_id: string;
  lot_code: string;
  supplier_id: string | null;
  received_at: string;
  expiry_date: string | null;
  quantity_received_base: number;
  quantity_remaining_base: number;
  unit_cost_minor: number;
  purchase_line_id: string | null;
  status: 'active' | 'depleted' | 'expired';
  created_at: string;
}

export interface ProductRecord {
  id: string;
  sku: string | null;
  name: string;
  category_id: string | null;
  description: string | null;
  selling_price_minor: number;
  tax_rate_percent: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeVersion {
  id: string;
  product_id: string;
  version_number: number;
  status: 'active' | 'archived' | 'draft';
  yield_quantity: number;
  effective_from: string;
  change_reason: string | null;
  created_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_version_id: string;
  inventory_item_id: string;
  quantity_per_serving_base: number;
  is_optional: number;
  preparation_notes: string | null;
}

export interface ModifierGroup {
  id: string;
  name: string;
  selection_type: 'single' | 'multiple';
  min_selections: number;
  max_selections: number;
  is_required: number;
  is_active: number;
}

export interface Modifier {
  id: string;
  modifier_group_id: string;
  name: string;
  additional_price_minor: number;
  is_active: number;
  sort_order: number;
}

export interface ModifierIngredient {
  id: string;
  modifier_id: string;
  inventory_item_id: string;
  quantity_per_modifier_base: number;
}

export interface ProductModifierGroup {
  id: string;
  product_id: string;
  modifier_group_id: string;
}

export interface InventoryMovement {
  id: string;
  inventory_item_id: string;
  movement_type:
    | 'opening_balance'
    | 'purchase_receipt'
    | 'sale_consumption'
    | 'modifier_consumption'
    | 'wastage'
    | 'physical_adjustment'
    | 'return_restock'
    | 'correction_reversal';
  quantity_delta_base: number;
  resulting_quantity_base: number;
  unit_cost_snapshot: number;
  total_cost_minor: number;
  reference_type: 'sale' | 'purchase' | 'wastage' | 'stock_count' | 'refund' | 'manual' | null;
  reference_id: string | null;
  reason: string | null;
  created_at: string;
  created_by: string | null;
}

export interface PurchaseDto {
  purchaseNumber?: string;
  supplierId?: string | null;
  invoiceReference?: string | null;
  purchaseDate?: string;
  lines: Array<{
    inventoryItemId: string;
    purchaseUnit: string;
    packsReceived: number;
    quantityPerPackBase: number;
    lineTotalMinor: number;
  }>;
  discountMinor?: number;
  paymentStatus?: string;
  notes?: string | null;
}

export interface CheckoutCartItemDto {
  productId: string;
  quantity: number;
  selectedModifiers?: Array<{
    modifierId: string;
    quantity: number;
  }>;
  discountMinor?: number;
}

export interface CheckoutDto {
  idempotencyKey?: string | null;
  cartItems: CheckoutCartItemDto[];
  discountMinor?: number;
  paymentMethod?: string;
  amountPaidMinor?: number;
  notes?: string | null;
  cashierId?: string | null;
  allowNegativeStockSales?: boolean;
}

export interface WastageDto {
  inventoryItemId: string;
  quantityBase: number;
  reason: 'spoiled' | 'dropped' | 'melted' | 'expired' | 'prep_error';
  notes?: string | null;
  recordedBy?: string | null;
}

export interface RefundDto {
  saleId: string;
  amountMinor: number;
  reason: string;
  lines: Array<{
    saleItemId: string;
    quantityRefunded: number;
    amountMinor: number;
    restockDecision: 'discarded' | 'restocked';
  }>;
}

export interface StockCountLineDto {
  inventoryItemId: string;
  countedQuantityBase: number;
  notes?: string | null;
}

export interface StockCountDto {
  notes?: string | null;
  lines: StockCountLineDto[];
}

// ============================================================
// ENGINE IMPLEMENTATION
// ============================================================

export class InventoryLedgerEngine {
  private db: DatabaseSync;

  constructor(customDb?: DatabaseSync) {
    this.db = customDb || localDbManager.getRawDb();
    this.initSchema();
  }

  /**
   * Initializes all required relational tables, unique constraints, and indices.
   * Safe to run repeatedly.
   */
  public initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS units (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        dimension TEXT NOT NULL,
        base_unit_code TEXT NOT NULL,
        conversion_factor REAL NOT NULL DEFAULT 1.0,
        precision_scale INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        sku TEXT UNIQUE,
        name TEXT NOT NULL,
        category_id TEXT,
        base_unit_code TEXT NOT NULL DEFAULT 'g',
        default_purchase_unit TEXT NOT NULL DEFAULT 'kg',
        default_pack_quantity_base INTEGER NOT NULL DEFAULT 1000,
        reorder_level_base INTEGER NOT NULL DEFAULT 2000,
        target_stock_level_base INTEGER,
        costing_method TEXT NOT NULL DEFAULT 'weighted_average',
        weighted_average_unit_cost_minor INTEGER NOT NULL DEFAULT 0,
        current_stock_base INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_lots (
        id TEXT PRIMARY KEY,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        lot_code TEXT NOT NULL,
        supplier_id TEXT,
        received_at TEXT NOT NULL,
        expiry_date TEXT,
        quantity_received_base INTEGER NOT NULL,
        quantity_remaining_base INTEGER NOT NULL,
        unit_cost_minor INTEGER NOT NULL,
        purchase_line_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bom_products (
        id TEXT PRIMARY KEY,
        sku TEXT UNIQUE,
        name TEXT NOT NULL,
        category_id TEXT,
        description TEXT,
        selling_price_minor INTEGER NOT NULL DEFAULT 0,
        tax_rate_percent REAL NOT NULL DEFAULT 5.0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recipe_versions (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        version_number INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        yield_quantity INTEGER NOT NULL DEFAULT 1,
        effective_from TEXT NOT NULL,
        change_reason TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(product_id, version_number)
      );

      CREATE TABLE IF NOT EXISTS recipe_ingredients (
        id TEXT PRIMARY KEY,
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
        quantity_per_serving_base INTEGER NOT NULL,
        is_optional INTEGER NOT NULL DEFAULT 0,
        preparation_notes TEXT,
        UNIQUE(recipe_version_id, inventory_item_id)
      );

      CREATE TABLE IF NOT EXISTS modifier_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        selection_type TEXT NOT NULL DEFAULT 'multiple',
        min_selections INTEGER NOT NULL DEFAULT 0,
        max_selections INTEGER NOT NULL DEFAULT 5,
        is_required INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS modifiers (
        id TEXT PRIMARY KEY,
        modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        additional_price_minor INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS modifier_ingredients (
        id TEXT PRIMARY KEY,
        modifier_id TEXT NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
        quantity_per_modifier_base INTEGER NOT NULL,
        UNIQUE(modifier_id, inventory_item_id)
      );

      CREATE TABLE IF NOT EXISTS product_modifier_groups (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
        UNIQUE(product_id, modifier_group_id)
      );

      CREATE TABLE IF NOT EXISTS pos_sales (
        id TEXT PRIMARY KEY,
        bill_number TEXT NOT NULL UNIQUE,
        idempotency_key TEXT UNIQUE,
        cashier_id TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        currency_code TEXT NOT NULL DEFAULT 'INR',
        subtotal_minor INTEGER NOT NULL DEFAULT 0,
        discount_minor INTEGER NOT NULL DEFAULT 0,
        tax_total_minor INTEGER NOT NULL DEFAULT 0,
        grand_total_minor INTEGER NOT NULL DEFAULT 0,
        amount_paid_minor INTEGER NOT NULL DEFAULT 0,
        change_due_minor INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        completed_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pos_sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
        product_id TEXT,
        product_name_snapshot TEXT NOT NULL,
        sku_snapshot TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price_minor INTEGER NOT NULL,
        gross_line_minor INTEGER NOT NULL,
        discount_minor INTEGER NOT NULL DEFAULT 0,
        taxable_amount_minor INTEGER NOT NULL,
        tax_rate_snapshot REAL NOT NULL DEFAULT 5.0,
        tax_amount_minor INTEGER NOT NULL DEFAULT 0,
        final_line_total_minor INTEGER NOT NULL,
        recipe_version_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pos_sale_item_modifiers (
        id TEXT PRIMARY KEY,
        sale_item_id TEXT NOT NULL REFERENCES pos_sale_items(id) ON DELETE CASCADE,
        modifier_id TEXT,
        modifier_name_snapshot TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price_minor INTEGER NOT NULL DEFAULT 0,
        total_price_minor INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS pos_payments (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        amount_minor INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        reference TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        movement_type TEXT NOT NULL,
        quantity_delta_base INTEGER NOT NULL,
        resulting_quantity_base INTEGER NOT NULL,
        unit_cost_snapshot INTEGER NOT NULL DEFAULT 0,
        total_cost_minor INTEGER NOT NULL DEFAULT 0,
        reference_type TEXT,
        reference_id TEXT,
        reason TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_created
        ON inventory_movements(inventory_item_id, created_at);

      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        purchase_number TEXT NOT NULL UNIQUE,
        supplier_id TEXT,
        invoice_reference TEXT,
        purchase_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'received',
        subtotal_minor INTEGER NOT NULL DEFAULT 0,
        discount_minor INTEGER NOT NULL DEFAULT 0,
        total_minor INTEGER NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'paid',
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_lines (
        id TEXT PRIMARY KEY,
        purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
        purchase_unit TEXT NOT NULL,
        packs_received INTEGER NOT NULL DEFAULT 1,
        quantity_per_pack_base INTEGER NOT NULL,
        quantity_received_base INTEGER NOT NULL,
        unit_price_minor INTEGER NOT NULL,
        line_total_minor INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stock_counts (
        id TEXT PRIMARY KEY,
        count_number TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'draft',
        count_date TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        approved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS stock_count_lines (
        id TEXT PRIMARY KEY,
        stock_count_id TEXT NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
        expected_quantity_base INTEGER NOT NULL,
        counted_quantity_base INTEGER NOT NULL,
        variance_quantity_base INTEGER NOT NULL,
        variance_cost_minor INTEGER NOT NULL DEFAULT 0,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS wastage_records (
        id TEXT PRIMARY KEY,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
        quantity_base INTEGER NOT NULL,
        reason TEXT NOT NULL,
        unit_cost_snapshot INTEGER NOT NULL DEFAULT 0,
        total_cost_minor INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        recorded_by TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pos_refunds (
        id TEXT PRIMARY KEY,
        refund_number TEXT NOT NULL UNIQUE,
        sale_id TEXT NOT NULL REFERENCES pos_sales(id),
        amount_minor INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pos_refund_lines (
        id TEXT PRIMARY KEY,
        refund_id TEXT NOT NULL REFERENCES pos_refunds(id) ON DELETE CASCADE,
        sale_item_id TEXT NOT NULL REFERENCES pos_sale_items(id),
        quantity_refunded INTEGER NOT NULL,
        amount_minor INTEGER NOT NULL,
        restock_decision TEXT NOT NULL DEFAULT 'discarded'
      );

      CREATE INDEX IF NOT EXISTS idx_pos_sales_created ON pos_sales(created_at);
      CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON pos_sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_recipe_versions_prod ON recipe_versions(product_id, status);
      CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ver ON recipe_ingredients(recipe_version_id);
      CREATE INDEX IF NOT EXISTS idx_modifiers_group ON modifiers(modifier_group_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
    `);

    // Seed default standard units if missing
    const unitCount = (this.db.prepare('SELECT COUNT(*) as count FROM units').get() as any)?.count || 0;
    if (unitCount === 0) {
      const defaultUnits = [
        { id: crypto.randomUUID(), code: 'g', display_name: 'Gram', dimension: 'mass', base_unit_code: 'g', conversion_factor: 1.0, precision_scale: 0 },
        { id: crypto.randomUUID(), code: 'kg', display_name: 'Kilogram', dimension: 'mass', base_unit_code: 'g', conversion_factor: 1000.0, precision_scale: 3 },
        { id: crypto.randomUUID(), code: 'ml', display_name: 'Milliliter', dimension: 'volume', base_unit_code: 'ml', conversion_factor: 1.0, precision_scale: 0 },
        { id: crypto.randomUUID(), code: 'l', display_name: 'Liter', dimension: 'volume', base_unit_code: 'ml', conversion_factor: 1000.0, precision_scale: 3 },
        { id: crypto.randomUUID(), code: 'piece', display_name: 'Piece', dimension: 'count', base_unit_code: 'piece', conversion_factor: 1.0, precision_scale: 0 },
      ];
      const stmt = this.db.prepare(`
        INSERT INTO units (id, code, display_name, dimension, base_unit_code, conversion_factor, precision_scale, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const u of defaultUnits) {
        stmt.run(u.id, u.code, u.display_name, u.dimension, u.base_unit_code, u.conversion_factor, u.precision_scale);
      }
    }
  }

  /**
   * Helper to execute a sequence of actions inside an immediate transaction.
   */
  public runTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const res = fn();
      this.db.exec('COMMIT');
      return res;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch (_) {}
      throw err;
    }
  }

  /**
   * Helper to mirror raw inventory receipts, counts, and wastage to the unified stock_movements ledger.
   */
  private recordStockMovementMirror(movement: {
    productId: string;
    productName: string;
    userName: string;
    type: 'PURCHASE' | 'DAMAGE' | 'ADJUSTMENT';
    quantity: number;
    beforeStock: number;
    afterStock: number;
    reason: string;
    referenceType: string;
    referenceId: string;
    purchaseCost?: number;
    supplierInvoice?: string;
    createdAt: string;
  }): void {
    try {
      const smTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_movements'").get();
      if (!smTable) return;

      let storeId = 'a0000000-0000-0000-0000-000000000001';
      try {
        const storeTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stores'").get();
        if (storeTable) {
          const firstStore = this.db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
          if (firstStore?.id) storeId = firstStore.id;
        }
      } catch (_) {}

      const smId = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO stock_movements (
          id, store_id, product_id, product_name, user_id, user_name,
          type, quantity, before_stock, after_stock, reason,
          reference_type, reference_id, purchase_cost, supplier_invoice, created_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        smId,
        storeId,
        movement.productId,
        movement.productName,
        movement.userName,
        movement.type,
        movement.quantity,
        movement.beforeStock,
        movement.afterStock,
        movement.reason,
        movement.referenceType,
        movement.referenceId,
        movement.purchaseCost ?? null,
        movement.supplierInvoice ?? null,
        movement.createdAt
      );

      if (db?.stock_movements) {
        db.stock_movements.unshift({
          id: smId,
          store_id: storeId,
          product_id: movement.productId,
          product_name: movement.productName,
          user_id: '',
          user_name: movement.userName,
          type: movement.type,
          quantity: movement.quantity,
          before_stock: movement.beforeStock,
          after_stock: movement.afterStock,
          reason: movement.reason,
          reference_type: movement.referenceType,
          reference_id: movement.referenceId,
          purchase_cost: movement.purchaseCost,
          supplier_invoice: movement.supplierInvoice,
          created_at: movement.createdAt,
        });
      }
    } catch (smErr) {
      console.warn('Notice: recording stock movement mirror:', smErr);
    }
  }

  // ============================================================
  // MASTER INVENTORY & UNIT SYSTEM
  // ============================================================

  public createInventoryItem(params: {
    sku?: string;
    name: string;
    categoryId?: string;
    baseUnitCode?: string; // g, ml, piece
    defaultPurchaseUnit?: string;
    defaultPackQuantityBase?: number;
    reorderLevelBase?: number;
    targetStockLevelBase?: number;
    initialStockBase?: number;
    initialUnitCostMinor?: number; // Cost per 1 base unit in paise
    notes?: string;
  }): InventoryItem {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const sku = params.sku || null;
    const baseUnitCode = params.baseUnitCode || 'g';
    const defaultPurchaseUnit = params.defaultPurchaseUnit || (baseUnitCode === 'ml' ? 'l' : baseUnitCode === 'g' ? 'kg' : 'piece');
    const defaultPackQuantityBase = params.defaultPackQuantityBase || 1000;
    const reorderLevelBase = params.reorderLevelBase || 2000;
    const targetStockLevelBase = params.targetStockLevelBase || null;
    const initialStockBase = Math.max(0, Math.round(params.initialStockBase || 0));
    const initialUnitCostMinor = Math.max(0, Math.round(params.initialUnitCostMinor || 0));

    return this.runTransaction(() => {
      this.db.prepare(`
        INSERT INTO inventory_items (
          id, sku, name, category_id, base_unit_code, default_purchase_unit,
          default_pack_quantity_base, reorder_level_base, target_stock_level_base,
          costing_method, weighted_average_unit_cost_minor, current_stock_base,
          is_active, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'weighted_average', ?, ?, 1, ?, ?, ?)
      `).run(
        id,
        sku,
        params.name,
        params.categoryId || null,
        baseUnitCode,
        defaultPurchaseUnit,
        defaultPackQuantityBase,
        reorderLevelBase,
        targetStockLevelBase,
        initialUnitCostMinor,
        initialStockBase,
        params.notes || null,
        now,
        now
      );

      // If initial stock provided, log opening balance in movement ledger
      if (initialStockBase > 0) {
        this.db.prepare(`
          INSERT INTO inventory_movements (
            id, inventory_item_id, movement_type, quantity_delta_base,
            resulting_quantity_base, unit_cost_snapshot, total_cost_minor,
            reference_type, reference_id, reason, created_at, created_by
          ) VALUES (?, ?, 'opening_balance', ?, ?, ?, ?, 'setup', NULL, 'Initial stock setup', ?, 'SYSTEM')
        `).run(
          crypto.randomUUID(),
          id,
          initialStockBase,
          initialStockBase,
          initialUnitCostMinor,
          Math.round(initialStockBase * initialUnitCostMinor),
          now
        );
      }

      return this.getInventoryItem(id)!;
    });
  }

  public getInventoryItem(id: string): InventoryItem | null {
    const row = this.db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as any;
    return row || null;
  }

  public listInventoryItems(): Array<InventoryItem & { packBreakdown: ReturnType<typeof calculatePackBreakdown> }> {
    const rows = this.db.prepare('SELECT * FROM inventory_items ORDER BY name ASC').all() as any[];
    return rows.map(r => ({
      ...r,
      packBreakdown: calculatePackBreakdown(r.current_stock_base, r.default_pack_quantity_base),
    }));
  }

  // ============================================================
  // PRODUCTS, BOM RECIPES & MODIFIERS
  // ============================================================

  public createProduct(params: {
    sku?: string;
    name: string;
    categoryId?: string;
    description?: string;
    sellingPriceMinor: number;
    taxRatePercent?: number;
  }): ProductRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO bom_products (
        id, sku, name, category_id, description,
        selling_price_minor, tax_rate_percent, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      params.sku || null,
      params.name,
      params.categoryId || null,
      params.description || null,
      params.sellingPriceMinor,
      params.taxRatePercent !== undefined ? params.taxRatePercent : 5.0,
      now,
      now
    );
    return this.getProduct(id)!;
  }

  public getProduct(id: string): ProductRecord | null {
    const row = this.db.prepare('SELECT * FROM bom_products WHERE id = ?').get(id) as any;
    return row || null;
  }

  public createRecipeVersion(params: {
    productId: string;
    yieldQuantity?: number;
    changeReason?: string;
    ingredients: Array<{
      inventoryItemId: string;
      quantityPerServingBase: number;
      isOptional?: boolean;
      preparationNotes?: string;
    }>;
  }): RecipeVersion {
    const product = this.getProduct(params.productId);
    if (!product) throw new Error(`Product ${params.productId} not found`);

    return this.runTransaction(() => {
      // Archive existing active versions
      this.db.prepare(`
        UPDATE recipe_versions SET status = 'archived' WHERE product_id = ? AND status = 'active'
      `).run(params.productId);

      const maxVerRow = this.db.prepare(`
        SELECT MAX(version_number) as maxVer FROM recipe_versions WHERE product_id = ?
      `).get(params.productId) as any;
      const nextVer = (maxVerRow?.maxVer || 0) + 1;

      const recipeId = crypto.randomUUID();
      const now = new Date().toISOString();

      this.db.prepare(`
        INSERT INTO recipe_versions (
          id, product_id, version_number, status, yield_quantity,
          effective_from, change_reason, created_at
        ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
      `).run(
        recipeId,
        params.productId,
        nextVer,
        params.yieldQuantity || 1,
        now,
        params.changeReason || null,
        now
      );

      const insertIng = this.db.prepare(`
        INSERT INTO recipe_ingredients (
          id, recipe_version_id, inventory_item_id, quantity_per_serving_base,
          is_optional, preparation_notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const ing of params.ingredients) {
        insertIng.run(
          crypto.randomUUID(),
          recipeId,
          ing.inventoryItemId,
          Math.max(1, Math.round(ing.quantityPerServingBase)),
          ing.isOptional ? 1 : 0,
          ing.preparationNotes || null
        );
      }

      return this.getActiveRecipeVersion(params.productId)!;
    });
  }

  public getActiveRecipeVersion(productId: string): (RecipeVersion & { ingredients: RecipeIngredient[] }) | null {
    const ver = this.db.prepare(`
      SELECT * FROM recipe_versions WHERE product_id = ? AND status = 'active'
    `).get(productId) as any;
    if (!ver) return null;

    const ingredients = this.db.prepare(`
      SELECT * FROM recipe_ingredients WHERE recipe_version_id = ?
    `).all(ver.id) as any[];

    return { ...ver, ingredients };
  }

  public createModifierGroup(params: {
    name: string;
    selectionType?: 'single' | 'multiple';
    minSelections?: number;
    maxSelections?: number;
    isRequired?: boolean;
  }): ModifierGroup {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO modifier_groups (
        id, name, selection_type, min_selections, max_selections, is_required, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      params.name,
      params.selectionType || 'multiple',
      params.minSelections || 0,
      params.maxSelections || 5,
      params.isRequired ? 1 : 0
    );
    return this.db.prepare('SELECT * FROM modifier_groups WHERE id = ?').get(id) as any;
  }

  public createModifier(params: {
    modifierGroupId: string;
    name: string;
    additionalPriceMinor: number;
    ingredients?: Array<{
      inventoryItemId: string;
      quantityPerModifierBase: number;
    }>;
  }): Modifier {
    const id = crypto.randomUUID();
    return this.runTransaction(() => {
      this.db.prepare(`
        INSERT INTO modifiers (
          id, modifier_group_id, name, additional_price_minor, is_active, sort_order
        ) VALUES (?, ?, ?, ?, 1, 0)
      `).run(id, params.modifierGroupId, params.name, params.additionalPriceMinor);

      if (params.ingredients && params.ingredients.length > 0) {
        const stmt = this.db.prepare(`
          INSERT INTO modifier_ingredients (
            id, modifier_id, inventory_item_id, quantity_per_modifier_base
          ) VALUES (?, ?, ?, ?)
        `);
        for (const ing of params.ingredients) {
          stmt.run(
            crypto.randomUUID(),
            id,
            ing.inventoryItemId,
            Math.max(1, Math.round(ing.quantityPerModifierBase))
          );
        }
      }

      return this.db.prepare('SELECT * FROM modifiers WHERE id = ?').get(id) as any;
    });
  }

  // ============================================================
  // 4.1 BOM & MULTI-TIER INGREDIENT AGGREGATION ALGORITHM
  // ============================================================

  public aggregateCartRequirements(cartItems: CheckoutCartItemDto[]): {
    requirementsMap: Map<string, number>;
    processedItems: Array<{
      productId: string;
      productName: string;
      sku: string | null;
      quantity: number;
      unitPriceMinor: number;
      grossLineMinor: number;
      discountMinor: number;
      taxableAmountMinor: number;
      taxRateSnapshot: number;
      taxAmountMinor: number;
      finalLineTotalMinor: number;
      recipeVersionId: string | null;
      modifiers: Array<{
        modifierId: string;
        name: string;
        quantity: number;
        unitPriceMinor: number;
        totalPriceMinor: number;
      }>;
    }>;
    subtotalMinor: number;
    taxTotalMinor: number;
    grandTotalMinor: number;
  } {
    const requirementsMap = new Map<string, number>();
    const processedItems: any[] = [];
    let subtotalMinor = 0;
    let taxTotalMinor = 0;

    for (const item of cartItems) {
      const product = this.getProduct(item.productId);
      if (!product) throw new Error(`Product "${item.productId}" not found`);
      if (!product.is_active) throw new Error(`Product "${product.name}" is inactive`);

      const recipe = this.getActiveRecipeVersion(product.id);
      const qtyItem = Math.max(1, Math.round(item.quantity));

      // Aggregate recipe ingredients
      if (recipe && recipe.ingredients) {
        for (const ing of recipe.ingredients) {
          const deltaBase = ing.quantity_per_serving_base * qtyItem;
          const current = requirementsMap.get(ing.inventory_item_id) || 0;
          requirementsMap.set(ing.inventory_item_id, current + deltaBase);
        }
      }

      // Process and aggregate modifiers
      const processedModifiers: any[] = [];
      let itemModifierTotalMinor = 0;

      if (item.selectedModifiers && item.selectedModifiers.length > 0) {
        for (const modSel of item.selectedModifiers) {
          const mod = this.db.prepare('SELECT * FROM modifiers WHERE id = ?').get(modSel.modifierId) as any;
          if (!mod) throw new Error(`Modifier "${modSel.modifierId}" not found`);

          const modQty = Math.max(1, Math.round(modSel.quantity));
          const modIngredients = this.db.prepare(`
            SELECT * FROM modifier_ingredients WHERE modifier_id = ?
          `).all(mod.id) as any[];

          for (const modIng of modIngredients) {
            const deltaMod = modIng.quantity_per_modifier_base * modQty * qtyItem;
            const current = requirementsMap.get(modIng.inventory_item_id) || 0;
            requirementsMap.set(modIng.inventory_item_id, current + deltaMod);
          }

          const modLineTotalMinor = mod.additional_price_minor * modQty;
          itemModifierTotalMinor += modLineTotalMinor;

          processedModifiers.push({
            modifierId: mod.id,
            name: mod.name,
            quantity: modQty,
            unitPriceMinor: mod.additional_price_minor,
            totalPriceMinor: modLineTotalMinor,
          });
        }
      }

      // Base financial calculations for this cart line
      const effectiveUnitPriceMinor = product.selling_price_minor + itemModifierTotalMinor;
      const financials = calculateLineFinancials({
        unitPriceMinor: effectiveUnitPriceMinor,
        quantity: qtyItem,
        discountMinor: item.discountMinor || 0,
        taxRatePercent: product.tax_rate_percent,
        isTaxInclusive: false,
      });

      subtotalMinor += financials.taxableAmountMinor;
      taxTotalMinor += financials.taxAmountMinor;

      processedItems.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: qtyItem,
        unitPriceMinor: effectiveUnitPriceMinor,
        grossLineMinor: financials.grossLineMinor,
        discountMinor: financials.discountMinor,
        taxableAmountMinor: financials.taxableAmountMinor,
        taxRateSnapshot: product.tax_rate_percent,
        taxAmountMinor: financials.taxAmountMinor,
        finalLineTotalMinor: financials.finalLineTotalMinor,
        recipeVersionId: recipe ? recipe.id : null,
        modifiers: processedModifiers,
      });
    }

    const grandTotalMinor = subtotalMinor + taxTotalMinor;

    return {
      requirementsMap,
      processedItems,
      subtotalMinor,
      taxTotalMinor,
      grandTotalMinor,
    };
  }

  // ============================================================
  // 4.2 ATOMIC POS CHECKOUT & STOCK DEPLETION ROUTINE
  // ============================================================

  public processPosCheckout(checkoutData: CheckoutDto): {
    sale: any;
    isDuplicate: boolean;
  } {
    return this.runTransaction(() => {
      // 1. Idempotency Check
      if (checkoutData.idempotencyKey) {
        const existing = this.db.prepare(`
          SELECT * FROM pos_sales WHERE idempotency_key = ?
        `).get(checkoutData.idempotencyKey) as any;

        if (existing) {
          const items = this.db.prepare(`
            SELECT * FROM pos_sale_items WHERE sale_id = ?
          `).all(existing.id);
          const payments = this.db.prepare(`
            SELECT * FROM pos_payments WHERE sale_id = ?
          `).all(existing.id);
          return {
            sale: { ...existing, saleItems: items, payments },
            isDuplicate: true,
          };
        }
      }

      // 2. Multi-tier BOM and modifier requirement aggregation
      const {
        requirementsMap,
        processedItems,
        subtotalMinor,
        taxTotalMinor,
      } = this.aggregateCartRequirements(checkoutData.cartItems);

      const billDiscountMinor = Math.max(0, checkoutData.discountMinor || 0);
      const calculatedGrandTotal = Math.max(0, subtotalMinor + taxTotalMinor - billDiscountMinor);

      // 3. Stock Sufficiency Check
      const requiredItemIds = Array.from(requirementsMap.keys());
      const stockMap = new Map<string, InventoryItem>();

      if (requiredItemIds.length > 0) {
        const placeholders = requiredItemIds.map(() => '?').join(',');
        const lockedStockItems = this.db.prepare(`
          SELECT * FROM inventory_items WHERE id IN (${placeholders})
        `).all(...requiredItemIds) as any[];

        for (const item of lockedStockItems) {
          stockMap.set(item.id, item);
        }
      }

      const allowNegative = Boolean(checkoutData.allowNegativeStockSales);
      if (!allowNegative) {
        for (const [itemId, neededQty] of requirementsMap.entries()) {
          const item = stockMap.get(itemId);
          if (!item) throw new Error(`Inventory item "${itemId}" not found`);
          if (item.current_stock_base < neededQty) {
            throw new Error(
              `Insufficient stock for "${item.name}". Available: ${item.current_stock_base} ${item.base_unit_code}, Required: ${neededQty} ${item.base_unit_code}`
            );
          }
        }
      }

      // 4. Generate sequential Bill Number: FB-YYYYMMDD-XXXX
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countTodayRow = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM pos_sales WHERE bill_number LIKE ?
      `).get(`FB-${todayStr}-%`) as any;
      const seq = String((countTodayRow?.cnt || 0) + 1).padStart(4, '0');
      const billNumber = `FB-${todayStr}-${seq}`;

      const saleId = crypto.randomUUID();
      const now = new Date().toISOString();
      const amountPaidMinor = checkoutData.amountPaidMinor !== undefined
        ? checkoutData.amountPaidMinor
        : calculatedGrandTotal;
      const changeDueMinor = Math.max(0, amountPaidMinor - calculatedGrandTotal);

      // 5. Insert Sale Header Record
      this.db.prepare(`
        INSERT INTO pos_sales (
          id, bill_number, idempotency_key, cashier_id, status, currency_code,
          subtotal_minor, discount_minor, tax_total_minor, grand_total_minor,
          amount_paid_minor, change_due_minor, notes, completed_at, created_at
        ) VALUES (?, ?, ?, ?, 'completed', 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId,
        billNumber,
        checkoutData.idempotencyKey || null,
        checkoutData.cashierId || null,
        subtotalMinor,
        billDiscountMinor,
        taxTotalMinor,
        calculatedGrandTotal,
        amountPaidMinor,
        changeDueMinor,
        checkoutData.notes || null,
        now,
        now
      );

      // 6. Insert Snapshot Sale Items & Modifier Records
      const insertItemStmt = this.db.prepare(`
        INSERT INTO pos_sale_items (
          id, sale_id, product_id, product_name_snapshot, sku_snapshot,
          quantity, unit_price_minor, gross_line_minor, discount_minor,
          taxable_amount_minor, tax_rate_snapshot, tax_amount_minor,
          final_line_total_minor, recipe_version_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertModStmt = this.db.prepare(`
        INSERT INTO pos_sale_item_modifiers (
          id, sale_item_id, modifier_id, modifier_name_snapshot,
          quantity, unit_price_minor, total_price_minor
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of processedItems) {
        const saleItemId = crypto.randomUUID();
        insertItemStmt.run(
          saleItemId,
          saleId,
          item.productId,
          item.productName,
          item.sku,
          item.quantity,
          item.unitPriceMinor,
          item.grossLineMinor,
          item.discountMinor,
          item.taxableAmountMinor,
          item.taxRateSnapshot,
          item.taxAmountMinor,
          item.finalLineTotalMinor,
          item.recipeVersionId,
          now
        );

        for (const mod of item.modifiers) {
          insertModStmt.run(
            crypto.randomUUID(),
            saleItemId,
            mod.modifierId,
            mod.name,
            mod.quantity,
            mod.unitPriceMinor,
            mod.totalPriceMinor
          );
        }
      }

      // 7. Insert Payment Record
      this.db.prepare(`
        INSERT INTO pos_payments (
          id, sale_id, payment_method, amount_minor, status, reference, created_at
        ) VALUES (?, ?, ?, ?, 'completed', NULL, ?)
      `).run(
        crypto.randomUUID(),
        saleId,
        checkoutData.paymentMethod || 'cash',
        amountPaidMinor,
        now
      );

      // 8. Deduct Stock & Append to Immutable Movement Ledger
      const insertMovement = this.db.prepare(`
        INSERT INTO inventory_movements (
          id, inventory_item_id, movement_type, quantity_delta_base,
          resulting_quantity_base, unit_cost_snapshot, total_cost_minor,
          reference_type, reference_id, reason, created_at, created_by
        ) VALUES (?, ?, 'sale_consumption', ?, ?, ?, ?, 'sale', ?, ?, ?, ?)
      `);

      const updateStock = this.db.prepare(`
        UPDATE inventory_items
        SET current_stock_base = ?, updated_at = ?
        WHERE id = ?
      `);

      for (const [itemId, consumedQty] of requirementsMap.entries()) {
        const item = stockMap.get(itemId)!;
        const resultingStock = item.current_stock_base - consumedQty;
        const totalCostMinor = Math.round(consumedQty * item.weighted_average_unit_cost_minor);

        insertMovement.run(
          crypto.randomUUID(),
          item.id,
          -consumedQty, // Negative for consumption
          resultingStock,
          item.weighted_average_unit_cost_minor,
          totalCostMinor,
          saleId,
          `POS Sale ${billNumber}`,
          now,
          checkoutData.cashierId || 'CASHIER'
        );

        updateStock.run(resultingStock, now, item.id);
      }

      const completedSale = this.db.prepare('SELECT * FROM pos_sales WHERE id = ?').get(saleId) as any;
      const saleItems = this.db.prepare('SELECT * FROM pos_sale_items WHERE sale_id = ?').all(saleId);
      const payments = this.db.prepare('SELECT * FROM pos_payments WHERE sale_id = ?').all(saleId);

      return {
        sale: { ...completedSale, saleItems, payments },
        isDuplicate: false,
      };
    });
  }

  // ============================================================
  // 4.3 PURCHASE RECEIVING & WEIGHTED AVERAGE COSTING (WAC)
  // ============================================================

  public receivePurchase(purchaseData: PurchaseDto): any {
    return this.runTransaction(() => {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countTodayRow = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM purchases WHERE purchase_number LIKE ?
      `).get(`PO-${todayStr}-%`) as any;
      const seq = String((countTodayRow?.cnt || 0) + 1).padStart(3, '0');
      const purchaseNumber = purchaseData.purchaseNumber || `PO-${todayStr}-${seq}`;

      const purchaseId = crypto.randomUUID();
      const now = new Date().toISOString();

      let subtotalMinor = 0;
      for (const l of purchaseData.lines) {
        subtotalMinor += l.lineTotalMinor;
      }
      const discountMinor = Math.max(0, purchaseData.discountMinor || 0);
      const totalMinor = Math.max(0, subtotalMinor - discountMinor);

      this.db.prepare(`
        INSERT INTO purchases (
          id, purchase_number, supplier_id, invoice_reference, purchase_date,
          status, subtotal_minor, discount_minor, total_minor, payment_status,
          notes, created_at
        ) VALUES (?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?)
      `).run(
        purchaseId,
        purchaseNumber,
        purchaseData.supplierId || null,
        purchaseData.invoiceReference || null,
        purchaseData.purchaseDate || now,
        subtotalMinor,
        discountMinor,
        totalMinor,
        purchaseData.paymentStatus || 'paid',
        purchaseData.notes || null,
        now
      );

      const insertLine = this.db.prepare(`
        INSERT INTO purchase_lines (
          id, purchase_id, inventory_item_id, purchase_unit, packs_received,
          quantity_per_pack_base, quantity_received_base, unit_price_minor,
          line_total_minor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertLot = this.db.prepare(`
        INSERT INTO inventory_lots (
          id, inventory_item_id, lot_code, supplier_id, received_at,
          expiry_date, quantity_received_base, quantity_remaining_base,
          unit_cost_minor, purchase_line_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'active', ?)
      `);

      const insertMovement = this.db.prepare(`
        INSERT INTO inventory_movements (
          id, inventory_item_id, movement_type, quantity_delta_base,
          resulting_quantity_base, unit_cost_snapshot, total_cost_minor,
          reference_type, reference_id, reason, created_at, created_by
        ) VALUES (?, ?, 'purchase_receipt', ?, ?, ?, ?, 'purchase', ?, ?, ?, 'SYSTEM')
      `);

      const updateItemStockAndCost = this.db.prepare(`
        UPDATE inventory_items
        SET current_stock_base = ?, weighted_average_unit_cost_minor = ?, updated_at = ?
        WHERE id = ?
      `);

      for (const line of purchaseData.lines) {
        const item = this.getInventoryItem(line.inventoryItemId);
        if (!item) throw new Error(`Inventory item "${line.inventoryItemId}" not found`);

        const baseQtyReceived = calculateReceivedBaseQuantity(
          line.packsReceived,
          line.quantityPerPackBase
        );
        if (baseQtyReceived <= 0) {
          throw new Error(`Received base quantity must be greater than zero for item "${item.name}"`);
        }

        const receivedUnitCostMinor = Math.round(line.lineTotalMinor / baseQtyReceived);
        const newWeightedAvgCost = calculateWeightedAverageCost(
          item.current_stock_base,
          item.weighted_average_unit_cost_minor,
          baseQtyReceived,
          receivedUnitCostMinor
        );
        const newStock = item.current_stock_base + baseQtyReceived;

        const purchaseLineId = crypto.randomUUID();
        insertLine.run(
          purchaseLineId,
          purchaseId,
          item.id,
          line.purchaseUnit,
          line.packsReceived,
          line.quantityPerPackBase,
          baseQtyReceived,
          receivedUnitCostMinor,
          line.lineTotalMinor
        );

        // Lot batch tracking
        const lotCode = `LOT-${purchaseNumber}-${item.sku || item.id.slice(0, 6)}`;
        insertLot.run(
          crypto.randomUUID(),
          item.id,
          lotCode,
          purchaseData.supplierId || null,
          now,
          baseQtyReceived,
          baseQtyReceived,
          receivedUnitCostMinor,
          purchaseLineId,
          now
        );

        // Append to immutable movement ledger
        insertMovement.run(
          crypto.randomUUID(),
          item.id,
          baseQtyReceived,
          newStock,
          receivedUnitCostMinor,
          line.lineTotalMinor,
          purchaseId,
          `Purchase Invoice ${purchaseData.invoiceReference || purchaseNumber}`,
          now
        );

        // Update cached master inventory item
        updateItemStockAndCost.run(newStock, newWeightedAvgCost, now, item.id);

        // Mirror to stock_movements for complete audit trail in POS & Stock Movements screen
        const unitCostRupees = Math.round(receivedUnitCostMinor) / 100;
        const invoiceRef = purchaseData.invoiceReference?.trim() || purchaseNumber;
        const smReason = purchaseData.invoiceReference
          ? `Bulk Delivery - Inv: ${purchaseData.invoiceReference}`
          : `Bulk Delivery - ${purchaseNumber}`;

        this.recordStockMovementMirror({
          productId: item.id,
          productName: `${item.name} (${item.base_unit_code || 'units'})`,
          userName: 'Bulk Delivery',
          type: 'PURCHASE',
          quantity: baseQtyReceived,
          beforeStock: item.current_stock_base,
          afterStock: newStock,
          reason: smReason,
          referenceType: 'purchase',
          referenceId: purchaseId,
          purchaseCost: unitCostRupees,
          supplierInvoice: invoiceRef,
          createdAt: now,
        });
      }

      const savedPurchase = this.db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId) as any;
      const lines = this.db.prepare('SELECT * FROM purchase_lines WHERE purchase_id = ?').all(purchaseId);
      return { ...savedPurchase, lines };
    });
  }

  // ============================================================
  // 4.4 PHYSICAL STOCK COUNT & VARIANCE RECONCILIATION
  // ============================================================

  public createStockCount(data: StockCountDto): any {
    return this.runTransaction(() => {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const cntRow = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM stock_counts WHERE count_number LIKE ?
      `).get(`SC-${todayStr}-%`) as any;
      const seq = String((cntRow?.cnt || 0) + 1).padStart(3, '0');
      const countNumber = `SC-${todayStr}-${seq}`;

      const countId = crypto.randomUUID();
      const now = new Date().toISOString();

      this.db.prepare(`
        INSERT INTO stock_counts (id, count_number, status, count_date, notes, created_at)
        VALUES (?, ?, 'draft', ?, ?, ?)
      `).run(countId, countNumber, now, data.notes || null, now);

      const insertLine = this.db.prepare(`
        INSERT INTO stock_count_lines (
          id, stock_count_id, inventory_item_id, expected_quantity_base,
          counted_quantity_base, variance_quantity_base, variance_cost_minor, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const line of data.lines) {
        const item = this.getInventoryItem(line.inventoryItemId);
        if (!item) throw new Error(`Inventory item "${line.inventoryItemId}" not found`);

        const expected = item.current_stock_base;
        const counted = Math.max(0, Math.round(line.countedQuantityBase));
        const varianceQty = counted - expected;
        const varianceCostMinor = Math.round(varianceQty * item.weighted_average_unit_cost_minor);

        insertLine.run(
          crypto.randomUUID(),
          countId,
          item.id,
          expected,
          counted,
          varianceQty,
          varianceCostMinor,
          line.notes || null
        );
      }

      const count = this.db.prepare('SELECT * FROM stock_counts WHERE id = ?').get(countId) as any;
      const lines = this.db.prepare('SELECT * FROM stock_count_lines WHERE stock_count_id = ?').all(countId);
      return { ...count, lines };
    });
  }

  public approveStockCount(stockCountId: string, approvedBy = 'MANAGER'): any {
    return this.runTransaction(() => {
      const count = this.db.prepare('SELECT * FROM stock_counts WHERE id = ?').get(stockCountId) as any;
      if (!count) throw new Error(`Stock count "${stockCountId}" not found`);
      if (count.status !== 'draft') throw new Error(`Stock count is already ${count.status}`);

      const lines = this.db.prepare(`
        SELECT * FROM stock_count_lines WHERE stock_count_id = ?
      `).all(stockCountId) as any[];

      const now = new Date().toISOString();

      const insertMovement = this.db.prepare(`
        INSERT INTO inventory_movements (
          id, inventory_item_id, movement_type, quantity_delta_base,
          resulting_quantity_base, unit_cost_snapshot, total_cost_minor,
          reference_type, reference_id, reason, created_at, created_by
        ) VALUES (?, ?, 'physical_adjustment', ?, ?, ?, ?, 'stock_count', ?, ?, ?, ?)
      `);

      const updateStock = this.db.prepare(`
        UPDATE inventory_items SET current_stock_base = ?, updated_at = ? WHERE id = ?
      `);

      for (const line of lines) {
        const item = this.getInventoryItem(line.inventory_item_id);
        if (!item) continue;

        // Calculate delta against fresh current stock
        const delta = line.counted_quantity_base - item.current_stock_base;
        if (delta !== 0) {
          const totalCostMinor = Math.round(Math.abs(delta) * item.weighted_average_unit_cost_minor);
          insertMovement.run(
            crypto.randomUUID(),
            item.id,
            delta,
            line.counted_quantity_base,
            item.weighted_average_unit_cost_minor,
            totalCostMinor,
            count.id,
            `Stock Count Audit Reconciliation (${count.count_number})`,
            now,
            approvedBy
          );

          updateStock.run(line.counted_quantity_base, now, item.id);

          this.recordStockMovementMirror({
            productId: item.id,
            productName: `${item.name} (${item.base_unit_code || 'units'})`,
            userName: approvedBy,
            type: 'ADJUSTMENT',
            quantity: delta,
            beforeStock: item.current_stock_base,
            afterStock: line.counted_quantity_base,
            reason: `Stock Count Reconciliation (${count.count_number})`,
            referenceType: 'stock_count',
            referenceId: count.id,
            createdAt: now,
          });
        }
      }

      this.db.prepare(`
        UPDATE stock_counts SET status = 'approved', approved_at = ? WHERE id = ?
      `).run(now, stockCountId);

      return {
        success: true,
        countNumber: count.count_number,
        approvedAt: now,
      };
    });
  }

  // ============================================================
  // 4.5 SPOILAGE & WASTAGE TRACKING
  // ============================================================

  public recordWastage(data: WastageDto): any {
    return this.runTransaction(() => {
      const item = this.getInventoryItem(data.inventoryItemId);
      if (!item) throw new Error(`Inventory item "${data.inventoryItemId}" not found`);

      const qty = Math.max(1, Math.round(data.quantityBase));
      const newStock = item.current_stock_base - qty;
      const totalCostMinor = Math.round(qty * item.weighted_average_unit_cost_minor);
      const wastageId = crypto.randomUUID();
      const now = new Date().toISOString();

      this.db.prepare(`
        INSERT INTO wastage_records (
          id, inventory_item_id, quantity_base, reason, unit_cost_snapshot,
          total_cost_minor, notes, recorded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        wastageId,
        item.id,
        qty,
        data.reason,
        item.weighted_average_unit_cost_minor,
        totalCostMinor,
        data.notes || null,
        data.recordedBy || 'STAFF',
        now
      );

      this.db.prepare(`
        INSERT INTO inventory_movements (
          id, inventory_item_id, movement_type, quantity_delta_base,
          resulting_quantity_base, unit_cost_snapshot, total_cost_minor,
          reference_type, reference_id, reason, created_at, created_by
        ) VALUES (?, ?, 'wastage', ?, ?, ?, ?, 'wastage', ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        item.id,
        -qty,
        newStock,
        item.weighted_average_unit_cost_minor,
        totalCostMinor,
        wastageId,
        `Wastage: ${data.reason}`,
        now,
        data.recordedBy || 'STAFF'
      );

      this.db.prepare(`
        UPDATE inventory_items SET current_stock_base = ?, updated_at = ? WHERE id = ?
      `).run(newStock, now, item.id);

      this.recordStockMovementMirror({
        productId: item.id,
        productName: `${item.name} (${item.base_unit_code || 'units'})`,
        userName: data.recordedBy || 'STAFF',
        type: 'DAMAGE',
        quantity: -qty,
        beforeStock: item.current_stock_base,
        afterStock: newStock,
        reason: data.notes ? `Wastage: ${data.reason} (${data.notes})` : `Wastage: ${data.reason}`,
        referenceType: 'wastage',
        referenceId: wastageId,
        createdAt: now,
      });

      return this.db.prepare('SELECT * FROM wastage_records WHERE id = ?').get(wastageId);
    });
  }

  // ============================================================
  // 4.6 RETURNS, REFUNDS & EXPLICIT RESTOCK GUARDRAILS
  // ============================================================

  public processRefund(data: RefundDto): any {
    return this.runTransaction(() => {
      const sale = this.db.prepare('SELECT * FROM pos_sales WHERE id = ?').get(data.saleId) as any;
      if (!sale) throw new Error(`Sale "${data.saleId}" not found`);

      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const cntRow = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM pos_refunds WHERE refund_number LIKE ?
      `).get(`REF-${todayStr}-%`) as any;
      const seq = String((cntRow?.cnt || 0) + 1).padStart(3, '0');
      const refundNumber = `REF-${todayStr}-${seq}`;

      const refundId = crypto.randomUUID();
      const now = new Date().toISOString();

      this.db.prepare(`
        INSERT INTO pos_refunds (id, refund_number, sale_id, amount_minor, reason, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'completed', ?)
      `).run(refundId, refundNumber, sale.id, data.amountMinor, data.reason, now);

      const insertRefundLine = this.db.prepare(`
        INSERT INTO pos_refund_lines (
          id, refund_id, sale_item_id, quantity_refunded, amount_minor, restock_decision
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertMovement = this.db.prepare(`
        INSERT INTO inventory_movements (
          id, inventory_item_id, movement_type, quantity_delta_base,
          resulting_quantity_base, unit_cost_snapshot, total_cost_minor,
          reference_type, reference_id, reason, created_at, created_by
        ) VALUES (?, ?, 'return_restock', ?, ?, ?, ?, 'refund', ?, ?, ?, 'STAFF')
      `);

      const updateStock = this.db.prepare(`
        UPDATE inventory_items SET current_stock_base = ?, updated_at = ? WHERE id = ?
      `);

      for (const line of data.lines) {
        insertRefundLine.run(
          crypto.randomUUID(),
          refundId,
          line.saleItemId,
          line.quantityRefunded,
          line.amountMinor,
          line.restockDecision
        );

        // Guardrail: Only restock if explicitly selected as 'restocked'
        if (line.restockDecision === 'restocked') {
          const saleItem = this.db.prepare(`
            SELECT * FROM pos_sale_items WHERE id = ?
          `).get(line.saleItemId) as any;

          if (saleItem && saleItem.recipe_version_id) {
            const recipeIngs = this.db.prepare(`
              SELECT * FROM recipe_ingredients WHERE recipe_version_id = ?
            `).all(saleItem.recipe_version_id) as any[];

            for (const ing of recipeIngs) {
              const deltaRestore = ing.quantity_per_serving_base * line.quantityRefunded;
              const item = this.getInventoryItem(ing.inventory_item_id);
              if (item) {
                const resultingStock = item.current_stock_base + deltaRestore;
                const totalCostMinor = Math.round(deltaRestore * item.weighted_average_unit_cost_minor);

                insertMovement.run(
                  crypto.randomUUID(),
                  item.id,
                  deltaRestore, // Positive for restock
                  resultingStock,
                  item.weighted_average_unit_cost_minor,
                  totalCostMinor,
                  refundId,
                  `Restocked returned item from Sale ${sale.bill_number}`,
                  now
                );

                updateStock.run(resultingStock, now, item.id);
              }
            }
          }
        }
      }

      // Mark sale status
      this.db.prepare(`
        UPDATE pos_sales SET status = 'refunded' WHERE id = ?
      `).run(sale.id);

      const refund = this.db.prepare('SELECT * FROM pos_refunds WHERE id = ?').get(refundId) as any;
      const refundLines = this.db.prepare('SELECT * FROM pos_refund_lines WHERE refund_id = ?').all(refundId);
      return { ...refund, lines: refundLines };
    });
  }

  // ============================================================
  // 5. IMMUTABLE STOCK MOVEMENT LEDGER & AUDIT INTEGRITY QUERY
  // ============================================================

  /**
   * Single source of truth ledger audit.
   * Compares cached current_stock_base against SUM(quantity_delta_base) of inventory_movements.
   * If any drift exists, drift_discrepancy != 0.
   */
  public checkLedgerIntegrity(): Array<{
    id: string;
    name: string;
    cached_stock: number;
    calculated_ledger_stock: number;
    drift_discrepancy: number;
  }> {
    const query = `
      SELECT 
          i.id,
          i.name,
          i.current_stock_base AS cached_stock,
          COALESCE(SUM(m.quantity_delta_base), 0) AS calculated_ledger_stock,
          (i.current_stock_base - COALESCE(SUM(m.quantity_delta_base), 0)) AS drift_discrepancy
      FROM inventory_items i
      LEFT JOIN inventory_movements m ON i.id = m.inventory_item_id
      GROUP BY i.id
      HAVING drift_discrepancy != 0
    `;
    return this.db.prepare(query).all() as any[];
  }

  public getMovements(params: {
    inventoryItemId?: string;
    movementType?: string;
    limit?: number;
  }): InventoryMovement[] {
    let sql = 'SELECT * FROM inventory_movements';
    const conditions: string[] = [];
    const args: any[] = [];

    if (params.inventoryItemId) {
      conditions.push('inventory_item_id = ?');
      args.push(params.inventoryItemId);
    }
    if (params.movementType) {
      conditions.push('movement_type = ?');
      args.push(params.movementType);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    args.push(params.limit || 100);

    return this.db.prepare(sql).all(...args) as any[];
  }
}

export const inventoryLedgerEngine = new InventoryLedgerEngine();

