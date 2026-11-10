import React, { useState, useEffect, useMemo } from 'react';
import { Sale, SaleItem, CreditNote } from '../../types';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDateTime, downloadCSV } from '../../lib/utils';
import { CreditNoteModal } from '../billing/CreditNoteModal';
import {
  RotateCcw,
  Search,
  CheckCircle2,
  AlertCircle,
  Printer,
  Share2,
  FileText,
  Boxes,
  Banknote,
  CreditCard,
  ArrowRight,
  Clock,
  User,
  Phone,
  Calendar,
  ChevronRight,
  TrendingDown,
  Layers,
  Filter,
  RefreshCw,
  Plus,
  Minus,
  Check,
  X,
  Eye,
  ShieldCheck,
  Receipt,
  Download,
} from 'lucide-react';

interface SingleItemRefundState {
  saleItemId: string;
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  purchasedQty: number;
  alreadyRefundedQty: number;
  remainingQty: number;
  refundQty: number;
  selected: boolean;
  restock: boolean;
  lineTotal: number;
}

export const RefundsView: React.FC = () => {
  const { store, user } = useAuth();

  // Navigation sub-tabs inside Refunds
  const [activeSubTab, setActiveSubTab] = useState<'process' | 'ledger' | 'analytics'>('process');

  // Search & Selected Bill state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [loadingSales, setLoadingSales] = useState<boolean>(false);

  // Credit Notes list state
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loadingCreditNotes, setLoadingCreditNotes] = useState<boolean>(false);
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [ledgerDateFrom, setLedgerDateFrom] = useState<string>('');
  const [ledgerDateTo, setLedgerDateTo] = useState<string>('');

  // Single Item Refund Form State
  const [itemsToRefund, setItemsToRefund] = useState<SingleItemRefundState[]>([]);
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'STORE_CREDIT'>('CASH');
  const [refundReason, setRefundReason] = useState<string>('Customer returned item');
  const [customReason, setCustomReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active Credit Note Voucher Modal
  const [viewingCreditNote, setViewingCreditNote] = useState<CreditNote | null>(null);

  // Load recent sales & credit notes on mount
  useEffect(() => {
    loadRecentSales();
    loadCreditNotes();
  }, []);

  const loadRecentSales = async () => {
    try {
      setLoadingSales(true);
      const res = await api.getSales({ limit: 100 });
      setRecentSales(res);
    } catch (err: any) {
      console.error('Failed to load recent sales:', err);
    } finally {
      setLoadingSales(false);
    }
  };

  const loadCreditNotes = async () => {
    try {
      setLoadingCreditNotes(true);
      const res = await api.getCreditNotes();
      setCreditNotes(res);
    } catch (err: any) {
      console.error('Failed to load credit notes:', err);
    } finally {
      setLoadingCreditNotes(false);
    }
  };

  // Filter sales based on search query (Bill Number, Customer Phone, Customer Name)
  const filteredSales = useMemo(() => {
    if (!searchQuery.trim()) {
      return recentSales.slice(0, 15);
    }
    const q = searchQuery.trim().toLowerCase();
    return recentSales.filter(
      (s) =>
        s.bill_number.toLowerCase().includes(q) ||
        (s.customer_phone && s.customer_phone.includes(q)) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
        (s.id && s.id.toLowerCase().includes(q))
    );
  }, [recentSales, searchQuery]);

  // When a sale is selected, initialize the single elements table
  const handleSelectSale = async (sale: Sale) => {
    setSelectedSale(sale);
    setStatusMessage(null);
    setRefundReason('Customer returned item');
    setCustomReason('');

    // Default refund method matches original payment method if applicable
    if (sale.payment_method === 'CASH') setRefundMethod('CASH');
    else if (sale.payment_method === 'UPI') setRefundMethod('UPI');
    else if (sale.payment_method === 'CARD') setRefundMethod('CARD');
    else setRefundMethod('CASH');

    // Calculate existing refunds per item from credit notes
    const relatedNotes = creditNotes.filter((cn) => cn.sale_id === sale.id);
    const refundedQtyMap = new Map<string, number>();
    for (const cn of relatedNotes) {
      for (const it of cn.items || []) {
        const prev = refundedQtyMap.get(it.sale_item_id) || 0;
        refundedQtyMap.set(it.sale_item_id, prev + (Number(it.quantity_refunded) || 0));
      }
    }

    const items: SingleItemRefundState[] = (sale.items || []).map((si) => {
      const alreadyRefunded = refundedQtyMap.get(si.id) || 0;
      const remaining = Math.max(0, si.quantity - alreadyRefunded);
      const unitPrice = si.unit_price;
      return {
        saleItemId: si.id,
        productId: si.product_id,
        name: si.product_name_snapshot,
        sku: si.sku_snapshot || '',
        unitPrice,
        purchasedQty: si.quantity,
        alreadyRefundedQty: alreadyRefunded,
        remainingQty: remaining,
        refundQty: remaining > 0 ? 1 : 0,
        selected: false,
        restock: true, // Default to restock
        lineTotal: remaining > 0 ? unitPrice : 0,
      };
    });

    setItemsToRefund(items);
  };

  // Stepper handlers for item quantity
  const handleQuantityChange = (saleItemId: string, newQty: number) => {
    setItemsToRefund((prev) =>
      prev.map((item) => {
        if (item.saleItemId !== saleItemId) return item;
        const clampedQty = Math.max(1, Math.min(newQty, item.remainingQty));
        const effectiveUnitTotal = item.unitPrice;
        return {
          ...item,
          refundQty: clampedQty,
          lineTotal: Number((clampedQty * effectiveUnitTotal).toFixed(2)),
        };
      })
    );
  };

  // Toggle item selection
  const handleToggleItemSelect = (saleItemId: string) => {
    setItemsToRefund((prev) =>
      prev.map((item) => {
        if (item.saleItemId !== saleItemId) return item;
        if (item.remainingQty <= 0) return item; // Cannot select already fully refunded item
        return {
          ...item,
          selected: !item.selected,
        };
      })
    );
  };

  // Toggle item restock
  const handleToggleRestock = (saleItemId: string) => {
    setItemsToRefund((prev) =>
      prev.map((item) => {
        if (item.saleItemId !== saleItemId) return item;
        return {
          ...item,
          restock: !item.restock,
        };
      })
    );
  };

  // Quick select all remaining refundable items
  const handleSelectAllRefundable = () => {
    const hasUnselected = itemsToRefund.some((i) => i.remainingQty > 0 && !i.selected);
    setItemsToRefund((prev) =>
      prev.map((item) => ({
        ...item,
        selected: item.remainingQty > 0 ? hasUnselected : false,
      }))
    );
  };

  // Compute total refund amount for selected items
  const selectedItems = useMemo(() => itemsToRefund.filter((i) => i.selected && i.refundQty > 0), [itemsToRefund]);
  const totalRefundAmount = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [selectedItems]
  );

  // Submit single-element or multi-element refund
  const handleSubmitRefund = async () => {
    if (!selectedSale) return;

    if (selectedItems.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please select at least one item from the bill to refund.' });
      return;
    }

    const finalReason = customReason.trim() || refundReason;
    if (!finalReason) {
      setStatusMessage({ type: 'error', text: 'Please provide a reason for issuing the refund.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage(null);

      const payload = {
        items: selectedItems.map((i) => ({
          saleItemId: i.saleItemId,
          productId: i.productId,
          quantityRefunded: i.refundQty,
          restock: i.restock,
        })),
        refundMethod,
        reason: finalReason,
      };

      const res = await api.refundSale(selectedSale.id, payload);

      setStatusMessage({
        type: 'success',
        text: `Credit Note #${res.creditNote.credit_note_number} generated successfully for ₹${res.creditNote.refund_amount.toFixed(2)}!`,
      });

      // Show the generated credit note voucher in modal
      setViewingCreditNote(res.creditNote);

      // Refresh data
      await loadCreditNotes();
      await loadRecentSales();

      // Refresh selected sale with updated status
      const updatedSale = await api.getSaleById(selectedSale.id);
      if (updatedSale) {
        handleSelectSale(updatedSale);
      }
    } catch (err: any) {
      console.error('Refund processing error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to process refund' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter credit notes for the ledger tab
  const filteredCreditNotes = useMemo(() => {
    return creditNotes.filter((cn) => {
      if (ledgerSearch.trim()) {
        const q = ledgerSearch.trim().toLowerCase();
        const matchNumber = cn.credit_note_number.toLowerCase().includes(q);
        const matchBill = cn.bill_number.toLowerCase().includes(q);
        const matchCustomer =
          (cn.customer_name && cn.customer_name.toLowerCase().includes(q)) ||
          (cn.customer_phone && cn.customer_phone.includes(q));
        const matchReason = cn.reason && cn.reason.toLowerCase().includes(q);
        if (!matchNumber && !matchBill && !matchCustomer && !matchReason) return false;
      }
      if (ledgerDateFrom) {
        if (new Date(cn.created_at) < new Date(ledgerDateFrom)) return false;
      }
      if (ledgerDateTo) {
        const toDate = new Date(ledgerDateTo);
        toDate.setDate(toDate.getDate() + 1);
        if (new Date(cn.created_at) > toDate) return false;
      }
      return true;
    });
  }, [creditNotes, ledgerSearch, ledgerDateFrom, ledgerDateTo]);

  // Export Credit Notes Schedule to CSV (Statutory Credit Notes Register)
  const handleExportCreditNotesCSV = () => {
    if (!filteredCreditNotes || filteredCreditNotes.length === 0) return;
    const exportData = filteredCreditNotes.map((cn) => ({
      'Credit Note Number': cn.credit_note_number,
      'Original Bill Number': cn.bill_number,
      'Date & Time': formatDateTime(cn.created_at),
      'Customer Name': cn.customer_name || 'Walk-in',
      'Customer Phone': cn.customer_phone || '-',
      'Taxable Subtotal (₹)': Number(cn.refund_amount - (cn.refund_tax || 0)).toFixed(2),
      'GST Tax (₹)': Number(cn.refund_tax || 0).toFixed(2),
      'Total Refund Amount (₹)': Number(cn.refund_amount).toFixed(2),
      'Refund Method': cn.refund_method,
      'Items Returned Count': (cn.items || []).length,
      'Items Detail': (cn.items || []).map((it) => `${it.product_name} x ${it.quantity_refunded} (${it.restocked ? 'Restocked' : 'Discarded'})`).join('; '),
      'Restocked to Stock': cn.restock_items ? 'YES' : 'NO',
      'Reason for Return': cn.reason || '-',
      'Issued By': cn.created_by_name || 'Staff',
      'Document Status': 'ISSUED',
    }));
    downloadCSV(`credit_notes_schedule_${new Date().toISOString().split('T')[0]}.csv`, exportData);
  };

  // Analytics Computations
  const analytics = useMemo(() => {
    const totalRefundsCount = creditNotes.length;
    const totalRefundedSum = creditNotes.reduce((sum, cn) => sum + (Number(cn.refund_amount) || 0), 0);
    const totalRefundedTax = creditNotes.reduce((sum, cn) => sum + (Number(cn.refund_tax) || 0), 0);

    let totalUnitsRestocked = 0;
    let totalUnitsDiscarded = 0;
    let cashRefundsTotal = 0;
    let upiRefundsTotal = 0;
    let cardRefundsTotal = 0;

    const itemReturnFreqMap = new Map<string, { name: string; count: number; totalAmount: number }>();
    const reasonsMap = new Map<string, number>();

    for (const cn of creditNotes) {
      if (cn.refund_method === 'CASH') cashRefundsTotal += cn.refund_amount;
      else if (cn.refund_method === 'UPI') upiRefundsTotal += cn.refund_amount;
      else if (cn.refund_method === 'CARD') cardRefundsTotal += cn.refund_amount;

      const reasonKey = cn.reason || 'Not specified';
      reasonsMap.set(reasonKey, (reasonsMap.get(reasonKey) || 0) + 1);

      for (const item of cn.items || []) {
        const qty = Number(item.quantity_refunded) || 0;
        if (item.restocked) {
          totalUnitsRestocked += qty;
        } else {
          totalUnitsDiscarded += qty;
        }

        const existing = itemReturnFreqMap.get(item.product_name) || {
          name: item.product_name,
          count: 0,
          totalAmount: 0,
        };
        existing.count += qty;
        existing.totalAmount += Number(item.refund_amount) || 0;
        itemReturnFreqMap.set(item.product_name, existing);
      }
    }

    const topReturnedItems = Array.from(itemReturnFreqMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const reasonsList = Array.from(reasonsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalRefundsCount,
      totalRefundedSum,
      totalRefundedTax,
      totalUnitsRestocked,
      totalUnitsDiscarded,
      cashRefundsTotal,
      upiRefundsTotal,
      cardRefundsTotal,
      topReturnedItems,
      reasonsList,
    };
  }, [creditNotes]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-100/70 overflow-hidden">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-neutral-200 px-4 py-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-neutral-900 text-white flex items-center justify-center shadow-xs">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-neutral-900 tracking-tight leading-tight flex items-center gap-2">
                <span>Customer Returns &amp; Refunds</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-300 uppercase font-semibold">
                  Credit Notes
                </span>
              </h1>
              <p className="text-[11px] text-neutral-500">
                Process single-item or partial bill returns with statutory Credit Note generation.
              </p>
            </div>
          </div>

          {/* Sub-tab Navigation */}
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200 text-xs">
            <button
              onClick={() => setActiveSubTab('process')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeSubTab === 'process'
                  ? 'bg-white text-neutral-900 font-bold shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-neutral-700" />
              <span>Process Return</span>
            </button>
            <button
              onClick={() => setActiveSubTab('ledger')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeSubTab === 'ledger'
                  ? 'bg-white text-neutral-900 font-bold shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-neutral-600" />
              <span>Credit Notes Ledger</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-neutral-200 rounded font-bold">
                {creditNotes.length}
              </span>
            </button>
            <button
              onClick={() => setActiveSubTab('analytics')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeSubTab === 'analytics'
                  ? 'bg-white text-neutral-900 font-bold shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5 text-neutral-600" />
              <span>Refund Analytics</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPI Mini Summary Bar (Clean, Minimalist Monochromatic) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">Total Refunded</span>
              <RotateCcw className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="text-lg font-bold font-mono text-neutral-900 mt-1 tabular-nums">
              {formatCurrency(analytics.totalRefundedSum)}
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Across {analytics.totalRefundsCount} credit notes</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">Restocked Items</span>
              <Boxes className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="text-lg font-bold font-mono text-neutral-900 mt-1 tabular-nums">
              {analytics.totalUnitsRestocked} units
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Returned back to store stock</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">Discarded / Spoil</span>
              <AlertCircle className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="text-lg font-bold font-mono text-neutral-900 mt-1 tabular-nums">
              {analytics.totalUnitsDiscarded} units
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Written off (defective/melted)</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">Cash Drawer Out</span>
              <Banknote className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="text-lg font-bold font-mono text-neutral-900 mt-1 tabular-nums">
              {formatCurrency(analytics.cashRefundsTotal)}
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Auto-deducted from drawer shift</div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: PROCESS NEW REFUND (SINGLE ELEMENT / LINE ITEMS)   */}
        {/* ========================================================= */}
        {activeSubTab === 'process' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Bill Lookup & Recent Completed Invoices (4 Cols) */}
            <div className="lg:col-span-4 space-y-3">
              <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-neutral-500" />
                    Lookup Original Bill
                  </span>
                  <button
                    onClick={loadRecentSales}
                    className="p-1 text-neutral-400 hover:text-neutral-700 transition-colors"
                    title="Refresh sales list"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingSales ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Bill #, Phone, or Customer..."
                    className="w-full pl-8 pr-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-medium focus:bg-white focus:border-neutral-900 focus:outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Invoices List */}
                <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-1">
                  {filteredSales.length === 0 ? (
                    <div className="py-8 text-center text-xs text-neutral-400 font-medium">
                      No matching sales invoices found.
                    </div>
                  ) : (
                    filteredSales.map((sale) => {
                      const isSelected = selectedSale?.id === sale.id;
                      const isFullyRefunded = sale.refund_status === 'FULL' || sale.status === 'REFUNDED';
                      const isPartial = sale.refund_status === 'PARTIAL';
                      return (
                        <div
                          key={sale.id}
                          onClick={() => handleSelectSale(sale)}
                          className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                              : 'bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-900'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs font-mono">{sale.bill_number}</span>
                            <span className="text-xs font-bold font-mono tabular-nums">
                              {formatCurrency(sale.total)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] mt-1 text-neutral-400">
                            <div className="flex items-center gap-1.5 truncate">
                              <User className="w-3 h-3 shrink-0" />
                              <span className="truncate">{sale.customer_name || 'Walk-in Customer'}</span>
                            </div>
                            <span className="font-mono text-[10px] shrink-0">
                              {formatDateTime(sale.created_at).split(',')[0]}
                            </span>
                          </div>

                          {/* Status and Items Info */}
                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-neutral-100/20 text-[10.5px]">
                            <span className={isSelected ? 'text-neutral-300' : 'text-neutral-500'}>
                              {sale.items?.length || 0} line items
                            </span>
                            {isFullyRefunded ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-200 text-neutral-800">
                                Fully Refunded
                              </span>
                            ) : isPartial ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                                Partial Refund (₹{sale.refunded_amount?.toFixed(0)})
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
                                Completed
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Selected Bill & Single Element Refund (8 Cols) */}
            <div className="lg:col-span-8 space-y-3">
              {statusMessage && (
                <div
                  className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-between animate-in fade-in ${
                    statusMessage.type === 'success'
                      ? 'bg-neutral-50 text-neutral-900 border-neutral-300'
                      : 'bg-neutral-50 text-neutral-900 border-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {statusMessage.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-neutral-900 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-neutral-700 shrink-0" />
                    )}
                    <span>{statusMessage.text}</span>
                  </div>
                  <button onClick={() => setStatusMessage(null)} className="text-neutral-400 hover:text-neutral-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {!selectedSale ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center shadow-2xs space-y-3">
                  <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
                    <RotateCcw className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-sm text-neutral-800">No Original Bill Selected</h3>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto">
                    Search or click an invoice from the left panel to inspect its line items and issue a partial or
                    single-element refund.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs overflow-hidden flex flex-col">
                  {/* Selected Bill Header Banner */}
                  <div className="p-4 bg-neutral-900 text-white flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold tracking-tight">
                          Bill #{selectedSale.bill_number}
                        </span>
                        {selectedSale.refund_status === 'FULL' || selectedSale.status === 'REFUNDED' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700 uppercase">
                            Fully Refunded
                          </span>
                        ) : selectedSale.refund_status === 'PARTIAL' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700 uppercase">
                            Partial Refund
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700 uppercase">
                            Original Completed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                        <span>Date: {formatDateTime(selectedSale.created_at)}</span>
                        <span>·</span>
                        <span>Cashier: {selectedSale.employee_name || 'Staff'}</span>
                        {selectedSale.customer_name && (
                          <>
                            <span>·</span>
                            <span>Customer: {selectedSale.customer_name}</span>
                          </>
                        )}
                        {selectedSale.customer_phone && <span>({selectedSale.customer_phone})</span>}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-neutral-400 block">Total Invoice Amount</span>
                      <span className="text-lg font-bold font-mono tabular-nums text-white">
                        {formatCurrency(selectedSale.total)}
                      </span>
                    </div>
                  </div>

                  {/* Previous Credit Notes Banner (if any) */}
                  {creditNotes.filter((cn) => cn.sale_id === selectedSale.id).length > 0 && (
                    <div className="bg-neutral-50 border-b border-neutral-200 p-2.5 px-4 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-neutral-800">
                        <FileText className="w-3.5 h-3.5 text-neutral-500" />
                        <span className="font-semibold">Linked Credit Notes:</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {creditNotes
                            .filter((cn) => cn.sale_id === selectedSale.id)
                            .map((cn) => (
                              <button
                                key={cn.id}
                                onClick={() => setViewingCreditNote(cn)}
                                className="px-2 py-0.5 bg-white border border-neutral-300 hover:border-neutral-500 text-neutral-800 font-mono text-[11px] font-semibold rounded cursor-pointer transition-colors"
                              >
                                #{cn.credit_note_number} (₹{cn.refund_amount.toFixed(0)})
                              </button>
                            ))}
                        </div>
                      </div>
                      <span className="text-[11px] text-neutral-500 font-medium">Click to view/print voucher</span>
                    </div>
                  )}

                  {/* Single Item Refund Instruction Header */}
                  <div className="p-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">
                        Select Single Item(s) to Refund
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        The entire bill does not need to be refunded. Check the specific item you want to return.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSelectAllRefundable}
                      className="text-xs text-neutral-700 hover:text-neutral-900 font-semibold underline underline-offset-2"
                    >
                      {itemsToRefund.some((i) => i.remainingQty > 0 && !i.selected) ? 'Select All' : 'Deselect All'}
                    </button>
                  </div>

                  {/* Line Items Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-neutral-100 text-neutral-600 font-bold border-b border-neutral-200 text-[11px]">
                          <th className="py-2.5 px-3 w-10 text-center">Select</th>
                          <th className="py-2.5 px-3">Product / Element</th>
                          <th className="py-2.5 px-3 text-right">Unit Price</th>
                          <th className="py-2.5 px-3 text-center">Purchased</th>
                          <th className="py-2.5 px-3 text-center">Refundable</th>
                          <th className="py-2.5 px-3 text-center w-32">Refund Qty</th>
                          <th className="py-2.5 px-3 text-center">Restock?</th>
                          <th className="py-2.5 px-3 text-right">Refund Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {itemsToRefund.map((item) => {
                          const isRefundable = item.remainingQty > 0;
                          return (
                            <tr
                              key={item.saleItemId}
                              className={`transition-colors ${
                                !isRefundable
                                  ? 'bg-neutral-50/50 opacity-60'
                                  : item.selected
                                  ? 'bg-neutral-100/70'
                                  : 'hover:bg-neutral-50/80'
                              }`}
                            >
                              {/* Selection Checkbox */}
                              <td className="py-3 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={item.selected}
                                  disabled={!isRefundable}
                                  onChange={() => handleToggleItemSelect(item.saleItemId)}
                                  className="w-4 h-4 rounded text-neutral-900 focus:ring-neutral-900 accent-neutral-900 border-neutral-300 cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>

                              {/* Product Info */}
                              <td className="py-3 px-3">
                                <div className="font-bold text-neutral-900">{item.name}</div>
                                {item.sku && (
                                  <div className="text-[10px] font-mono text-neutral-400">SKU: {item.sku}</div>
                                )}
                              </td>

                              {/* Unit Price */}
                              <td className="py-3 px-3 text-right font-mono font-medium text-neutral-700">
                                {formatCurrency(item.unitPrice)}
                              </td>

                              {/* Purchased Qty */}
                              <td className="py-3 px-3 text-center font-mono font-semibold text-neutral-600">
                                {item.purchasedQty}
                              </td>

                              {/* Remaining Refundable Qty */}
                              <td className="py-3 px-3 text-center">
                                {isRefundable ? (
                                  <span className="font-mono font-semibold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                                    {item.remainingQty} left
                                  </span>
                                ) : (
                                  <span className="font-mono text-[10px] text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded font-medium">
                                    Fully Refunded
                                  </span>
                                )}
                              </td>

                              {/* Refund Qty Stepper */}
                              <td className="py-3 px-3 text-center">
                                {isRefundable ? (
                                  <div className="inline-flex items-center border border-neutral-300 rounded-md bg-white overflow-hidden shadow-2xs">
                                    <button
                                      type="button"
                                      disabled={!item.selected || item.refundQty <= 1}
                                      onClick={() => handleQuantityChange(item.saleItemId, item.refundQty - 1)}
                                      className="p-1 hover:bg-neutral-100 text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="w-8 text-center font-bold font-mono text-xs text-neutral-900">
                                      {item.refundQty}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={!item.selected || item.refundQty >= item.remainingQty}
                                      onClick={() => handleQuantityChange(item.saleItemId, item.refundQty + 1)}
                                      className="p-1 hover:bg-neutral-100 text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-neutral-400 font-mono text-xs">-</span>
                                )}
                              </td>

                              {/* Restock Toggle */}
                              <td className="py-3 px-3 text-center">
                                {isRefundable ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleRestock(item.saleItemId)}
                                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors border cursor-pointer ${
                                      item.restock
                                        ? 'bg-neutral-900 text-white border-neutral-900'
                                        : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'
                                    }`}
                                  >
                                    {item.restock ? '✓ Restock' : '✗ Discard'}
                                  </button>
                                ) : (
                                  <span className="text-neutral-400 font-mono text-xs">-</span>
                                )}
                              </td>

                              {/* Line Total */}
                              <td className="py-3 px-3 text-right font-mono font-bold text-neutral-900 tabular-nums">
                                {item.selected && isRefundable ? formatCurrency(item.lineTotal) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Refund Execution Form & Payment Method Drawer */}
                  <div className="bg-neutral-50 p-4 border-t border-neutral-200 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Payment Method */}
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                          Refund Payout Method:
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { id: 'CASH', label: 'Cash', icon: Banknote },
                            { id: 'UPI', label: 'UPI', icon: CreditCard },
                            { id: 'CARD', label: 'Card', icon: CreditCard },
                            { id: 'STORE_CREDIT', label: 'Credit', icon: FileText },
                          ].map((m) => {
                            const Icon = m.icon;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setRefundMethod(m.id as any)}
                                className={`py-2 px-2 rounded-lg border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                                  refundMethod === m.id
                                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                                    : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                                <span>{m.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        {refundMethod === 'CASH' && (
                          <p className="text-[10.5px] text-neutral-500 font-medium mt-1.5 flex items-center gap-1">
                            <Banknote className="w-3.5 h-3.5 shrink-0" />
                            Will auto-record deduction in active Cash Drawer shift session.
                          </p>
                        )}
                      </div>

                      {/* Refund Reason */}
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                          Reason for Return:
                        </label>
                        <select
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-900"
                        >
                          <option value="Customer returned item">Customer returned item</option>
                          <option value="Wrong flavor / size served">Wrong flavor / size served</option>
                          <option value="Defective / damaged product">Defective / damaged product</option>
                          <option value="Quality / taste dissatisfaction">Quality / taste dissatisfaction</option>
                          <option value="Customer changed mind / cancel">Customer changed mind / cancel</option>
                          <option value="Other">Other (specify below)</option>
                        </select>
                        {refundReason === 'Other' && (
                          <input
                            type="text"
                            value={customReason}
                            onChange={(e) => setCustomReason(e.target.value)}
                            placeholder="Enter detailed reason..."
                            className="mt-2 w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs font-medium focus:outline-none focus:border-neutral-900"
                          />
                        )}
                      </div>
                    </div>

                    {/* Summary & Submit Action */}
                    <div className="pt-3 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] text-neutral-500">
                          Selected for Refund:{' '}
                          <span className="font-bold text-neutral-900">
                            {selectedItems.length} line element(s)
                          </span>
                        </div>
                        <div className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                          <span>Total Refund Amount:</span>
                          <span className="text-xl font-extrabold font-mono text-neutral-900 tabular-nums">
                            {formatCurrency(totalRefundAmount)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSale(null)}
                          className="px-4 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          disabled={selectedItems.length === 0 || isSubmitting || totalRefundAmount <= 0}
                          onClick={handleSubmitRefund}
                          className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-xs disabled:cursor-not-allowed cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>
                            {isSubmitting
                              ? 'Issuing Credit Note...'
                              : `Confirm Refund & Issue Credit Note (${formatCurrency(totalRefundAmount)})`}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CREDIT NOTES LEDGER (ALL ISSUED CREDIT NOTES)       */}
        {/* ========================================================= */}
        {activeSubTab === 'ledger' && (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs overflow-hidden flex flex-col space-y-3 p-4">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search by Credit Note #, Bill #, Customer..."
                    className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs focus:bg-white focus:border-neutral-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Date Filters */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-500 font-medium">Date:</span>
                <input
                  type="date"
                  value={ledgerDateFrom}
                  onChange={(e) => setLedgerDateFrom(e.target.value)}
                  className="px-2 py-1 bg-white border border-neutral-300 rounded text-xs focus:outline-none"
                />
                <span className="text-neutral-400">to</span>
                <input
                  type="date"
                  value={ledgerDateTo}
                  onChange={(e) => setLedgerDateTo(e.target.value)}
                  className="px-2 py-1 bg-white border border-neutral-300 rounded text-xs focus:outline-none"
                />
                {(ledgerDateFrom || ledgerDateTo || ledgerSearch) && (
                  <button
                    onClick={() => {
                      setLedgerSearch('');
                      setLedgerDateFrom('');
                      setLedgerDateTo('');
                    }}
                    className="text-neutral-500 hover:text-neutral-900 text-[11px] underline"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={loadCreditNotes}
                  className="p-1.5 text-neutral-500 hover:text-neutral-800 bg-neutral-100 rounded"
                  title="Reload"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingCreditNotes ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleExportCreditNotesCSV}
                  disabled={filteredCreditNotes.length === 0}
                  className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Credit Notes Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-600 font-bold border-b border-neutral-200 text-[11px]">
                    <th className="py-2.5 px-3">Credit Note #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Original Bill</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Items Returned</th>
                    <th className="py-2.5 px-3 text-right">Refund Amount</th>
                    <th className="py-2.5 px-3 text-center">Method</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">Cashier</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-sans">
                  {filteredCreditNotes.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-xs text-neutral-400">
                        No credit notes found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCreditNotes.map((cn) => (
                      <tr key={cn.id} className="hover:bg-neutral-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-neutral-900">
                          {cn.credit_note_number}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-500 font-mono text-[11px]">
                          {formatDateTime(cn.created_at)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-neutral-800">
                          {cn.bill_number}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-neutral-900">
                            {cn.customer_name || 'Walk-in'}
                          </div>
                          {cn.customer_phone && (
                            <div className="text-[10px] text-neutral-400 font-mono">{cn.customer_phone}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(cn.items || []).map((it, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-700 font-medium"
                              >
                                {it.product_name} × {it.quantity_refunded}{' '}
                                {it.restocked ? (
                                  <span className="text-neutral-800 font-semibold">(Restocked)</span>
                                ) : (
                                  <span className="text-neutral-500 font-normal">(Discarded)</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-900 tabular-nums">
                          {formatCurrency(cn.refund_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-700 uppercase">
                            {cn.refund_method}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600 italic text-[11px] max-w-xs truncate">
                          {cn.reason}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-500 text-[11px]">
                          {cn.created_by_name || 'Staff'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setViewingCreditNote(cn)}
                            className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Voucher</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: REFUND ANALYTICS                                   */}
        {/* ========================================================= */}
        {activeSubTab === 'analytics' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top Returned Items */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <h3 className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-neutral-600" />
                    Most Frequently Returned Items
                  </h3>
                  <span className="text-[11px] text-neutral-400 font-mono">Top 5 by units</span>
                </div>

                <div className="space-y-2">
                  {analytics.topReturnedItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-neutral-400">No return data recorded yet.</div>
                  ) : (
                    analytics.topReturnedItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-neutral-50 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-700 font-bold flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-neutral-900">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-neutral-900 font-mono tabular-nums block">
                            {item.count} units returned
                          </span>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {formatCurrency(item.totalAmount)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Reasons Breakdown */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <h3 className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-neutral-600" />
                    Top Return Reasons
                  </h3>
                  <span className="text-[11px] text-neutral-400 font-mono">Distribution</span>
                </div>

                <div className="space-y-2">
                  {analytics.reasonsList.length === 0 ? (
                    <div className="py-8 text-center text-xs text-neutral-400">No return reasons recorded yet.</div>
                  ) : (
                    analytics.reasonsList.map(([reason, count], idx) => {
                      const percentage = Math.round((count / (analytics.totalRefundsCount || 1)) * 100);
                      return (
                        <div key={idx} className="p-2.5 bg-neutral-50 rounded-lg space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-neutral-800">{reason}</span>
                            <span className="font-bold font-mono text-neutral-900">
                              {count} ({percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-neutral-200 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-neutral-800 h-1.5 rounded-full" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Refund Financial Breakdown Cards */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-2xs space-y-3">
              <h3 className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-neutral-600" />
                Payment Method Refund Breakdown
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <span className="text-[11px] text-neutral-500 block">Cash Drawer Refunds</span>
                  <span className="text-base font-bold font-mono text-neutral-900 tabular-nums">
                    {formatCurrency(analytics.cashRefundsTotal)}
                  </span>
                  <span className="text-[10px] text-neutral-400 block mt-0.5">Physical cash returned</span>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <span className="text-[11px] text-neutral-500 block">UPI Reversals</span>
                  <span className="text-base font-bold font-mono text-neutral-900 tabular-nums">
                    {formatCurrency(analytics.upiRefundsTotal)}
                  </span>
                  <span className="text-[10px] text-neutral-400 block mt-0.5">UPI / QR refunds</span>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <span className="text-[11px] text-neutral-500 block">Card Refunds</span>
                  <span className="text-base font-bold font-mono text-neutral-900 tabular-nums">
                    {formatCurrency(analytics.cardRefundsTotal)}
                  </span>
                  <span className="text-[10px] text-neutral-400 block mt-0.5">POS terminal card refund</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Credit Note Voucher Modal */}
      {viewingCreditNote && (
        <CreditNoteModal
          mode="view"
          creditNote={viewingCreditNote}
          onClose={() => setViewingCreditNote(null)}
        />
      )}
    </div>
  );
};

