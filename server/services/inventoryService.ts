import { db, StockMovement, MovementType } from '../db.ts';
import { LocalDb, localDbManager } from '../localDb.ts';
import { AuditService } from './auditService.ts';
import { SupabaseDb } from '../supabaseDb.ts';
import { isSupabaseConfigured } from '../supabaseClient.ts';
import crypto from 'crypto';

export class InventoryService {
  static receiveStock(params: {
    storeId: string;
    userId: string;
    userName: string;
    productId: string;
    quantity: number;
    reason?: string;
    purchasePrice?: number;
    taxRate?: number;
    taxType?: 'EXCLUSIVE' | 'INCLUSIVE';
    supplierInvoice?: string;
    supplierGstin?: string;
  }) {
    const qty = Number(params.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new Error('Received quantity must be a positive number');
    }

    const product = db.products.find(p => p.id === params.productId && p.store_id === params.storeId);
    if (!product) throw new Error('Product not found');
    if (!product.active) throw new Error('Cannot receive stock for deactivated product');

    const beforeStock = product.current_stock;
    const afterStock = beforeStock + qty;
    product.current_stock = afterStock;
    product.updated_at = new Date().toISOString();

    const unitCost = params.purchasePrice !== undefined && Number(params.purchasePrice) >= 0
      ? Number(params.purchasePrice)
      : product.purchase_price;
    const taxRate = params.taxRate !== undefined && Number(params.taxRate) >= 0
      ? Number(params.taxRate)
      : product.tax_rate;
    const taxType = params.taxType || product.purchase_tax_type || 'EXCLUSIVE';

    let totalCost = qty * unitCost;
    let taxableAmount = totalCost;
    let taxAmount = 0;

    if (taxType === 'INCLUSIVE' && taxRate > 0) {
      taxableAmount = Math.round((totalCost / (1 + taxRate / 100)) * 100) / 100;
      taxAmount = Math.round((totalCost - taxableAmount) * 100) / 100;
    } else {
      taxableAmount = totalCost;
      taxAmount = Math.round((taxableAmount * (taxRate / 100)) * 100) / 100;
    }

    if (params.purchasePrice !== undefined && Number(params.purchasePrice) > 0) {
      product.purchase_price = Number(params.purchasePrice);
      if (params.taxType) product.purchase_tax_type = params.taxType;
    }

    const reasonParts = [];
    if (params.reason) reasonParts.push(params.reason.trim());
    if (params.supplierInvoice) reasonParts.push(`Inv: ${params.supplierInvoice.trim()}`);
    if (params.supplierGstin) reasonParts.push(`GSTIN: ${params.supplierGstin.trim().toUpperCase()}`);
    if (taxRate > 0) reasonParts.push(`GST: ${taxRate}% (${taxType})`);

    const finalReason = reasonParts.join(' · ') || 'Stock received from supplier';

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      store_id: params.storeId,
      product_id: product.id,
      product_name: product.name,
      user_id: params.userId,
      user_name: params.userName,
      type: 'PURCHASE',
      quantity: qty,
      before_stock: beforeStock,
      after_stock: afterStock,
      reason: finalReason,
      purchase_cost: unitCost,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      supplier_invoice: params.supplierInvoice?.trim(),
      supplier_gstin: params.supplierGstin?.trim().toUpperCase(),
      created_at: new Date().toISOString(),
    };

    db.stock_movements.unshift(movement);

