import { db, Sale, SaleItem, StockMovement, CreditNote } from '../db.ts';
import { LocalDb } from '../localDb.ts';
import { AuditService } from './auditService.ts';
import { SupabaseDb } from '../supabaseDb.ts';
import { isSupabaseConfigured } from '../supabaseClient.ts';
import { CashControlService } from './cashControlService.ts';
import crypto from 'crypto';

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export interface CreateSaleItemInput {
  productId: string;
  quantity: number;
  taxType?: 'INCLUSIVE' | 'EXCLUSIVE';
  selectedModifiers?: Array<{
    modifierId: string;
    quantity: number;
  }>;
}

export interface CreateSaleInput {
  items: CreateSaleItemInput[];
  discount?: number;
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'OTHER';
  notes?: string;
  gstType?: 'INTRA_STATE' | 'INTER_STATE' | 'EXEMPT';
  taxMode?: 'INCLUSIVE' | 'EXCLUSIVE' | 'AUTO';
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
}

export class BillingService {
  static async createSale(params: {
    storeId: string;
    userId: string;
    userName: string;
    payload: CreateSaleInput;
  }): Promise<Sale> {
    const { storeId, userId, userName, payload } = params;

    if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error('Sale must contain at least one item');
    }

    const validPaymentMethods = ['CASH', 'UPI', 'CARD', 'OTHER'];
    if (!validPaymentMethods.includes(payload.paymentMethod)) {
      throw new Error('Invalid payment method');
    }

    const gstType = payload.gstType || 'INTRA_STATE';
    const globalTaxMode = payload.taxMode;

    const rawDb = (await import('../localDb.ts')).localDbManager.getRawDb();

    // 1. Check total requested quantities across all items per product
    const totalQtyMap = new Map<string, number>();
    for (const item of payload.items) {
      const q = Number(item.quantity);
      if (isNaN(q) || q <= 0) throw new Error('All item quantities must be greater than zero');
      totalQtyMap.set(item.productId, (totalQtyMap.get(item.productId) || 0) + q);
    }

