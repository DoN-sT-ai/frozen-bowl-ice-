import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { VerificationResponse } from '../../types';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { CheckCircle, XCircle, ShieldCheck, ArrowLeft, Search, QrCode } from 'lucide-react';

interface PublicVerificationPageProps {
  initialToken?: string;
  onBackToApp?: () => void;
}

export const PublicVerificationPage: React.FC<PublicVerificationPageProps> = ({
  initialToken,
  onBackToApp,
}) => {
  const [tokenInput, setTokenInput] = useState<string>(initialToken || '');
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const performVerification = async (token: string) => {
    if (!token.trim()) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await api.verifyBill(token.trim());
      setResult(res);
      if (!res.valid) {
        setErrorMsg(res.error || 'Verification failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification service error');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialToken) {
      performVerification(initialToken);
    }
  }, [initialToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performVerification(tokenInput);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-neutral-100 flex flex-col justify-between p-4 sm:p-6 text-neutral-900 font-sans overflow-y-auto">
      <div className="max-w-md w-full mx-auto my-auto space-y-4">
        {/* Top Header / Back button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/fryfreeze-logo.jpg" alt="FryFreeze" className="w-8 h-8 rounded-lg object-contain shadow-xs border border-neutral-200" />
            <span className="text-sm font-bold tracking-tight text-neutral-900">
              FryFreeze Bill Verification
            </span>
          </div>

          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Store App
            </button>
          )}
        </div>

        {/* Verification Card */}
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
          {/* Token input form */}
          <form onSubmit={handleSubmit} className="p-4 border-b border-neutral-100 bg-neutral-50 flex gap-2">
            <input
              type="text"
              placeholder="Enter Bill Verification UUID Token..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-white border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !tokenInput.trim()}
              className="px-3.5 py-1.5 bg-neutral-900 text-white text-xs font-semibold rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Verify'}
            </button>
          </form>

          {/* Verification Results */}
          <div className="p-6">
            {loading ? (
              <div className="text-center py-8 text-neutral-400 text-xs">
                Verifying digital token against cryptographic store ledger...
              </div>
            ) : errorMsg || (result && !result.valid) ? (
              <div className="text-center py-6 space-y-3">
                <XCircle className="w-12 h-12 text-red-600 mx-auto" />
                <h2 className="text-base font-bold text-red-700">INVALID OR COUNTERFEIT BILL</h2>
                <p className="text-xs text-neutral-600 max-w-xs mx-auto">
                  {errorMsg || result?.error || 'The scanned bill token does not correspond to any authenticated transaction in the store database.'}
                </p>
              </div>
            ) : result && result.valid && result.bill ? (
              <div className="space-y-4 text-xs font-mono">
                {/* Status Stamp */}
                {result.bill.status === 'VOIDED' ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-center space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-red-700 font-bold text-sm">
                      <XCircle className="w-4 h-4 text-red-600" />
                      BILL VOIDED / CANCELLED
                    </div>
                    {result.bill.voidReason && (
                      <p className="text-[11px] text-red-600 font-sans">
                        Reason: {result.bill.voidReason}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-center">
                    <div className="flex items-center justify-center gap-1.5 text-emerald-800 font-bold text-sm">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      AUTHENTIC BILL VERIFIED
                    </div>
                    <div className="text-[10px] text-emerald-700 font-sans mt-0.5">
                      Confirmed recorded transaction from authorized store ledger
                    </div>
                  </div>
                )}

                {/* Store Header */}
                <div className="text-center pb-3 border-b border-neutral-200">
                  <div className="font-bold text-sm text-neutral-900">{result.store?.name}</div>
                  <div className="text-[11px] text-neutral-500 font-sans mt-0.5 whitespace-pre-line">
                    {result.store?.address}
                  </div>
                  {result.store?.gstin && (
                    <div className="text-[11px] text-neutral-700 font-semibold mt-1">
                      GSTIN: {result.store?.gstin}
                    </div>
                  )}
                </div>

                {/* Bill Meta */}
                <div className="space-y-1 py-1 border-b border-neutral-200 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Bill Number:</span>
                    <span className="font-bold text-neutral-900">{result.bill.billNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Date & Time:</span>
                    <span className="text-neutral-800">{formatDateTime(result.bill.date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Payment Channel:</span>
                    <span className="font-semibold text-neutral-900">{result.bill.paymentMethod} ({result.bill.paymentStatus})</span>
                  </div>
                  {result.bill.customerName && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Customer:</span>
                      <span className="font-medium text-neutral-900">{result.bill.customerName}</span>
                    </div>
                  )}
                  {result.bill.customerGstin && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Customer GSTIN:</span>
                      <span className="font-bold font-mono text-neutral-900">{result.bill.customerGstin}</span>
                    </div>
                  )}
                </div>

                {/* Itemized List */}
                <div className="space-y-2 py-2 border-b border-neutral-200">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Purchased Items Snapshot
                  </div>
                  <div className="space-y-1.5">
                    {result.bill.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-baseline text-[11px]">
                        <div>
                          <span className="font-medium text-neutral-900">{it.name}</span>
                          <span className="text-neutral-400 text-[10px] ml-1">
                            ({it.quantity} × {formatCurrency(it.unitPrice)})
                          </span>
                        </div>
                        <span className="font-bold tabular-nums text-neutral-900">
                          {formatCurrency(it.lineTotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between text-neutral-500">
                    <span>Taxable Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(result.bill.subtotal)}</span>
                  </div>
                  {result.bill.cgst !== undefined && result.bill.cgst > 0 && (
                    <div className="flex justify-between text-neutral-500 pl-2 border-l border-neutral-200">
                      <span>CGST (Central Tax)</span>
                      <span className="tabular-nums font-mono">+{formatCurrency(result.bill.cgst)}</span>
                    </div>
                  )}
                  {result.bill.sgst !== undefined && result.bill.sgst > 0 && (
                    <div className="flex justify-between text-neutral-500 pl-2 border-l border-neutral-200">
                      <span>SGST (State Tax)</span>
                      <span className="tabular-nums font-mono">+{formatCurrency(result.bill.sgst)}</span>
                    </div>
                  )}
                  {result.bill.igst !== undefined && result.bill.igst > 0 && (
                    <div className="flex justify-between text-neutral-500 pl-2 border-l border-neutral-200">
                      <span>IGST (Integrated Tax)</span>
                      <span className="tabular-nums font-mono">+{formatCurrency(result.bill.igst)}</span>
                    </div>
                  )}
                  {result.bill.tax > 0 && (
                    <div className="flex justify-between text-neutral-700 font-medium">
                      <span>Total GST</span>
                      <span className="tabular-nums">+{formatCurrency(result.bill.tax)}</span>
                    </div>
                  )}
                  {result.bill.discount > 0 && (
                    <div className="flex justify-between text-neutral-500">
                      <span>Discount Applied</span>
                      <span className="tabular-nums">- {formatCurrency(result.bill.discount)}</span>
                    </div>
                  )}
                  {result.bill.roundOff !== undefined && result.bill.roundOff !== 0 && (
                    <div className="flex justify-between text-neutral-500">
                      <span>Round Off</span>
                      <span className="tabular-nums font-mono">
                        {result.bill.roundOff > 0 ? `+${formatCurrency(result.bill.roundOff)}` : formatCurrency(result.bill.roundOff)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-neutral-900 pt-1 border-t border-neutral-200">
                    <span>TOTAL PAID</span>
                    <span className="tabular-nums text-base">{formatCurrency(result.bill.total)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-neutral-400 text-xs">
                Scan the QR code printed on the thermal bill or paste the verification UUID token above to authenticate this invoice.
              </div>
            )}
          </div>
        </div>

        {/* Security badge */}
        <div className="text-center text-[10px] text-neutral-400 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-neutral-500" />
          <span>FryFreeze Immutable Cryptographic Receipt Verification</span>
        </div>
      </div>
    </div>
  );
};