    if (isSupabaseConfigured) {
      SupabaseDb.updateProduct(product.id, {
        current_stock: afterStock,
        purchase_price: product.purchase_price,
        purchase_tax_type: product.purchase_tax_type,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      SupabaseDb.createStockMovement(movement).catch(() => {});
    } else {
      LocalDb.updateProduct(product.id, {
        current_stock: afterStock,
        purchase_price: product.purchase_price,
        purchase_tax_type: product.purchase_tax_type,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      LocalDb.createStockMovement(movement).catch(() => {});
    }

    AuditService.log({
      storeId: params.storeId,
      userId: params.userId,
      userName: params.userName,
      action: 'STOCK_RECEIVED',
      entityType: 'INVENTORY',
      entityId: product.id,
      afterData: {
        product: product.name,
        quantityReceived: qty,
        unitCost,
        taxRate,
        taxAmount,
        beforeStock,
        afterStock,
        supplierInvoice: params.supplierInvoice,
        reason: movement.reason,
      },
    });

    db.save();
    return { product, movement };
  }

  static adjustStock(params: {
    storeId: string;
    userId: string;
    userName: string;
    productId: string;
    quantityDifference: number; // can be negative (damage/loss) or positive (found stock)
    reason: string;
    type?: 'ADJUSTMENT' | 'DAMAGE';
  }) {
    const diff = Number(params.quantityDifference);
    if (isNaN(diff) || diff === 0) {
      throw new Error('Adjustment quantity difference cannot be zero');
    }
    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error('Adjustment reason is strictly required for audit trails');
    }

    const product = db.products.find(p => p.id === params.productId && p.store_id === params.storeId);
    if (!product) throw new Error('Product not found');

    const beforeStock = product.current_stock;
    const afterStock = beforeStock + diff;

    if (afterStock < 0) {
      throw new Error(`Insufficient stock. Current stock is ${beforeStock}, cannot deduct ${Math.abs(diff)}.`);
    }

    product.current_stock = afterStock;
    product.updated_at = new Date().toISOString();

    const movementType: MovementType = params.type || (diff < 0 ? 'DAMAGE' : 'ADJUSTMENT');

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      store_id: params.storeId,
      product_id: product.id,
      product_name: product.name,
      user_id: params.userId,
      user_name: params.userName,
      type: movementType,
      quantity: diff,
      before_stock: beforeStock,
      after_stock: afterStock,
      reason: params.reason.trim(),
      created_at: new Date().toISOString(),
    };

    db.stock_movements.unshift(movement);

    if (isSupabaseConfigured) {
      SupabaseDb.updateProduct(product.id, {
        current_stock: afterStock,
        updated_at: product.updated_at,
      }).catch(() => {});
      SupabaseDb.createStockMovement(movement).catch(() => {});
    } else {
      LocalDb.updateProduct(product.id, {
        current_stock: afterStock,
        updated_at: product.updated_at,
      }).catch(() => {});
      LocalDb.createStockMovement(movement).catch(() => {});
    }

    AuditService.log({
      storeId: params.storeId,
      userId: params.userId,
      userName: params.userName,
      action: 'STOCK_ADJUSTED',
      entityType: 'INVENTORY',
      entityId: product.id,
      afterData: {
        product: product.name,
        type: movementType,
        quantityDifference: diff,
        beforeStock,
        afterStock,
        reason: movement.reason,
      },
    });

    db.save();
    return { product, movement };
  }

  static getMovements(storeId: string, options?: { productId?: string; type?: MovementType; limit?: number }) {
    try {
      let sql = "SELECT * FROM stock_movements WHERE (store_id = ? OR store_id = 'STORE-01' OR store_id = 'a0000000-0000-0000-0000-000000000001')";
      const params: any[] = [storeId];
      if (options?.productId) {
        sql += ' AND product_id = ?';
        params.push(options.productId);
      }
      if (options?.type) {
        sql += ' AND type = ?';
        params.push(options.type);
      }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(options?.limit || 100);

      const rawRows = localDbManager.getRawDb().prepare(sql).all(...params) as any[];
      return rawRows.map(r => ({
        ...r,
        quantity: Number(r.quantity) || 0,
        before_stock: Number(r.before_stock) || 0,
        after_stock: Number(r.after_stock) || 0,
        purchase_cost: r.purchase_cost != null ? Number(r.purchase_cost) : undefined,
        tax_rate: r.tax_rate != null ? Number(r.tax_rate) : undefined,
        tax_amount: r.tax_amount != null ? Number(r.tax_amount) : undefined,
      }));
    } catch (_) {
      let filtered = (db.stock_movements || []).filter(m => m.store_id === storeId);
      if (options?.productId) {
        filtered = filtered.filter(m => m.product_id === options.productId);
      }
      if (options?.type) {
        filtered = filtered.filter(m => m.type === options.type);
      }
      const limit = options?.limit || 100;
      return filtered.slice(0, limit);
    }
  }
}
