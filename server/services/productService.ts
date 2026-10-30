import { db, Product, Category } from '../db.ts';
import { LocalDb, localDbManager } from '../localDb.ts';
import { AuditService } from './auditService.ts';
import { SupabaseDb } from '../supabaseDb.ts';
import { isSupabaseConfigured } from '../supabaseClient.ts';
import crypto from 'crypto';

export function getProductModifierGroups(productId: string) {
  try {
    const rawDb = localDbManager.getRawDb();
    const groups = rawDb.prepare(`
      SELECT mg.id, mg.name, mg.selection_type as selectionType,
             mg.min_selections as minSelections, mg.max_selections as maxSelections,
             mg.is_required as isRequired
      FROM product_modifier_groups pmg
      JOIN modifier_groups mg ON pmg.modifier_group_id = mg.id
      WHERE pmg.product_id = ? AND mg.is_active = 1
    `).all(productId) as any[];

    return groups.map(g => {
      const modifiers = rawDb.prepare(`
        SELECT m.id, m.name, m.additional_price_minor as additionalPriceMinor, m.sort_order as sortOrder
        FROM modifiers m
        WHERE m.modifier_group_id = ? AND m.is_active = 1
        ORDER BY m.sort_order ASC
      `).all(g.id) as any[];

      const modsWithIngredients = modifiers.map(mod => {
        const ings = rawDb.prepare(`
          SELECT mi.inventory_item_id as inventoryItemId, mi.quantity_per_modifier_base as quantityPerModifierBase,
                 ii.name as inventoryItemName, ii.base_unit_code as baseUnitCode
          FROM modifier_ingredients mi
          JOIN inventory_items ii ON mi.inventory_item_id = ii.id
          WHERE mi.modifier_id = ?
        `).all(mod.id);
        return { ...mod, ingredients: ings };
      });

      return {
        ...g,
        isRequired: Boolean(g.isRequired),
        modifiers: modsWithIngredients,
      };
    });
  } catch (_) {
    return [];
  }
}

function getProductRecipe(productId: string) {
  try {
    const rawDb = localDbManager.getRawDb();
    const recipeVer = rawDb.prepare(`
      SELECT * FROM recipe_versions WHERE product_id = ? AND status = 'active'
    `).get(productId) as any;
    if (!recipeVer) return undefined;

    const ingredients = rawDb.prepare(`
      SELECT ri.id, ri.inventory_item_id as inventoryItemId, ri.quantity_per_serving_base as quantityPerServingBase,
             ii.name as inventoryItemName, ii.base_unit_code as baseUnitCode, ii.weighted_average_unit_cost_minor as unitCostMinor
      FROM recipe_ingredients ri
      JOIN inventory_items ii ON ri.inventory_item_id = ii.id
      WHERE ri.recipe_version_id = ?
    `).all(recipeVer.id) as any[];

    return {
      id: recipeVer.id,
      versionNumber: recipeVer.version_number,
      yieldQuantity: recipeVer.yield_quantity || 1,
      ingredients,
    };
  } catch (_) {
    return undefined;
  }
}

export class ProductService {
  static listProducts(storeId: string, options?: {
    search?: string;
    barcode?: string;
    categoryId?: string;
    lowStock?: boolean;
    outOfStock?: boolean;
    activeOnly?: boolean;
  }) {
    const validStoreId = LocalDb.resolveValidStoreId(storeId);
    let list = db.products.filter(p => p.store_id === storeId || p.store_id === validStoreId);

    if (options?.activeOnly !== false) {
      list = list.filter(p => p.active);
    }

    if (options?.barcode) {
      const b = options.barcode.trim();
      list = list.filter(p => p.barcode === b);
    } else if (options?.search) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    if (options?.categoryId) {
      list = list.filter(p => p.category_id === options.categoryId);
    }

    if (options?.lowStock) {
      list = list.filter(p => p.current_stock <= p.minimum_stock && p.current_stock > 0);
    }

    if (options?.outOfStock) {
      list = list.filter(p => p.current_stock <= 0);
    }

    return list.map(p => {
      const groups = getProductModifierGroups(p.id);
      const recipe = getProductRecipe(p.id);
      return {
        ...p,
        modifierGroups: groups.length > 0 ? groups : undefined,
        recipe,
      };
    });
  }

