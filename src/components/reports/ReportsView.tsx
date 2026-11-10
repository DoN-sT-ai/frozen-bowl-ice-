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
  const [activeTab, setActiveTab] = useState<'sales' | 'credit_notes' | 'inventory' | 'profit' | 'employees'>('sales');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [salesData, setSalesData] = useState<{ rows: any[]; summary: any; creditNotes?: any[] } | null>(null);
  const [creditNotesData, setCreditNotesData] = useState<any[]>([]);
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
      } else if (activeTab === 'credit_notes') {
        const res = await api.getCreditNotes(params);
        setCreditNotesData(res);
      } else if (activeTab === 'inventory') {
        const res = await api.getInventoryReport();
        setInventoryData(res);
      } else if (activeTab === 'profit') {
        const res = await api.getProfitReport(params);
        setProfitData(res);
      } else if (activeTab === 'employees') {
        const res = await api.getEmployeeReport(params);
        const nonDevStaff = Array.isArray(res)
          ? res.filter(
              (emp: any) =>
                emp.role !== 'DEVELOPER' &&
                (emp.employeeName || '').toLowerCase() !== 'developer' &&
                !(emp.email || '').toLowerCase().includes('developer')
            )
          : [];
        setEmployeeData(nonDevStaff);
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

  // CSV Exporters with Statutory Compliance (Invoices immutable, Credit Notes as new separate rows)
  const handleExportCSV = () => {
    if (activeTab === 'sales' && salesData?.rows) {
      const exportRows = salesData.rows.map((r: any) => {
        const isCreditNote = r.recordType === 'CREDIT_NOTE' || (r.voucherNumber && r.voucherNumber.startsWith('CN-'));
        return {
          'Document Type': isCreditNote ? 'CREDIT_NOTE' : 'INVOICE',
          'Voucher Number': r.voucherNumber || r.billNumber,
          'Original Bill Reference': r.referenceInvoiceNumber && r.referenceInvoiceNumber !== '-' ? r.referenceInvoiceNumber : (isCreditNote ? r.billNumber : '-'),
          'Date': formatDateTime(r.date),
          'Customer Name': r.customerName || 'Walk-in Customer',
          'Customer Phone': r.customerPhone || '-',
          'Subtotal (₹)': Number(r.subtotal).toFixed(2),
          'GST Tax (₹)': Number(r.tax).toFixed(2),
          'Discount (₹)': Number(r.discount || 0).toFixed(2),
          'Total Amount (₹)': Number(r.amount !== undefined ? r.amount : r.total).toFixed(2),
          'Payment Method': r.paymentMethod || '-',
          'Document Status': isCreditNote ? 'ISSUED' : (r.status || 'COMPLETED'),
          'Notes / Reason': r.notes || '-',
          'Cashier / Staff': r.cashier || '-',
        };
      });
      downloadCSV(`sales_and_credit_notes_ledger_${new Date().toISOString().split('T')[0]}.csv`, exportRows);
    } else if (activeTab === 'credit_notes' && creditNotesData) {
      const exportNotes = creditNotesData.map((cn: any) => ({
        'Credit Note Number': cn.credit_note_number,
        'Original Bill Reference': cn.bill_number,
        'Date': formatDateTime(cn.created_at),
        'Customer Name': cn.customer_name || 'Walk-in',
        'Customer Phone': cn.customer_phone || '-',
        'Taxable Subtotal (₹)': Number(cn.refund_amount - (cn.refund_tax || 0)).toFixed(2),
        'GST Tax (₹)': Number(cn.refund_tax || 0).toFixed(2),
        'Refund Amount (₹)': Number(cn.refund_amount).toFixed(2),
        'Refund Method': cn.refund_method,
        'Restocked to Stock': cn.restock_items ? 'YES' : 'NO',
        'Reason for Return': cn.reason || '-',
        'Issued By': cn.created_by_name || 'Staff',
      }));
      downloadCSV(`credit_notes_schedule_${new Date().toISOString().split('T')[0]}.csv`, exportNotes);
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
              { id: 'credit_notes', label: 'Credit Notes & Refunds' },
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block font-medium">Net Revenue</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {formatCurrency(salesData.summary.netRevenue ?? salesData.summary.totalRevenue)}
                </span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">Gross minus refunds</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Gross Sales</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {formatCurrency(salesData.summary.grossRevenue ?? salesData.summary.totalRevenue)}
                </span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">{salesData.summary.totalBills} bills</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block font-medium">Customer Refunds</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  -{formatCurrency(salesData.summary.totalRefunds || 0)}
                </span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">
                  {salesData.summary.creditNotesCount || 0} credit notes
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Tax Collected (Net)</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {formatCurrency(salesData.summary.totalTax)}
                </span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">GST Liability</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block">Completed Orders</span>
                <span className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
                  {salesData.summary.completedBills}
                </span>
                <span className="text-[10px] text-neutral-400 block mt-0.5">
                  {salesData.summary.refundedBills || 0} refunded
                </span>
              </div>
            </div>

            {/* Sales & Financial Ledger Table */}
            <div className="bg-white rounded-lg border border-neutral-200 shadow-xs overflow-hidden">
              <div className="p-3 bg-neutral-50/80 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-neutral-800">Unified Statutory Accounting Ledger</span>
                  <span className="text-[11px] text-neutral-500 ml-2">
                    Tax Invoices (immutable) &amp; Credit Notes (separate statutory refund adjustment records)
                  </span>
                </div>
                <div className="text-[11px] font-mono text-neutral-500">
                  {salesData.rows.length} total ledger entries
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[950px]">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Voucher #</th>
                      <th className="py-2.5 px-3">Ref Invoice</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3 text-right">Taxable Subtotal</th>
                      <th className="py-2.5 px-3 text-right">GST Tax</th>
                      <th className="py-2.5 px-3 text-right">Ledger Amount</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-sans">
                    {salesData.rows.map((row: any) => {
                      const isCN = row.recordType === 'CREDIT_NOTE' || (row.voucherNumber && row.voucherNumber.startsWith('CN-'));
                      return (
                        <tr key={row.id} className={`transition-colors ${isCN ? 'bg-neutral-50/70 hover:bg-neutral-100/60' : 'hover:bg-neutral-50'}`}>
                          {/* Type */}
                          <td className="py-2 px-3">
                            {isCN ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-900 text-white font-mono">
                                CREDIT NOTE
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200 font-mono">
                                TAX INVOICE
                              </span>
                            )}
                          </td>

                          {/* Voucher Number */}
                          <td className="py-2 px-3 font-mono font-bold text-neutral-900">
                            {row.voucherNumber || row.billNumber}
                          </td>

                          {/* Ref Invoice */}
                          <td className="py-2 px-3 font-mono text-neutral-600">
                            {row.referenceInvoiceNumber && row.referenceInvoiceNumber !== '-' ? (
                              <span className="font-semibold text-neutral-800">{row.referenceInvoiceNumber}</span>
                            ) : (
                              <span className="text-neutral-400">-</span>
                            )}
                          </td>

                          {/* Date */}
                          <td className="py-2 px-3 text-neutral-600 font-mono text-[11px]">
                            {formatDateTime(row.date)}
                          </td>

                          {/* Customer */}
                          <td className="py-2 px-3 text-neutral-700">
                            <span className="font-medium">{row.customerName || 'Walk-in'}</span>
                            {row.customerPhone && (
                              <span className="text-[10px] font-mono text-neutral-400 block">{row.customerPhone}</span>
                            )}
                          </td>

                          {/* Method */}
                          <td className="py-2 px-3 font-mono text-[11px] text-neutral-700">
                            {row.paymentMethod}
                          </td>

                          {/* Taxable Subtotal */}
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-neutral-700">
                            {formatCurrency(row.subtotal)}
                          </td>

                          {/* GST Tax */}
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-neutral-700">
                            {formatCurrency(row.tax)}
                          </td>

                          {/* Ledger Amount */}
                          <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-neutral-900">
                            {isCN ? `-${formatCurrency(Math.abs(row.total))}` : formatCurrency(row.total)}
                          </td>

                          {/* Status */}
                          <td className="py-2 px-3 text-center">
                            {isCN ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                                ISSUED
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
                                COMPLETED
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'credit_notes' ? (
          /* ========================================================= */
          /* CREDIT NOTES & REFUNDS REPORT VIEW                        */
          /* ========================================================= */
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block font-medium">Total Refund Payouts</span>
                <span className="text-xl font-bold font-mono text-neutral-900 tabular-nums">
                  -{formatCurrency(creditNotesData.reduce((sum, cn) => sum + (Number(cn.refund_amount) || 0), 0))}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block font-medium">Credit Notes Issued</span>
                <span className="text-xl font-bold font-mono text-neutral-900 tabular-nums">
                  {creditNotesData.length}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[11px] text-neutral-500 block font-medium">Inventory Restock Rate</span>
                <span className="text-xl font-bold font-mono text-neutral-900 tabular-nums">
                  {creditNotesData.length > 0
                    ? `${Math.round((creditNotesData.filter((cn) => cn.restock_items).length / creditNotesData.length) * 100)}%`
                    : '100%'}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 shadow-xs overflow-hidden">
              {creditNotesData.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">
                  No credit notes or customer refunds recorded for the selected period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-700 font-semibold">
                        <th className="py-2.5 px-3">Credit Note #</th>
                        <th className="py-2.5 px-3">Original Invoice</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3">Refund Method</th>
                        <th className="py-2.5 px-3">Reason</th>
                        <th className="py-2.5 px-3 text-right">Refund Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {creditNotesData.map((cn) => (
                        <tr key={cn.id} className="hover:bg-neutral-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-neutral-900">
                            {cn.credit_note_number}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-neutral-900">
                            {cn.bill_number}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-600 font-mono text-[11px]">
                            {formatDateTime(cn.created_at)}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-700">
                            {cn.customer_name || 'Walk-in'} {cn.customer_phone ? `(${cn.customer_phone})` : ''}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 font-mono text-[10px] font-bold">
                              {cn.refund_method}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-neutral-600 max-w-[200px] truncate" title={cn.reason}>
                            {cn.reason}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-mono font-bold text-neutral-900">
                            -{formatCurrency(cn.refund_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                {employeeData
                  .filter(
                    (emp: any) =>
                      emp.role !== 'DEVELOPER' &&
                      (emp.employeeName || '').toLowerCase() !== 'developer' &&
                      !(emp.email || '').toLowerCase().includes('developer')
                  )
                  .map((emp, idx) => (
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
                {employeeData.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-400">
                      No staff performance data available for this store.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};
