import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, downloadCSV } from '../../lib/utils';
import {
  FileBarChart2,
  Download,
  Calendar,
  Filter,
  TrendingUp,
  Receipt,
  Boxes,
  Users,
  RefreshCw,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'profit' | 'employees'>('sales');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [salesData, setSalesData] = useState<{ rows: any[]; summary: any } | null>(null);
  const [inventoryData, setInventoryData] = useState<{ rows: any[]; summary: any } | null>(null);
  const [profitData, setProfitData] = useState<{ summary: any } | null>(null);
  const [employeeData, setEmployeeData] = useState<any[]>([]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      if (activeTab === 'sales') {
        const res = await api.getSalesReport(params);
        setSalesData(res);
      } else if (activeTab === 'inventory') {
        const res = await api.getInventoryReport();
        setInventoryData(res);
      } else if (activeTab === 'profit') {
        const res = await api.getProfitReport(params);
        setProfitData(res);
      } else if (activeTab === 'employees') {
        const res = await api.getEmployeeReport(params);
        setEmployeeData(res);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [activeTab, dateFrom, dateTo]);

  // CSV Exporters
  const handleExportCSV = () => {
    if (activeTab === 'sales' && salesData?.rows) {
      downloadCSV(`sales_report_${new Date().toISOString().split('T')[0]}.csv`, salesData.rows);
    } else if (activeTab === 'inventory' && inventoryData?.rows) {
      downloadCSV(`inventory_valuation_${new Date().toISOString().split('T')[0]}.csv`, inventoryData.rows);
    } else if (activeTab === 'employees' && employeeData) {
      downloadCSV(`employee_performance_${new Date().toISOString().split('T')[0]}.csv`, employeeData);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto md:overflow-hidden">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-neutral-200 space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-neutral-900 leading-none">
              Financial & Audit Reports
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              Authoritative accounting ledgers, COGS cost analysis, and CSV export tools.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Tab Selector & Date Range Filter */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-100">
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded border border-neutral-200">
            {[
              { id: 'sales', label: 'Sales Ledger' },
              { id: 'inventory', label: 'Inventory Valuation' },
              { id: 'profit', label: 'P&L Statement' },
              { id: 'employees', label: 'Staff Performance' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-neutral-900 font-semibold shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab !== 'inventory' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-500 font-medium">Date Range:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1 bg-white border border-neutral-300 rounded text-xs focus:outline-none"
              />
              <span className="text-neutral-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1 bg-white border border-neutral-300 rounded text-xs focus:outline-none"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="text-neutral-500 hover:text-neutral-900 text-[11px]"
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400">Loading report data...</div>
        ) : activeTab === 'sales' && salesData ? (
          <div className="space-y-4">
            {/* Sales Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-3 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Total Revenue</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {formatCurrency(salesData.summary.totalRevenue)}
                </span>
              </div>
              <div className="bg-white p-3 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Tax Collected</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {formatCurrency(salesData.summary.totalTax)}
                </span>
              </div>
              <div className="bg-white p-3 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Total Discounts</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {formatCurrency(salesData.summary.totalDiscount)}
                </span>
              </div>
              <div className="bg-white p-3 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Completed Bills</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {salesData.summary.completedBills}
                </span>
              </div>
            </div>

            {/* Sales Rows Table */}
            <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                    <th className="py-2.5 px-3">Bill Number</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Cashier</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                    <th className="py-2.5 px-3 text-right">Tax</th>
                    <th className="py-2.5 px-3 text-right">Discount</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-right">COGS Cost</th>
                    <th className="py-2.5 px-3 text-right">Gross Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {salesData.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-50">
                      <td className="py-2 px-3 font-mono font-medium text-neutral-900">{row.billNumber}</td>
                      <td className="py-2 px-3 text-neutral-600 font-mono text-[11px]">{formatDateTime(row.date)}</td>
                      <td className="py-2 px-3 text-neutral-700">{row.cashier}</td>
                      <td className="py-2 px-3 font-mono text-[11px]">{row.paymentMethod}</td>
                      <td className="py-2 px-3 text-right font-mono text-neutral-600 tabular-nums">{formatCurrency(row.subtotal)}</td>
                      <td className="py-2 px-3 text-right font-mono text-neutral-600 tabular-nums">{formatCurrency(row.tax)}</td>
                      <td className="py-2 px-3 text-right font-mono text-neutral-600 tabular-nums">{formatCurrency(row.discount)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-neutral-900 tabular-nums">{formatCurrency(row.total)}</td>
                      <td className="py-2 px-3 text-right font-mono text-neutral-500 tabular-nums">{formatCurrency(row.cogs)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">{formatCurrency(row.grossMargin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'inventory' && inventoryData ? (
          <div className="space-y-4">
            {/* Inventory Valuation KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-3 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Total Purchase Cost Valuation</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {formatCurrency(inventoryData.summary.totalPurchaseValuation)}
                </span>
              </div>
              <div className="bg-white p-3 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Retail Value Potential</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {formatCurrency(inventoryData.summary.totalRetailValuation)}
                </span>
              </div>
              <div className="bg-white p-3 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Gross Profit Potential</span>
                <span className="text-lg font-bold font-mono text-emerald-700 tabular-nums">
                  {formatCurrency(inventoryData.summary.estimatedGrossProfitPotential)}
                </span>
              </div>
              <div className="bg-white p-3 rounded border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Total Stock SKUs</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {inventoryData.summary.totalProducts}
                </span>
              </div>
            </div>

            <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">On Hand</th>
                    <th className="py-2.5 px-3 text-right">Unit Cost</th>
                    <th className="py-2.5 px-3 text-right">Selling Price</th>
                    <th className="py-2.5 px-3 text-right">Total Cost Value</th>
                    <th className="py-2.5 px-3 text-right">Retail Potential</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {inventoryData.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-50">
                      <td className="py-2 px-3 font-medium text-neutral-900">{row.name}</td>
                      <td className="py-2 px-3 font-mono text-neutral-500">{row.sku}</td>
                      <td className="py-2 px-3 text-neutral-600">{row.category}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-neutral-900 tabular-nums">
                        {row.currentStock} {row.unit}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-neutral-600 tabular-nums">{formatCurrency(row.purchasePrice)}</td>
                      <td className="py-2 px-3 text-right font-mono text-neutral-900 tabular-nums">{formatCurrency(row.sellingPrice)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-neutral-900 tabular-nums">{formatCurrency(row.purchaseValuation)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums">{formatCurrency(row.retailValuation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'profit' && profitData ? (
          <div className="max-w-xl mx-auto bg-white p-6 rounded border border-neutral-200 shadow-xs space-y-4 text-xs">
            <h3 className="text-sm font-bold text-neutral-900 border-b border-neutral-200 pb-2">
              Profit & Loss Statement (P&L)
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between py-1 text-neutral-700 font-medium">
                <span>Gross Sales Revenue ({profitData.summary.billsCount} bills)</span>
                <span className="font-mono text-neutral-900 font-bold tabular-nums">
                  {formatCurrency(profitData.summary.revenue)}
                </span>
              </div>

              <div className="flex justify-between py-1 text-neutral-700 font-medium pl-4 border-l-2 border-neutral-200">
                <span>Cost of Goods Sold (COGS Snapshots)</span>
                <span className="font-mono text-neutral-500 tabular-nums">
                  - {formatCurrency(profitData.summary.cogs)}
                </span>
              </div>

              <div className="flex justify-between py-2 border-t border-b border-neutral-200 font-bold text-emerald-800">
                <span>Gross Profit (Margin: {profitData.summary.grossMarginPercent}%)</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(profitData.summary.grossProfit)}
                </span>
              </div>

              <div className="flex justify-between py-1 text-neutral-700 font-medium pl-4 border-l-2 border-neutral-200">
                <span>Operational Store Expenses</span>
                <span className="font-mono text-neutral-500 tabular-nums">
                  - {formatCurrency(profitData.summary.totalExpenses)}
                </span>
              </div>

              <div className="flex justify-between py-3 border-t-2 border-neutral-900 font-bold text-sm text-neutral-900">
                <span>ESTIMATED NET OPERATING PROFIT</span>
                <span className={`font-mono tabular-nums text-base ${profitData.summary.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatCurrency(profitData.summary.netProfit)}
                </span>
              </div>
            </div>
          </div>
        ) : activeTab === 'employees' ? (
          <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                  <th className="py-2.5 px-3">Employee Name</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3 text-center">Bills Created</th>
                  <th className="py-2.5 px-3 text-center">Items Sold</th>
                  <th className="py-2.5 px-3 text-right">Total Revenue Billed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {employeeData.map((emp, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 font-medium text-neutral-900">{emp.employeeName}</td>
                    <td className="py-2 px-3 font-mono text-neutral-500">{emp.email}</td>
                    <td className="py-2 px-3 font-mono text-neutral-600 text-[11px]">{emp.role}</td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums">{emp.billsCount}</td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums">{emp.itemsSold}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-neutral-900 tabular-nums">
                      {formatCurrency(emp.totalSales)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};
