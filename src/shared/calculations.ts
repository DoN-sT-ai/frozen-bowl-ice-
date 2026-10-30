// ============================================================
// MISSION-CRITICAL INVENTORY & FINANCIAL CALCULATION ENGINE
// Pure mathematical functions: Zero floating-point drift,
// 64-bit integer minor currency units (paise/cents),
// and single irreducible scalar base inventory units (g, ml, piece).
// ============================================================

/**
 * Converts rupees (decimal or string) to integer paise.
 * Strictly eliminates floating-point drift by rounding to nearest integer.
 */
export function rupeesToPaise(rupees: number | string): number {
  if (typeof rupees === 'string') {
    const cleaned = rupees.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100);
  }
  return Math.round(rupees * 100);
}

/**
 * Converts integer paise back to decimal rupees for presentation display.
 */
export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Formats integer paise into a human-readable currency string (e.g. ₹1,234.50).
 */
export function formatMoney(paise: number, symbol = '₹'): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const mainUnits = Math.floor(absPaise / 100);
  const remainder = absPaise % 100;
  const formatted = `${mainUnits.toLocaleString('en-IN')}.${remainder.toString().padStart(2, '0')}`;
  return `${isNegative ? '-' : ''}${symbol}${formatted}`;
}

/**
 * Calculates display breakdown for bulk packaging vs loose remainder.
 * Base inventory units (g, ml, piece) are the single source of truth in the database.
 */
export function calculatePackBreakdown(
  stockBase: number,
  packSizeBase: number
): {
  fullPacks: number;
  looseRemainder: number;
  displayString: string;
} {
  const packSize = Math.max(1, packSizeBase);
  const safeStock = Math.max(0, stockBase);
  const fullPacks = Math.floor(safeStock / packSize);
  const looseRemainder = safeStock % packSize;
  let displayString = `${fullPacks} pack${fullPacks === 1 ? '' : 's'}`;
  if (looseRemainder > 0) {
    displayString += ` + ${looseRemainder} loose`;
  }
  return { fullPacks, looseRemainder, displayString };
}

/**
 * Converts received packages into irreducible base inventory units.
 */
export function calculateReceivedBaseQuantity(
  packsReceived: number,
  quantityPerPackBase: number
): number {
  return Math.max(0, Math.round(packsReceived)) * Math.max(1, Math.round(quantityPerPackBase));
}

/**
 * Moving Weighted Average Costing (WAC)
 * Recalculates unit cost in minor currency units (paise) per base unit upon stock receipt.
 *
 * Formula:
 * New WAC = Math.round( ((Current Stock * Current Cost) + (Received Qty * Received Cost)) / Total Qty )
 */
export function calculateWeightedAverageCost(
  currentStockBase: number,
  currentUnitCostMinor: number,
  receivedQtyBase: number,
  receivedUnitCostMinor: number
): number {
  const safeCurrentStock = Math.max(0, currentStockBase);
  const safeReceivedQty = Math.max(0, receivedQtyBase);
  const totalQty = safeCurrentStock + safeReceivedQty;
  if (totalQty <= 0) return receivedUnitCostMinor;
  
  const totalValue =
    safeCurrentStock * currentUnitCostMinor + safeReceivedQty * receivedUnitCostMinor;
  return Math.round(totalValue / totalQty);
}

export interface LineFinancialsResult {
  grossLineMinor: number;
  discountMinor: number;
  taxableAmountMinor: number;
  taxRatePercent: number;
  taxAmountMinor: number;
  finalLineTotalMinor: number;
}

/**
 * Pure calculation for financial line items supporting both
 * Tax-Exclusive (default) and Tax-Inclusive pricing models.
 * Strictly operates on integer minor currency units.
 */
