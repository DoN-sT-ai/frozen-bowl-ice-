import { db } from '../db.ts';

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export class DashboardService {
  static getSummary(storeId: string) {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

    // Active (non-voided) sales
    const validSales = db.sales.filter(s => s.store_id === storeId && s.status === 'COMPLETED');
    const validSaleIds = new Set(validSales.map(s => s.id));
    const validSaleItems = db.sale_items.filter(si => validSaleIds.has(si.sale_id));

    // Map sale items to sales for date filtering
    const saleDateMap = new Map(validSales.map(s => [s.id, s.created_at]));

    // Today's metrics
    const todaySalesList = validSales.filter(s => s.created_at.startsWith(todayStr));
    const todayRevenue = round2(todaySalesList.reduce((sum, s) => sum + s.total, 0));
    const todayBillsCount = todaySalesList.length;

    // Today's COGS
    const todaySaleItemIds = new Set(todaySalesList.map(s => s.id));
    const todayItems = validSaleItems.filter(si => todaySaleItemIds.has(si.sale_id));
    const todayCOGS = round2(todayItems.reduce((sum, i) => sum + (i.quantity * (i.purchase_price_snapshot || 0)), 0));
    const todayGrossProfit = round2(todayRevenue - todayCOGS);

    // Today's Expenses
    const activeExpenses = db.expenses.filter(e => e.store_id === storeId && e.status === 'ACTIVE');
    const todayExpensesList = activeExpenses.filter(e => e.expense_date === todayStr);
    const todayExpenses = round2(todayExpensesList.reduce((sum, e) => sum + e.amount, 0));
    const todayNetProfit = round2(todayGrossProfit - todayExpenses);

    // Month metrics
    const monthSalesList = validSales.filter(s => s.created_at.startsWith(currentMonthStr));
    const monthRevenue = round2(monthSalesList.reduce((sum, s) => sum + s.total, 0));

    const monthSaleIds = new Set(monthSalesList.map(s => s.id));
    const monthItems = validSaleItems.filter(si => monthSaleIds.has(si.sale_id));
    const monthCOGS = round2(monthItems.reduce((sum, i) => sum + (i.quantity * (i.purchase_price_snapshot || 0)), 0));
    const monthGrossProfit = round2(monthRevenue - monthCOGS);

    const monthExpensesList = activeExpenses.filter(e => e.expense_date.startsWith(currentMonthStr));
    const monthExpenses = round2(monthExpensesList.reduce((sum, e) => sum + e.amount, 0));
    const monthNetProfit = round2(monthGrossProfit - monthExpenses);

    // Inventory status
    const products = db.products.filter(p => p.store_id === storeId && p.active);
    const lowStockCount = products.filter(p => p.current_stock <= p.minimum_stock && p.current_stock > 0).length;
    const outOfStockCount = products.filter(p => p.current_stock <= 0).length;
    const totalProductsCount = products.length;

    // Payment breakdown (today or overall recent)
    const paymentMap: Record<string, { count: number; total: number }> = {
      CASH: { count: 0, total: 0 },
      UPI: { count: 0, total: 0 },
      CARD: { count: 0, total: 0 },
      OTHER: { count: 0, total: 0 },
    };

    validSales.forEach(s => {
      if (paymentMap[s.payment_method]) {
        paymentMap[s.payment_method].count += 1;
        paymentMap[s.payment_method].total = round2(paymentMap[s.payment_method].total + s.total);
      }
    });

    // Top products sold (by quantity & revenue)
    const productStats = new Map<string, { name: string; quantity: number; revenue: number }>();
    validSaleItems.forEach(item => {
      const existing = productStats.get(item.product_id) || {
        name: item.product_name_snapshot,
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue = round2(existing.revenue + item.line_total);
      productStats.set(item.product_id, existing);
    });

    const topProducts = Array.from(productStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Recent 7 days chart
    const last7Days: Array<{ date: string; label: string; sales: number; bills: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      const daySales = validSales.filter(s => s.created_at.startsWith(dayStr));
      const total = round2(daySales.reduce((sum, s) => sum + s.total, 0));
      last7Days.push({
        date: dayStr,
        label: dayLabel,
        sales: total,
        bills: daySales.length,
      });
    }

    // Recent bills
    const recentBills = db.sales
      .filter(s => s.store_id === storeId)
      .slice(0, 6)
      .map(s => ({
        id: s.id,
        billNumber: s.bill_number,
        total: s.total,
        status: s.status,
        paymentMethod: s.payment_method,
        employeeName: s.employee_name,
        createdAt: s.created_at,
        itemCount: db.sale_items.filter(si => si.sale_id === s.id).length,
      }));

    // Critical low-stock alert items
    const lowStockItems = products
      .filter(p => p.current_stock <= p.minimum_stock)
      .map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        currentStock: p.current_stock,
        minimumStock: p.minimum_stock,
        unit: p.unit,
        isOut: p.current_stock <= 0,
      }))
      .slice(0, 6);

    return {
      today: {
        revenue: todayRevenue,
        cogs: todayCOGS,
        grossProfit: todayGrossProfit,
        expenses: todayExpenses,
        netProfit: todayNetProfit,
        billsCount: todayBillsCount,
      },
      month: {
        revenue: monthRevenue,
        cogs: monthCOGS,
        grossProfit: monthGrossProfit,
        expenses: monthExpenses,
        netProfit: monthNetProfit,
      },
      inventory: {
        lowStockCount,
        outOfStockCount,
        totalProductsCount,
        lowStockItems,
      },
      paymentBreakdown: paymentMap,
      topProducts,
      salesChart: last7Days,
      recentBills,
    };
  }
}
