import React, { useState, useEffect } from 'react';
import { Sale } from '../../types';
import { formatCurrency, formatDateTime, formatBillNumber } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { shareReceiptPDF, downloadReceiptPDF } from '../../lib/pdfReceipt';
import { printReceipt } from '../../lib/printerService';
import { ThermalReceiptContent } from './ThermalReceiptContent';
import {
  Printer,
  X,
  CheckCircle,
  ExternalLink,
  Share2,
  Download,
  MessageCircle,
  Copy,
  Check,
  PlusCircle,
  FileText,
  Loader2,
  Smartphone,
} from 'lucide-react';

interface ReceiptModalProps {
  sale: Sale;
  onClose: () => void;
  onNewBill: () => void;
  autoPrint?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  onClose,
  onNewBill,
  autoPrint = false,
}) => {
  const { store } = useAuth();

  // Document Type: Always default to 'BILL' (Retail/Cash Bill) - Never invoice by default
  const [docType, setDocType] = useState<'BILL' | 'INVOICE'>('BILL');

  // Printer format: Default is 'free' (Auto-Fit: fills thermal roll on POS printers, fills full page on A4 / Print to PDF)
  const [printFormat, setPrintFormat] = useState<'free' | '80mm' | '58mm' | 'a4'>('free');

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showWhatsAppDrawer, setShowWhatsAppDrawer] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState(sale.customer_phone || '');
  const [copiedLink, setCopiedLink] = useState(false);

  const publicVerificationUrl = `${window.location.origin}/?verify=${sale.verification_token}`;

  const isInvoice = docType === 'INVOICE';
  const isExempt = sale.gst_type === 'EXEMPT';

  // Dynamic Document Title: Default is BILL (RETAIL BILL / CASH BILL).
  const documentTitle = isInvoice
    ? (isExempt ? 'BILL OF SUPPLY' : 'TAX INVOICE')
    : (isExempt ? 'BILL OF SUPPLY' : (sale.payment_method === 'CASH' ? 'CASH BILL' : 'RETAIL BILL'));

  const billNumberFormatted = formatBillNumber(sale.bill_number, docType);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handlePrint = (targetFormat?: 'free' | '80mm' | '58mm' | 'a4' | React.MouseEvent) => {
    const fmt = typeof targetFormat === 'string' ? targetFormat : printFormat;
    printReceipt({
      sale,
      store,
      format: fmt,
      docType,
      qrCodeDataUrl,
    });
  };

  useEffect(() => {
    // Generate QR Code
    api.getQRCode(publicVerificationUrl)
      .then(res => setQrCodeDataUrl(res.dataUrl))
      .catch(() => {});

    // Auto trigger system print prompt if requested
    if (autoPrint) {
      showToast('Opening printer dialog...');
      const printTimer = setTimeout(() => {
        handlePrint(printFormat);
      }, 350);

      return () => clearTimeout(printTimer);
    }
  }, [sale.id, sale.verification_token, publicVerificationUrl, autoPrint]);

  const handleSharePDF = async () => {
    try {
      setIsGeneratingPdf(true);
      const res = await shareReceiptPDF({
        sale,
        store,
        docType,
        qrCodeDataUrl,
        title: `${documentTitle} #${sale.bill_number} - ${store?.name || 'Store'}`,
        text: `${documentTitle} #${sale.bill_number} for ${formatCurrency(sale.total)}. View & verify: ${publicVerificationUrl}`,
      });

      if (res.sharedViaNative) {
        showToast('Shared via device sheet!');
      } else {
        showToast('PDF downloaded successfully!');
      }
    } catch (err: any) {
      console.error('PDF generation error:', err);
      showToast('Could not generate PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setIsGeneratingPdf(true);
      await downloadReceiptPDF(sale, store, docType, qrCodeDataUrl);
      showToast('Full-Page PDF downloaded to your device!');
    } catch (err: any) {
      console.error('PDF download error:', err);
      showToast('Could not download PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSendWhatsApp = () => {
    let cleanPhone = whatsAppPhone.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    const itemsSummary = (sale.items || [])
      .slice(0, 5)
      .map((item, i) => `${i + 1}. ${item.product_name_snapshot} (${item.quantity}x) = ${formatCurrency(item.line_total)}`)
      .join('\n');
    const extraItems = (sale.items?.length || 0) > 5 ? `\n...and ${(sale.items?.length || 0) - 5} more items` : '';

    const text = `🧾 *${documentTitle}*\n` +
      `*Store:* ${store?.name || 'Retail Store'}\n` +
      `*Bill No:* ${sale.bill_number}\n` +
      `*Date:* ${formatDateTime(sale.created_at)}\n` +
      (sale.customer_name ? `*Customer:* ${sale.customer_name}\n` : '') +
      `*Total Amount:* ${formatCurrency(sale.total)} (${sale.payment_method})\n` +
      `--------------------------------\n` +
      `*Items Summary:*\n${itemsSummary}${extraItems}\n` +
      `--------------------------------\n` +
      `*View & Verify Digital Bill Online:*\n${publicVerificationUrl}\n\n` +
      `Thank you for your business! 🙏`;

    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('Opening WhatsApp...');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicVerificationUrl);
      setCopiedLink(true);
      showToast('Verification link copied to clipboard!');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      showToast('Failed to copy link.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className={`bg-white rounded-xl border border-neutral-200 shadow-2xl transition-all duration-300 w-full max-h-[96vh] flex flex-col overflow-hidden ${
        printFormat === '58mm' ? 'max-w-sm' : (printFormat === 'a4' || printFormat === 'free') ? 'max-w-2xl' : 'max-w-md'
      }`}>
        {/* Top Header */}
        <div className="p-3 sm:p-4 border-b border-neutral-200 flex items-center justify-between no-print bg-neutral-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                  {documentTitle} #{billNumberFormatted}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  READY
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-0.5">
                Total: <span className="font-semibold text-white">{formatCurrency(sale.total)}</span> · Paid via {sale.payment_method}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PRIMARY ACTIONS BANNER */}
        <div className="p-3 sm:p-3.5 bg-neutral-50 border-b border-neutral-200 no-print space-y-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
              Quick Actions:
            </div>
            {toastMessage && (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded animate-pulse">
                {toastMessage}
              </span>
            )}
          </div>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* 1. Print Receipt Button */}
            <button
              onClick={() => handlePrint(printFormat)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98] rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
              title="Print bill with connected printer"
            >
              <Printer className="w-4 h-4 text-neutral-300" />
              <span>Print {printFormat === 'free' ? 'Bill (Auto)' : printFormat === 'a4' ? 'A4 Bill' : printFormat === '58mm' ? '2" Bill' : '3" Bill'}</span>
            </button>

            {/* 2. Download Full-Page PDF Button */}
            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
              title="Download Full-Page PDF"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-indigo-200" />
                  <span>Full-Page PDF</span>
                </>
              )}
            </button>

            {/* 3. WhatsApp Share Toggle */}
            <button
              onClick={() => setShowWhatsAppDrawer(!showWhatsAppDrawer)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer ${
                showWhatsAppDrawer
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              } active:scale-[0.98]`}
              title="Send bill link and summary via WhatsApp"
            >
              <MessageCircle className="w-4 h-4 text-emerald-200" />
              <span>WhatsApp</span>
            </button>

            {/* 4. Start New Bill */}
            <button
              onClick={onNewBill}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300 active:scale-[0.98] rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
              title="Close and begin next customer transaction"
            >
              <PlusCircle className="w-4 h-4 text-neutral-500" />
              <span>New Bill</span>
            </button>
          </div>

          {/* WhatsApp Interactive Drawer / Bar */}
          {showWhatsAppDrawer && (
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-2.5 space-y-2 animate-in slide-in-from-top duration-150">
              <div className="flex items-center justify-between text-xs text-emerald-900 font-semibold">
                <span className="flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
                  Share Bill via WhatsApp
                </span>
                <button
                  onClick={handleCopyLink}
                  className="text-[11px] text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                  {copiedLink ? 'Copied Link' : 'Copy Online Link'}
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="Customer Phone (e.g. 9876543210)"
                  value={whatsAppPhone}
                  onChange={(e) => setWhatsAppPhone(e.target.value)}
                  className="flex-1 bg-white border border-emerald-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <button
                  onClick={handleSendWhatsApp}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1 shrink-0 shadow-xs"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Send WhatsApp
                </button>
              </div>
              <p className="text-[11px] text-emerald-800 leading-tight">
                Sends full itemized bill summary + verified online link directly to customer's WhatsApp chat.
              </p>
            </div>
          )}

          {/* Document Type & Format Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1.5 border-t border-neutral-200/80 text-xs">
            {/* Document Type Selector (Bill Default vs Tax Invoice) */}
            <div className="flex items-center gap-1">
              <span className="text-neutral-500 font-medium mr-1 text-[11px]">Type:</span>
              <button
                type="button"
                onClick={() => setDocType('BILL')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                  docType === 'BILL'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
                }`}
              >
                Bill (Default)
              </button>
              <button
                type="button"
                onClick={() => setDocType('INVOICE')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                  docType === 'INVOICE'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
                }`}
              >
                Tax Invoice (B2B)
              </button>
            </div>

            {/* Print Size Selector (Free Size Auto-Fit, 3" Thermal, Full Page A4, 2" Thermal) */}
            <div className="flex items-center gap-1">
              <span className="text-neutral-500 font-medium mr-1 text-[11px]">Printer:</span>
              <button
                type="button"
                onClick={() => setPrintFormat('free')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                  printFormat === 'free'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
                }`}
                title="Free size automatically scales to fit 3-inch thermal printers or full-page A4 / PDF"
              >
                Free Size (Auto)
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('80mm')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                  printFormat === '80mm'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
                }`}
                title="Fixed 3-inch (80mm) thermal POS roll"
              >
                3" Thermal
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('a4')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                  printFormat === 'a4'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
                }`}
                title="Full Page (A4 / Laser / PDF)"
              >
                Full Page (A4)
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('58mm')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                  printFormat === '58mm'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
                }`}
                title="Fixed 2-inch (58mm) roll"
              >
                2" (58mm)
              </button>
            </div>

            {/* Secondary Share Button */}
            <button
              onClick={handleSharePDF}
              disabled={isGeneratingPdf}
              className="text-xs text-neutral-600 hover:text-neutral-900 font-medium flex items-center gap-1 bg-white border border-neutral-200 px-2.5 py-1 rounded hover:bg-neutral-100 transition cursor-pointer disabled:opacity-50"
              title="Share PDF via device share sheet"
            >
              <Share2 className="w-3.5 h-3.5 text-neutral-500" />
              Share PDF
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Preview (Screen Only) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-neutral-200/70 flex justify-center items-start">
          <div
            className={`bg-white text-neutral-900 transition-all mx-auto ${
              printFormat === '58mm'
                ? 'w-full max-w-[260px] shadow-md border border-neutral-300 p-2 leading-tight text-[9px]'
                : (printFormat === 'a4' || printFormat === 'free')
                ? 'w-full max-w-2xl shadow-lg border border-neutral-300 p-6 md:p-8 text-xs'
                : 'w-full max-w-[340px] shadow-md border border-neutral-300 p-3 leading-tight text-[10px]'
            }`}
          >
            <ThermalReceiptContent
              sale={sale}
              store={store}
              docType={docType}
              qrCodeDataUrl={qrCodeDataUrl}
              isFullPagePdf={printFormat === 'a4' || printFormat === 'free'}
            />
          </div>
        </div>

        {/* Footer Actions (Screen only) */}
        <div className="p-3 sm:p-3.5 border-t border-neutral-200 bg-white flex flex-wrap items-center justify-between gap-2 no-print shrink-0">
          <a
            href={publicVerificationUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-neutral-600 hover:text-neutral-900 underline flex items-center gap-1 font-sans"
          >
            Verify Online
            <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePrint(printFormat)}
              className="px-3.5 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print ({printFormat === 'free' ? 'Auto-Fit' : printFormat === '58mm' ? '2" Thermal' : printFormat === 'a4' ? 'A4' : '3" Thermal'})
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf}
              className="px-3.5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              Download Full-Page PDF
            </button>
            <button
              onClick={onNewBill}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Start New Bill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
