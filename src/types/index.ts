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
  permissions?: string[];
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

export interface DenominationCounts {
  '500'?: number;
  '200'?: number;
  '100'?: number;
  '50'?: number;
  '20'?: number;
  '10'?: number;
  '5'?: number;
  '2'?: number;
  '1'?: number;
  [key: string]: number | undefined;
}

export interface CashDrawerSession {
  id: string;
  store_id: string;
  opened_by?: string;
  opened_by_name: string;
  opened_at: string;
  opening_amount: number;
  opening_denominations_json?: string;
  opening_notes?: string;
  closed_by?: string;
  closed_by_name?: string;
  closed_at?: string;
  closing_amount?: number;
  closing_denominations_json?: string;
  closing_notes?: string;
  expected_amount: number;
  cash_sales_amount: number;
  cash_in_amount: number;
  cash_out_amount: number;
  difference?: number;
  status: 'OPEN' | 'CLOSED';
  created_at: string;
  updated_at: string;
}

export type CashDrawerTransactionType = 'OPENING_FLOAT' | 'CASH_IN' | 'CASH_OUT' | 'SALE' | 'REFUND';

export interface CashDrawerTransaction {
  id: string;
  session_id: string;
  store_id: string;
  type: CashDrawerTransactionType;
  amount: number;
  category?: string;
  reason?: string;
  reference_id?: string;
  performed_by?: string;
  performed_by_name: string;
  notes?: string;
  created_at: string;
}

export interface CashControlCurrentData {
  session: CashDrawerSession | null;
  transactions: CashDrawerTransaction[];
  lastClosedSession?: CashDrawerSession | null;
}

export interface CashCloseReconciliation {
  session: CashDrawerSession;
  reconciliation: {
    expectedAmount: number;
    closingAmount: number;
    difference: number;
    status: 'BALANCED' | 'SURPLUS' | 'SHORTAGE';
  };
}

export interface CustomerSuggestion {
  customer_name: string;
  customer_phone: string;
  customer_gstin?: string;
  visit_count: number;
  total_spend: number;
  last_visit: string;
}

export interface CustomerAnalyticsSummary {
  total_unique_customers: number;
  repeat_customers: number;
  repeat_rate: number;
  total_spend: number;
  avg_spend_per_customer: number;
  visits_this_week: number;
  visits_last_week: number;
  new_customers_this_week: number;
}

export interface CustomerAnalyticsItem {
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
}

export interface CustomerWeeklyTrend {
  date: string;
  day_name: string;
  visit_count: number;
  revenue: number;
}

export interface CustomerAnalyticsResponse {
  summary: CustomerAnalyticsSummary;
  customers: CustomerAnalyticsItem[];
  weekly_trends: CustomerWeeklyTrend[];
}

export interface CustomerHistoryResponse {
  customer: {
    customer_name: string;
    customer_phone: string;
    customer_gstin?: string;
    total_visits: number;
    total_spend: number;
  } | null;
  sales: Sale[];
}