  static getProduct(storeId: string, productId: string) {
    const prod = db.products.find(p => p.id === productId && p.store_id === storeId);
    if (!prod) throw new Error('Product not found');
    const groups = getProductModifierGroups(prod.id);
    const recipe = getProductRecipe(prod.id);
    return {
      ...prod,
      modifierGroups: groups.length > 0 ? groups : undefined,
      recipe,
    };
  }

  static async createProduct(storeId: string, userId: string, userName: string, payload: {
    name: string;
    sku?: string;
    barcode?: string;
    hsnCode?: string;
    categoryId?: string;
    description?: string;
    purchasePrice?: number;
    purchaseTaxType?: 'EXCLUSIVE' | 'INCLUSIVE';
    sellingPrice: number;
    taxRate?: number;
    taxType?: 'EXCLUSIVE' | 'INCLUSIVE';
    currentStock?: number;
    minimumStock?: number;
    unit?: string;
    packageInfo?: string;
    recipeIngredients?: Array<{ inventoryItemId: string; quantityPerServingBase: number }>;
    modifierGroupIds?: string[];
  }) {
    const cleanSku = (payload.sku && payload.sku.trim())
      ? payload.sku.trim()
      : `ICE-${Date.now().toString().slice(-6)}`;
    const cleanBarcode = (payload.barcode && payload.barcode.trim())
      ? payload.barcode.trim()
      : `FB${Date.now().toString().slice(-8)}`;

    // Check uniqueness against cache
    if (cleanSku && db.products.some(p => p.store_id === storeId && p.sku.toLowerCase() === cleanSku.toLowerCase())) {
      throw new Error(`SKU "${cleanSku}" is already in use by another product`);
    }
    if (cleanBarcode && db.products.some(p => p.store_id === storeId && p.barcode.toLowerCase() === cleanBarcode.toLowerCase())) {
      throw new Error(`Barcode "${cleanBarcode}" is already in use by another product`);
    }

    const now = new Date().toISOString();
    const newProduct: Product = {
      id: crypto.randomUUID(),
      store_id: storeId,
      category_id: payload.categoryId && payload.categoryId.trim() ? payload.categoryId.trim() : undefined,
      name: payload.name.trim(),
      sku: cleanSku,
      barcode: cleanBarcode,
      hsn_code: payload.hsnCode?.trim() || '',
      description: payload.description || '',
      purchase_price: Math.max(0, Number(payload.purchasePrice) || 0),
      purchase_tax_type: payload.purchaseTaxType || 'EXCLUSIVE',
      selling_price: Math.max(0, Number(payload.sellingPrice) || 0),
      tax_rate: Math.max(0, Number(payload.taxRate) || 0),
      tax_type: payload.taxType || 'EXCLUSIVE',
      current_stock: payload.currentStock !== undefined ? Math.max(0, Number(payload.currentStock)) : 100,
      minimum_stock: payload.minimumStock !== undefined ? Math.max(0, Number(payload.minimumStock)) : 5,
      unit: payload.unit || 'piece',
      package_info: payload.packageInfo || '',
      active: true,
      created_at: now,
      updated_at: now,
    };

    // Write to Supabase first (primary store)
    if (isSupabaseConfigured) {
      const saved = await SupabaseDb.createProduct(newProduct);
      db.products.push(saved); // update cache

      if (saved.current_stock > 0) {
        const movement = {
          store_id: storeId,
          product_id: saved.id,
          product_name: saved.name,
          user_id: userId,
          user_name: userName,
          type: 'INITIAL_STOCK' as const,
          quantity: saved.current_stock,
          before_stock: 0,
          after_stock: saved.current_stock,
          reason: 'Initial stock on product creation',
        };
        const savedMov = await SupabaseDb.createStockMovement(movement);
        db.stock_movements.unshift(savedMov);
      }

      AuditService.log({
        storeId, userId, userName, action: 'PRODUCT_CREATED', entityType: 'PRODUCT', entityId: saved.id,
        afterData: { name: saved.name, sku: saved.sku, sellingPrice: saved.selling_price },
      });
      return saved;
    }

    // Local fallback: Persist to SQLite
    const savedLocal = await LocalDb.createProduct(newProduct);
    db.products.push(savedLocal);
    if (savedLocal.current_stock > 0) {
      const movement = {
        id: crypto.randomUUID(), store_id: storeId, product_id: savedLocal.id,
        product_name: savedLocal.name, user_id: userId, user_name: userName,
        type: 'INITIAL_STOCK' as const, quantity: savedLocal.current_stock,
        before_stock: 0, after_stock: savedLocal.current_stock,
        reason: 'Initial stock on product creation', created_at: now,
      };
      await LocalDb.createStockMovement(movement);
      db.stock_movements.unshift(movement);
    }

    // Sync BOM product, Recipe and Modifiers in local SQLite
    try {
      const rawDb = localDbManager.getRawDb();
      const sellingMinor = Math.round(savedLocal.selling_price * 100);

      rawDb.prepare(`
        INSERT INTO bom_products (
          id, sku, name, category_id, description, selling_price_minor, tax_rate_percent, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sku = excluded.sku,
          name = excluded.name,
          category_id = excluded.category_id,
          description = excluded.description,
          selling_price_minor = excluded.selling_price_minor,
          tax_rate_percent = excluded.tax_rate_percent,
          updated_at = excluded.updated_at
      `).run(
        savedLocal.id,
        savedLocal.sku,
        savedLocal.name,
        savedLocal.category_id || null,
        savedLocal.description,
        sellingMinor,
        savedLocal.tax_rate,
        now,
        now
      );

      // Recipe Ingredients
      if (Array.isArray(payload.recipeIngredients) && payload.recipeIngredients.length > 0) {
        const recipeVerId = crypto.randomUUID();
        rawDb.prepare(`
          INSERT INTO recipe_versions (id, product_id, version_number, status, yield_quantity, effective_from, created_at)
          VALUES (?, ?, 1, 'active', 1, ?, ?)
        `).run(recipeVerId, savedLocal.id, now, now);

        const insertRi = rawDb.prepare(`
          INSERT INTO recipe_ingredients (id, recipe_version_id, inventory_item_id, quantity_per_serving_base)
          VALUES (?, ?, ?, ?)
        `);
        for (const ing of payload.recipeIngredients) {
          if (ing.inventoryItemId && Number(ing.quantityPerServingBase) > 0) {
            insertRi.run(crypto.randomUUID(), recipeVerId, ing.inventoryItemId, Number(ing.quantityPerServingBase));
          }
        }
      }

      // Modifier Groups
      if (Array.isArray(payload.modifierGroupIds)) {
        rawDb.prepare('DELETE FROM product_modifier_groups WHERE product_id = ?').run(savedLocal.id);
        const insertPmg = rawDb.prepare(`
          INSERT INTO product_modifier_groups (id, product_id, modifier_group_id, sort_order)
          VALUES (?, ?, ?, ?)
        `);
        payload.modifierGroupIds.forEach((grpId, idx) => {
          insertPmg.run(crypto.randomUUID(), savedLocal.id, grpId, idx);
        });
      }
    } catch (bomErr) {
      console.warn('Notice: Error syncing BOM product and recipe on create:', bomErr);
    }

    AuditService.log({
      storeId, userId, userName, action: 'PRODUCT_CREATED', entityType: 'PRODUCT', entityId: savedLocal.id,
      afterData: { name: savedLocal.name, sku: savedLocal.sku, sellingPrice: savedLocal.selling_price },
    });
    return savedLocal;
  }

