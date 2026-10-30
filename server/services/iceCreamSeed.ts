import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { localDbManager } from '../localDb.ts';
import { inventoryLedgerEngine } from './inventoryLedgerEngine.ts';
import { db } from '../db.ts';

/**
 * Authoritative FryFreeze Seeder
 * Clears old generic grocery demo data and establishes authentic quick-service & dessert parlour defaults:
 * - Store: FryFreeze
 * - Menu Categories: Ice Cream Scoops, Sundaes & Platters, Milkshakes & Drinks, Savory & Hot Bites
 * - Raw Materials: Chocolate Base, Vanilla Base, Milk, Syrups, Oreo, Choco Chips, Waffle Cones, etc.
 * - Modifier Groups: Serving Option (Cone vs Cup) & Ice Cream Toppings (Choco Chips, Oreo, Tutti Frutti, Drizzle)
 * - Decoupled Products linked to BOM Recipe Versions
 */
export function seedIceCreamParlourData(customDb?: DatabaseSync) {
  const sqlite = customDb || localDbManager.getRawDb();
  const now = new Date().toISOString();

  sqlite.exec('BEGIN IMMEDIATE');
  try {
    // 0. Ensure tables exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        address TEXT,
        phone TEXT,
        email TEXT,
        gstin TEXT,
        currency TEXT DEFAULT 'INR',
        timezone TEXT DEFAULT 'Asia/Kolkata',
        invoice_prefix TEXT DEFAULT 'INV',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        store_id TEXT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        store_id TEXT,
        category_id TEXT,
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
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        store_id TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'STAFF',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        created_at TEXT NOT NULL
      );
    `);

    // 1. Clear old demo sales, products, and categories safely
    try {
      sqlite.exec(`
        DELETE FROM sale_items;
        DELETE FROM sales;
        DELETE FROM stock_movements;
      `);
    } catch (_) {}

    try {
      sqlite.exec(`
        DELETE FROM pos_refund_lines;
        DELETE FROM pos_refunds;
        DELETE FROM pos_sale_item_modifiers;
        DELETE FROM pos_sale_items;
        DELETE FROM pos_payments;
        DELETE FROM pos_sales;
        DELETE FROM purchase_lines;
        DELETE FROM purchases;
        DELETE FROM stock_count_lines;
        DELETE FROM stock_counts;
        DELETE FROM wastage_records;
        DELETE FROM inventory_movements;
        DELETE FROM inventory_lots;
        DELETE FROM recipe_ingredients;
        DELETE FROM recipe_versions;
        DELETE FROM product_modifier_groups;
        DELETE FROM modifier_ingredients;
        DELETE FROM modifiers;
        DELETE FROM modifier_groups;
        DELETE FROM bom_products;
        DELETE FROM products;
        DELETE FROM categories;
        DELETE FROM suppliers;
      `);
    } catch (_) {}

    const defaultStoreId = 'a0000000-0000-0000-0000-000000000001';

    // 2. Set Ice Cream Store Profile
    sqlite.prepare(`
      INSERT OR REPLACE INTO stores (
        id, name, code, address, phone, email, gstin, currency,
        timezone, invoice_prefix, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      defaultStoreId,
      'FryFreeze',
      'FRYFREEZE-01',
      '42 Richmond Road, Central Arcade, Bengaluru, KA 560025',
      '+91 98450 12345',
      'orders@fryfreeze.com',
      '29AABCU9603R1ZM',
      'INR',
      'Asia/Kolkata',
      'FF',
      now,
      now
    );

    // Note: User credentials are NOT stored locally. Users reside exclusively in Supabase Cloud.

    // 4. Categories (Menu, Inventory, Expenses)
    const categoriesData = [
      { id: crypto.randomUUID(), name: 'Ice Cream Scoops', categoryType: 'menu', sortOrder: 1, desc: 'Fresh single and double scoops' },
      { id: crypto.randomUUID(), name: 'Sundaes & Platters', categoryType: 'menu', sortOrder: 2, desc: 'Signature sundaes with rich fudge and crunches' },
      { id: crypto.randomUUID(), name: 'Milkshakes & Drinks', categoryType: 'menu', sortOrder: 3, desc: 'Thick gelato shakes and ice cream floats' },
      { id: crypto.randomUUID(), name: 'Savory & Hot Bites', categoryType: 'menu', sortOrder: 4, desc: 'Crispy fried chicken bites and hot snacks' },
      { id: crypto.randomUUID(), name: 'Dairy & Ice Cream Base', categoryType: 'inventory', sortOrder: 10, desc: 'Bulk ice cream bases and milk' },
      { id: crypto.randomUUID(), name: 'Syrups & Sauces', categoryType: 'inventory', sortOrder: 11, desc: 'Fudge, chocolate syrups, and fruit drizzles' },
      { id: crypto.randomUUID(), name: 'Dry Toppings & Biscuits', categoryType: 'inventory', sortOrder: 12, desc: 'Oreo, choco chips, nuts, and tutti frutti' },
      { id: crypto.randomUUID(), name: 'Poultry & Savory Raw', categoryType: 'inventory', sortOrder: 13, desc: 'Chicken, batter, and frying oil' },
      { id: crypto.randomUUID(), name: 'Serving & Cones', categoryType: 'inventory', sortOrder: 14, desc: 'Waffle cones, cups, and spoons' },
      { id: crypto.randomUUID(), name: 'Utilities & Power', categoryType: 'expense', sortOrder: 20, desc: 'Electricity and refrigeration power' },
      { id: crypto.randomUUID(), name: 'Rent & Store Maintenance', categoryType: 'expense', sortOrder: 21, desc: 'Store lease and upkeep' },
      { id: crypto.randomUUID(), name: 'Packaging & Supplies', categoryType: 'expense', sortOrder: 22, desc: 'Takeaway containers and bags' },
    ];

    const insertCat = sqlite.prepare(`
      INSERT INTO categories (id, store_id, name, description, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);

    const catMap = new Map<string, string>();
    for (const c of categoriesData) {
      insertCat.run(c.id, defaultStoreId, c.name, c.desc, now, now);
      catMap.set(c.name, c.id);
    }

    // 5. Suppliers
    const suppliersData = [
      { id: crypto.randomUUID(), name: 'Creamline Dairy Co.', contactPerson: 'Arun Kumar', phone: '+91 94480 11223', email: 'orders@creamlinedairy.in', address: 'Plot 14, Whitefield Industrial Area, Bengaluru' },
      { id: crypto.randomUUID(), name: 'SweetBake Confectionery Importers', contactPerson: 'Anita Rao', phone: '+91 98860 33445', email: 'sales@sweetbake.com', address: '28 Commercial Street, Bengaluru' },
      { id: crypto.randomUUID(), name: 'Poultry Direct Farms', contactPerson: 'Farhan Khan', phone: '+91 97400 55667', email: 'supplies@poultrydirect.in', address: 'Hoskote Farm Hub, Bengaluru Rural' },
    ];

    const insertSup = sqlite.prepare(`
      INSERT INTO suppliers (id, name, contact_person, phone, email, address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of suppliersData) {
      insertSup.run(s.id, s.name, s.contactPerson, s.phone, s.email, s.address, now);
    }

    // 6. Raw Inventory Items & Opening Movements
    const rawItemsData = [
      {
        sku: 'ING-CHOC-01',
        name: 'Chocolate Ice Cream Base',
        category: 'Dairy & Ice Cream Base',
        baseUnitCode: 'g',
        defaultPurchaseUnit: 'kg',
        defaultPackQuantityBase: 5000, // 5 kg tub
        reorderLevelBase: 3000,
        unitCostMinor: 25, // 25 paise/g = ₹250/kg
        initialStock: 10000, // 2 tubs = 10,000 g
      },
      {
        sku: 'ING-VAN-01',
        name: 'Vanilla Ice Cream Base',
        category: 'Dairy & Ice Cream Base',
        baseUnitCode: 'g',
        defaultPurchaseUnit: 'kg',
        defaultPackQuantityBase: 5000,
        reorderLevelBase: 3000,
        unitCostMinor: 20, // 20 paise/g = ₹200/kg
        initialStock: 10000,
      },
      {
        sku: 'ING-MILK-01',
        name: 'Full Cream Fresh Milk',
        category: 'Dairy & Ice Cream Base',
        baseUnitCode: 'ml',
        defaultPurchaseUnit: 'l',
        defaultPackQuantityBase: 1000, // 1 L packet
        reorderLevelBase: 4000,
        unitCostMinor: 7, // 7 paise/ml = ₹70/L
        initialStock: 10000,
      },
      {
        sku: 'ING-SYR-01',
        name: 'Dark Chocolate Syrup',
        category: 'Syrups & Sauces',
        baseUnitCode: 'ml',
        defaultPurchaseUnit: 'l',
        defaultPackQuantityBase: 1000, // 1 L bottle
        reorderLevelBase: 1000,
        unitCostMinor: 15, // 15 paise/ml = ₹150/L
        initialStock: 4000,
      },
      {
        sku: 'ING-OREO-01',
        name: 'Oreo Biscuits & Crumbs',
        category: 'Dry Toppings & Biscuits',
        baseUnitCode: 'g',
        defaultPurchaseUnit: 'kg',
        defaultPackQuantityBase: 1000, // 1 kg pouch
        reorderLevelBase: 1000,
        unitCostMinor: 20, // 20 paise/g = ₹200/kg
        initialStock: 5000,
      },
      {
        sku: 'ING-CHIP-01',
        name: 'Belgian Chocolate Chips',
        category: 'Dry Toppings & Biscuits',
        baseUnitCode: 'g',
        defaultPurchaseUnit: 'kg',
        defaultPackQuantityBase: 1000, // 1 kg bag
        reorderLevelBase: 800,
        unitCostMinor: 35, // 35 paise/g = ₹350/kg
        initialStock: 3000,
      },
      {
        sku: 'ING-TUTTI-01',
        name: 'Tutti Frutti Mix',
        category: 'Dry Toppings & Biscuits',
        baseUnitCode: 'g',
        defaultPurchaseUnit: 'kg',
        defaultPackQuantityBase: 1000,
        reorderLevelBase: 800,
        unitCostMinor: 12, // 12 paise/g = ₹120/kg
        initialStock: 3000,
      },
      {
        sku: 'ING-CONE-01',
        name: 'Crispy Waffle Cones',
        category: 'Serving & Cones',
        baseUnitCode: 'piece',
        defaultPurchaseUnit: 'piece',
        defaultPackQuantityBase: 50, // 50 cones box
        reorderLevelBase: 50,
        unitCostMinor: 400, // ₹4.00 per piece
        initialStock: 150,
      },
      {
        sku: 'ING-WING-01',
        name: 'Fresh Chicken Wings',
        category: 'Poultry & Savory Raw',
        baseUnitCode: 'g',
        defaultPurchaseUnit: 'kg',
        defaultPackQuantityBase: 2000, // 2 kg pack
        reorderLevelBase: 2000,
        unitCostMinor: 22, // 22 paise/g = ₹220/kg
        initialStock: 8000,
      },
      {
        sku: 'ING-DRUM-01',
        name: 'Fresh Chicken Drumsticks',
        category: 'Poultry & Savory Raw',
        baseUnitCode: 'g',
        defaultPurchaseUnit: 'kg',
        defaultPackQuantityBase: 2000,
        reorderLevelBase: 2000,
        unitCostMinor: 25, // 25 paise/g = ₹250/kg
        initialStock: 8000,
      },
      {
        sku: 'ING-COAT-01',
        name: 'Crispy Breading & Coating Mix',
        category: 'Poultry & Savory Raw',
        baseUnitCode: 'g',
        defaultPurchaseUnit: 'kg',
        defaultPackQuantityBase: 1000,
        reorderLevelBase: 1000,
        unitCostMinor: 10, // 10 paise/g = ₹100/kg
        initialStock: 4000,
      },
      {
        sku: 'ING-OIL-01',
        name: 'Refined Frying Oil',
        category: 'Poultry & Savory Raw',
        baseUnitCode: 'ml',
        defaultPurchaseUnit: 'l',
        defaultPackQuantityBase: 5000, // 5 L can
        reorderLevelBase: 5000,
        unitCostMinor: 14, // 14 paise/ml = ₹140/L
        initialStock: 15000,
      },
    ];

    const insertRaw = sqlite.prepare(`
      INSERT INTO inventory_items (
        id, sku, name, category_id, base_unit_code, default_purchase_unit,
        default_pack_quantity_base, reorder_level_base, costing_method,
        weighted_average_unit_cost_minor, current_stock_base, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'weighted_average', ?, ?, 1, ?, ?)
    `);

    const insertMovement = sqlite.prepare(`
      INSERT INTO inventory_movements (
        id, inventory_item_id, movement_type, quantity_delta_base,
        resulting_quantity_base, unit_cost_snapshot, total_cost_minor,
        reference_type, reference_id, reason, created_at, created_by
      ) VALUES (?, ?, 'opening_balance', ?, ?, ?, ?, 'setup', NULL, 'Initial setup opening stock', ?, 'SYSTEM')
    `);

    const rawMap = new Map<string, string>();
    for (const item of rawItemsData) {
      const id = crypto.randomUUID();
      const catId = catMap.get(item.category) || null;
      insertRaw.run(
        id,
        item.sku,
        item.name,
        catId,
        item.baseUnitCode,
        item.defaultPurchaseUnit,
        item.defaultPackQuantityBase,
        item.reorderLevelBase,
        item.unitCostMinor,
        item.initialStock,
        now,
        now
      );

      insertMovement.run(
        crypto.randomUUID(),
        id,
        item.initialStock,
        item.initialStock,
        item.unitCostMinor,
        Math.round(item.initialStock * item.unitCostMinor),
        now
      );

      rawMap.set(item.name, id);
    }

    // 7. Modifier Groups & Modifiers (Ice Cream Toppings & Serving Options)
    const toppingGroupId = crypto.randomUUID();
    sqlite.prepare(`
      INSERT INTO modifier_groups (
        id, name, selection_type, min_selections, max_selections, is_required, is_active
      ) VALUES (?, 'Ice Cream Toppings', 'multiple', 0, 4, 0, 1)
    `).run(toppingGroupId);

    const toppingsList = [
      { name: 'Belgian Chocolate Chips', priceMinor: 1500, ingName: 'Belgian Chocolate Chips', qty: 10 },
      { name: 'Crunchy Oreo Crumbs', priceMinor: 2000, ingName: 'Oreo Biscuits & Crumbs', qty: 15 },
      { name: 'Tutti Frutti Bits', priceMinor: 1000, ingName: 'Tutti Frutti Mix', qty: 15 },
      { name: 'Dark Chocolate Drizzle', priceMinor: 1000, ingName: 'Dark Chocolate Syrup', qty: 10 },
    ];

    for (let i = 0; i < toppingsList.length; i++) {
      const top = toppingsList[i];
      const modId = crypto.randomUUID();
      sqlite.prepare(`
        INSERT INTO modifiers (
          id, modifier_group_id, name, additional_price_minor, is_active, sort_order
        ) VALUES (?, ?, ?, ?, 1, ?)
      `).run(modId, toppingGroupId, top.name, top.priceMinor, i + 1);

      const rawId = rawMap.get(top.ingName);
      if (rawId) {
        sqlite.prepare(`
          INSERT INTO modifier_ingredients (
            id, modifier_id, inventory_item_id, quantity_per_modifier_base
          ) VALUES (?, ?, ?, ?)
        `).run(crypto.randomUUID(), modId, rawId, top.qty);
      }
    }

    const servingGroupId = crypto.randomUUID();
    sqlite.prepare(`
      INSERT INTO modifier_groups (
        id, name, selection_type, min_selections, max_selections, is_required, is_active
      ) VALUES (?, 'Serving Option', 'single', 0, 1, 0, 1)
    `).run(servingGroupId);

    const coneModId = crypto.randomUUID();
    sqlite.prepare(`
      INSERT INTO modifiers (
        id, modifier_group_id, name, additional_price_minor, is_active, sort_order
      ) VALUES (?, ?, 'Crispy Waffle Cone', 1500, 1, 1)
    `).run(coneModId, servingGroupId);

    const coneRawId = rawMap.get('Crispy Waffle Cones');
    if (coneRawId) {
      sqlite.prepare(`
        INSERT INTO modifier_ingredients (
          id, modifier_id, inventory_item_id, quantity_per_modifier_base
        ) VALUES (?, ?, ?, ?)
      `).run(crypto.randomUUID(), coneModId, coneRawId, 1);
    }

    const cupModId = crypto.randomUUID();
    sqlite.prepare(`
      INSERT INTO modifiers (
        id, modifier_group_id, name, additional_price_minor, is_active, sort_order
      ) VALUES (?, ?, 'Classic Eco Cup', 0, 1, 2)
    `).run(cupModId, servingGroupId);

    // 8. Products, Recipes & POS Catalog
    const productsData = [
      {
        id: crypto.randomUUID(),
        sku: 'PRD-CHOC-SCP',
        barcode: '8901234001',
        name: 'Belgian Chocolate Scoop',
        category: 'Ice Cream Scoops',
        description: 'Single scoop of rich, creamy Belgian dark chocolate gelato.',
        sellingPriceMinor: 8000, // ₹80.00
        taxRatePercent: 5.0,
        modifierGroupIds: [servingGroupId, toppingGroupId],
        ingredients: [
          { name: 'Chocolate Ice Cream Base', qty: 100 }, // 100g
        ],
      },
      {
        id: crypto.randomUUID(),
        sku: 'PRD-VAN-SCP',
        barcode: '8901234002',
        name: 'Classic Vanilla Scoop',
        category: 'Ice Cream Scoops',
        description: 'Single scoop of aromatic Madagascar bourbon vanilla bean gelato.',
        sellingPriceMinor: 7000, // ₹70.00
        taxRatePercent: 5.0,
        modifierGroupIds: [servingGroupId, toppingGroupId],
        ingredients: [
          { name: 'Vanilla Ice Cream Base', qty: 100 }, // 100g
        ],
      },
      {
        id: crypto.randomUUID(),
        sku: 'PRD-OREO-SHK',
        barcode: '8901234003',
        name: 'Chocolate Oreo Milkshake',
        category: 'Milkshakes & Drinks',
        description: 'Thick, creamy blend of chocolate gelato, milk, Oreo biscuits, and rich chocolate syrup.',
        sellingPriceMinor: 16000, // ₹160.00
        taxRatePercent: 5.0,
        modifierGroupIds: [toppingGroupId],
        ingredients: [
          { name: 'Chocolate Ice Cream Base', qty: 150 }, // 150g
          { name: 'Full Cream Fresh Milk', qty: 200 },    // 200ml
          { name: 'Oreo Biscuits & Crumbs', qty: 30 },    // 30g
          { name: 'Dark Chocolate Syrup', qty: 20 },       // 20ml
        ],
      },
      {
        id: crypto.randomUUID(),
        sku: 'PRD-BELG-SUN',
        barcode: '8901234004',
        name: 'Royal Belgian Fudge Sundae',
        category: 'Sundaes & Platters',
        description: 'Double scoop of dark chocolate gelato drizzled with chocolate fudge, chocolate chips, and waffle crunch.',
        sellingPriceMinor: 19000, // ₹190.00
        taxRatePercent: 5.0,
        modifierGroupIds: [toppingGroupId],
        ingredients: [
          { name: 'Chocolate Ice Cream Base', qty: 180 }, // 180g
          { name: 'Dark Chocolate Syrup', qty: 30 },      // 30ml
          { name: 'Belgian Chocolate Chips', qty: 15 },   // 15g
          { name: 'Crispy Waffle Cones', qty: 1 },         // 1 piece
        ],
      },
      {
        id: crypto.randomUUID(),
        sku: 'PRD-CHK-WING',
        barcode: '8901234005',
        name: 'Crispy Fried Wings (4 pcs)',
        category: 'Savory & Hot Bites',
        description: 'Golden fried chicken wings coated in seasoned batter and deep-fried to perfection.',
        sellingPriceMinor: 18000, // ₹180.00
        taxRatePercent: 5.0,
        modifierGroupIds: [],
        ingredients: [
          { name: 'Fresh Chicken Wings', qty: 200 },          // 200g
          { name: 'Crispy Breading & Coating Mix', qty: 40 }, // 40g
          { name: 'Refined Frying Oil', qty: 30 },             // 30ml
        ],
      },
      {
        id: crypto.randomUUID(),
        sku: 'PRD-CHK-DRUM',
        barcode: '8901234006',
        name: 'Crispy Fried Drumsticks (2 pcs)',
        category: 'Savory & Hot Bites',
        description: 'Juicy, marinated chicken drumsticks coated in signature spice batter.',
        sellingPriceMinor: 19000, // ₹190.00
        taxRatePercent: 5.0,
        modifierGroupIds: [],
        ingredients: [
          { name: 'Fresh Chicken Drumsticks', qty: 250 },      // 250g
          { name: 'Crispy Breading & Coating Mix', qty: 50 },  // 50g
          { name: 'Refined Frying Oil', qty: 35 },              // 35ml
        ],
      },
    ];

    const insertLegacyProduct = sqlite.prepare(`
      INSERT INTO products (
        id, store_id, category_id, name, sku, barcode, description,
        purchase_price, selling_price, tax_rate, current_stock, minimum_stock,
        unit, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 10, 'piece', 1, ?, ?)
    `);

    const insertBomProduct = sqlite.prepare(`
      INSERT INTO bom_products (
        id, sku, name, category_id, description,
        selling_price_minor, tax_rate_percent, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const insertRecipeVer = sqlite.prepare(`
      INSERT INTO recipe_versions (
        id, product_id, version_number, status, yield_quantity, effective_from, change_reason, created_at
      ) VALUES (?, ?, 1, 'active', 1, ?, 'Initial recipe standard', ?)
    `);

    const insertRecipeIng = sqlite.prepare(`
      INSERT INTO recipe_ingredients (
        id, recipe_version_id, inventory_item_id, quantity_per_serving_base, is_optional, preparation_notes
      ) VALUES (?, ?, ?, ?, 0, NULL)
    `);

    const insertProdModGroup = sqlite.prepare(`
      INSERT INTO product_modifier_groups (id, product_id, modifier_group_id)
      VALUES (?, ?, ?)
    `);

    for (const prod of productsData) {
      const catId = catMap.get(prod.category) || null;
      const sellingPriceRupees = prod.sellingPriceMinor / 100;
      const purchasePriceRupees = Math.round(sellingPriceRupees * 0.45 * 100) / 100; // Estimated 45% food cost

      // Insert into legacy POS catalog products table
      insertLegacyProduct.run(
        prod.id,
        defaultStoreId,
        catId,
        prod.name,
        prod.sku,
        prod.barcode,
        prod.description,
        purchasePriceRupees,
        sellingPriceRupees,
        prod.taxRatePercent,
        now,
        now
      );

      // Insert into decoupled BOM product table
      insertBomProduct.run(
        prod.id,
        prod.sku,
        prod.name,
        catId,
        prod.description,
        prod.sellingPriceMinor,
        prod.taxRatePercent,
        now,
        now
      );

      // Link modifier groups
      for (const mgId of prod.modifierGroupIds) {
        insertProdModGroup.run(crypto.randomUUID(), prod.id, mgId);
      }

      // Create Recipe Version 1
      const recipeVersionId = crypto.randomUUID();
      insertRecipeVer.run(recipeVersionId, prod.id, now, now);

      // Link Recipe Ingredients
      for (const ing of prod.ingredients) {
        const rawId = rawMap.get(ing.name);
        if (rawId) {
          insertRecipeIng.run(crypto.randomUUID(), recipeVersionId, rawId, ing.qty);
        }
      }
    }

    sqlite.exec('COMMIT');

    // Sync in-memory cache if db is initialized
    try {
      (db as any).syncFromSqlite?.();
    } catch (_) {}

    console.log('🍗🍦 FryFreeze seeded successfully!');
    return { success: true, storeName: 'FryFreeze' };
  } catch (err) {
    try {
      sqlite.exec('ROLLBACK');
    } catch (_) {}
    console.error('Failed to seed ice cream parlour data:', err);
    throw err;
  }
}