export function calculateLineFinancials(params: {
  unitPriceMinor: number;
  quantity: number;
  discountMinor?: number;
  taxRatePercent?: number;
  isTaxInclusive?: boolean;
}): LineFinancialsResult {
  const qty = Math.max(0, params.quantity);
  const grossLineMinor = Math.round(params.unitPriceMinor * qty);
  const discountMinor = Math.min(grossLineMinor, Math.max(0, params.discountMinor || 0));
  const taxRate = Math.max(0, params.taxRatePercent || 0);

  if (params.isTaxInclusive) {
    // Tax-Inclusive
    const discounted = Math.max(0, grossLineMinor - discountMinor);
    // Taxable = round(Discounted / (1 + (TaxRate / 100)))
    const taxableAmountMinor = Math.round(discounted / (1 + taxRate / 100));
    const taxAmountMinor = discounted - taxableAmountMinor;
    const finalLineTotalMinor = discounted;

    return {
      grossLineMinor,
      discountMinor,
      taxableAmountMinor,
      taxRatePercent: taxRate,
      taxAmountMinor,
      finalLineTotalMinor,
    };
  } else {
    // Tax-Exclusive
    const taxableAmountMinor = Math.max(0, grossLineMinor - discountMinor);
    const taxAmountMinor = Math.round(taxableAmountMinor * (taxRate / 100));
    const finalLineTotalMinor = taxableAmountMinor + taxAmountMinor;

    return {
      grossLineMinor,
      discountMinor,
      taxableAmountMinor,
      taxRatePercent: taxRate,
      taxAmountMinor,
      finalLineTotalMinor,
    };
  }
}

export interface PackagingConfig {
  packageType: string; // 'box', 'carton', 'tub', 'crate', 'bag', 'tin', 'pack', 'unit'
  packsCount: number; // e.g. 5 boxes
  piecesPerPack: number; // e.g. 20 pieces per box
  pieceWeightValue: number; // e.g. 50 (grams or ml)
  pieceWeightUnit: 'g' | 'kg' | 'ml' | 'L' | 'piece' | 'scoop';
}

export interface CalculatedPackagingStock {
  totalPieces: number;
  totalBaseQuantity: number;
  baseUnit: 'g' | 'ml' | 'piece';
  displayString: string;
  weightFormatted: string;
}

/**
 * Calculates stock from packaging hierarchy:
 * Outer Packs (boxes) × Pieces per Pack × Weight/Volume per piece.
 * Converts to irreducible base inventory units (g, ml, piece).
 */
export function calculatePackagingStock(config: PackagingConfig): CalculatedPackagingStock {
  const packs = Math.max(0, Math.round(Number(config.packsCount) || 0));
  const piecesPerPack = Math.max(1, Math.round(Number(config.piecesPerPack) || 1));
  const totalPieces = packs * piecesPerPack;

  const weightVal = Math.max(0, Number(config.pieceWeightValue) || 0);
  const unit = config.pieceWeightUnit || 'piece';

  let totalBaseQuantity = totalPieces;
  let baseUnit: 'g' | 'ml' | 'piece' = 'piece';
  let weightFormatted = '';

  if (unit === 'kg') {
    baseUnit = 'g';
    const gramsPerPiece = weightVal * 1000;
    totalBaseQuantity = Math.round(totalPieces * gramsPerPiece);
    const totalKg = totalBaseQuantity / 1000;
    weightFormatted = `${totalBaseQuantity.toLocaleString('en-IN')} g (${totalKg.toFixed(2)} kg)`;
  } else if (unit === 'g') {
    baseUnit = 'g';
    totalBaseQuantity = Math.round(totalPieces * (weightVal || 1));
    const totalKg = totalBaseQuantity / 1000;
    weightFormatted = `${totalBaseQuantity.toLocaleString('en-IN')} g (${totalKg.toFixed(2)} kg)`;
  } else if (unit === 'L') {
    baseUnit = 'ml';
    const mlPerPiece = weightVal * 1000;
    totalBaseQuantity = Math.round(totalPieces * mlPerPiece);
    const totalL = totalBaseQuantity / 1000;
    weightFormatted = `${totalBaseQuantity.toLocaleString('en-IN')} ml (${totalL.toFixed(2)} L)`;
  } else if (unit === 'ml') {
    baseUnit = 'ml';
    totalBaseQuantity = Math.round(totalPieces * (weightVal || 1));
    const totalL = totalBaseQuantity / 1000;
    weightFormatted = `${totalBaseQuantity.toLocaleString('en-IN')} ml (${totalL.toFixed(2)} L)`;
  } else {
    baseUnit = 'piece';
    weightFormatted = `${totalPieces.toLocaleString('en-IN')} ${unit}${totalPieces === 1 ? '' : 's'}`;
  }

  const pkgLabel = config.packageType || 'pack';
  const displayString = `${packs} ${pkgLabel}${packs === 1 ? '' : 's'} × ${piecesPerPack} pcs = ${totalPieces} pcs (${weightFormatted})`;

  return {
    totalPieces,
    totalBaseQuantity,
    baseUnit,
    displayString,
    weightFormatted,
  };
}