  static async updateProduct(storeId: string, userId: string, userName: string, productId: string, payload: Partial<{
    name: string;
    sku: string;
    barcode: string;
    hsnCode?: string;
    categoryId?: string;
    description?: string;
    purchasePrice: number;
    purchaseTaxType: 'EXCLUSIVE' | 'INCLUSIVE';
    sellingPrice: number;
    taxRate: number;
    taxType: 'EXCLUSIVE' | 'INCLUSIVE';
    currentStock: number;
    minimumStock: number;
    unit?: string;
    packageInfo?: string;
    active?: boolean;
    recipeIngredients?: Array<{ inventoryItemId: string; quantityPerServingBase: number }>;
    modifierGroupIds?: string[];
  }>) {
    const product = this.getProduct(storeId, productId);
    const beforeData = { ...product };

    if (payload.sku && payload.sku !== product.sku) {
      const exists = db.products.some(p => p.store_id === storeId && p.id !== productId && p.sku.toLowerCase() === payload.sku!.toLowerCase());
      if (exists) throw new Error(`SKU "${payload.sku}" already exists`);
      product.sku = payload.sku;
    }
    if (payload.barcode && payload.barcode !== product.barcode) {
      const exists = db.products.some(p => p.store_id === storeId && p.id !== productId && p.barcode.toLowerCase() === payload.barcode!.toLowerCase());
      if (exists) throw new Error(`Barcode "${payload.barcode}" already exists`);
      product.barcode = payload.barcode;
    }

    if (payload.hsnCode !== undefined) product.hsn_code = payload.hsnCode.trim();
    if (payload.name !== undefined) product.name = payload.name.trim();
    if (payload.categoryId !== undefined) product.category_id = payload.categoryId;
    if (payload.description !== undefined) product.description = payload.description;
    if (payload.purchasePrice !== undefined) product.purchase_price = Math.max(0, Number(payload.purchasePrice));
    if (payload.purchaseTaxType !== undefined) product.purchase_tax_type = payload.purchaseTaxType;
    if (payload.sellingPrice !== undefined) product.selling_price = Math.max(0, Number(payload.sellingPrice));
    if (payload.taxRate !== undefined) product.tax_rate = Math.max(0, Number(payload.taxRate));
    if (payload.taxType !== undefined) product.tax_type = payload.taxType;
    if (payload.currentStock !== undefined) product.current_stock = Math.max(0, Number(payload.currentStock));
    if (payload.minimumStock !== undefined) product.minimum_stock = Math.max(0, Number(payload.minimumStock));
    if (payload.unit !== undefined) product.unit = payload.unit;
    if (payload.packageInfo !== undefined) product.package_info = payload.packageInfo;
    if (payload.active !== undefined) product.active = payload.active;
    product.updated_at = new Date().toISOString();

    if (isSupabaseConfigured) {
      await SupabaseDb.updateProduct(productId, product);
    } else {
      await LocalDb.updateProduct(productId, product);
    }

    // Sync BOM product, Recipe and Modifiers in local SQLite
    try {
      const rawDb = localDbManager.getRawDb();
      const sellingMinor = Math.round(product.selling_price * 100);

      rawDb.prepare(`
        INSERT INTO bom_products (
          id, sku, name, category_id, description, selling_price_minor, tax_rate_percent, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sku = excluded.sku,
          name = excluded.name,
          category_id = excluded.category_id,
          description = excluded.description,
          selling_price_minor = excluded.selling_price_minor,
          tax_rate_percent = excluded.tax_rate_percent,
          updated_at = excluded.updated_at
      `).run(
        product.id,
        product.sku,
        product.name,
        product.category_id || null,
        product.description,
        sellingMinor,
        product.tax_rate,
        product.created_at,
        product.updated_at
      );

      // Recipe Ingredients
      if (payload.recipeIngredients !== undefined) {
        let recipeVer = rawDb.prepare("SELECT id FROM recipe_versions WHERE product_id = ? AND status = 'active'").get(product.id) as any;
        if (!recipeVer) {
          const recipeVerId = crypto.randomUUID();
          rawDb.prepare(`
            INSERT INTO recipe_versions (id, product_id, version_number, status, yield_quantity, effective_from, created_at)
            VALUES (?, ?, 1, 'active', 1, ?, ?)
          `).run(recipeVerId, product.id, product.updated_at, product.updated_at);
          recipeVer = { id: recipeVerId };
        }

        rawDb.prepare('DELETE FROM recipe_ingredients WHERE recipe_version_id = ?').run(recipeVer.id);
        const insertRi = rawDb.prepare(`
          INSERT INTO recipe_ingredients (id, recipe_version_id, inventory_item_id, quantity_per_serving_base)
          VALUES (?, ?, ?, ?)
        `);
        for (const ing of payload.recipeIngredients) {
          if (ing.inventoryItemId && Number(ing.quantityPerServingBase) > 0) {
            insertRi.run(crypto.randomUUID(), recipeVer.id, ing.inventoryItemId, Number(ing.quantityPerServingBase));
          }
        }
      }

      // Modifier Groups
      if (payload.modifierGroupIds !== undefined) {
        rawDb.prepare('DELETE FROM product_modifier_groups WHERE product_id = ?').run(product.id);
        const insertPmg = rawDb.prepare(`
          INSERT INTO product_modifier_groups (id, product_id, modifier_group_id, sort_order)
          VALUES (?, ?, ?, ?)
        `);
        payload.modifierGroupIds.forEach((grpId, idx) => {
          insertPmg.run(crypto.randomUUID(), product.id, grpId, idx);
        });
      }
    } catch (bomErr) {
      console.warn('Notice: Error syncing BOM product and recipe on update:', bomErr);
    }

    AuditService.log({
      storeId, userId, userName, action: 'PRODUCT_UPDATED', entityType: 'PRODUCT', entityId: product.id,
      beforeData, afterData: { ...product },
    });
    return product;
  }

