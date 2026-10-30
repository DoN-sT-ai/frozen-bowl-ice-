import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import QRCode from 'qrcode';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { db } from './db.ts';
import { AuthService } from './services/authService.ts';
import { ProductService, CategoryService } from './services/productService.ts';
import { InventoryService } from './services/inventoryService.ts';
import { BillingService } from './services/billingService.ts';
import { EmployeeService, ExpenseService } from './services/employeeService.ts';
import { VerificationService } from './services/verificationService.ts';
import { DashboardService } from './services/dashboardService.ts';
import { ReportService } from './services/reportService.ts';
import { AuditService } from './services/auditService.ts';
import { isSupabaseConfigured } from './supabaseClient.ts';
import { LocalDb, DB_FILE_PATH } from './localDb.ts';
import { inventoryLedgerRouter, PosCheckoutSchema } from './routes/inventoryLedgerRoutes.ts';
import { inventoryLedgerEngine } from './services/inventoryLedgerEngine.ts';

const app = express();

// Resilient body parsing: skip express.json() if body already parsed by Vercel serverless runtime
app.use((req: Request, res: Response, next: NextFunction) => {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (_) {}
  }
  if (req.body && typeof req.body === 'object') {
    return next();
  }
  express.json({ limit: '50mb' })(req, res, next);
});
app.use(cookieParser());

// Localhost Security Guard: Prevent unauthorized devices on Wi-Fi/LAN from accessing the POS engine
app.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.ALLOW_REMOTE_LAN === 'true') {
    return next();
  }
  const remoteIp = req.socket.remoteAddress || req.ip || '';
  const isLocal =
    remoteIp === '127.0.0.1' ||
    remoteIp === '::1' ||
    remoteIp === '::ffff:127.0.0.1' ||
    remoteIp === 'localhost';

  if (!isLocal) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN_NETWORK_ACCESS',
        message: 'Security Guard: Access to this POS billing terminal from external network devices is strictly blocked.',
      },
    });
  }
  next();
});


// Normalize incoming path for Vercel rewrites:
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.url && req.url.startsWith('/api/index.js')) {
    req.url = req.url.replace('/api/index.js', '/api');
  }
  if (process.env.VERCEL && req.url && !req.url.startsWith('/api') && !req.url.startsWith('/@') && !req.url.startsWith('/src') && !req.url.startsWith('/node_modules') && !req.url.includes('.')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

// Diagnostic Health Check Route
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    isSupabaseConfigured,
    supabaseConfigured: Boolean(process.env.SUPABASE_URL),
    nodeEnv: process.env.NODE_ENV,
    isVercel: Boolean(process.env.VERCEL),
  });
});

// Authentication Middleware
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    store_id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER';
    active: boolean;
  };
  store?: any;
}

const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = (req.cookies?.session_token as string)
    || (req.headers['x-session-token'] as string)
    || (req.headers['authorization']?.replace(/^Bearer\s+/i, ''))
    || (req.query?.token as string);

  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }

  const sessionData = AuthService.getSession(token);
  if (!sessionData) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Session expired or invalid' } });
  }

  req.user = sessionData.user;
  req.store = sessionData.store;
  next();
};

const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'DEVELOPER') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin or Developer privileges required' } });
  }
  next();
};

const requireDeveloper = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'DEVELOPER') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Developer privileges required' } });
  }
  next();
};

// ==========================================
// PUBLIC & VERIFICATION ROUTES
// ==========================================

// QR Code generator helper
app.get('/api/qr', async (req: Request, res: Response) => {
  try {
    const text = req.query.text as string;
    if (!text) {
      return res.status(400).send('Text parameter is required');
    }
    const dataUrl = await QRCode.toDataURL(text, { margin: 1, width: 256 });
    res.json({ dataUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public bill verification
app.get('/api/verify/:token', (req: Request, res: Response) => {
  try {
    const result = VerificationService.verifyBill(req.params.token);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ valid: false, error: err.message });
  }
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' } });
    }

    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await AuthService.login(email, password, ip, userAgent);

    // Ephemeral session-only cookie (no maxAge/expires): automatically destroyed when app is closed
    res.cookie('session_token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
    });

    res.json({
      token: result.token,
      user: result.user,
      store: result.store,
    });
  } catch (err: any) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: err.message } });
  }
});

app.post('/api/auth/logout', (req: AuthenticatedRequest, res: Response) => {
  const token = (req.cookies?.session_token as string) || (req.headers['x-session-token'] as string);
  if (token) {
    AuthService.logout(token);
  }
  res.clearCookie('session_token');
  res.json({ success: true });
});

