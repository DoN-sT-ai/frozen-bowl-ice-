import { db } from '../db.ts';

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export class ReportService {
  static getSalesReport(storeId: string, options?: { from?: string; to?: string; employeeId?: string; paymentMethod?: string; status?: string }) {
    let sales = db.sales.filter(s => s.store_id === storeId);

    if (options?.from) {
      sales = sales.filter(s => s.created_at >= options.from!);
    }
    if (options?.to) {
      sales = sales.filter(s => s.created_at <= options.to! + 'T23:59:59.999Z');
    }
    if (options?.employeeId) {
      sales = sales.filter(s => s.employee_id === options.employeeId);
    }
    if (options?.paymentMethod) {
      sales = sales.filter(s => s.payment_method === options.paymentMethod);
    }
    if (options?.status) {
      sales = sales.filter(s => s.status === options.status);
    }

    const reportRows = sales.map(s => {
      const items = db.sale_items.filter(si => si.sale_id === s.id);
      const cogs = round2(items.reduce((sum, i) => sum + (i.quantity * (i.purchase_price_snapshot || 0)), 0));
      return {
        id: s.id,
        billNumber: s.bill_number,
        date: s.created_at,
        cashier: s.employee_name,
        subtotal: s.subtotal,
        discount: s.discount,
        tax: s.tax,
        total: s.total,
        cogs,
        grossMargin: s.status === 'COMPLETED' ? round2(s.total - cogs) : 0,
        paymentMethod: s.payment_method,
        status: s.status,
        itemCount: items.length,
      };
    });

    const totalRevenue = round2(reportRows.filter(r => r.status === 'COMPLETED').reduce((sum, r) => sum + r.total, 0));
    const totalTax = round2(reportRows.filter(r => r.status === 'COMPLETED').reduce((sum, r) => sum + r.tax, 0));
    const totalDiscount = round2(reportRows.filter(r => r.status === 'COMPLETED').reduce((sum, r) => sum + r.discount, 0));

    return {
      rows: reportRows,
      summary: {
        totalRevenue,
        totalTax,
        totalDiscount,
        totalBills: reportRows.length,
        completedBills: reportRows.filter(r => r.status === 'COMPLETED').length,
        voidedBills: reportRows.filter(r => r.status === 'VOIDED').length,
      },
    };
  }

  static getInventoryReport(storeId: string) {
    const products = db.products.filter(p => p.store_id === storeId);
    const categoriesMap = new Map(db.categories.map(c => [c.id, c.name]));

    let totalPurchaseValuation = 0;
    let totalRetailValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const rows = products.map(p => {
      const purchaseVal = round2(p.current_stock * p.purchase_price);
      const retailVal = round2(p.current_stock * p.selling_price);

      totalPurchaseValuation = round2(totalPurchaseValuation + purchaseVal);
      totalRetailValuation = round2(totalRetailValuation + retailVal);

      let status = 'IN_STOCK';
      if (p.current_stock <= 0) {
        status = 'OUT_OF_STOCK';
        outOfStockCount++;
      } else if (p.current_stock <= p.minimum_stock) {
        status = 'LOW_STOCK';
        lowStockCount++;
      }

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category_id ? categoriesMap.get(p.category_id) || 'Uncategorized' : 'Uncategorized',
        currentStock: p.current_stock,
        minimumStock: p.minimum_stock,
        unit: p.unit,
        purchasePrice: p.purchase_price,
        sellingPrice: p.selling_price,
        purchaseValuation: purchaseVal,
        retailValuation: retailVal,
        status,
        active: p.active,
      };
    });

    return {
      rows,
      summary: {
        totalProducts: products.length,
        totalPurchaseValuation,
        totalRetailValuation,
        estimatedGrossProfitPotential: round2(totalRetailValuation - totalPurchaseValuation),
        lowStockCount,
        outOfStockCount,
      },
    };
  }

  static getProfitReport(storeId: string, options?: { from?: string; to?: string }) {
    const salesReport = this.getSalesReport(storeId, { from: options?.from, to: options?.to, status: 'COMPLETED' });
    const revenue = salesReport.summary.totalRevenue;
    const totalCOGS = round2(salesReport.rows.reduce((sum, r) => sum + r.cogs, 0));
    const grossProfit = round2(revenue - totalCOGS);
    const grossMarginPercent = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;

    let expenses = db.expenses.filter(e => e.store_id === storeId && e.status === 'ACTIVE');
    if (options?.from) expenses = expenses.filter(e => e.expense_date >= options.from!);
    if (options?.to) expenses = expenses.filter(e => e.expense_date <= options.to!);

    const totalExpenses = round2(expenses.reduce((sum, e) => sum + e.amount, 0));
    const netProfit = round2(grossProfit - totalExpenses);
    const netMarginPercent = revenue > 0 ? round2((netProfit / revenue) * 100) : 0;

    return {
      summary: {
        revenue,
        cogs: totalCOGS,
        grossProfit,
        grossMarginPercent,
        totalExpenses,
        netProfit,
        netMarginPercent,
        billsCount: salesReport.summary.completedBills,
      },
    };
  }

  static getEmployeeReport(storeId: string, options?: { from?: string; to?: string }) {
    const employees = db.users.filter(u => u.store_id === storeId);
    let sales = db.sales.filter(s => s.store_id === storeId && s.status === 'COMPLETED');

    if (options?.from) sales = sales.filter(s => s.created_at >= options.from!);
    if (options?.to) sales = sales.filter(s => s.created_at <= options.to! + 'T23:59:59.999Z');

    const empMap = new Map<string, { employeeName: string; email: string; role: string; billsCount: number; totalSales: number; itemsSold: number }>();

    employees.forEach(emp => {
      empMap.set(emp.id, {
        employeeName: emp.name,
        email: emp.email,
        role: emp.role,
        billsCount: 0,
        totalSales: 0,
        itemsSold: 0,
      });
    });

    sales.forEach(s => {
      const entry = empMap.get(s.employee_id);
      if (entry) {
        entry.billsCount += 1;
        entry.totalSales = round2(entry.totalSales + s.total);
        const items = db.sale_items.filter(si => si.sale_id === s.id);
        entry.itemsSold += items.reduce((sum, i) => sum + i.quantity, 0);
      }
    });

    return Array.from(empMap.values());
  }
}
