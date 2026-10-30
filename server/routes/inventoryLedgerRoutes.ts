import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { inventoryLedgerEngine } from '../services/inventoryLedgerEngine.ts';

export const inventoryLedgerRouter = Router();

// ============================================================
// STRICT ZOD VALIDATION SCHEMAS
// ============================================================

export const CartItemModifierSchema = z.object({
  modifierId: z.string().min(1, 'modifierId is required'),
  quantity: z.number().int().positive().default(1),
});

export const CartItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  selectedModifiers: z.array(CartItemModifierSchema).optional().default([]),
  discountMinor: z.number().int().nonnegative().optional().default(0),
});

export const PosCheckoutSchema = z.object({
  idempotencyKey: z.string().nullable().optional(),
  cartItems: z.array(CartItemSchema).min(1, 'Cart must contain at least 1 item'),
  discountMinor: z.number().int().nonnegative().optional().default(0),
  paymentMethod: z.string().optional().default('cash'),
  amountPaidMinor: z.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  allowNegativeStockSales: z.boolean().optional().default(false),
});

export const PurchaseLineSchema = z.object({
  inventoryItemId: z.string().min(1, 'inventoryItemId is required'),
  purchaseUnit: z.string().min(1, 'purchaseUnit is required'),
  packsReceived: z.number().int().positive('packsReceived must be greater than zero'),
  quantityPerPackBase: z.number().int().positive('quantityPerPackBase must be greater than zero'),
  lineTotalMinor: z.number().int().nonnegative('lineTotalMinor cannot be negative'),
});

export const PurchaseSchema = z.object({
  supplierId: z.string().nullable().optional(),
  invoiceReference: z.string().nullable().optional(),
  purchaseDate: z.string().optional(),
  lines: z.array(PurchaseLineSchema).min(1, 'Purchase must have at least 1 line item'),
  discountMinor: z.number().int().nonnegative().optional().default(0),
  paymentStatus: z.string().optional().default('paid'),
  notes: z.string().nullable().optional(),
});

export const WastageSchema = z.object({
  inventoryItemId: z.string().min(1, 'inventoryItemId is required'),
  quantityBase: z.number().int().positive('quantityBase must be greater than zero'),
  reason: z.enum(['spoiled', 'dropped', 'melted', 'expired', 'prep_error']),
  notes: z.string().nullable().optional(),
});

export const RefundLineSchema = z.object({
  saleItemId: z.string().min(1, 'saleItemId is required'),
  quantityRefunded: z.number().int().positive('quantityRefunded must be at least 1'),
  amountMinor: z.number().int().nonnegative(),
  restockDecision: z.enum(['discarded', 'restocked']),
});

export const RefundSchema = z.object({
  saleId: z.string().min(1, 'saleId is required'),
  amountMinor: z.number().int().nonnegative(),
  reason: z.string().min(1, 'Reason is required'),
  lines: z.array(RefundLineSchema).min(1, 'Refund must have at least 1 line'),
});

export const StockCountLineSchema = z.object({
  inventoryItemId: z.string().min(1, 'inventoryItemId is required'),
  countedQuantityBase: z.number().int().nonnegative(),
  notes: z.string().nullable().optional(),
});

export const StockCountSchema = z.object({
  notes: z.string().nullable().optional(),
  lines: z.array(StockCountLineSchema).min(1, 'Stock count must have at least 1 line item'),
});

export const RecipeIngredientSchema = z.object({
  inventoryItemId: z.string().min(1, 'inventoryItemId is required'),
  quantityPerServingBase: z.number().int().positive('quantityPerServingBase must be greater than zero'),
  isOptional: z.boolean().optional().default(false),
  preparationNotes: z.string().optional(),
});

export const RecipeVersionSchema = z.object({
  yieldQuantity: z.number().int().positive().optional().default(1),
  changeReason: z.string().nullable().optional(),
  ingredients: z.array(RecipeIngredientSchema).min(1, 'Recipe must have at least 1 ingredient'),
});

// ============================================================
// ROUTE HANDLERS
// ============================================================

// 6.1 POST /api/pos/sales (and alias /api/sales when cartItems present)
inventoryLedgerRouter.post('/pos/sales', (req: Request, res: Response) => {
  try {
    const validated = PosCheckoutSchema.parse(req.body);
    const result = inventoryLedgerEngine.processPosCheckout(validated);
    if (result.isDuplicate) {
      return res.status(200).json(result);
    }
    return res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.issues } });
    }
    return res.status(400).json({ error: { code: 'CHECKOUT_ERROR', message: err.message } });
  }
});

// 6.2 POST /api/purchases
inventoryLedgerRouter.post('/purchases', (req: Request, res: Response) => {
  try {
    const validated = PurchaseSchema.parse(req.body);
    const result = inventoryLedgerEngine.receivePurchase(validated);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.issues } });
    }
    return res.status(400).json({ error: { code: 'PURCHASE_ERROR', message: err.message } });
  }
});