app.get('/api/auth/session', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: req.user,
    store: req.store,
  });
});

// ==========================================
// PRODUCT & CATEGORY ROUTES
// ==========================================

app.get('/api/products', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, barcode, categoryId, lowStock, outOfStock, activeOnly } = req.query;
    const products = ProductService.listProducts(req.user!.store_id, {
      search: search as string,
      barcode: barcode as string,
      categoryId: categoryId as string,
      lowStock: lowStock === 'true',
      outOfStock: outOfStock === 'true',
      activeOnly: activeOnly !== 'false',
    });
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get('/api/products/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const product = ProductService.getProduct(req.user!.store_id, req.params.id);
    res.json(product);
  } catch (err: any) {
    res.status(404).json({ error: { message: err.message } });
  }
});

app.post('/api/products', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const product = await ProductService.createProduct(
      req.user!.store_id,
      req.user!.id,
      req.user!.name,
      req.body
    );
    res.status(201).json(product);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

app.patch('/api/products/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await ProductService.updateProduct(
      req.user!.store_id,
      req.user!.id,
      req.user!.name,
      req.params.id,
      req.body
    );
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

app.post('/api/products/:id/activate', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await ProductService.toggleActive(req.user!.store_id, req.user!.id, req.user!.name, req.params.id, true);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

app.post('/api/products/:id/deactivate', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await ProductService.toggleActive(req.user!.store_id, req.user!.id, req.user!.name, req.params.id, false);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// Admin-only: Permanently delete/remove product from inventory
app.delete('/api/products/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await ProductService.deleteProduct(req.user!.store_id, req.user!.id, req.user!.name, req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

app.get('/api/categories', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const categories = await CategoryService.listCategories(req.user!.store_id);
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/api/categories', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: { message: 'Category name is required' } });
    }
    const cat = await CategoryService.createCategory(req.user!.store_id, req.user!.id, req.user!.name, name, description);
    res.status(201).json(cat);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// Admin-only: Remove / delete category
app.delete('/api/categories/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await CategoryService.deleteCategory(
      req.user!.store_id,
      req.user!.id,
      req.user!.name,
      req.params.id
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// Admin-only: Seed/restore standard default store categories
app.post('/api/categories/seed-defaults', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const seeded = await CategoryService.seedDefaultCategories(
      req.user!.store_id,
      req.user!.id,
      req.user!.name
    );
    res.json(seeded);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// ==========================================
// INVENTORY ROUTES
// ==========================================

app.get('/api/inventory/movements', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productId, type, limit } = req.query;
    const movements = InventoryService.getMovements(req.user!.store_id, {
      productId: productId as string,
      type: type as any,
      limit: limit ? Number(limit) : 100,
    });
    res.json(movements);
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/api/inventory/receive', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productId, quantity, reason, purchasePrice, taxRate, taxType, supplierInvoice, supplierGstin } = req.body;
    const result = InventoryService.receiveStock({
      storeId: req.user!.store_id,
      userId: req.user!.id,
      userName: req.user!.name,
      productId,
      quantity,
      reason,
      purchasePrice,
      taxRate,
      taxType,
      supplierInvoice,
      supplierGstin,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

app.post('/api/inventory/adjust', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productId, quantityDifference, reason, type } = req.body;
    const result = InventoryService.adjustStock({
      storeId: req.user!.store_id,
      userId: req.user!.id,
      userName: req.user!.name,
      productId,
      quantityDifference,
      reason,
      type,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// ==========================================
// BILLING / POS / SALES ROUTES
// ==========================================

// Register Enterprise Inventory, BOM & Ledger Router
app.use('/api', inventoryLedgerRouter);

app.post('/api/sales', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = (req.cookies?.session_token as string)
      || (req.headers['x-session-token'] as string)
      || (req.headers['authorization']?.replace(/^Bearer\s+/i, ''))
      || (req.query?.token as string);

    if (token) {
      const sessionData = AuthService.getSession(token);
      if (sessionData) {
        req.user = sessionData.user;
        req.store = sessionData.store;
      }
    }

    // Resolve active operator context: uses logged-in user or store cashier
    const user = req.user || {
      id: 'POS-CASHIER',
      store_id: LocalDb.resolveValidStoreId(),
      name: 'Store Operator',
      email: 'operator@local.pos',
      role: 'EMPLOYEE' as const,
      active: true,
    };

    // If enterprise BOM cartItems payload is supplied, route to transactional engine
    if (req.body && Array.isArray(req.body.cartItems)) {
      const validated = PosCheckoutSchema.parse(req.body);
      const result = inventoryLedgerEngine.processPosCheckout({
        ...validated,
        cashierId: user.id || validated.idempotencyKey || 'POS_CASHIER',
      });
      if (result.isDuplicate) {
        return res.status(200).json(result);
      }
      return res.status(201).json(result);
    }

    const sale = await BillingService.createSale({
      storeId: user.store_id,
      userId: user.id,
      userName: user.name,
      payload: req.body,
    });
    res.status(201).json(sale);
  } catch (err: any) {
    res.status(400).json({ error: { code: 'SALE_FAILED', message: err.message } });
  }
});

app.get('/api/sales', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, from, to, employeeId, paymentMethod, status, limit } = req.query;

    // Strict role check: If employee, only view own sales unless configured otherwise
    const filterEmployeeId = req.user!.role === 'EMPLOYEE' ? req.user!.id : (employeeId as string);

    const sales = BillingService.getSales(req.user!.store_id, {
      search: search as string,
      from: from as string,
      to: to as string,
      employeeId: filterEmployeeId,
      paymentMethod: paymentMethod as string,
      status: status as string,
      limit: limit ? Number(limit) : 100,
    });
    res.json(sales);
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get('/api/sales/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = BillingService.getSaleById(req.user!.store_id, req.params.id);
    res.json(sale);
  } catch (err: any) {
    res.status(404).json({ error: { message: err.message } });
  }
});

app.post('/api/sales/:id/void', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const voided = await BillingService.voidSale({
      storeId: req.user!.store_id,
      userId: req.user!.id,
      userName: req.user!.name,
      saleId: req.params.id,
      reason,
    });
    res.json(voided);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// Admin-only: Purge all sales and reset sequences
app.delete('/api/sales/purge-all', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const storeId = req.user!.store_id;
    const rawDb = (await import('./localDb.ts')).localDbManager.getRawDb();
    rawDb.exec(`DELETE FROM sale_items;`);
    rawDb.exec(`DELETE FROM sales WHERE store_id = '${storeId}';`);
    rawDb.exec(`UPDATE bill_sequences SET last_number = 0 WHERE store_id = '${storeId}';`);

    db.sales.length = 0;
    db.sale_items.length = 0;
    const seq = db.bill_sequences.find(s => s.store_id === storeId);
    if (seq) seq.last_number = 0;

    AuditService.log({
      storeId,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'SALES_PURGED',
      entityType: 'STORE',
      entityId: storeId,
      afterData: { message: 'All sales purged and bill sequences reset to 0' },
    });

    res.json({ success: true, message: 'All old billings removed and sequences reset to 0' });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// ==========================================
// EMPLOYEE MANAGEMENT (ADMIN ONLY)
// ==========================================

app.get('/api/employees', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employees = await EmployeeService.listEmployees(req.user!.store_id, req.user!.role);
    res.json(employees);
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message || 'Failed to list employees' } });
  }
});

app.post('/api/employees', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.body?.role === 'DEVELOPER' && req.user!.role !== 'DEVELOPER') {
      return res.status(403).json({ error: { message: 'Developer role can only be assigned by developers' } });
    }
    const emp = await EmployeeService.createEmployee(
      req.user!.store_id,
      req.user!.id,
      req.user!.name,
      req.body
    );
    res.status(201).json(emp);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

app.post('/api/employees/:id/activate', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const emp = await EmployeeService.setEmployeeActive(
      req.user!.store_id,
      req.user!.id,
      req.user!.name,
      req.params.id,
      true
    );
    res.json(emp);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

app.post('/api/employees/:id/deactivate', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const emp = await EmployeeService.setEmployeeActive(
      req.user!.store_id,
      req.user!.id,
      req.user!.name,
      req.params.id,
      false
    );
    res.json(emp);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// Admin-only: Permanently delete staff/user account
app.delete('/api/employees/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await EmployeeService.deleteEmployee(
      req.user!.store_id,
      req.user!.id,
      req.user!.name,
      req.params.id
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// ==========================================
// EXPENSES (ADMIN ONLY)
// ==========================================

app.get('/api/expenses', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { from, to } = req.query;
  const list = ExpenseService.listExpenses(req.user!.store_id, {
    from: from as string,
    to: to as string,
  });
  res.json(list);
});

app.post('/api/expenses', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const exp = await ExpenseService.createExpense(
      req.user!.store_id,
      req.user!.id,
      req.user!.name,
      req.body
    );
    res.status(201).json(exp);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

app.post('/api/expenses/:id/void', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const exp = await ExpenseService.voidExpense(
      req.user!.store_id,
      req.user!.id,
      req.user!.name,
      req.params.id
    );
    res.json(exp);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// ==========================================
// DASHBOARD & REPORTS (ADMIN ONLY)
// ==========================================

app.get('/api/dashboard/summary', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = DashboardService.getSummary(req.user!.store_id);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get('/api/reports/sales', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { from, to, employeeId, paymentMethod, status } = req.query;
  const rep = ReportService.getSalesReport(req.user!.store_id, {
    from: from as string,
    to: to as string,
    employeeId: employeeId as string,
    paymentMethod: paymentMethod as string,
    status: status as string,
  });
  res.json(rep);
});

app.get('/api/reports/inventory', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const rep = ReportService.getInventoryReport(req.user!.store_id);
  res.json(rep);
});

app.get('/api/reports/profit', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { from, to } = req.query;
  const rep = ReportService.getProfitReport(req.user!.store_id, {
    from: from as string,
    to: to as string,
  });
  res.json(rep);
});

app.get('/api/reports/employees', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { from, to } = req.query;
  const rep = ReportService.getEmployeeReport(req.user!.store_id, {
    from: from as string,
    to: to as string,
  });
  res.json(rep);
});

// ==========================================
// AUDIT LOGS (ADMIN ONLY)
// ==========================================

app.get('/api/audit-logs', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { action, entityType, limit } = req.query;
  const logs = AuditService.getLogs(req.user!.store_id, {
    action: action as string,
    entityType: entityType as string,
    limit: limit ? Number(limit) : 100,
  });
  res.json(logs);
});

// ==========================================
// STORE SETTINGS
// ==========================================

// Public store info for login screen (returns shop name without requiring prior auth)
app.get('/api/store/info', async (_req: Request, res: Response) => {
  try {
    const store = (await LocalDb.getFirstStore()) || db.stores[0];
    res.json({
      name: store?.name || '',
      code: store?.code || '',
      phone: store?.phone || '',
      address: store?.address || '',
      gstin: store?.gstin || '',
      invoice_prefix: store?.invoice_prefix || '',
    });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get('/api/settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json(req.store);
});

app.patch('/api/settings', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const store = db.stores.find(s => s.id === req.user!.store_id);
    if (!store) return res.status(404).json({ error: { message: 'Store not found' } });

    const before = { ...store };
    const { name, address, phone, email, gstin, invoicePrefix } = req.body;
    if (name) store.name = name;
    if (address) store.address = address;
    if (phone) store.phone = phone;
    if (email) store.email = email;
    if (gstin) store.gstin = gstin;
    if (invoicePrefix) store.invoice_prefix = invoicePrefix;
    store.updated_at = new Date().toISOString();

    // Persist store settings to Local SQLite database
    await LocalDb.updateStore(store.id, store).catch(() => {});

    AuditService.log({
      storeId: store.id,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'SETTINGS_UPDATED',
      entityType: 'STORE',
      entityId: store.id,
      beforeData: before,
      afterData: { ...store },
    });

    res.json(store);
  } catch (err: any) {
    res.status(400).json({ error: { message: err.message } });
  }
});

// ==========================================
// CONNECTED PRINTERS
// ==========================================

app.get('/api/system/printers', (_req: Request, res: Response) => {
  if (process.platform === 'win32') {
    const cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default, PrinterStatus, PortName | ConvertTo-Json"';
    exec(cmd, { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) {
        return res.json([]);
      }
      try {
        const parsed = JSON.parse(stdout);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const printers = list.map((p: any) => ({
          name: p.Name || 'Unknown Printer',
          displayName: p.Name || 'Unknown Printer',
          isDefault: Boolean(p.Default),
          status: p.PrinterStatus,
          portName: p.PortName,
        }));
        res.json(printers);
      } catch (_) {
        res.json([]);
      }
    });
  } else {
    exec('lpstat -p -d 2>/dev/null', { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) return res.json([]);
      const lines = stdout.split('\n');
      const printers: any[] = [];
      for (const line of lines) {
        const match = line.match(/^printer\s+([^\s]+)/);
        if (match) {
          printers.push({
            name: match[1],
            displayName: match[1],
            isDefault: stdout.includes(`system default destination: ${match[1]}`),
          });
        }
      }
      res.json(printers);
    });
  }
});

// ==========================================
// BACKUP & RESTORE / EXPORT & IMPORT (ADMIN)
// ==========================================

app.get('/api/backup/export', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const backup = LocalDb.exportBackup();
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="ledgerstore-backup-${dateStr}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(backup);
  } catch (err: any) {
    console.error('Backup export error:', err);
    res.status(500).json({ error: { code: 'BACKUP_FAILED', message: err.message || 'Failed to generate backup' } });
  }
});

