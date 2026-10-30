import React, { useState, useEffect } from 'react';
import { DashboardSummary } from '../../types';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import {
  TrendingUp,
  Receipt,
  AlertTriangle,
  Boxes,
  Wallet,
  DollarSign,
  ArrowUpRight,
  ShoppingCart,
  QrCode,
  CreditCard,
  Banknote,
  RefreshCw,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab }) => {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);
      setError(null);
      const res = await api.getDashboardSummary();
      setData(res);
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadSummary(false);
    const interval = setInterval(() => {
      loadSummary(true);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-neutral-400 text-xs">
        Loading analytics data...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-xs text-red-600 space-y-2">
        <p>{error || 'Could not load dashboard'}</p>
        <button
          onClick={() => loadSummary(false)}
          className="px-3 py-1 bg-neutral-900 text-white rounded font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  const maxChartSale = Math.max(...data.salesChart.map((d) => d.sales), 100);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 leading-none">
            Store Performance Dashboard
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Real-time financial summary, COGS profit breakdown, and stock indicators.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Metrics</span>
          </div>
          <button
            onClick={() => loadSummary(false)}
            className="p-1.5 text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded text-xs transition-colors cursor-pointer"
            title="Auto-refreshing live every 4s. Click to refresh now."
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => onNavigateTab('billing')}
            className="px-3 py-1.5 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Open Billing POS
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-7xl w-full mx-auto">
        {/* Row 1: Core Financial Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Today's Sales */}
          <div className="bg-white p-3.5 rounded border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">Today's Revenue</span>
              <Receipt className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="text-xl font-bold font-mono text-neutral-900 tabular-nums">
              {formatCurrency(data.today.revenue)}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
              <span>{data.today.billsCount} bills completed</span>
            </div>
          </div>

          {/* Today's Gross Profit (Revenue - COGS) */}
          <div className="bg-white p-3.5 rounded border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">Estimated Gross Margin</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold font-mono text-neutral-900 tabular-nums">
              {formatCurrency(data.today.grossProfit)}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              COGS Cost: {formatCurrency(data.today.cogs)}
            </div>
          </div>

          {/* Today's Expenses */}
          <div className="bg-white p-3.5 rounded border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">Today's Expenses</span>
              <Wallet className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="text-xl font-bold font-mono text-neutral-900 tabular-nums">
              {formatCurrency(data.today.expenses)}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              Month Total: {formatCurrency(data.month.expenses)}
            </div>
          </div>

          {/* Net Profit */}
          <div className="bg-white p-3.5 rounded border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-medium">Estimated Net Profit</span>
              <DollarSign className="w-4 h-4 text-emerald-700" />
            </div>
            <div className={`text-xl font-bold font-mono tabular-nums ${data.today.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {formatCurrency(data.today.netProfit)}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              Month Net: {formatCurrency(data.month.netProfit)}
            </div>
          </div>
        </div>

        {/* Row 2: Charts & Payment Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Sales Chart (Last 7 Days) */}
          <div className="lg:col-span-2 bg-white p-4 rounded border border-neutral-200 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                  Daily Sales Trend (Last 7 Days)
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">Authoritative revenue snapshots</p>
              </div>
              <span className="text-xs font-mono text-neutral-500">
                Month: {formatCurrency(data.month.revenue)}
              </span>
            </div>

            {/* Custom high-contrast Bar Chart */}
            <div className="flex-1 flex items-end gap-3 pt-6 pb-2 min-h-[160px]">
              {data.salesChart.map((bar, idx) => {
                const heightPct = Math.max(8, Math.round((bar.sales / maxChartSale) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-[10px] font-mono font-medium text-neutral-600 tabular-nums">
                      {bar.sales > 0 ? `₹${Math.round(bar.sales)}` : '-'}
                    </span>
                    <div className="w-full bg-neutral-100 rounded-t h-28 flex items-end overflow-hidden">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full bg-neutral-900 group-hover:bg-neutral-700 transition-all rounded-t"
                      />
                    </div>
                    <span className="text-[10px] text-neutral-500 mt-1 font-mono whitespace-nowrap">
                      {bar.label.split(',')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Method Distribution */}
          <div className="bg-white p-4 rounded border border-neutral-200 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide mb-1">
                Payment Distribution
              </h3>
              <p className="text-[11px] text-neutral-500 mb-4">Revenue breakdown by payment channel</p>

              <div className="space-y-3 text-xs">
                {Object.entries(data.paymentBreakdown).map(([method, info]) => {
                  const total = Object.values(data.paymentBreakdown).reduce((sum, item) => sum + item.total, 0);
                  const pct = total > 0 ? Math.round((info.total / total) * 100) : 0;
                  return (
                    <div key={method} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-neutral-800">{method}</span>
                        <span className="font-mono tabular-nums text-neutral-600">
                          {formatCurrency(info.total)} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-neutral-100 h-2 rounded overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full bg-neutral-800 rounded"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 flex justify-between">
              <span>All payment channels active</span>
              <span className="font-semibold text-neutral-800">100% Reconciled</span>
            </div>
          </div>
        </div>

        {/* Row 3: Inventory Alerts & Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Inventory Alerts Box */}
          <div className="bg-white p-4 rounded border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                  Stock Depletion Alerts
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('inventory')}
                className="text-xs text-neutral-700 hover:text-neutral-950 font-medium underline"
              >
                Manage Stock ({data.inventory.totalProductsCount} Items)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Low Stock Items</span>
                <span className="text-lg font-bold font-mono text-amber-700">
                  {data.inventory.lowStockCount}
                </span>
              </div>
              <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Out of Stock Items</span>
                <span className="text-lg font-bold font-mono text-red-600">
                  {data.inventory.outOfStockCount}
                </span>
              </div>
            </div>

            <div className="divide-y divide-neutral-100 text-xs">
              {data.inventory.lowStockItems.length === 0 ? (
                <div className="py-4 text-center text-neutral-400 text-xs">
                  All items are above minimum stock threshold.
                </div>
              ) : (
                data.inventory.lowStockItems.map((item) => (
                  <div key={item.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-neutral-900">{item.name}</div>
                      <div className="text-[10px] text-neutral-400 font-mono">SKU: {item.sku}</div>
                    </div>
                    <div className="text-right">
                      {item.isOut ? (
                        <span className="text-[11px] font-semibold text-red-600">OUT OF STOCK</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-700 font-mono">
                          {item.currentStock} {item.unit} remaining
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Selling Products */}
          <div className="bg-white p-4 rounded border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                Top Revenue Products
              </h3>
              <span className="text-[11px] text-neutral-400 font-mono">Historical Volume</span>
            </div>

            <div className="divide-y divide-neutral-100 text-xs">
              {data.topProducts.length === 0 ? (
                <div className="py-4 text-center text-neutral-400 text-xs">
                  No sales recorded yet.
                </div>
              ) : (
                data.topProducts.map((prod, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-neutral-400 text-xs w-4">
                        0{idx + 1}.
                      </span>
                      <div>
                        <div className="font-medium text-neutral-900">{prod.name}</div>
                        <div className="text-[10px] text-neutral-500 font-mono">
                          Units sold: {prod.quantity}
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold text-neutral-900 tabular-nums">
                      {formatCurrency(prod.revenue)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
