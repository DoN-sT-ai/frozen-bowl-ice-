import React, { useState, useEffect } from 'react';
import { Sale, CreditNote } from '../../types';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatBillNumber } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { ReceiptModal } from './ReceiptModal';
import { CreditNoteModal } from './CreditNoteModal';
import {
  Search,
  Receipt,
  Filter,
  Eye,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  Trash2,
  FileText,
  BadgeAlert,
  ArrowRight,
} from 'lucide-react';

export const BillHistory: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [activeHistoryTab, setActiveHistoryTab] = useState<'bills' | 'credit_notes'>('bills');
  const [sales, setSales] = useState<Sale[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPayment, setSelectedPayment] = useState<string>('all');

  // Modals
  const [selectedSaleForView, setSelectedSaleForView] = useState<Sale | null>(null);
  const [selectedSaleForRefund, setSelectedSaleForRefund] = useState<Sale | null>(null);
  const [selectedCreditNoteForView, setSelectedCreditNoteForView] = useState<CreditNote | null>(null);
  const [saleToVoid, setSaleToVoid] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [isVoiding, setIsVoiding] = useState<boolean>(false);
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeHistoryTab === 'bills') {
        const params: any = {};
        if (selectedStatus !== 'all') params.status = selectedStatus;
        if (selectedPayment !== 'all') params.paymentMethod = selectedPayment;
        if (searchQuery) params.search = searchQuery;

        const data = await api.getSales(params);
        setSales(data);
      } else {
        const params: any = {};
        if (searchQuery) params.search = searchQuery;
        const notes = await api.getCreditNotes(params);
        setCreditNotes(notes);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeHistoryTab, selectedStatus, selectedPayment]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleConfirmVoid = async () => {
    if (!saleToVoid) return;
    if (!voidReason.trim()) {
      setErrorMsg('A valid reason is required to void a bill.');
      return;
    }

    try {
      setIsVoiding(true);
      setErrorMsg(null);
      await api.voidSale(saleToVoid.id, voidReason);
      setSaleToVoid(null);
      setVoidReason('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to void bill');
    } finally {
      setIsVoiding(false);
    }
  };

  const handleConfirmPurge = async () => {
    try {
      setIsPurging(true);
      setErrorMsg(null);
      await api.purgeAllSales();
      setShowPurgeModal(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to clear all sales');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto md:overflow-hidden">
      {/* Top Header & Filters */}
      <div className="p-4 bg-white border-b border-neutral-200 space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-neutral-900 leading-none">
              Sales Ledger & Credit Notes
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              Search bills, issue customer refunds with credit notes, and audit receipts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-neutral-500 font-mono">
              {activeHistoryTab === 'bills' ? `Bills: ${sales.length}` : `Credit Notes: ${creditNotes.length}`}
            </div>
            {isAdmin && activeHistoryTab === 'bills' && sales.length > 0 && (
              <button
                onClick={() => setShowPurgeModal(true)}
                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                title="Permanently remove all old bills (Admin Only)"
              >
                <Trash2 className="w-3 h-3" />
                Clear All Bills
              </button>
            )}
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-2 pt-1 border-t border-neutral-100">
          <button
            onClick={() => setActiveHistoryTab('bills')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeHistoryTab === 'bills'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Sales Invoices ({sales.length})</span>
          </button>
          <button
            onClick={() => setActiveHistoryTab('credit_notes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeHistoryTab === 'credit_notes'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-red-50 hover:bg-red-100 text-red-800 border border-red-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Customer Refunds & Credit Notes ({creditNotes.length})</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder={
                activeHistoryTab === 'bills'
                  ? 'Search by Bill #, Customer, Cashier...'
                  : 'Search by Credit Note #, Bill #, Customer...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded text-xs focus:bg-white focus:outline-none focus:border-neutral-900"
            />
          </form>

          {activeHistoryTab === 'bills' && (
            <>
              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded border border-neutral-200">
                <span className="text-neutral-500 text-[10px] uppercase font-mono px-1">Status:</span>
                {['all', 'COMPLETED', 'REFUNDED', 'VOIDED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setSelectedStatus(st)}
                    className={`px-2 py-0.5 rounded transition-colors text-xs font-medium ${
                      selectedStatus === st
                        ? 'bg-white text-neutral-900 shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    {st === 'all' ? 'All' : st}
                  </button>
                ))}
              </div>

              {/* Payment Method Filter */}
              <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded border border-neutral-200">
                <span className="text-neutral-500 text-[10px] uppercase font-mono px-1">Payment:</span>
                {['all', 'UPI', 'CASH', 'CARD'].map((pm) => (
                  <button
                    key={pm}
                    onClick={() => setSelectedPayment(pm)}
                    className={`px-2 py-0.5 rounded transition-colors text-xs font-medium ${
                      selectedPayment === pm
                        ? 'bg-white text-neutral-900 shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    {pm === 'all' ? 'All' : pm}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex justify-between items-center">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Content: Sales Invoices vs Credit Notes */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400">Loading records...</div>
        ) : activeHistoryTab === 'bills' ? (
          /* ========================================================= */
          /* BILLS / INVOICES TABLE                                    */
          /* ========================================================= */
          sales.length === 0 ? (
            <div className="bg-white rounded border border-neutral-200 p-8 text-center text-xs text-neutral-500">
              No bills found matching current filter parameters.
            </div>
          ) : (
            <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[820px]">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                      <th className="py-2.5 px-3">Bill Number</th>
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Cashier</th>
                      <th className="py-2.5 px-3 text-center">Items</th>
                      <th className="py-2.5 px-3">Payment</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {sales.map((sale) => {
                      const isVoided = sale.status === 'VOIDED';
                      const isFullRefund = sale.status === 'REFUNDED' || sale.refund_status === 'FULL';
                      const isPartialRefund = sale.refund_status === 'PARTIAL';
                      return (
                        <tr
                          key={sale.id}
                          className={`hover:bg-neutral-50 transition-colors ${
                            isVoided ? 'bg-red-50/20 text-neutral-500' : isFullRefund ? 'bg-purple-50/20' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-medium text-neutral-900">
                            <div>{formatBillNumber(sale.bill_number, 'BILL')}</div>
                            {sale.customer_name && (
                              <div className="text-[10px] text-neutral-500 font-sans truncate max-w-[130px]">
                                {sale.customer_name} {sale.customer_phone ? `· ${sale.customer_phone}` : ''}
                              </div>
                            )}
                            {sale.last_credit_note_number && (
                              <div className="text-[9px] text-red-700 font-mono mt-0.5">
                                CN: {sale.last_credit_note_number}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-600">
                            {formatDateTime(sale.created_at)}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-700">
                            {sale.employee_name}
                          </td>
                          <td className="py-2.5 px-3 text-center tabular-nums">
                            {sale.items?.length || '-'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[11px] text-neutral-700">
                              {sale.payment_method}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-neutral-500 font-mono">
                            <div>{formatCurrency(sale.subtotal)}</div>
                            {sale.tax > 0 && (
                              <div className="text-[10px] text-neutral-400">Tax: {formatCurrency(sale.tax)}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-mono">
                            <div className="font-bold text-neutral-900">{formatCurrency(sale.total)}</div>
                            {sale.refunded_amount && sale.refunded_amount > 0 && (
                              <div className="text-[10px] text-red-600 font-bold">
                                -{formatCurrency(sale.refunded_amount)}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isVoided ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700">
                                <XCircle className="w-3 h-3 text-red-600" />
                                VOIDED
                              </span>
                            ) : isFullRefund ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                                <RotateCcw className="w-3 h-3 text-purple-600" />
                                REFUNDED
                              </span>
                            ) : isPartialRefund ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                <RotateCcw className="w-3 h-3 text-amber-600" />
                                PARTIAL REFUND
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                COMPLETED
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1.5">
                            <button
                              onClick={() => setSelectedSaleForView(sale)}
                              className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              View / Print
                            </button>

                            {/* Customer Refund & Credit Note Option */}
                            {!isVoided && !isFullRefund && (
                              <button
                                onClick={() => setSelectedSaleForRefund(sale)}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="Issue customer refund & official credit note"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Refund
                              </button>
                            )}

                            {/* Admin Void Option */}
                            {isAdmin && !isVoided && !isFullRefund && (
                              <button
                                onClick={() => {
                                  setSaleToVoid(sale);
                                  setVoidReason('');
                                }}
                                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="Void this bill and return inventory to stock"
                              >
                                <XCircle className="w-3 h-3" />
                                Void
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          /* ========================================================= */
          /* CREDIT NOTES & REFUNDS LEDGER TABLE                       */
          /* ========================================================= */
          creditNotes.length === 0 ? (
            <div className="bg-white rounded border border-neutral-200 p-8 text-center text-xs text-neutral-500">
              No credit notes or customer refunds issued yet.
            </div>
          ) : (
            <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-red-50/50 border-b border-red-100 text-neutral-700 font-semibold">
                      <th className="py-2.5 px-3">Credit Note #</th>
                      <th className="py-2.5 px-3">Original Invoice</th>
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Refund Method</th>
                      <th className="py-2.5 px-3">Reason</th>
                      <th className="py-2.5 px-3 text-center">Items</th>
                      <th className="py-2.5 px-3 text-right">Refund Amount</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {creditNotes.map((cn) => (
                      <tr key={cn.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-red-700">
                          {cn.credit_note_number}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-neutral-900">
                          {cn.bill_number}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600">
                          {formatDateTime(cn.created_at)}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-700">
                          {cn.customer_name ? (
                            <div>
                              <div className="font-medium">{cn.customer_name}</div>
                              {cn.customer_phone && (
                                <div className="text-[10px] text-neutral-400 font-mono">
                                  {cn.customer_phone}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-neutral-400 italic">Walk-in</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 font-mono text-[10px] font-bold">
                            {cn.refund_method}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600 max-w-[180px] truncate" title={cn.reason}>
                          {cn.reason}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums">
                          {cn.items?.length || 1}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-mono font-bold text-red-700">
                          -{formatCurrency(cn.refund_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => setSelectedCreditNoteForView(cn)}
                            className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            View Voucher
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>

      {/* Refund & Credit Note Modal */}
      {selectedSaleForRefund && (
        <CreditNoteModal
          sale={selectedSaleForRefund}
          mode="create"
          onClose={() => setSelectedSaleForRefund(null)}
          onSuccess={(newCN) => {
            setSelectedSaleForRefund(null);
            loadData();
          }}
        />
      )}

      {/* Credit Note View / Print Modal */}
      {selectedCreditNoteForView && (
        <CreditNoteModal
          creditNote={selectedCreditNoteForView}
          mode="view"
          onClose={() => setSelectedCreditNoteForView(null)}
        />
      )}

      {/* Bill View / Print Modal */}
      {selectedSaleForView && (
        <ReceiptModal
          sale={selectedSaleForView}
          autoPrint={false}
          onClose={() => setSelectedSaleForView(null)}
          onNewBill={() => setSelectedSaleForView(null)}
        />
      )}

      {/* Admin Void Confirmation Modal */}
      {saleToVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-xl max-w-md w-full p-5 space-y-4 max-h-[85dvh] overflow-y-auto">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-sm">Void Bill #{saleToVoid.bill_number}</h3>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Voiding this bill will mark its status as <strong className="text-neutral-900">VOIDED</strong>, reverse all financial totals from active store revenue, and <strong className="text-neutral-900">automatically return all {saleToVoid.items?.length || 0} purchased items back to stock</strong>.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700 block">
                Reason for cancellation <span className="text-red-500">*</span>:
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Customer returned goods, incorrect payment method entered..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full p-2 text-xs border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                onClick={() => setSaleToVoid(null)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVoid}
                disabled={isVoiding || !voidReason.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isVoiding ? 'Restoring Stock...' : 'Confirm Void & Restore Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Purge All Sales Modal */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-sm">Clear All Billing History</h3>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to permanently clear all <strong className="text-neutral-900">{sales.length} bills</strong> and reset invoice sequence numbers back to 0?
            </p>
            <div className="text-[11px] text-red-700 bg-red-50 p-2.5 rounded border border-red-200">
              ⚠️ <strong>Admin Action:</strong> This action permanently deletes all sales transactions and itemized receipts. This cannot be undone.
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setShowPurgeModal(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPurging}
                onClick={handleConfirmPurge}
                className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1 shadow-xs"
              >
                {isPurging ? 'Clearing...' : 'Confirm Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
