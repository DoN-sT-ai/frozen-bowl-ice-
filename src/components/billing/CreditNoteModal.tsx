import React, { useState, useRef } from 'react';
import { Sale, CreditNote } from '../../types';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { getPrinterSettings, printCreditNoteReceipt } from '../../lib/printerService';
import { sendWhatsAppMessage } from '../../lib/whatsappService';
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Printer,
  Share2,
  X,
  Package,
  Boxes,
  CreditCard,
  Banknote,
  Receipt,
  FileText,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface CreditNoteModalProps {
  sale?: Sale | null;
  creditNote?: CreditNote | null;
  mode: 'create' | 'view';
  onClose: () => void;
  onSuccess?: (creditNote: CreditNote) => void;
}

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  sale,
  creditNote: initialCreditNote,
  mode: initialMode,
  onClose,
  onSuccess,
}) => {
  const { store, user } = useAuth();
  const [currentMode, setCurrentMode] = useState<'create' | 'view'>(initialMode);
  const [activeCreditNote, setActiveCreditNote] = useState<CreditNote | null>(initialCreditNote || null);

  // Refund Form State (for mode === 'create')
  const [refundItems, setRefundItems] = useState<
    Array<{
      saleItemId: string;
      productId: string;
      name: string;
      unitPrice: number;
      taxRate: number;
      purchasedQty: number;
      refundQty: number;
      lineTotal: number;
      selected: boolean;
      restock: boolean;
    }>
  >(() => {
    if (!sale?.items) return [];
    return sale.items.map((i) => ({
      saleItemId: i.id,
      productId: i.product_id,
      name: i.product_name_snapshot,
      unitPrice: i.unit_price,
      taxRate: i.tax_rate,
      purchasedQty: i.quantity,
      refundQty: i.quantity,
      lineTotal: i.line_total,
      selected: true,
      restock: true,
    }));
  });

  const [refundMethod, setRefundMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'STORE_CREDIT'>('CASH');
  const [restockAll, setRestockAll] = useState<boolean>(true);
  const [refundReason, setRefundReason] = useState<string>('Customer Return / Cancellation');
  const [customReason, setCustomReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // WhatsApp state
  const [showWhatsAppDrawer, setShowWhatsAppDrawer] = useState<boolean>(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState<string>(
    initialCreditNote?.customer_phone || sale?.customer_phone || ''
  );
  const printAreaRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Calculations for Refund
  const selectedItems = refundItems.filter((i) => i.selected && i.refundQty > 0);
  const refundSubtotal = selectedItems.reduce((sum, i) => {
    const itemTotal = (i.lineTotal / i.purchasedQty) * i.refundQty;
    return sum + itemTotal;
  }, 0);

  const totalRefundAmount = Number(refundSubtotal.toFixed(2));
  const isFullRefund = sale ? totalRefundAmount >= Number(sale.total) - 0.05 : false;

  const handleToggleSelectAll = (selectAll: boolean) => {
    setRefundItems((prev) =>
      prev.map((i) => ({
        ...i,
        selected: selectAll,
        refundQty: selectAll ? i.purchasedQty : 0,
      }))
    );
  };

  const handleItemQtyChange = (saleItemId: string, newQty: number) => {
    setRefundItems((prev) =>
      prev.map((i) => {
        if (i.saleItemId !== saleItemId) return i;
        const validQty = Math.max(0, Math.min(i.purchasedQty, newQty));
        return {
          ...i,
          refundQty: validQty,
          selected: validQty > 0,
        };
      })
    );
  };

  const handleConfirmRefund = async () => {
    if (!sale) return;
    if (selectedItems.length === 0) {
      setErrorMsg('Please select at least one item with quantity > 0 to refund.');
      return;
    }

    const finalReason = customReason.trim() ? customReason.trim() : refundReason;
    if (!finalReason) {
      setErrorMsg('Please specify a valid reason for this refund.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const payload = {
        items: selectedItems.map((i) => ({
          saleItemId: i.saleItemId,
          productId: i.productId,
          quantityRefunded: i.refundQty,
          restock: restockAll && i.restock,
        })),
        refundMethod,
        reason: finalReason,
        restockAll,
      };

      const res = await api.refundSale(sale.id, payload);
      setActiveCreditNote(res.creditNote);
      setCurrentMode('view');
      showToast(`Credit Note #${res.creditNote.credit_note_number} generated successfully!`);
      if (onSuccess) {
        onSuccess(res.creditNote);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process refund');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintCreditNote = () => {
    if (!activeCreditNote) return;
    try {
      printCreditNoteReceipt({
        creditNote: activeCreditNote,
        store,
      });
      showToast('Credit Note sent to printer!');
    } catch (err) {
      console.warn('Print credit note notice:', err);
      window.print();
    }
  };

  const handleSendWhatsApp = async () => {
    if (!activeCreditNote) return;
    const targetPhone = whatsAppPhone.replace(/\D/g, '');
    if (targetPhone.length < 10) {
      showToast('Please enter a valid 10-digit mobile number.');
      return;
    }

    const text = `🧾 *CREDIT NOTE / REFUND VOUCHER*\n*${store?.name || 'FryFreeze'}*\n--------------------------------\n*Credit Note #:* ${activeCreditNote.credit_note_number}\n*Original Bill #:* ${activeCreditNote.bill_number}\n*Date:* ${formatDateTime(activeCreditNote.created_at)}\n*Refund Amount:* ₹${activeCreditNote.refund_amount.toFixed(2)}\n*Payment Method:* ${activeCreditNote.refund_method}\n*Reason:* ${activeCreditNote.reason}\n--------------------------------\nThank you for your visit!`;

    showToast('Sending Credit Note via WhatsApp...');
    await sendWhatsAppMessage({ phone: targetPhone, text });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-neutral-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-300 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                {currentMode === 'create'
                  ? 'Issue Customer Refund & Credit Note'
                  : `Credit Note #${activeCreditNote?.credit_note_number}`}
              </h2>
              <p className="text-[11px] text-neutral-400">
                {currentMode === 'create'
                  ? `Original Bill: ${sale?.bill_number} · ${formatDateTime(sale?.created_at || '')}`
                  : `Original Invoice: ${activeCreditNote?.bill_number} · ${formatDateTime(activeCreditNote?.created_at || '')}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast alert */}
        {toastMsg && (
          <div className="bg-neutral-900 text-white text-xs px-4 py-2 font-medium flex items-center gap-1.5 animate-in slide-in-from-top-2 border-b border-neutral-800">
            <CheckCircle2 className="w-4 h-4 text-white" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Error alert */}
        {errorMsg && (
          <div className="bg-neutral-100 text-neutral-900 border-b border-neutral-300 text-xs px-4 py-2.5 font-medium flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-neutral-700" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="font-bold cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {currentMode === 'create' ? (
            /* ======================================================= */
            /* MODE A: CREATE REFUND & CREDIT NOTE                     */
            /* ======================================================= */
            <div className="space-y-4 text-xs">
              {/* Customer & Bill Summary Banner */}
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                    Original Bill
                  </span>
                  <span className="font-mono font-bold text-neutral-900 text-xs">
                    {sale?.bill_number}
                  </span>
                  {sale?.customer_name && (
                    <span className="text-neutral-600 ml-1.5 font-medium">
                      ({sale.customer_name} {sale.customer_phone ? `· ${sale.customer_phone}` : ''})
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block">
                    Original Total
                  </span>
                  <span className="font-mono font-bold text-neutral-900 text-xs">
                    {formatCurrency(sale?.total || 0)}
                  </span>
                </div>
              </div>

              {/* Items Selection for Refund */}
              <div>
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-neutral-100">
                  <span className="font-bold text-neutral-800 text-xs flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-neutral-500" />
                    Select Items to Refund
                  </span>
                  <div className="space-x-2">
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(true)}
                      className="text-[11px] text-neutral-900 hover:underline font-semibold cursor-pointer"
                    >
                      Select All (Full Bill)
                    </button>
                    <span className="text-neutral-300">·</span>
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(false)}
                      className="text-[11px] text-neutral-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg overflow-hidden">
                  {refundItems.map((item) => {
                    const itemUnitTotal = item.lineTotal / item.purchasedQty;
                    const calculatedRefund = itemUnitTotal * item.refundQty;
                    return (
                      <div
                        key={item.saleItemId}
                        className={`p-2.5 flex items-center justify-between gap-3 transition-colors ${
                          item.selected ? 'bg-neutral-50' : 'bg-white opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              handleItemQtyChange(item.saleItemId, checked ? item.purchasedQty : 0);
                            }}
                            className="w-4 h-4 rounded text-neutral-900 focus:ring-neutral-900 accent-neutral-900 cursor-pointer"
                          />
                          <div className="truncate">
                            <div className="font-semibold text-neutral-900 truncate">
                              {item.name}
                            </div>
                            <div className="text-[10px] text-neutral-500 font-mono">
                              Unit: {formatCurrency(item.unitPrice)} · Qty Sold: {item.purchasedQty}
                            </div>
                          </div>
                        </div>

                        {/* Quantity Spinner */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-neutral-500">Refund:</span>
                          <input
                            type="number"
                            min="0"
                            max={item.purchasedQty}
                            step="1"
                            value={item.refundQty}
                            disabled={!item.selected}
                            onChange={(e) =>
                              handleItemQtyChange(item.saleItemId, parseInt(e.target.value, 10) || 0)
                            }
                            className="w-14 px-1.5 py-1 text-center font-mono text-xs border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 disabled:bg-neutral-100"
                          />
                          <span className="text-[10px] text-neutral-400">/ {item.purchasedQty}</span>
                        </div>

                        {/* Calculated Refund Amount */}
                        <div className="text-right shrink-0 w-20">
                          <span className="font-mono font-bold text-neutral-900 block text-xs">
                            {formatCurrency(calculatedRefund)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Restock Options & Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Restock Inventory Decision */}
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-800 text-xs flex items-center gap-1">
                      <Boxes className="w-3.5 h-3.5 text-neutral-600" />
                      Restock Inventory
                    </span>
                    <input
                      type="checkbox"
                      checked={restockAll}
                      onChange={(e) => setRestockAll(e.target.checked)}
                      className="w-4 h-4 rounded text-neutral-900 focus:ring-neutral-900 accent-neutral-900 cursor-pointer"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-500 leading-tight">
                    {restockAll
                      ? 'Returned items will automatically be restored back into available stock.'
                      : 'Items will NOT be restocked (use for melted, damaged, or spoiled food items).'}
                  </p>
                </div>

                {/* Refund Payment Mode */}
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                  <span className="font-semibold text-neutral-800 text-xs flex items-center gap-1">
                    <Banknote className="w-3.5 h-3.5 text-neutral-600" />
                    Refund Method
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'CASH', label: 'Cash (Drawer)' },
                      { id: 'UPI', label: 'UPI / Online' },
                      { id: 'CARD', label: 'Card' },
                      { id: 'STORE_CREDIT', label: 'Store Credit' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setRefundMethod(m.id as any)}
                        className={`px-2 py-1.5 rounded text-[11px] font-medium transition-colors border text-center cursor-pointer ${
                          refundMethod === m.id
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Refund Reason */}
              <div className="space-y-1.5">
                <label className="font-semibold text-neutral-800 text-xs block">
                  Refund Reason (Mandatory for Credit Note)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Customer Return / Change of Mind',
                    'Wrong Item Prepared',
                    'Quality / Freshness Issue',
                    'Billing Discrepancy',
                    'Customer Cancelled Post-Billing',
                  ].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setRefundReason(r);
                        setCustomReason('');
                      }}
                      className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                        refundReason === r && !customReason
                          ? 'bg-neutral-900 text-white border-neutral-900 font-medium'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Or enter custom reason..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-neutral-300 rounded focus:outline-none focus:border-neutral-900"
                />
              </div>

              {/* Financial Calculation Summary Card */}
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1.5">
                <div className="flex justify-between text-xs text-neutral-600">
                  <span>Refund Subtotal:</span>
                  <span className="font-mono font-medium">{formatCurrency(refundSubtotal)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-neutral-900 pt-1 border-t border-neutral-200">
                  <span>Total Refund Amount:</span>
                  <span className="font-mono text-sm text-neutral-900 font-extrabold">
                    -{formatCurrency(totalRefundAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-neutral-500 pt-0.5">
                  <span>Resulting Bill Status:</span>
                  <span className="font-medium uppercase tracking-wider text-neutral-700">
                    {isFullRefund ? 'FULL REFUND (100%)' : 'PARTIAL REFUND'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* ======================================================= */
            /* MODE B: VIEW / PRINT CREDIT NOTE VOUCHER                */
            /* ======================================================= */
            activeCreditNote && (
              <div className="space-y-4">
                {/* Printable Credit Note Preview Card */}
                <div
                  ref={printAreaRef}
                  className="p-6 bg-white border border-neutral-300 rounded-lg shadow-xs space-y-4 font-mono text-xs text-neutral-900"
                >
                  {/* Voucher Header */}
                  <div className="text-center pb-3 border-b border-dashed border-neutral-300">
                    <h3 className="text-base font-bold uppercase tracking-wider text-neutral-900">
                      {store?.name || 'FryFreeze'}
                    </h3>
                    {store?.address && (
                      <p className="text-[11px] text-neutral-600">
                        {store.address}
                      </p>
                    )}
                    {store?.gstin && (
                      <p className="text-[10px] text-neutral-500">GSTIN: {store.gstin}</p>
                    )}
                    <div className="mt-2 inline-block px-3 py-0.5 bg-neutral-900 text-white rounded text-[11px] font-bold tracking-widest uppercase">
                      CREDIT NOTE / REFUND VOUCHER
                    </div>
                  </div>

                  {/* Metadata details */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] pb-3 border-b border-dashed border-neutral-300">
                    <div>
                      <span className="text-neutral-500 block">Credit Note No:</span>
                      <span className="font-bold">{activeCreditNote.credit_note_number}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-neutral-500 block">Original Invoice:</span>
                      <span className="font-bold">{activeCreditNote.bill_number}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Date & Time:</span>
                      <span>{formatDateTime(activeCreditNote.created_at)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-neutral-500 block">Refund Mode:</span>
                      <span className="font-bold">{activeCreditNote.refund_method}</span>
                    </div>
                    {activeCreditNote.customer_name && (
                      <div className="col-span-2">
                        <span className="text-neutral-500 block">Customer:</span>
                        <span>
                          {activeCreditNote.customer_name}{' '}
                          {activeCreditNote.customer_phone ? `(${activeCreditNote.customer_phone})` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Refunded Items Table */}
                  <div>
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-neutral-300 text-neutral-600 font-bold">
                          <th className="py-1">Item</th>
                          <th className="py-1 text-center">Qty</th>
                          <th className="py-1 text-right">Price</th>
                          <th className="py-1 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {activeCreditNote.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-1">
                              <div>{item.product_name}</div>
                              {item.restocked && (
                                <span className="text-[9px] text-neutral-600 font-sans block">
                                  ✓ Restocked to inventory
                                </span>
                              )}
                            </td>
                            <td className="py-1 text-center">{item.quantity_refunded}</td>
                            <td className="py-1 text-right tabular-nums">
                              {formatCurrency(item.unit_price)}
                            </td>
                            <td className="py-1 text-right tabular-nums font-semibold">
                              {formatCurrency(item.refund_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Total & Reason Footer */}
                  <div className="pt-2 border-t border-dashed border-neutral-300 space-y-1">
                    <div className="flex justify-between font-bold text-sm">
                      <span>TOTAL REFUND:</span>
                      <span>{formatCurrency(activeCreditNote.refund_amount)}</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 pt-1">
                      <span className="font-semibold text-neutral-700">Reason: </span>
                      {activeCreditNote.reason}
                    </div>
                    {activeCreditNote.created_by_name && (
                      <div className="text-[10px] text-neutral-400">
                        Authorized by: {activeCreditNote.created_by_name}
                      </div>
                    )}
                  </div>

                  <div className="text-center text-[10px] text-neutral-400 pt-2 border-t border-neutral-100">
                    This credit note voucher adjusts sales records and inventory in accordance with GST standards.
                  </div>
                </div>

                {/* WhatsApp Share Drawer */}
                {showWhatsAppDrawer && (
                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                    <span className="text-xs font-bold text-neutral-900 block">
                      Send Credit Note via WhatsApp
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        placeholder="10-digit customer mobile..."
                        value={whatsAppPhone}
                        onChange={(e) => setWhatsAppPhone(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white border border-neutral-300 rounded text-xs focus:outline-none"
                      />
                      <button
                        onClick={handleSendWhatsApp}
                        className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between gap-2 shrink-0">
          {currentMode === 'create' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRefund}
                disabled={isSubmitting || selectedItems.length === 0}
                className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {isSubmitting
                    ? 'Processing Refund...'
                    : `Confirm & Issue Credit Note (${formatCurrency(totalRefundAmount)})`}
                </span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowWhatsAppDrawer(!showWhatsAppDrawer)}
                  className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handlePrintCreditNote}
                  className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Credit Note</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
