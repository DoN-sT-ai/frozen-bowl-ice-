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
}

export interface User {
  id: string;
  store_id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER';
  active: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface SelectedModifier {
  modifierId: string;
  name: string;
  additionalPriceMinor: number;
  quantity: number;
}

export interface ModifierGroupItem {
  id: string;
  name: string;
  selectionType: 'single' | 'multiple';
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  modifiers: Array<{
    id: string;
    name: string;
    additionalPriceMinor: number;
    ingredients?: Array<{
      inventoryItemId: string;
      quantityPerModifierBase: number;
      inventoryItemName?: string;
      baseUnitCode?: string;
    }>;
  }>;
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
  tax_rate: number; // GST slab: 0, 3, 5, 12, 18, 28
  tax_type?: 'EXCLUSIVE' | 'INCLUSIVE';
  current_stock: number;
  minimum_stock: number;
  unit: string;
  package_info?: string;
  active: boolean;
  modifierGroups?: ModifierGroupItem[];
  recipe?: {
    id: string;
    versionNumber: number;
    yieldQuantity?: number;
    ingredients: Array<{
      id?: string;
      inventoryItemId: string;
      inventoryItemName?: string;
      baseUnitCode?: string;
      quantityPerServingBase: number;
      unitCostMinor?: number;
    }>;
  };
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

export interface CartItem {
  product: Product;
  quantity: number;
  taxTypeOverride?: 'EXCLUSIVE' | 'INCLUSIVE';
  selectedModifiers?: SelectedModifier[];
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
  selected_modifiers?: SelectedModifier[];
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

export interface DashboardSummary {
  today: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    billsCount: number;
  };
  month: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
  };
  inventory: {
    lowStockCount: number;
    outOfStockCount: number;
    totalProductsCount: number;
    lowStockItems: Array<{
      id: string;
      name: string;
      sku: string;
      currentStock: number;
      minimumStock: number;
      unit: string;
      isOut: boolean;
    }>;
  };
  paymentBreakdown: Record<string, { count: number; total: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  salesChart: Array<{ date: string; label: string; sales: number; bills: number }>;
  recentBills: Array<{
    id: string;
    billNumber: string;
    total: number;
    status: string;
    paymentMethod: string;
    employeeName: string;
    createdAt: string;
    itemCount: number;
  }>;
}

export interface VerificationResponse {
  valid: boolean;
  error?: string;
  store?: {
    name: string;
    address: string;
    gstin: string;
    phone: string;
    email: string;
  };
  bill?: {
    billNumber: string;
    date: string;
    status: string;
    items: Array<{
      name: string;
      hsn?: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      taxAmount: number;
      cgstAmount?: number;
      sgstAmount?: number;
      lineTotal: number;
    }>;
    subtotal: number;
    discount: number;
    tax: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    gstType?: string;
    roundOff?: number;
    customerName?: string;
    customerPhone?: string;
    customerGstin?: string;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    voidReason?: string;
    voidedAt?: string;
  };
}