app.post('/api/backup/import', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: { code: 'INVALID_FORMAT', message: 'Invalid backup file payload' } });
    }

    const result = LocalDb.importBackup(payload);

    // Re-sync memory cache immediately so entire system reflects the imported snapshot
    await db.syncFromLocalDb();

    res.json({
      success: true,
      message: 'Database backup imported successfully',
      counts: result.counts,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Backup import error:', err);
    res.status(500).json({ error: { code: 'IMPORT_FAILED', message: err.message || 'Failed to restore database from backup' } });
  }
});

app.get('/api/backup/download-db', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    if (!fs.existsSync(DB_FILE_PATH)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'SQLite database file not found' } });
    }
    const dateStr = new Date().toISOString().split('T')[0];
    res.download(DB_FILE_PATH, `ledgerstore-${dateStr}.db`);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOWNLOAD_FAILED', message: err.message } });
  }
});

app.get('/api/system/db-stats', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(LocalDb.getStats());
  } catch (err: any) {
    res.status(500).json({ error: { code: 'STATS_ERROR', message: err.message } });
  }
});

// ==========================================
// DEVELOPER CONSOLE & CLOUD API CONFIGURATION
// ==========================================

const API_CATALOG = [
  { path: '/api/auth/login', method: 'POST', description: 'Authenticate terminal operator or admin' },
  { path: '/api/auth/session', method: 'GET', description: 'Retrieve active operator session and permissions' },
  { path: '/api/products', method: 'GET / POST', description: 'Catalog management, recipes, and BOM configurations' },
  { path: '/api/sales', method: 'GET / POST', description: 'Transactional billing, tax calculation, and receipt generation' },
  { path: '/api/inventory/items', method: 'GET / POST', description: 'Raw ingredients warehouse ledger and portion tracking' },
  { path: '/api/inventory/receive', method: 'POST', description: 'Supplier restock, outer pack calculations, and GST ITC' },
  { path: '/api/inventory/ledger-movements', method: 'GET', description: 'Immutable double-entry stock movement ledger' },
  { path: '/api/employees', method: 'GET / POST', description: 'Cloud operator accounts and role management' },
  { path: '/api/backup/export', method: 'GET', description: 'Complete system snapshot export' },
  { path: '/api/system/db-stats', method: 'GET', description: 'SQLite file statistics and table row metrics' },
  { path: '/api/developer/config', method: 'GET / POST', description: 'Supabase cloud endpoints, keys, and API management' },
  { path: '/api/developer/test-connection', method: 'POST', description: 'Cloud database ping and live latency audit' },
];

