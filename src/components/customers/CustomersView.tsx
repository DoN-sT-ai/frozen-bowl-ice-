import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { sendWhatsAppMessage } from '../../lib/whatsappService';
import type { CustomerAnalyticsResponse, CustomerAnalyticsItem, CustomerHistoryResponse, Sale } from '../../types';
import {
  Users,
  UserCheck,
  Star,
  TrendingUp,
  Calendar,
  Phone,
  MessageSquare,
  Download,
  RefreshCw,
  Search,
  X,
  Receipt,
  ShoppingBag,
  Clock,
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export const CustomersView: React.FC = () => {
  const [data, setData] = useState<CustomerAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'repeat' | 'vip' | 'this_week' | 'top_spenders'>('all');
  
  // History Modal State
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<CustomerHistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Quick WhatsApp Message Modal
  const [whatsappModalCustomer, setWhatsappModalCustomer] = useState<CustomerAnalyticsItem | null>(null);
  const [whatsappCustomText, setWhatsappCustomText] = useState<string>('');
  const [whatsappSending, setWhatsappSending] = useState<boolean>(false);

  const fetchAnalytics = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const res = await api.getCustomerAnalytics();
      setData(res);
    } catch (err: any) {
      console.error('Failed to load customer analytics:', err);
      setLoadError(err?.message || 'Failed to load customer analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const openCustomerHistory = async (phone: string) => {
    setSelectedCustomerPhone(phone);
    setLoadingHistory(true);
    setHistoryData(null);
    try {
      const res = await api.getCustomerHistory(phone);
      setHistoryData(res);
    } catch (err) {
      console.error('Failed to load customer history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openWhatsAppDialog = (customer: CustomerAnalyticsItem) => {
    setWhatsappModalCustomer(customer);
    const greeting = `Hello ${customer.customer_name || 'valued customer'}, thank you for shopping with us! As a valued ${customer.tier === 'VIP' ? 'VIP patron' : 'customer'}, we appreciate your continued visits.`;
    setWhatsappCustomText(greeting);
  };

  const handleSendWhatsApp = async () => {
    if (!whatsappModalCustomer) return;
    setWhatsappSending(true);
    try {
      await sendWhatsAppMessage({
        phone: whatsappModalCustomer.customer_phone,
        text: whatsappCustomText,
      });
      setWhatsappModalCustomer(null);
    } catch (err) {
      console.error('Failed to send WhatsApp message:', err);
    } finally {
      setWhatsappSending(false);
    }
  };

  const handleSendBillWhatsApp = async (sale: Sale, customerPhone: string) => {
    const lines = [
      `*BILL RECEIPT*`,
      `Invoice #: ${sale.bill_number}`,
      `Date: ${new Date(sale.created_at).toLocaleString()}`,
      `--------------------------------`,
      ...(sale.items || []).map(i => `${i.product_name_snapshot} x${i.quantity} = ₹${i.line_total.toFixed(2)}`),
      `--------------------------------`,
      `*Total: ₹${sale.total.toFixed(2)}*`,
      `Payment: ${sale.payment_method}`,
      `Thank you for your visit!`,
    ];
    await sendWhatsAppMessage({
      phone: customerPhone,
      text: lines.join('\n'),
    });
  };

  // Filter and Search
  const filteredCustomers = useMemo(() => {
    if (!data?.customers) return [];
    let list = [...data.customers];

    // Filter pills
    if (activeFilter === 'repeat') {
      list = list.filter(c => c.total_visits >= 2);
    } else if (activeFilter === 'vip') {
      list = list.filter(c => c.tier === 'VIP' || c.total_visits >= 5);
    } else if (activeFilter === 'this_week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      list = list.filter(c => new Date(c.last_visit) >= oneWeekAgo);
    } else if (activeFilter === 'top_spenders') {
      list = [...list].sort((a, b) => b.total_spend - a.total_spend);
    }

    // Search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        c.customer_phone.toLowerCase().includes(q) ||
        c.customer_name.toLowerCase().includes(q) ||
        (c.customer_gstin && c.customer_gstin.toLowerCase().includes(q))
      );
    }

    return list;
  }, [data, activeFilter, searchQuery]);

  // Export to CSV
  const exportToCSV = () => {
    if (!data?.customers || data.customers.length === 0) return;
    const headers = ['Customer Name', 'Phone Number', 'GSTIN', 'Tier', 'Total Visits', 'Total Spend (INR)', 'Average Bill (INR)', 'First Visit', 'Last Visit', 'Favorite Items'];
    const rows = filteredCustomers.map(c => [
      `"${c.customer_name.replace(/"/g, '""')}"`,
      `"${c.customer_phone}"`,
      `"${c.customer_gstin || ''}"`,
      `"${c.tier}"`,
      c.total_visits,
      c.total_spend.toFixed(2),
      c.avg_bill_value.toFixed(2),
      `"${new Date(c.first_visit).toLocaleDateString()}"`,
      `"${new Date(c.last_visit).toLocaleDateString()}"`,
      `"${(c.favorite_items || []).join(', ').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `customers_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = data?.summary;
  const weeklyTrends = data?.weekly_trends || [];
  const maxTrendVisits = Math.max(...weeklyTrends.map(t => t.visit_count), 1);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-50 overflow-y-auto">
      {/* Top Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-10">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-neutral-900 tracking-tight">Customers & Loyalty</h1>
            <span className="px-2 py-0.5 text-[10px] font-mono font-medium bg-neutral-100 text-neutral-600 rounded-full border border-neutral-200">
              {filteredCustomers.length} Records
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Track repeat customer frequency, weekly visit reports, top patrons and direct WhatsApp engagement
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAnalytics(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-neutral-700 border border-neutral-200 rounded-md hover:bg-neutral-50 transition-colors disabled:opacity-50"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={exportToCSV}
            disabled={filteredCustomers.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors disabled:opacity-50 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {loadError && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between">
            <span>{loadError}</span>
            <button
              onClick={() => fetchAnalytics(true)}
              className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Unique Customers */}
          <div className="bg-white p-4 rounded-lg border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-2">
              <span className="text-xs font-medium text-neutral-600">Total Customers</span>
              <Users className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-neutral-900">
              {loading ? '...' : (summary?.total_unique_customers ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
              <span>Lifetime unique customer phones</span>
            </div>
          </div>

          {/* Repeat Customers & Repeat Rate */}
          <div className="bg-white p-4 rounded-lg border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-2">
              <span className="text-xs font-medium text-neutral-600">Repeat Customers</span>
              <UserCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-neutral-900">
                {loading ? '...' : (summary?.repeat_customers ?? 0).toLocaleString()}
              </span>
              <span className="text-xs font-semibold font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                {summary?.repeat_rate ? `${summary.repeat_rate}%` : '0%'}
              </span>
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              Customers with 2 or more store visits
            </div>
          </div>

          {/* Weekly Visits & Comparison */}
          <div className="bg-white p-4 rounded-lg border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-2">
              <span className="text-xs font-medium text-neutral-600">Visits This Week</span>
              <TrendingUp className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-neutral-900">
                {loading ? '...' : (summary?.visits_this_week ?? 0).toLocaleString()}
              </span>
              {summary && summary.visits_last_week > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${
                  summary.visits_this_week >= summary.visits_last_week
                    ? 'text-emerald-700 bg-emerald-50'
                    : 'text-amber-700 bg-amber-50'
                }`}>
                  {summary.visits_this_week >= summary.visits_last_week ? '+' : ''}
                  {Math.round(((summary.visits_this_week - summary.visits_last_week) / summary.visits_last_week) * 100)}% vs last wk
                </span>
              )}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              Last week: {summary?.visits_last_week ?? 0} customer visits
            </div>
          </div>

          {/* New Customers This Week */}
          <div className="bg-white p-4 rounded-lg border border-neutral-200 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 mb-2">
              <span className="text-xs font-medium text-neutral-600">New Customers</span>
              <Star className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-neutral-900">
              {loading ? '...' : (summary?.new_customers_this_week ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              First-time visitors in the last 7 days
            </div>
          </div>
        </div>

        {/* Weekly Report & Daily Visit Trend */}
        <div className="bg-white p-5 rounded-lg border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-700">
                Weekly Customer Visit Report (Last 7 Days)
              </h2>
              <p className="text-[11px] text-neutral-500">
                Daily footfall pattern and repeat visits across the past week
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-mono">
              <Calendar className="w-3.5 h-3.5 text-neutral-400" />
              <span>7-Day Pulse</span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-2">
            {weeklyTrends.map((trend) => {
              const heightPercent = Math.max(12, Math.round((trend.visit_count / maxTrendVisits) * 100));
              const isToday = trend.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={trend.date} className="flex flex-col items-center">
                  <div className="text-[11px] font-mono font-semibold text-neutral-700 mb-1">
                    {trend.visit_count}
                  </div>
                  <div className="w-full bg-neutral-100 rounded-t h-28 flex items-end p-1 relative group">
                    <div
                      className={`w-full rounded-t transition-all duration-300 ${
                        isToday ? 'bg-neutral-900' : 'bg-neutral-400 group-hover:bg-neutral-600'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-20 pointer-events-none shadow-md font-mono">
                      <div>{trend.visit_count} visits</div>
                      <div>₹{trend.revenue.toFixed(0)} sales</div>
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    <div className={`text-[11px] font-medium ${isToday ? 'text-neutral-900 font-bold' : 'text-neutral-600'}`}>
                      {trend.day_name}
                    </div>
                    <div className="text-[9px] font-mono text-neutral-400">
                      {trend.date.slice(5)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Search, Filter Bar and Customer Directory Table */}
        <div className="bg-white rounded-lg border border-neutral-200 shadow-xs overflow-hidden">
          {/* Controls bar */}
          <div className="p-4 border-b border-neutral-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                All ({data?.customers?.length || 0})
              </button>
              <button
                onClick={() => setActiveFilter('repeat')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeFilter === 'repeat'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                Repeat (2+ visits)
              </button>
              <button
                onClick={() => setActiveFilter('vip')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeFilter === 'vip'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                VIP (5+ visits)
              </button>
              <button
                onClick={() => setActiveFilter('this_week')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeFilter === 'this_week'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                Visited This Week
              </button>
              <button
                onClick={() => setActiveFilter('top_spenders')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeFilter === 'top_spenders'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                Top Spenders
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search phone or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-mono text-[11px] uppercase">
                  <th className="py-2.5 px-4 font-medium">Customer</th>
                  <th className="py-2.5 px-4 font-medium">Tier</th>
                  <th className="py-2.5 px-4 font-medium text-center">Visits</th>
                  <th className="py-2.5 px-4 font-medium text-right">Total Spent</th>
                  <th className="py-2.5 px-4 font-medium text-right">Avg Bill</th>
                  <th className="py-2.5 px-4 font-medium">Last Visit</th>
                  <th className="py-2.5 px-4 font-medium">Favorite Items</th>
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-neutral-400 font-mono">
                      Loading customer analytics...
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-neutral-500">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <Users className="w-6 h-6 text-neutral-300" />
                        <p className="font-medium text-xs text-neutral-600">No customers found</p>
                        <p className="text-[11px] text-neutral-400">
                          {searchQuery
                            ? `No records matching "${searchQuery}"`
                            : 'Customers will automatically appear here as they are billed at POS.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => (
                    <tr
                      key={cust.customer_phone}
                      className="hover:bg-neutral-50/80 transition-colors group"
                    >
                      {/* Name & Phone */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                          <span>{cust.customer_name || 'Customer'}</span>
                          {cust.tier === 'VIP' && (
                            <span className="text-[10px] text-amber-600 font-normal">★ VIP</span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-neutral-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-neutral-400" />
                          <span>{cust.customer_phone}</span>
                          {cust.customer_gstin && (
                            <span className="text-[9px] bg-neutral-100 px-1 py-0.2 rounded border border-neutral-200">
                              GST: {cust.customer_gstin}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tier Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                            cust.tier === 'VIP'
                              ? 'bg-neutral-900 text-white border-neutral-900 font-bold'
                              : cust.tier === 'REGULAR'
                              ? 'bg-neutral-100 text-neutral-800 border-neutral-300'
                              : 'bg-white text-neutral-500 border-neutral-200'
                          }`}
                        >
                          {cust.tier}
                        </span>
                      </td>

                      {/* Visit Count */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 font-mono font-semibold px-2 py-0.5 rounded text-xs ${
                          cust.total_visits >= 5
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : cust.total_visits >= 2
                            ? 'bg-neutral-100 text-neutral-800 border border-neutral-200'
                            : 'text-neutral-600'
                        }`}>
                          {cust.total_visits} {cust.total_visits === 1 ? 'visit' : 'visits'}
                        </span>
                      </td>

                      {/* Total Spent */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-neutral-900">
                        ₹{cust.total_spend.toFixed(2)}
                      </td>

                      {/* Avg Bill */}
                      <td className="py-3 px-4 text-right font-mono text-neutral-600">
                        ₹{cust.avg_bill_value.toFixed(2)}
                      </td>

                      {/* Last Visit */}
                      <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">
                        {new Date(cust.last_visit).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>

                      {/* Favorite Items */}
                      <td className="py-3 px-4">
                        {cust.favorite_items && cust.favorite_items.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {cust.favorite_items.slice(0, 2).map((item, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-1.5 py-0.5 bg-neutral-100 text-neutral-700 text-[10px] rounded border border-neutral-200 truncate max-w-[130px]"
                                title={item}
                              >
                                {item}
                              </span>
                            ))}
                            {cust.favorite_items.length > 2 && (
                              <span className="text-[10px] text-neutral-400 font-mono self-center">
                                +{cust.favorite_items.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openWhatsAppDialog(cust)}
                            className="p-1.5 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded border border-emerald-200 transition-colors"
                            title="Send WhatsApp Message (Local App or Web)"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openCustomerHistory(cust.customer_phone)}
                            className="px-2 py-1 text-[11px] font-medium bg-neutral-100 text-neutral-800 hover:bg-neutral-200 rounded border border-neutral-200 transition-colors flex items-center gap-1"
                          >
                            <span>Orders</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Customer Purchase History Modal */}
      {selectedCustomerPhone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg border border-neutral-200 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">
                  {historyData?.customer?.customer_name || 'Customer'} - Order History
                </h3>
                <p className="text-xs font-mono text-neutral-500 mt-0.5">
                  Phone: {selectedCustomerPhone} • {historyData?.customer?.total_visits || 0} Total Visits • Lifetime Spend: ₹{(historyData?.customer?.total_spend || 0).toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setSelectedCustomerPhone(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {loadingHistory ? (
                <div className="py-12 text-center text-xs font-mono text-neutral-400">
                  Loading order history...
                </div>
              ) : !historyData || historyData.sales.length === 0 ? (
                <div className="py-12 text-center text-xs text-neutral-500">
                  No previous bills found for this phone number.
                </div>
              ) : (
                historyData.sales.map((sale) => (
                  <div
                    key={sale.id}
                    className="p-3.5 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2 hover:bg-white transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-neutral-500" />
                        <span className="font-mono font-semibold text-xs text-neutral-900">
                          {sale.bill_number}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700">
                          {sale.payment_method}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-neutral-900">
                          ₹{sale.total.toFixed(2)}
                        </span>
                        <button
                          onClick={() => handleSendBillWhatsApp(sale, selectedCustomerPhone)}
                          className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded flex items-center gap-1 transition-colors"
                          title="Resend this bill via WhatsApp"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] text-neutral-500 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3 text-neutral-400" />
                      <span>{new Date(sale.created_at).toLocaleString()}</span>
                    </div>

                    {/* Items snippet */}
                    <div className="border-t border-neutral-200/60 pt-2 flex flex-wrap gap-1.5">
                      {(sale.items || []).map((item, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-white px-2 py-0.5 rounded border border-neutral-200 text-neutral-700 font-mono"
                        >
                          {item.product_name_snapshot} × {item.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-neutral-200 bg-neutral-50 flex justify-end">
              <button
                onClick={() => setSelectedCustomerPhone(null)}
                className="px-3 py-1.5 text-xs font-medium bg-neutral-900 text-white rounded-md hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick WhatsApp Message Modal */}
      {whatsappModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg border border-neutral-200 w-full max-w-md flex flex-col shadow-xl animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-neutral-900">
                  Send WhatsApp to {whatsappModalCustomer.customer_name}
                </h3>
              </div>
              <button
                onClick={() => setWhatsappModalCustomer(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-xs text-neutral-600">
                Customer Phone: <span className="font-mono font-semibold text-neutral-900">{whatsappModalCustomer.customer_phone}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Message Text:
                </label>
                <textarea
                  rows={4}
                  value={whatsappCustomText}
                  onChange={(e) => setWhatsappCustomText(e.target.value)}
                  className="w-full p-2.5 text-xs bg-neutral-50 border border-neutral-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  placeholder="Type your message here..."
                />
              </div>

              <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200 text-[11px] text-neutral-500 space-y-1">
                <div className="font-semibold text-neutral-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Desktop App Priority Dispatch</span>
                </div>
                <p>
                  Will attempt to open your locally installed WhatsApp Desktop app. If not installed, it automatically launches WhatsApp Web in your browser.
                </p>
              </div>
            </div>

            <div className="p-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setWhatsappModalCustomer(null)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSendWhatsApp}
                disabled={whatsappSending || !whatsappCustomText.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-md flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{whatsappSending ? 'Sending...' : 'Send WhatsApp'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
