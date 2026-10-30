import {
  Product,
  Category,
  Sale,
  StockMovement,
  Expense,
  User,
  Store,
  DashboardSummary,
  VerificationResponse,
  AuditLog,
} from '../types';

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Purge any legacy disk-persisted session tokens
      try {
        localStorage.removeItem('ledger_session_token');
      } catch (_) {}
      this.token = sessionStorage.getItem('ledger_session_token');
    }
  }

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('ledger_session_token');
      } catch (_) {}
      if (token) {
        sessionStorage.setItem('ledger_session_token', token);
      } else {
        sessionStorage.removeItem('ledger_session_token');
      }
    }
  }

  public getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = sessionStorage.getItem('ledger_session_token');
    }
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    const currentToken = this.getToken();
    if (currentToken) {
      headers.set('x-session-token', currentToken);
      headers.set('Authorization', `Bearer ${currentToken}`);
    }

    const res = await fetch(endpoint, {
      ...options,
      credentials: 'include',
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data?.error?.message || data?.message || `Request failed (${res.status})`;
      throw new Error(errorMsg);
    }

    return data as T;
  }

  // Public Store Info
  async getStoreInfo() {
    return this.request<{ name: string; code?: string; phone?: string; address?: string; invoice_prefix?: string }>('/api/store/info');
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{ token: string; user: User; store: Store }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async logout() {
    try {
      await this.request<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
    return { success: true };
  }

  async getSession() {
    return this.request<{ user: User; store: Store }>('/api/auth/session');
  }

  // Verification (public)
  async verifyBill(token: string) {
    return this.request<VerificationResponse>(`/api/verify/${token}`);
  }

  // QR Generator
  async getQRCode(text: string) {
    return this.request<{ dataUrl: string }>(`/api/qr?text=${encodeURIComponent(text)}`);
  }

  // Products
  async getProducts(params?: { search?: string; barcode?: string; categoryId?: string; lowStock?: boolean; outOfStock?: boolean; activeOnly?: boolean }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.barcode) query.set('barcode', params.barcode);
    if (params?.categoryId) query.set('categoryId', params.categoryId);
    if (params?.lowStock) query.set('lowStock', 'true');
    if (params?.outOfStock) query.set('outOfStock', 'true');
    if (params?.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly));
    return this.request<Product[]>(`/api/products?${query.toString()}`);
  }

  async createProduct(payload: any) {
    return this.request<Product>('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateProduct(id: string, payload: any) {
    return this.request<Product>(`/api/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async toggleProductActive(id: string, activate: boolean) {
    return this.request<Product>(`/api/products/${id}/${activate ? 'activate' : 'deactivate'}`, {
      method: 'POST',
    });
  }

  async deleteProduct(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/products/${id}`, {
      method: 'DELETE',
    });
  }

  // Categories
  async getCategories() {
    return this.request<Category[]>('/api/categories');
  }

  async createCategory(payload: { name: string; description?: string }) {
    return this.request<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteCategory(id: string) {
    return this.request<{ success: boolean; message: string; affectedProductsCount: number }>(`/api/categories/${id}`, {
      method: 'DELETE',
    });
  }

  async seedDefaultCategories() {
    return this.request<Category[]>('/api/categories/seed-defaults', {
      method: 'POST',
    });
  }

  // Inventory
  async receiveStock(payload: {
    productId: string;
    quantity: number;
    reason?: string;
    purchasePrice?: number;
    taxRate?: number;
    taxType?: 'EXCLUSIVE' | 'INCLUSIVE';
    supplierInvoice?: string;
    supplierGstin?: string;
  }) {
    return this.request<{ product: Product; movement: StockMovement }>('/api/inventory/receive', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async adjustStock(payload: { productId: string; quantityDifference: number; reason: string; type?: string }) {
    return this.request<{ product: Product; movement: StockMovement }>('/api/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getStockMovements(params?: { productId?: string; type?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.productId) query.set('productId', params.productId);
    if (params?.type) query.set('type', params.type);
    if (params?.limit) query.set('limit', String(params.limit));
    return this.request<StockMovement[]>(`/api/inventory/movements?${query.toString()}`);
  }

  // Sales / Billing
  async createSale(payload: {
    items: Array<{ productId: string; quantity: number }>;
    discount?: number;
    paymentMethod: string;
    notes?: string;
    gstType?: 'INTRA_STATE' | 'INTER_STATE' | 'EXEMPT';
    customerName?: string;
    customerPhone?: string;
    customerGstin?: string;
  }) {
    return this.request<Sale>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getSales(params?: {
    search?: string;
    from?: string;
    to?: string;
    employeeId?: string;
    paymentMethod?: string;
    status?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.employeeId) query.set('employeeId', params.employeeId);
    if (params?.paymentMethod) query.set('paymentMethod', params.paymentMethod);
    if (params?.status) query.set('status', params.status);
    return this.request<Sale[]>(`/api/sales?${query.toString()}`);
  }

  async getSaleById(id: string) {
    return this.request<Sale>(`/api/sales/${id}`);
  }

  async voidSale(id: string, reason: string) {
    return this.request<Sale>(`/api/sales/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async purgeAllSales() {
    return this.request<{ success: boolean; message: string }>('/api/sales/purge-all', {
      method: 'DELETE',
    });
  }

  // Employees
  async getEmployees() {
    return this.request<User[]>('/api/employees');
  }

  async createEmployee(payload: { username?: string; name?: string; email?: string; password: string; role?: string }) {
    return this.request<User>('/api/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async toggleEmployeeActive(id: string, activate: boolean) {
    return this.request<User>(`/api/employees/${id}/${activate ? 'activate' : 'deactivate'}`, {
      method: 'POST',
    });
  }

  async deleteEmployee(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/employees/${id}`, {
      method: 'DELETE',
    });
  }

  // Expenses
  async getExpenses(params?: { from?: string; to?: string }) {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    return this.request<Expense[]>(`/api/expenses?${query.toString()}`);
  }

  async createExpense(payload: { category: string; amount: number; description?: string; expenseDate?: string }) {
    return this.request<Expense>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async voidExpense(id: string) {
    return this.request<Expense>(`/api/expenses/${id}/void`, { method: 'POST' });
  }

  // Dashboard & Reports
  async getDashboardSummary() {
    return this.request<DashboardSummary>('/api/dashboard/summary');
  }

  async getSalesReport(params?: { from?: string; to?: string; employeeId?: string; paymentMethod?: string; status?: string }) {
    const query = new URLSearchParams(params as any);
    return this.request<{ rows: any[]; summary: any }>(`/api/reports/sales?${query.toString()}`);
  }

  async getInventoryReport() {
    return this.request<{ rows: any[]; summary: any }>('/api/reports/inventory');
  }

  async getProfitReport(params?: { from?: string; to?: string }) {
    const query = new URLSearchParams(params as any);
    return this.request<{ summary: any }>(`/api/reports/profit?${query.toString()}`);
  }

  async getEmployeeReport(params?: { from?: string; to?: string }) {
    const query = new URLSearchParams(params as any);
    return this.request<any[]>(`/api/reports/employees?${query.toString()}`);
  }

  // Audit Logs
  async getAuditLogs(params?: { action?: string; entityType?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.action) query.set('action', params.action);
    if (params?.entityType) query.set('entityType', params.entityType);
    if (params?.limit) query.set('limit', String(params.limit));
    return this.request<AuditLog[]>(`/api/audit-logs?${query.toString()}`);
  }

  // Settings
  async getSettings() {
    return this.request<Store>('/api/settings');
  }

  async updateSettings(payload: Partial<Store>) {
    return this.request<Store>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  // Printers
  async getPrinters() {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getPrinters) {
      try {
        const list = await (window as any).electronAPI.getPrinters();
        if (Array.isArray(list) && list.length > 0) return list;
      } catch (_) {}
    }
    return this.request<any[]>('/api/system/printers').catch(() => []);
  }

  // Backup & Restore
  async exportBackup() {
    return this.request<any>('/api/backup/export');
  }

  async importBackup(data: any) {
    return this.request<{ success: boolean; message: string; counts: Record<string, number> }>('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getDbStats() {
    return this.request<any>('/api/system/db-stats');
  }

  // Enterprise Inventory & BOM Ledger API
  async getInventoryRawItems() {
    return this.request<any[]>('/api/inventory/items');
  }

  async createInventoryRawItem(payload: {
    sku?: string;
    name: string;
    baseUnitCode: string;
    defaultPurchaseUnit?: string;
    defaultPackQuantityBase: number;
    reorderLevelBase: number;
    initialStockBase?: number;
    initialUnitCostMinor?: number;
    notes?: string;
  }) {
    return this.request<any>('/api/inventory/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async receivePurchase(payload: {
    supplierId?: string;
    invoiceReference?: string;
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
    notes?: string;
  }) {
    return this.request<any>('/api/purchases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async recordWastage(payload: {
    inventoryItemId: string;
    quantityBase: number;
    reason: 'spoiled' | 'dropped' | 'melted' | 'expired' | 'prep_error';
    notes?: string;
  }) {
    return this.request<any>('/api/wastage', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createStockCount(payload: {
    notes?: string;
    lines: Array<{
      inventoryItemId: string;
      countedQuantityBase: number;
      notes?: string;
    }>;
  }) {
    return this.request<any>('/api/stock-counts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async approveStockCount(id: string) {
    return this.request<any>(`/api/stock-counts/${id}/approve`, {
      method: 'POST',
    });
  }

  async processRefund(payload: {
    saleId: string;
    amountMinor: number;
    reason: string;
    lines: Array<{
      saleItemId: string;
      quantityRefunded: number;
      amountMinor: number;
      restockDecision: 'discarded' | 'restocked';
    }>;
  }) {
    return this.request<any>('/api/refunds', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getLedgerAuditDrift() {
    return this.request<{
      status: 'HEALTHY' | 'DISCREPANCY_DETECTED';
      discrepancyCount: number;
      discrepancies: any[];
      checkedAt: string;
    }>('/api/inventory/audit-drift');
  }

  async getModifierGroups() {
    return this.request<Array<{ id: string; name: string; selectionType: 'single' | 'multiple'; isRequired: boolean }>>('/api/modifier-groups');
  }

  async getLedgerMovements(params?: { inventoryItemId?: string; movementType?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.inventoryItemId) query.set('inventoryItemId', params.inventoryItemId);
    if (params?.movementType) query.set('movementType', params.movementType);
    if (params?.limit) query.set('limit', String(params.limit));
    return this.request<any[]>(`/api/inventory/ledger-movements?${query.toString()}`);
  }

  // Developer Console APIs
  async getDevConfig() {
    return this.request<{
      supabase: {
        configured: boolean;
        url: string;
        anonKeyPreview: string;
        serviceKeyPreview: string;
      };
      database: {
        mode: string;
        path: string;
      };
      server: {
        appUrl: string;
        port: number;
        nodeVersion: string;
        platform: string;
      };
      endpoints: Array<{ path: string; method: string; description: string }>;
    }>('/api/developer/config');
  }

  async updateDevConfig(payload: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    supabaseServiceKey?: string;
    appUrl?: string;
    port?: number;
  }) {
    return this.request<{ success: boolean; message: string }>('/api/developer/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async testSupabaseConnection(payload?: { url?: string; key?: string }) {
    return this.request<{
      success: boolean;
      latencyMs?: number;
      message: string;
      serverTime?: string;
      tableCounts?: Record<string, number>;
    }>('/api/developer/test-connection', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }
}

export const api = new ApiClient();