  static async toggleActive(storeId: string, userId: string, userName: string, productId: string, active: boolean) {
    const product = this.getProduct(storeId, productId);
    const before = product.active;
    product.active = active;
    product.updated_at = new Date().toISOString();

    if (isSupabaseConfigured) {
      await SupabaseDb.updateProduct(productId, { active, updated_at: product.updated_at });
    } else {
      await LocalDb.updateProduct(productId, { active, updated_at: product.updated_at });
    }

    AuditService.log({
      storeId, userId, userName,
      action: active ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
      entityType: 'PRODUCT', entityId: product.id,
      beforeData: { active: before }, afterData: { active },
    });
    return product;
  }

  static async deleteProduct(storeId: string, userId: string, userName: string, productId: string) {
    const product = this.getProduct(storeId, productId);
    if (isSupabaseConfigured) {
      await SupabaseDb.deleteProduct(productId);
    } else {
      await LocalDb.deleteProduct(productId);
    }
    const idx = db.products.findIndex(p => p.id === productId && p.store_id === storeId);
    if (idx !== -1) {
      db.products.splice(idx, 1);
    }
    AuditService.log({
      storeId, userId, userName,
      action: 'PRODUCT_DELETED',
      entityType: 'PRODUCT', entityId: productId,
      beforeData: { name: product.name, sku: product.sku, barcode: product.barcode },
    });
    return { success: true, message: `Product "${product.name}" deleted` };
  }
}