app.get('/api/developer/config', requireAuth, requireDeveloper, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const anonKey = process.env.SUPABASE_ANON_KEY || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const anonPreview = anonKey.length > 10 ? `${anonKey.slice(0, 8)}...${anonKey.slice(-4)}` : '';
    const servicePreview = serviceKey.length > 10 ? `${serviceKey.slice(0, 8)}...${serviceKey.slice(-4)}` : '';

    res.json({
      supabase: {
        configured: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)),
        url: process.env.SUPABASE_URL || '',
        anonKeyPreview: anonPreview,
        serviceKeyPreview: servicePreview,
      },
      database: {
        mode: 'SQLite (Local ACID Ledger) + Supabase (Cloud PostgreSQL Auth)',
        path: DB_FILE_PATH,
      },
      server: {
        appUrl: process.env.APP_URL || 'http://127.0.0.1:9876',
        port: process.env.PORT ? parseInt(process.env.PORT, 10) : 9876,
        nodeVersion: process.version,
        platform: process.platform,
      },
      endpoints: API_CATALOG,
    });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/api/developer/config', requireAuth, requireDeveloper, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { supabaseUrl, supabaseAnonKey, supabaseServiceKey, appUrl, port } = req.body;
    const envPath = path.resolve(process.cwd(), '.env');

    let currentEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    if (supabaseUrl !== undefined) {
      process.env.SUPABASE_URL = supabaseUrl.trim();
      currentEnv = currentEnv.replace(/^SUPABASE_URL=.*$/m, `SUPABASE_URL="${supabaseUrl.trim()}"`);
      if (!currentEnv.includes('SUPABASE_URL=')) currentEnv += `\nSUPABASE_URL="${supabaseUrl.trim()}"`;
      await LocalDb.setDeveloperConfig('SUPABASE_URL', supabaseUrl.trim());
    }

    if (supabaseAnonKey !== undefined && supabaseAnonKey.trim()) {
      process.env.SUPABASE_ANON_KEY = supabaseAnonKey.trim();
      currentEnv = currentEnv.replace(/^SUPABASE_ANON_KEY=.*$/m, `SUPABASE_ANON_KEY="${supabaseAnonKey.trim()}"`);
      if (!currentEnv.includes('SUPABASE_ANON_KEY=')) currentEnv += `\nSUPABASE_ANON_KEY="${supabaseAnonKey.trim()}"`;
      await LocalDb.setDeveloperConfig('SUPABASE_ANON_KEY', supabaseAnonKey.trim());
    }

    if (supabaseServiceKey !== undefined && supabaseServiceKey.trim()) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey.trim();
      currentEnv = currentEnv.replace(/^SUPABASE_SERVICE_ROLE_KEY=.*$/m, `SUPABASE_SERVICE_ROLE_KEY="${supabaseServiceKey.trim()}"`);
      if (!currentEnv.includes('SUPABASE_SERVICE_ROLE_KEY=')) currentEnv += `\nSUPABASE_SERVICE_ROLE_KEY="${supabaseServiceKey.trim()}"`;
      await LocalDb.setDeveloperConfig('SUPABASE_SERVICE_ROLE_KEY', supabaseServiceKey.trim());
    }

    if (appUrl !== undefined) {
      process.env.APP_URL = appUrl.trim();
      currentEnv = currentEnv.replace(/^APP_URL=.*$/m, `APP_URL="${appUrl.trim()}"`);
      await LocalDb.setDeveloperConfig('APP_URL', appUrl.trim());
    }

    if (port !== undefined) {
      process.env.PORT = String(port);
      currentEnv = currentEnv.replace(/^PORT=.*$/m, `PORT=${port}`);
      await LocalDb.setDeveloperConfig('PORT', String(port));
    }

    fs.writeFileSync(envPath, currentEnv, 'utf8');

    AuditService.log({
      storeId: req.user!.store_id,
      userId: req.user!.id,
      userName: req.user!.name,
      action: 'DEVELOPER_CONFIG_UPDATED',
      entityType: 'SYSTEM',
      afterData: { supabaseUrl: process.env.SUPABASE_URL, port: process.env.PORT, storage: 'LOCAL_SQLITE_AND_ENV' },
    });

    res.json({ success: true, message: 'Developer configuration saved to local SQLite database and .env' });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/api/developer/test-connection', requireAuth, requireDeveloper, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, key } = req.body;
    const testUrl = (url || process.env.SUPABASE_URL || '').trim();
    const testKey = (key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

    if (!testUrl || !testKey) {
      return res.status(400).json({ success: false, message: 'Supabase URL and API Key are required to test connection' });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const testClient = createClient(testUrl, testKey, {
      auth: { persistSession: false },
    });

    const start = Date.now();
    const { data: users, error: userError } = await testClient.from('users').select('id, name, role').limit(10);
    const latencyMs = Date.now() - start;

    if (userError) {
      return res.status(400).json({
        success: false,
        latencyMs,
        message: `Supabase Connection Error: ${userError.message}`,
      });
    }

    let productCount = 0;
    try {
      const prodRes = await testClient.from('products').select('*', { count: 'exact', head: true });
      productCount = prodRes.count || 0;
    } catch (_) {}

    res.json({
      success: true,
      latencyMs,
      message: 'Supabase Cloud PostgreSQL connected with healthy latency!',
      serverTime: new Date().toISOString(),
      tableCounts: {
        usersCount: users?.length || 0,
        productsCount: productCount || 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Connection test failed' });
  }
});


// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API Error:', err);
  res.status(err.status || 500).json({
    error: {
      code: err.code || 'SERVER_ERROR',
      message: err.message || 'Internal Server Error',
    },
  });
});

export default app;
export { app };