    for (const [productId, totalQty] of totalQtyMap.entries()) {
      let product = db.products.find(p => p.id === productId && p.store_id === storeId);
      if (!product) {
        const row = rawDb.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
        if (row) {
          product = row;
          db.products.push(row);
        }
      }
      if (!product) throw new Error(`Product not found with ID ${productId}`);
      if (!product.active) throw new Error(`Product "${product.name}" is deactivated and cannot be sold`);
      if (product.current_stock < totalQty) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.current_stock}, requested: ${totalQty}`);
      }
    }

    // 2. Validate line items, resolve modifiers and compute financials
    const verifiedProducts: Array<{
      product: typeof db.products[0];
      quantity: number;
      unitPrice: number;
      taxRate: number;
      taxType: 'EXCLUSIVE' | 'INCLUSIVE';
      lineSubtotal: number;
      lineTax: number;
      lineTotal: number;
      cgst: number;
      sgst: number;
      igst: number;
      selectedModifiers?: any[];
    }> = [];

    let calculatedSubtotal = 0;
    let calculatedTax = 0;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;

    for (const item of payload.items) {
      const product = db.products.find(p => p.id === item.productId && p.store_id === storeId)!;
      const qty = Number(item.quantity);

      // Resolve modifiers & calculate extra price
      let modExtraPaise = 0;
      const enrichedModifiers: any[] = [];
      if (item.selectedModifiers && Array.isArray(item.selectedModifiers)) {
        for (const selMod of item.selectedModifiers) {
          const modRow = rawDb.prepare('SELECT * FROM modifiers WHERE id = ?').get(selMod.modifierId) as any;
          if (modRow) {
            const modQty = Number(selMod.quantity) || 1;
            modExtraPaise += (modRow.additional_price_minor || 0) * modQty;
            enrichedModifiers.push({
              modifierId: modRow.id,
              modifierName: modRow.name,
              additionalPriceMinor: modRow.additional_price_minor,
              quantity: modQty,
            });
          }
        }
      }

      const unitPrice = round2(product.selling_price + (modExtraPaise / 100));
      let taxRate = round2(product.tax_rate || 0);
      if (gstType === 'EXEMPT') taxRate = 0;

      const chosenTaxType: 'EXCLUSIVE' | 'INCLUSIVE' =
        item.taxType ||
        (globalTaxMode && globalTaxMode !== 'AUTO' ? globalTaxMode : product.tax_type) ||
        'EXCLUSIVE';

      let lineSubtotal: number, lineTax: number, lineTotal: number;

      if (chosenTaxType === 'INCLUSIVE' && taxRate > 0) {
        lineTotal = round2(qty * unitPrice);
        lineSubtotal = round2(lineTotal / (1 + taxRate / 100));
        lineTax = round2(lineTotal - lineSubtotal);
      } else {
        lineSubtotal = round2(qty * unitPrice);
        lineTax = round2(lineSubtotal * (taxRate / 100));
        lineTotal = round2(lineSubtotal + lineTax);
      }

      let itemCGST = 0, itemSGST = 0, itemIGST = 0;
      if (gstType === 'INTER_STATE') {
        itemIGST = lineTax;
      } else if (gstType === 'INTRA_STATE') {
        itemCGST = round2(lineTax / 2);
        itemSGST = round2(lineTax - itemCGST);
      }

      calculatedSubtotal = round2(calculatedSubtotal + lineSubtotal);
      calculatedTax = round2(calculatedTax + lineTax);
      totalCGST = round2(totalCGST + itemCGST);
      totalSGST = round2(totalSGST + itemSGST);
      totalIGST = round2(totalIGST + itemIGST);

      verifiedProducts.push({
        product,
        quantity: qty,
        unitPrice,
        taxRate,
        taxType: chosenTaxType,
        lineSubtotal,
        lineTax,
        lineTotal,
        cgst: itemCGST,
        sgst: itemSGST,
        igst: itemIGST,
        selectedModifiers: enrichedModifiers.length > 0 ? enrichedModifiers : undefined,
      });
    }

    // 3. Discount
    let appliedDiscount = round2(Math.max(0, Number(payload.discount) || 0));
    if (appliedDiscount > calculatedSubtotal + calculatedTax) {
      throw new Error('Discount cannot exceed the total bill amount');
    }
    const netBeforeRound = calculatedSubtotal + calculatedTax - appliedDiscount;
    const roundedTotal = Math.round(netBeforeRound);
    const roundOff = round2(roundedTotal - netBeforeRound);

    // 4. Get bill number (from Supabase or local)
    const billNumber = await db.getNextBillNumberAsync(storeId);
    const verificationToken = crypto.randomUUID();
    const saleId = crypto.randomUUID();
    const now = new Date().toISOString();

    const saleItems: SaleItem[] = [];
    const stockMovements: Omit<StockMovement, 'id' | 'created_at'>[] = [];

    // 5. Build items and movements, deduct stock from cache
    for (const vp of verifiedProducts) {
      const { product, quantity, unitPrice, taxRate, lineSubtotal, lineTax, lineTotal, cgst, sgst, igst, selectedModifiers } = vp;
      const beforeStock = product.current_stock;
      const afterStock = beforeStock - quantity;

      product.current_stock = afterStock;
      product.updated_at = now;

      saleItems.push({
        id: crypto.randomUUID(),
        sale_id: saleId,
        product_id: product.id,
        product_name_snapshot: product.name,
        sku_snapshot: product.sku,
        barcode_snapshot: product.barcode,
        hsn_snapshot: product.hsn_code || '',
        quantity,
        unit_price: unitPrice,
        purchase_price_snapshot: product.purchase_price,
        tax_rate: taxRate,
        tax_amount: lineTax,
        tax_type_snapshot: vp.taxType,
        taxable_value: lineSubtotal,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        discount: 0,
        line_total: lineTotal,
        selected_modifiers: selectedModifiers,
        created_at: now,
      });

      stockMovements.push({
        store_id: storeId,
        product_id: product.id,
        product_name: product.name,
        user_id: userId,
        user_name: userName,
        type: 'SALE',
        quantity: -quantity,
        before_stock: beforeStock,
        after_stock: afterStock,
        reason: `Sold on bill #${billNumber}`,
        reference_type: 'SALE',
        reference_id: saleId,
      });
    }

    // Automatic Ice Cream Parlour BOM ingredient & modifier depletion
    try {
      const rawDb = (await import('../localDb.ts')).localDbManager.getRawDb();
      for (const item of payload.items) {
        const qty = Number(item.quantity) || 1;
        // Check recipe version
        const recipeVer = rawDb.prepare(`
          SELECT id FROM recipe_versions WHERE product_id = ? AND status = 'active'
        `).get(item.productId) as any;

        if (recipeVer) {
          const recipeIngs = rawDb.prepare(`
            SELECT * FROM recipe_ingredients WHERE recipe_version_id = ?
          `).all(recipeVer.id) as any[];

          for (const ing of recipeIngs) {
            const deltaBase = ing.quantity_per_serving_base * qty;
            const curItem = rawDb.prepare('SELECT * FROM inventory_items WHERE id = ?').get(ing.inventory_item_id) as any;
            if (curItem) {
              const resStock = curItem.current_stock_base - deltaBase;
              rawDb.prepare(`
                INSERT INTO inventory_movements (
                  id, inventory_item_id, movement_type, quantity_delta_base,
                  resulting_quantity_base, unit_cost_snapshot, total_cost_minor,
                  reference_type, reference_id, reason, created_at, created_by
                ) VALUES (?, ?, 'sale_consumption', ?, ?, ?, ?, 'sale', ?, ?, ?, ?)
              `).run(
                crypto.randomUUID(),
                curItem.id,
                -deltaBase,
                resStock,
                curItem.weighted_average_unit_cost_minor,
                Math.round(deltaBase * curItem.weighted_average_unit_cost_minor),
                saleId,
                `POS Sale ${billNumber}`,
                now,
                userName
              );
              rawDb.prepare('UPDATE inventory_items SET current_stock_base = ? WHERE id = ?').run(resStock, curItem.id);
            }
          }
        }

        // Check selected modifiers
        if (item.selectedModifiers && Array.isArray(item.selectedModifiers)) {
          for (const modSel of item.selectedModifiers) {
            const modQty = Number(modSel.quantity) || 1;
            const modIngs = rawDb.prepare(`
              SELECT * FROM modifier_ingredients WHERE modifier_id = ?
            `).all(modSel.modifierId) as any[];

            for (const mIng of modIngs) {
              const deltaMod = mIng.quantity_per_modifier_base * modQty * qty;
              const curItem = rawDb.prepare('SELECT * FROM inventory_items WHERE id = ?').get(mIng.inventory_item_id) as any;
              if (curItem) {
                const resStock = curItem.current_stock_base - deltaMod;
                rawDb.prepare(`
                  INSERT INTO inventory_movements (
                    id, inventory_item_id, movement_type, quantity_delta_base,
                    resulting_quantity_base, unit_cost_snapshot, total_cost_minor,
                    reference_type, reference_id, reason, created_at, created_by
                  ) VALUES (?, ?, 'sale_consumption', ?, ?, ?, ?, 'sale', ?, ?, ?, ?)
                `).run(
                  crypto.randomUUID(),
                  curItem.id,
                  -deltaMod,
                  resStock,
                  curItem.weighted_average_unit_cost_minor,
                  Math.round(deltaMod * curItem.weighted_average_unit_cost_minor),
                  saleId,
                  `POS Sale ${billNumber} Modifier`,
                  now,
                  userName
                );
                rawDb.prepare('UPDATE inventory_items SET current_stock_base = ? WHERE id = ?').run(resStock, curItem.id);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('BOM ledger stock depletion notice:', err);
    }

    const newSale: Sale = {
      id: saleId,
      store_id: storeId,
      bill_number: billNumber,
      verification_token: verificationToken,
      employee_id: userId,
      employee_name: userName,
      subtotal: calculatedSubtotal,
      discount: appliedDiscount,
      tax: calculatedTax,
      cgst: totalCGST,
      sgst: totalSGST,
      igst: totalIGST,
      gst_type: gstType,
      tax_mode: payload.taxMode,
      round_off: roundOff,
      customer_name: payload.customerName?.trim() || undefined,
      customer_phone: payload.customerPhone?.trim() || undefined,
      customer_gstin: payload.customerGstin?.trim().toUpperCase() || undefined,
      total: roundedTotal,
      payment_method: payload.paymentMethod,
      status: 'COMPLETED',
      refund_status: 'NONE',
      refunded_amount: 0,
      notes: payload.notes?.trim() || undefined,
      created_at: now,
      items: saleItems,
    };

    // 6. Persist to Supabase (primary) or local cache
    if (isSupabaseConfigured) {
      let saved: Sale;
      try {
        const [saleResult] = await Promise.all([
          SupabaseDb.createSale(
            { ...newSale, items: undefined } as any,
            saleItems.map(({ id, sale_id, created_at, ...rest }) => rest)
          ),
          SupabaseDb.createStockMovementsBatch(stockMovements).catch(err => {
            console.error('Stock movements batch error:', err);
          }),
          Promise.all(
            verifiedProducts.map(vp =>
              SupabaseDb.updateProduct(vp.product.id, {
                current_stock: vp.product.current_stock,
                updated_at: now,
              }).catch(() => {})
            )
          ),
        ]);
        saved = saleResult;
      } catch (insertErr: any) {
        const msg = String(insertErr?.message || '');
        if (msg.includes('sales_bill_number_key') || msg.includes('unique constraint') || msg.includes('duplicate key')) {
          console.warn('Bill number collision detected, generating next sequence and retrying...');
          const retryBillNumber = await db.getNextBillNumberAsync(storeId);
          newSale.bill_number = retryBillNumber;
          saved = await SupabaseDb.createSale(
            { ...newSale, items: undefined } as any,
            saleItems.map(({ id, sale_id, created_at, ...rest }) => rest)
          );
        } else {
          throw insertErr;
        }
      }

      // Update local cache
      db.sales.unshift(saved);
      db.sale_items.push(...saleItems);
      db.stock_movements.unshift(...(stockMovements as StockMovement[]));
    } else {
      // Local SQLite persistence
      const saved = await LocalDb.createSale(
        { ...newSale, items: undefined } as any,
        saleItems.map(({ id, sale_id, created_at, ...rest }) => rest)
      );
      await LocalDb.createStockMovementsBatch(stockMovements as any);
      for (const vp of verifiedProducts) {
        await LocalDb.updateProduct(vp.product.id, {
          current_stock: vp.product.current_stock,
          updated_at: now,
        });
      }

      db.sales.unshift(saved);
      db.sale_items.push(...saleItems);
      db.stock_movements.unshift(...(stockMovements as StockMovement[]));
    }

    AuditService.log({
      storeId, userId, userName, action: 'SALE_CREATED', entityType: 'SALE', entityId: newSale.id,
      afterData: { billNumber: newSale.bill_number, total: newSale.total, paymentMethod: newSale.payment_method, itemCount: saleItems.length },
    });

    if (newSale.payment_method === 'CASH') {
      await CashControlService.recordSaleIfSessionOpen(storeId, { ...newSale, items: saleItems }, userId, userName);
    }

    return { ...newSale, items: saleItems };
  }

  static async voidSale(params: {
    storeId: string;
    userId: string;
    userName: string;
    saleId: string;
    reason: string;
  }): Promise<Sale> {
    const { storeId, userId, userName, saleId, reason } = params;

    if (!reason || reason.trim().length === 0) throw new Error('A reason is mandatory for voiding a bill');

    const sale = db.sales.find(s => s.id === saleId && s.store_id === storeId);
    if (!sale) throw new Error('Sale record not found');
    if (sale.status === 'VOIDED') throw new Error('This bill is already voided');

    const saleItemsForSale = db.sale_items.filter(si => si.sale_id === sale.id);
    const now = new Date().toISOString();

    // Restore stock
    const stockRestores: Array<{ productId: string; newStock: number }> = [];
    for (const item of saleItemsForSale) {
      const product = db.products.find(p => p.id === item.product_id && p.store_id === storeId);
      if (product) {
        const beforeStock = product.current_stock;
        const afterStock = beforeStock + item.quantity;
        product.current_stock = afterStock;
        product.updated_at = now;
        stockRestores.push({ productId: product.id, newStock: afterStock });

        const voidMov = {
          store_id: storeId, product_id: product.id, product_name: product.name,
          user_id: userId, user_name: userName, type: 'VOID' as const,
          quantity: item.quantity, before_stock: beforeStock, after_stock: afterStock,
          reason: `Stock restored from voided bill #${sale.bill_number}: ${reason.trim()}`,
          reference_type: 'SALE_VOID', reference_id: sale.id,
        };

        if (isSupabaseConfigured) {
          SupabaseDb.createStockMovement(voidMov).catch(() => {});
          SupabaseDb.updateProduct(product.id, { current_stock: afterStock, updated_at: now }).catch(() => {});
        } else {
          LocalDb.createStockMovement(voidMov).catch(() => {});
          LocalDb.updateProduct(product.id, { current_stock: afterStock, updated_at: now }).catch(() => {});
        }
        db.stock_movements.unshift(voidMov as StockMovement);
      }
    }

    sale.status = 'VOIDED';
    sale.voided_at = now;
    sale.voided_by = userId;
    sale.voided_by_name = userName;
    sale.void_reason = reason.trim();

    if (isSupabaseConfigured) {
      await SupabaseDb.voidSale(saleId, userId, userName, reason.trim());
    } else {
      await LocalDb.voidSale(saleId, userId, userName, reason.trim());
    }

    AuditService.log({
      storeId, userId, userName, action: 'SALE_VOIDED', entityType: 'SALE', entityId: sale.id,
      afterData: { billNumber: sale.bill_number, voidReason: sale.void_reason, voidedAt: sale.voided_at },
    });

    if (sale.payment_method === 'CASH') {
      await CashControlService.recordVoidIfSessionOpen(storeId, sale, userId, userName, reason.trim());
    }

    return sale;
  }

  static getSales(storeId: string, options?: {
    search?: string;
    from?: string;
    to?: string;
    employeeId?: string;
    paymentMethod?: string;
    status?: string;
    limit?: number;
  }) {
    let list = db.sales.filter(s => s.store_id === storeId);

    if (options?.employeeId) list = list.filter(s => s.employee_id === options.employeeId);
    if (options?.paymentMethod) list = list.filter(s => s.payment_method === options.paymentMethod);
    if (options?.status) list = list.filter(s => s.status === options.status);

    if (options?.search) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(s =>
        s.bill_number.toLowerCase().includes(q) ||
        s.employee_name.toLowerCase().includes(q) ||
        (s.notes && s.notes.toLowerCase().includes(q))
      );
    }

    if (options?.from) {
      const fromDate = new Date(options.from).getTime();
      list = list.filter(s => new Date(s.created_at).getTime() >= fromDate);
    }

    if (options?.to) {
      const toDate = new Date(options.to).getTime() + 86400000;
      list = list.filter(s => new Date(s.created_at).getTime() <= toDate);
    }

    const limit = options?.limit || 200;
    return list.slice(0, limit).map(s => ({
      ...s,
      items: db.sale_items.filter(si => si.sale_id === s.id),
    }));
  }

  static getSaleById(storeId: string, saleId: string) {
    const sale = db.sales.find(s => s.id === saleId && s.store_id === storeId);
    if (!sale) throw new Error('Sale not found');
    const items = db.sale_items.filter(si => si.sale_id === sale.id);
    return { ...sale, items };
  }

  // ============================================================
  // CUSTOMER REFUND & CREDIT NOTE ENGINE
  // ============================================================

  static async createCreditNote(params: {
    storeId: string;
    userId: string;
    userName: string;
    saleId: string;
    items: Array<{
      saleItemId: string;
      productId: string;
      quantityRefunded: number;
      restock: boolean;
    }>;
    refundMethod: 'CASH' | 'UPI' | 'CARD' | 'STORE_CREDIT';
    reason: string;
    restockAll?: boolean;
  }): Promise<{ creditNote: any; sale: Sale }> {
    const { storeId, userId, userName, saleId, items: requestedItems, refundMethod, reason, restockAll } = params;

    if (!reason || !reason.trim()) {
      throw new Error('A reason is mandatory for issuing a credit note');
    }

    if (!requestedItems || requestedItems.length === 0) {
      throw new Error('At least one item must be selected for refund');
    }

    let sale = db.sales.find(s => s.id === saleId && s.store_id === storeId);
    if (!sale) {
      const row = await LocalDb.getSaleById(saleId);
      if (row && row.store_id === storeId) {
        sale = row;
      }
    }
    if (!sale) throw new Error('Original sale invoice not found');
    if (sale.status === 'VOIDED') throw new Error('Cannot refund a voided bill');

    const saleItems = (db.sale_items && db.sale_items.filter(si => si.sale_id === sale!.id).length > 0)
      ? db.sale_items.filter(si => si.sale_id === sale!.id)
      : (sale.items || []);

    const now = new Date().toISOString();
    const creditNoteId = crypto.randomUUID();
    const creditNoteNumber = LocalDb.getNextCreditNoteNumber(storeId);

    // Track previous refunds on this sale to prevent over-refunding
    const existingCreditNotes = await LocalDb.getCreditNotes(storeId, sale.id);
    const alreadyRefundedByItem = new Map<string, number>();
    for (const cn of existingCreditNotes) {
      for (const it of (cn.items || [])) {
        const prev = alreadyRefundedByItem.get(it.sale_item_id) || 0;
        alreadyRefundedByItem.set(it.sale_item_id, prev + (Number(it.quantity_refunded) || 0));
      }
    }

    // Calculate line items refund
    let totalRefundAmount = 0;
    let totalRefundTax = 0;
    const creditNoteItems: any[] = [];

    for (const reqItem of requestedItems) {
      const originalItem = saleItems.find(si => si.id === reqItem.saleItemId);
      if (!originalItem) {
        throw new Error(`Item ${reqItem.saleItemId} not found in original sale`);
      }

      const qtyRefund = Number(reqItem.quantityRefunded !== undefined ? reqItem.quantityRefunded : (reqItem as any).quantity);
      if (isNaN(qtyRefund) || qtyRefund <= 0) {
        throw new Error(`Invalid refund quantity for item ${originalItem.product_name_snapshot}`);
      }

      const prevRefunded = alreadyRefundedByItem.get(originalItem.id) || 0;
      const remainingQty = originalItem.quantity - prevRefunded;
      if (remainingQty <= 0) {
        throw new Error(`Item ${originalItem.product_name_snapshot} is already fully refunded`);
      }

      if (qtyRefund > remainingQty) {
        throw new Error(`Refund quantity (${qtyRefund}) cannot exceed remaining refundable quantity (${remainingQty}) for ${originalItem.product_name_snapshot}`);
      }

      // Calculate proportionate refund amount
      const unitTotal = originalItem.line_total / originalItem.quantity;
      const unitTax = (originalItem.tax_amount || 0) / originalItem.quantity;
      const lineRefund = Number((unitTotal * qtyRefund).toFixed(2));
      const lineTaxRefund = Number((unitTax * qtyRefund).toFixed(2));

      totalRefundAmount = Number((totalRefundAmount + lineRefund).toFixed(2));
      totalRefundTax = Number((totalRefundTax + lineTaxRefund).toFixed(2));

      const shouldRestock = restockAll !== undefined ? Boolean(restockAll) : Boolean(reqItem.restock);

      creditNoteItems.push({
        sale_item_id: originalItem.id,
        product_id: originalItem.product_id,
        product_name: originalItem.product_name_snapshot,
        quantity_refunded: qtyRefund,
        unit_price: originalItem.unit_price,
        tax_rate: originalItem.tax_rate,
        tax_amount: lineTaxRefund,
        refund_amount: lineRefund,
        restocked: shouldRestock,
      });

      // Handle inventory restock if requested
      if (shouldRestock) {
        const product = db.products.find(p => p.id === originalItem.product_id && p.store_id === storeId);
        if (product) {
          const beforeStock = product.current_stock;
          const afterStock = beforeStock + qtyRefund;
          product.current_stock = afterStock;
          product.updated_at = now;

          const restockMov: any = {
            id: crypto.randomUUID(),
            store_id: storeId,
            product_id: product.id,
            product_name: product.name,
            user_id: userId,
            user_name: userName,
            type: 'RESTOCK',
            quantity: qtyRefund,
            before_stock: beforeStock,
            after_stock: afterStock,
            reason: `Restocked via Credit Note #${creditNoteNumber} (Bill #${sale.bill_number}): ${reason.trim()}`,
            reference_type: 'CREDIT_NOTE',
            reference_id: creditNoteId,
            created_at: now,
          };

          await LocalDb.createStockMovement(restockMov).catch(() => {});
          await LocalDb.updateProduct(product.id, { current_stock: afterStock, updated_at: now }).catch(() => {});
          db.stock_movements.unshift(restockMov as StockMovement);
        }
      }
    }

    const previouslyRefunded = Number(sale.refunded_amount || 0);
    const newTotalRefunded = Number((previouslyRefunded + totalRefundAmount).toFixed(2));
    const isFullRefund = newTotalRefunded >= (Number(sale.total) - 0.01);
    const refundStatus: 'PARTIAL' | 'FULL' = isFullRefund ? 'FULL' : 'PARTIAL';

    const creditNoteRecord: any = {
      id: creditNoteId,
      credit_note_number: creditNoteNumber,
      store_id: storeId,
      sale_id: sale.id,
      bill_number: sale.bill_number,
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      refund_amount: totalRefundAmount,
      refund_tax: totalRefundTax,
      refund_method: refundMethod || 'CASH',
      reason: reason.trim(),
      restock_items: creditNoteItems.some(i => i.restocked),
      items: creditNoteItems,
      created_by: userId,
      created_by_name: userName,
      created_at: now,
    };

    // Save credit note to SQLite
    await LocalDb.createCreditNote(creditNoteRecord);
    await LocalDb.updateSaleRefundStatus(sale.id, refundStatus, newTotalRefunded, creditNoteId, creditNoteNumber);

    // Update memory cache
    if (!db.credit_notes) (db as any).cache.credit_notes = [];
    db.credit_notes.unshift(creditNoteRecord);

    sale.refund_status = refundStatus;
    sale.refunded_amount = newTotalRefunded;
    sale.last_credit_note_id = creditNoteId;
    sale.last_credit_note_number = creditNoteNumber;
    // Statutory law: The original invoice is immutable and remains COMPLETED.
    // The refund is tracked through the credit note record.

    // Cash drawer integration: if cash refund, record cash out from drawer
    if (refundMethod === 'CASH') {
      await CashControlService.recordRefundIfSessionOpen(storeId, creditNoteRecord, userId, userName);
    }

    AuditService.log({
      storeId,
      userId,
      userName,
      action: 'CREDIT_NOTE_CREATED',
      entityType: 'CREDIT_NOTE',
      entityId: creditNoteId,
      afterData: {
        creditNoteNumber,
        billNumber: sale.bill_number,
        refundAmount: totalRefundAmount,
        refundMethod,
        reason: reason.trim(),
        refundStatus,
      },
    });

    return { creditNote: creditNoteRecord, sale };
  }

  static async getCreditNotes(storeId: string, options?: { search?: string; from?: string; to?: string }) {
    let list: CreditNote[] = await LocalDb.getCreditNotes(storeId, 1000);
    if (!list || list.length === 0) {
      list = db.credit_notes.filter(cn => cn.store_id === storeId);
    } else {
      (db as any).cache.credit_notes = list;
    }

    if (options?.search) {
      const q = options.search.trim().toLowerCase();
      list = list.filter(cn =>
        cn.credit_note_number.toLowerCase().includes(q) ||
        cn.bill_number.toLowerCase().includes(q) ||
        (cn.customer_name && cn.customer_name.toLowerCase().includes(q)) ||
        (cn.customer_phone && cn.customer_phone.includes(q))
      );
    }

    if (options?.from) {
      const fromDate = new Date(options.from).getTime();
      list = list.filter(cn => new Date(cn.created_at).getTime() >= fromDate);
    }

    if (options?.to) {
      const toDate = new Date(options.to).getTime() + 86400000;
      list = list.filter(cn => new Date(cn.created_at).getTime() <= toDate);
    }

    return list;
  }

  static async getCreditNoteById(storeId: string, id: string) {
    let cn = db.credit_notes.find(c => c.id === id && c.store_id === storeId);
    if (!cn) {
      cn = await LocalDb.getCreditNoteById(id);
    }
    return cn;
  }
}