export const DEFAULT_STORE_CATEGORIES = [
  { name: 'Ice Cream Scoops', description: 'Fresh single and double artisanal gelato scoops' },
  { name: 'Sundaes & Platters', description: 'Signature sundaes with rich fudge, waffle crunch, and toppings' },
  { name: 'Milkshakes & Drinks', description: 'Thick gelato shakes, ice cream floats, and beverages' },
  { name: 'Savory & Hot Bites', description: 'Crispy fried chicken bites and hot savory lounge snacks' },
  { name: 'Dairy & Ice Cream Base', description: 'Bulk ice cream bases and full cream milk' },
  { name: 'Syrups & Sauces', description: 'Dark chocolate fudge, sauces, and drizzles' },
  { name: 'Dry Toppings & Biscuits', description: 'Oreo crumbs, choco chips, and tutti frutti mix' },
  { name: 'Serving & Cones', description: 'Crispy waffle cones, eco cups, and spoons' },
];

export class CategoryService {
  static async listCategories(storeId: string): Promise<Category[]> {
    const validStoreId = LocalDb.resolveValidStoreId(storeId);
    let cats = db.categories.filter(c => (c.store_id === storeId || c.store_id === validStoreId) && c.active);
    if (cats.length === 0) {
      cats = await CategoryService.seedDefaultCategories(storeId);
    }
    return cats;
  }