// Stock Counts: Create draft
inventoryLedgerRouter.post('/stock-counts', (req: Request, res: Response) => {
  try {
    const validated = StockCountSchema.parse(req.body);
    const result = inventoryLedgerEngine.createStockCount(validated);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.issues } });
    }
    return res.status(400).json({ error: { code: 'STOCK_COUNT_ERROR', message: err.message } });
  }
});

// 6.3 POST /api/stock-counts/:id/approve
inventoryLedgerRouter.post('/stock-counts/:id/approve', (req: Request, res: Response) => {
  try {
    const result = inventoryLedgerEngine.approveStockCount(req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: { code: 'APPROVE_ERROR', message: err.message } });
  }
});

// 6.4 POST /api/wastage
inventoryLedgerRouter.post('/wastage', (req: Request, res: Response) => {
  try {
    const validated = WastageSchema.parse(req.body);
    const result = inventoryLedgerEngine.recordWastage(validated);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.issues } });
    }
    return res.status(400).json({ error: { code: 'WASTAGE_ERROR', message: err.message } });
  }
});

// 6.5 POST /api/refunds
inventoryLedgerRouter.post('/refunds', (req: Request, res: Response) => {
  try {
    const validated = RefundSchema.parse(req.body);
    const result = inventoryLedgerEngine.processRefund(validated);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.issues } });
    }
    return res.status(400).json({ error: { code: 'REFUND_ERROR', message: err.message } });
  }
});

// ============================================================
// INVENTORY, RECIPES & AUDIT ROUTES
// ============================================================

// GET /api/inventory/items
inventoryLedgerRouter.get('/inventory/items', (_req: Request, res: Response) => {
  try {
    const items = inventoryLedgerEngine.listInventoryItems();
    return res.json(items);
  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message } });
  }
});

// POST /api/inventory/items
inventoryLedgerRouter.post('/inventory/items', (req: Request, res: Response) => {
  try {
    const item = inventoryLedgerEngine.createInventoryItem(req.body);
    return res.status(201).json(item);
  } catch (err: any) {
    return res.status(400).json({ error: { message: err.message } });
  }
});

// POST /api/recipes/:productId/versions
inventoryLedgerRouter.post('/recipes/:productId/versions', (req: Request, res: Response) => {
  try {
    const validated = RecipeVersionSchema.parse(req.body);
    const recipe = inventoryLedgerEngine.createRecipeVersion({
      productId: req.params.productId,
      yieldQuantity: validated.yieldQuantity,
      changeReason: validated.changeReason || undefined,
      ingredients: validated.ingredients,
    });
    return res.status(201).json(recipe);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: err.issues } });
    }
    return res.status(400).json({ error: { message: err.message } });
  }
});

// GET /api/recipes/:productId/active
inventoryLedgerRouter.get('/recipes/:productId/active', (req: Request, res: Response) => {
  try {
    const recipe = inventoryLedgerEngine.getActiveRecipeVersion(req.params.productId);
    if (!recipe) {
      return res.status(404).json({ error: { message: 'No active recipe found for product' } });
    }
    return res.json(recipe);
  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message } });
  }
});

// GET /api/inventory/audit-drift (Double-entry reconciliation audit query)
inventoryLedgerRouter.get('/inventory/audit-drift', (_req: Request, res: Response) => {
  try {
    const discrepancies = inventoryLedgerEngine.checkLedgerIntegrity();
    return res.json({
      status: discrepancies.length === 0 ? 'HEALTHY' : 'DISCREPANCY_DETECTED',
      discrepancyCount: discrepancies.length,
      discrepancies,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message } });
  }
});

// GET /api/inventory/ledger-movements
inventoryLedgerRouter.get('/inventory/ledger-movements', (req: Request, res: Response) => {
  try {
    const { inventoryItemId, movementType, limit } = req.query;
    const movements = inventoryLedgerEngine.getMovements({
      inventoryItemId: inventoryItemId as string,
      movementType: movementType as string,
      limit: limit ? Number(limit) : 100,
    });
    return res.json(movements);
  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message } });
  }
});

// GET /api/modifier-groups
inventoryLedgerRouter.get('/modifier-groups', (_req: Request, res: Response) => {
  try {
    const rawDb = (inventoryLedgerEngine as any).db;
    const groups = rawDb.prepare(`
      SELECT g.id, g.name, g.selection_type as selectionType, g.is_required as isRequired
      FROM modifier_groups g
      ORDER BY g.name ASC
    `).all();
    return res.json(groups);
  } catch (err: any) {
    return res.status(500).json({ error: { message: err.message } });
  }
});
