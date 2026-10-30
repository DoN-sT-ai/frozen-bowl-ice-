import React from 'react';
import { Sale, Store } from '../../types';
import { formatCurrency, formatDateTime, formatBillNumber } from '../../lib/utils';
import { QrCode as QrIcon } from 'lucide-react';

interface ThermalReceiptContentProps {
  sale: Sale;
  store: Store | null;
  docType?: 'BILL' | 'INVOICE';
  qrCodeDataUrl?: string;
  isFullPagePdf?: boolean;
}

export const ThermalReceiptContent: React.FC<ThermalReceiptContentProps> = ({
  sale,
  store,
  docType = 'BILL',
  qrCodeDataUrl,
  isFullPagePdf = false,
}) => {
  const isInvoice = docType === 'INVOICE';
  const isExempt = sale.gst_type === 'EXEMPT';
  const isInterState = sale.gst_type === 'INTER_STATE';

  // Dynamic Document Title: Default is always BILL (RETAIL BILL / CASH BILL)
  // Only TAX INVOICE when explicitly requested
  const documentTitle = isInvoice
    ? (isExempt ? 'BILL OF SUPPLY' : 'TAX INVOICE')
    : (isExempt ? 'BILL OF SUPPLY' : (sale.payment_method === 'CASH' ? 'CASH BILL' : 'RETAIL BILL'));

  const billNumberFormatted = formatBillNumber(sale.bill_number, docType);

  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Nirmala UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
      className={`text-neutral-900 leading-tight bg-white ${
        isFullPagePdf
          ? 'w-full max-w-[720px] mx-auto p-6 md:p-8 text-xs sm:text-sm border border-neutral-300 rounded shadow-xs'
          : 'w-full text-[10px]'
      }`}
    >
      {/* Store Header */}
      <div className="text-center pb-2">
        <div className={`font-bold tracking-tight uppercase text-neutral-900 ${isFullPagePdf ? 'text-xl' : 'text-sm'}`}>
          {store?.name || 'RETAIL STORE'}
        </div>
        {store?.address && (
          <div className={`text-neutral-700 whitespace-pre-line leading-tight mt-0.5 ${isFullPagePdf ? 'text-xs' : 'text-[9.5px]'}`}>
            {store.address}
          </div>
        )}
        <div className={`text-neutral-700 mt-0.5 ${isFullPagePdf ? 'text-xs' : 'text-[9.5px]'}`}>
          {store?.phone ? `Ph: ${store.phone}` : ''}
          {store?.phone && store?.email ? ' · ' : ''}
          {store?.email ? `Email: ${store.email}` : ''}
        </div>
        {store?.gstin && (
          <div className={`font-bold text-neutral-900 mt-0.5 ${isFullPagePdf ? 'text-xs' : 'text-[10px]'}`}>
            GSTIN: {store.gstin}
          </div>
        )}
      </div>

      {/* Bill Title Banner (Default BILL, never Invoice unless explicitly selected) */}
      <div className={`border-t-2 border-b-2 border-dashed border-neutral-800 py-1 text-center font-bold tracking-wider uppercase text-neutral-900 ${
        isFullPagePdf ? 'text-sm my-2' : 'text-[10.5px] my-1'
      }`}>
        *** {documentTitle} ***
      </div>

      {/* Bill Meta Details */}
      <div className={`py-1.5 space-y-0.5 border-b border-dashed border-neutral-400 ${isFullPagePdf ? 'text-xs' : 'text-[9.5px]'}`}>
        <div className="flex justify-between items-center">
          <span className="text-neutral-600 font-medium">{isInvoice ? 'Invoice No:' : 'Bill No:'}</span>
          <span className="font-bold text-neutral-900 font-mono">{billNumberFormatted}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-neutral-600 font-medium">Date & Time:</span>
          <span>{formatDateTime(sale.created_at)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-neutral-600 font-medium">Cashier / Billed By:</span>
          <span>{sale.employee_name || 'Staff'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-neutral-600 font-medium">Payment Mode:</span>
          <span className="font-bold text-neutral-900">{sale.payment_method}</span>
        </div>

        {/* Customer Details if present */}
        {(sale.customer_name || sale.customer_phone || sale.customer_gstin) && (
          <div className="pt-1 mt-1 border-t border-dotted border-neutral-300 space-y-0.5">
            {sale.customer_name && (
              <div className="flex justify-between items-center">
                <span className="text-neutral-600 font-medium">Customer:</span>
                <span className="font-semibold text-neutral-900 truncate max-w-[240px]">{sale.customer_name}</span>
              </div>
            )}
            {sale.customer_phone && (
              <div className="flex justify-between items-center">
                <span className="text-neutral-600 font-medium">Phone:</span>
                <span>{sale.customer_phone}</span>
              </div>
            )}
            {sale.customer_gstin && (
              <div className="flex justify-between items-center">
                <span className="text-neutral-600 font-medium">Customer GSTIN:</span>
                <span className="font-bold font-mono text-neutral-900">{sale.customer_gstin}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Items Table - Strict Fixed Table Layout for Guaranteed Column Alignment */}
      <div className="py-1 border-b border-dashed border-neutral-400">
        <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: '48%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr className={`border-b border-dashed border-neutral-300 font-bold text-neutral-800 ${
              isFullPagePdf ? 'text-xs' : 'text-[9.5px]'
            }`}>
              <th className="text-left py-1 font-bold">ITEM / DETAILS</th>
              <th className="text-center py-1 font-bold">QTY</th>
              <th className="text-right py-1 font-bold">RATE</th>
              <th className="text-right py-1 font-bold">AMOUNT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dotted divide-neutral-200">
            {sale.items?.map((item, idx) => (
              <tr key={idx} className={`align-top ${isFullPagePdf ? 'text-xs' : 'text-[9.5px]'}`}>
                <td className="py-1 text-left pr-1" style={{ wordBreak: 'break-word' }}>
                  <div className="font-semibold text-neutral-900 leading-tight">
                    {idx + 1}. {item.product_name_snapshot}
                  </div>
                  {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                    <div className="pl-2 pt-0.5 space-y-0.5 text-neutral-600 font-mono text-[8.5px]">
                      {item.selected_modifiers.map((m: any, mIdx: number) => (
                        <div key={mIdx}>
                          + {m.modifierName || m.name} {m.additionalPriceMinor ? `(${formatCurrency(m.additionalPriceMinor / 100)})` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {(item.hsn_snapshot || item.tax_rate > 0) && (
                    <div className={`text-neutral-500 truncate mt-0.5 ${isFullPagePdf ? 'text-[11px]' : 'text-[8.5px]'}`}>
                      {item.hsn_snapshot ? `HSN:${item.hsn_snapshot}` : ''}
                      {item.tax_rate > 0 ? ` · GST:${item.tax_rate}%` : ''}
                    </div>
                  )}
                </td>
                <td className="py-1 text-center font-semibold tabular-nums px-1">
                  {item.quantity}
                </td>
                <td className="py-1 text-right tabular-nums whitespace-nowrap px-1">
                  {formatCurrency(item.unit_price)}
                </td>
                <td className="py-1 text-right font-bold text-neutral-900 tabular-nums whitespace-nowrap pl-1">
                  {formatCurrency(item.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* GST Breakdown (if applicable) */}
      {!isExempt && sale.tax > 0 && (
        <div className={`py-1.5 space-y-0.5 border-b border-dashed border-neutral-400 ${isFullPagePdf ? 'text-xs' : 'text-[9.5px]'}`}>
          <div className="font-bold text-neutral-500 uppercase tracking-wider mb-0.5 text-[9px]">
            Tax Breakdown (GST)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td className="text-left py-0.5 text-neutral-600">Taxable Amount:</td>
                <td className="text-right py-0.5 font-mono tabular-nums">{formatCurrency(sale.subtotal)}</td>
              </tr>
              {isInterState ? (
                <tr>
                  <td className="text-left py-0.5 text-neutral-600">IGST (Integrated Tax):</td>
                  <td className="text-right py-0.5 font-mono tabular-nums">+{formatCurrency(sale.igst || sale.tax)}</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td className="text-left py-0.5 text-neutral-600">CGST (Central Tax):</td>
                    <td className="text-right py-0.5 font-mono tabular-nums">
                      +{formatCurrency(sale.cgst ?? Math.round((sale.tax / 2) * 100) / 100)}
                    </td>
                  </tr>
                  <tr>
                    <td className="text-left py-0.5 text-neutral-600">SGST (State Tax):</td>
                    <td className="text-right py-0.5 font-mono tabular-nums">
                      +{formatCurrency(sale.sgst ?? Math.round((sale.tax / 2) * 100) / 100)}
                    </td>
                  </tr>
                </>
              )}
              <tr className="border-t border-dotted border-neutral-300 font-semibold text-neutral-900">
                <td className="text-left py-0.5">Total GST Tax:</td>
                <td className="text-right py-0.5 font-mono tabular-nums">+{formatCurrency(sale.tax)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Totals Summary */}
      <div className={`py-1.5 space-y-0.5 border-b border-dashed border-neutral-400 ${isFullPagePdf ? 'text-xs' : 'text-[10px]'}`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td className="text-left py-0.5 text-neutral-600">Subtotal:</td>
              <td className="text-right py-0.5 tabular-nums font-mono">{formatCurrency(sale.subtotal)}</td>
            </tr>
            {sale.tax > 0 && (
              <tr>
                <td className="text-left py-0.5 text-neutral-600">GST Amount:</td>
                <td className="text-right py-0.5 tabular-nums font-mono">+{formatCurrency(sale.tax)}</td>
              </tr>
            )}
            {sale.discount > 0 && (
              <tr>
                <td className="text-left py-0.5 text-emerald-700 font-medium">Discount:</td>
                <td className="text-right py-0.5 tabular-nums font-mono text-emerald-700 font-medium">
                  -{formatCurrency(sale.discount)}
                </td>
              </tr>
            )}
            {sale.round_off !== undefined && sale.round_off !== 0 && (
              <tr className="text-neutral-500 text-[9px]">
                <td className="text-left py-0.5">Round Off:</td>
                <td className="text-right py-0.5 tabular-nums font-mono">
                  {sale.round_off > 0 ? `+${formatCurrency(sale.round_off)}` : formatCurrency(sale.round_off)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Grand Total */}
        <div className={`border-t-2 border-b-2 border-neutral-900 py-1.5 my-1 flex justify-between items-baseline font-bold text-neutral-900 ${
          isFullPagePdf ? 'text-base sm:text-lg' : 'text-xs sm:text-sm'
        }`}>
          <span className="tracking-tight uppercase">Grand Total:</span>
          <span className="tabular-nums font-mono">{formatCurrency(sale.total)}</span>
        </div>

        <div className="flex justify-between text-neutral-600 pt-0.5 text-[9px]">
          <span>Payment Status:</span>
          <span className="font-bold text-emerald-800 uppercase">PAID VIA {sale.payment_method}</span>
        </div>
      </div>

      {sale.notes && (
        <div className="py-1 border-b border-dotted border-neutral-300 text-[9px] text-neutral-600 italic">
          Note: {sale.notes}
        </div>
      )}

      {/* Verification QR Code Section */}
      <div className="pt-2 text-center">
        <div className="flex items-center justify-center gap-3">
          {qrCodeDataUrl ? (
            <img
              src={qrCodeDataUrl}
              alt="Bill QR"
              className={`border border-neutral-300 p-0.5 rounded bg-white shrink-0 block ${
                isFullPagePdf ? 'w-16 h-16' : 'w-11 h-11'
              }`}
            />
          ) : (
            <div className={`border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 shrink-0 ${
              isFullPagePdf ? 'w-16 h-16' : 'w-11 h-11'
            }`}>
              <QrIcon className="w-5 h-5" />
            </div>
          )}
          <div className="text-left leading-tight">
            <div className={`font-bold tracking-tight text-neutral-900 ${isFullPagePdf ? 'text-xs' : 'text-[9.5px]'}`}>
              Scan to Verify Authentic Bill
            </div>
            <div className="text-[8.5px] text-neutral-500 font-mono mt-0.5">
              Token: {(sale.verification_token || '').slice(0, 16)}...
            </div>
            <div className="text-[9px] text-neutral-800 font-bold uppercase mt-1 tracking-wider">
              *** THANK YOU! VISIT AGAIN ***
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