  static async seedDefaultCategories(storeId: string, userId?: string, userName?: string): Promise<Category[]> {
    const existingNames = new Set(
      db.categories.filter(c => c.store_id === storeId).map(c => c.name.toLowerCase().trim())
    );

    const toAdd = DEFAULT_STORE_CATEGORIES.filter(d => !existingNames.has(d.name.toLowerCase().trim()));
    if (toAdd.length === 0) {
      return db.categories.filter(c => c.store_id === storeId && c.active);
    }

    if (isSupabaseConfigured) {
      const saved = await SupabaseDb.seedDefaultCategories(storeId, toAdd);
      if (saved && saved.length > 0) {
        db.categories.push(...saved);
        if (userId && userName) {
          AuditService.log({
            storeId, userId, userName,
            action: 'CATEGORIES_SEEDED',
            entityType: 'CATEGORY',
            afterData: { count: saved.length },
          });
        }
        return db.categories.filter(c => c.store_id === storeId && c.active);
      }
    }

    await LocalDb.seedDefaultCategories(storeId, toAdd);
    const seeded = await LocalDb.getCategories(storeId);
    db.categories.splice(0, db.categories.length, ...seeded);
    if (userId && userName) {
      AuditService.log({
        storeId, userId, userName,
        action: 'CATEGORIES_SEEDED',
        entityType: 'CATEGORY',
        afterData: { count: seeded.length },
      });
    }
    return db.categories.filter(c => c.store_id === storeId && c.active);
  }

  static async createCategory(storeId: string, userId: string, userName: string, name: string, description: string) {
    const clean = name.trim();
    if (db.categories.some(c => c.store_id === storeId && c.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error(`Category "${clean}" already exists`);
    }

    const now = new Date().toISOString();
    const catPayload = {
      store_id: storeId,
      name: clean,
      description: description || '',
      active: true,
    };

    if (isSupabaseConfigured) {
      const saved = await SupabaseDb.createCategory(catPayload);
      db.categories.push(saved);
      AuditService.log({
        storeId, userId, userName, action: 'CATEGORY_CREATED', entityType: 'CATEGORY', entityId: saved.id,
        afterData: { name: saved.name },
      });
      return saved;
    }

    const saved = await LocalDb.createCategory(catPayload);
    db.categories.push(saved);
    AuditService.log({
      storeId, userId, userName, action: 'CATEGORY_CREATED', entityType: 'CATEGORY', entityId: saved.id,
      afterData: { name: saved.name },
    });
    return saved;
  }

  static async deleteCategory(storeId: string, userId: string, userName: string, categoryId: string) {
    const catIndex = db.categories.findIndex(c => c.store_id === storeId && c.id === categoryId);
    if (catIndex === -1) {
      throw new Error('Category not found');
    }
    const cat = db.categories[catIndex];

    // Detach from all products in memory
    let affectedProductsCount = 0;
    db.products.forEach(p => {
      if (p.store_id === storeId && p.category_id === categoryId) {
        p.category_id = undefined;
        p.updated_at = new Date().toISOString();
        affectedProductsCount++;
      }
    });

    if (isSupabaseConfigured) {
      await SupabaseDb.deleteCategory(storeId, categoryId);
    } else {
      await LocalDb.deleteCategory(storeId, categoryId);
    }

    // Remove from in-memory cache
    db.categories.splice(catIndex, 1);

    AuditService.log({
      storeId,
      userId,
      userName,
      action: 'CATEGORY_DELETED',
      entityType: 'CATEGORY',
      entityId: categoryId,
      beforeData: { name: cat.name, description: cat.description, affectedProductsCount },
    });

    return {
      success: true,
      message: `Category "${cat.name}" removed successfully`,
      affectedProductsCount,
    };
  }
}
