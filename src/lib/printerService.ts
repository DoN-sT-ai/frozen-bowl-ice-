import { Sale, Store, CreditNote } from '../types';
import { formatCurrency, formatDateTime, formatBillNumber } from './utils';
import { api } from './api';

export interface PrinterCustomizationSettings {
  // Hardware & Paper
  deviceName: string;
  format: '80mm' | '58mm' | 'free' | 'a4';
  directPrint: boolean;
  autoPrintOnSale: boolean;
  copies: number;
  feedLines: number;
  density: 'compact' | 'normal' | 'large';

  // Header & Store Branding
  headerStoreNameOverride: string;
  headerTagline: string;
  showStoreAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showGstin: boolean;
  showFssai: boolean;
  fssaiNumber: string;

  // Title & Metadata
  docTitleMode: 'AUTO' | 'BILL' | 'INVOICE' | 'CASH_MEMO';
  showDateTime: boolean;
  showCashierName: boolean;
  showCustomerDetails: boolean;
  showPaymentMethod: boolean;

  // Line Items & Table
  showItemIndex: boolean;
  showHsn: boolean;
  showTaxRatePerItem: boolean;
  showModifiers: boolean;

  // Tax & Totals
  showGstBreakdown: boolean;
  showDiscountLine: boolean;
  showRoundOff: boolean;

  // Footer & Verification
  showVerificationQr: boolean;
  showVerificationToken: boolean;
  footerPrimaryMessage: string;
  footerSecondaryNote: string;
}

export const DEFAULT_THERMAL_PRINTER_SETTINGS: PrinterCustomizationSettings = {
  deviceName: '',
  format: '80mm', // DEFAULT: 80mm standard thermal roll
  directPrint: true, // DEFAULT: silent direct print to hardware
  autoPrintOnSale: true, // DEFAULT: auto-print on bill checkout
  copies: 1,
  feedLines: 2,
  density: 'normal',

  headerStoreNameOverride: '',
  headerTagline: '',
  showStoreAddress: true,
  showPhone: true,
  showEmail: true,
  showGstin: true,
  showFssai: false,
  fssaiNumber: '',

  docTitleMode: 'AUTO',
  showDateTime: true,
  showCashierName: true,
  showCustomerDetails: true,
  showPaymentMethod: true,

  showItemIndex: true,
  showHsn: true,
  showTaxRatePerItem: true,
  showModifiers: true,

  showGstBreakdown: true,
  showDiscountLine: true,
  showRoundOff: true,

  showVerificationQr: true,
  showVerificationToken: true,
  footerPrimaryMessage: '*** THANK YOU! VISIT AGAIN ***',
  footerSecondaryNote: 'Please check your items before leaving the counter.',
};

export const PRINTER_SETTINGS_STORAGE_KEY = 'pos_thermal_printer_customization';

export function isThermalPrinterName(name: string): boolean {
  if (!name) return false;
  return /(thermal|pos|receipt|tm-|rp-|tv|epson|tvs|citizen|tsc|xprinter|rongta|bixolon|snfe|pt-|zjiang|58|80|direct|receipt)/i.test(name);
}

export function getPrinterSettings(): PrinterCustomizationSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_THERMAL_PRINTER_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(PRINTER_SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    // Backward compatibility with legacy separate localStorage keys
    const legacyDevice = localStorage.getItem('pos_printer_name') || localStorage.getItem('ledger_default_printer') || '';
    const legacyFormat = (localStorage.getItem('pos_paper_size') || localStorage.getItem('ledger_printer_format') || '80mm') as any;
    const legacyDirect = localStorage.getItem('pos_direct_print') !== null
      ? localStorage.getItem('pos_direct_print') !== 'false'
      : (localStorage.getItem('ledger_direct_print') !== 'false');
    const legacyAutoPrint = localStorage.getItem('pos_auto_print') !== null
      ? localStorage.getItem('pos_auto_print') === 'true'
      : true;

    return {
      ...DEFAULT_THERMAL_PRINTER_SETTINGS,
      ...parsed,
      deviceName: parsed.deviceName ?? legacyDevice,
      format: parsed.format ?? legacyFormat ?? '80mm',
      directPrint: parsed.directPrint ?? legacyDirect ?? true,
      autoPrintOnSale: parsed.autoPrintOnSale ?? legacyAutoPrint ?? true,
    };
  } catch (_) {
    return { ...DEFAULT_THERMAL_PRINTER_SETTINGS };
  }
}

export function savePrinterSettings(updated: Partial<PrinterCustomizationSettings>): PrinterCustomizationSettings {
  const current = getPrinterSettings();
  const merged: PrinterCustomizationSettings = {
    ...current,
    ...updated,
  };

  try {
    localStorage.setItem(PRINTER_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    // Keep all legacy keys in sync across POS, Settings & modals
    localStorage.setItem('pos_printer_name', merged.deviceName || '');
    localStorage.setItem('ledger_default_printer', merged.deviceName || '');
    localStorage.setItem('pos_paper_size', merged.format || '80mm');
    localStorage.setItem('ledger_printer_format', merged.format || '80mm');
    localStorage.setItem('pos_direct_print', merged.directPrint ? 'true' : 'false');
    localStorage.setItem('ledger_direct_print', merged.directPrint ? 'true' : 'false');
    localStorage.setItem('pos_auto_print', merged.autoPrintOnSale ? 'true' : 'false');

    // Notify listeners so POSWorkspace and ReceiptModal re-render instantly
    window.dispatchEvent(new CustomEvent('pos_printer_settings_changed', { detail: merged }));

    // Persist permanently to SQLite database so closing/reopening the app never resets it
    api.savePrinterSettings(merged).catch((err) => {
      console.warn('Could not sync printer settings to local database:', err);
    });
  } catch (err) {
    console.error('Failed to save printer settings', err);
  }

  return merged;
}

export async function syncPrinterSettingsFromServer(): Promise<PrinterCustomizationSettings> {
  try {
    const res = await api.getPrinterSettings();
    if (res?.success && res.settings && Object.keys(res.settings).length > 0) {
      const merged: PrinterCustomizationSettings = {
        ...DEFAULT_THERMAL_PRINTER_SETTINGS,
        ...res.settings,
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(PRINTER_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
        localStorage.setItem('pos_printer_name', merged.deviceName || '');
        localStorage.setItem('ledger_default_printer', merged.deviceName || '');
        localStorage.setItem('pos_paper_size', merged.format || '80mm');
        localStorage.setItem('ledger_printer_format', merged.format || '80mm');
        localStorage.setItem('pos_direct_print', merged.directPrint ? 'true' : 'false');
        localStorage.setItem('ledger_direct_print', merged.directPrint ? 'true' : 'false');
        localStorage.setItem('pos_auto_print', merged.autoPrintOnSale ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent('pos_printer_settings_changed', { detail: merged }));
      }
      return merged;
    } else {
      // If server does not have settings in SQLite yet, save current local settings to SQLite
      const local = getPrinterSettings();
      api.savePrinterSettings(local).catch(() => {});
      return local;
    }
  } catch (err) {
    console.warn('Failed to sync printer settings from server:', err);
    return getPrinterSettings();
  }
}

let syncInitiated = false;
export function initPrinterSettingsSync(): void {
  if (syncInitiated || typeof window === 'undefined') return;
  syncInitiated = true;
  syncPrinterSettingsFromServer().catch(() => {});
}

// Automatically sync on initial script load in browser
if (typeof window !== 'undefined') {
  setTimeout(() => initPrinterSettingsSync(), 100);
}

export function resetPrinterSettingsToDefault(): PrinterCustomizationSettings {
  return savePrinterSettings(DEFAULT_THERMAL_PRINTER_SETTINGS);
}

export interface PrintReceiptOptions {
  sale: Sale;
  store: Store | null;
  format?: 'free' | '80mm' | '58mm' | 'a4';
  docType?: 'BILL' | 'INVOICE';
  qrCodeDataUrl?: string;
  silent?: boolean;
  deviceName?: string;
  customSettings?: Partial<PrinterCustomizationSettings>;
}

/**
 * Universal, customizable thermal & standard printing service.
 */
export function printReceipt({
  sale,
  store,
  format,
  docType = 'BILL',
  qrCodeDataUrl,
  silent,
  deviceName,
  customSettings,
}: PrintReceiptOptions): void {
  const settings: PrinterCustomizationSettings = {
    ...getPrinterSettings(),
    ...(customSettings || {}),
  };

  const chosenFormat = format || settings.format || '80mm';
  const isSilent = silent !== undefined ? silent : settings.directPrint;
  const chosenDeviceName = deviceName || settings.deviceName || '';
  const isInvoice = docType === 'INVOICE';
  const isExempt = sale.gst_type === 'EXEMPT';
  const isInterState = sale.gst_type === 'INTER_STATE';

  // Resolve Document Title based on customization mode
  let documentTitle = 'RETAIL BILL';
  if (settings.docTitleMode === 'INVOICE' || isInvoice) {
    documentTitle = isExempt ? 'BILL OF SUPPLY' : 'TAX INVOICE';
  } else if (settings.docTitleMode === 'CASH_MEMO') {
    documentTitle = 'CASH MEMO';
  } else if (settings.docTitleMode === 'BILL') {
    documentTitle = isExempt ? 'BILL OF SUPPLY' : 'RETAIL BILL';
  } else {
    // AUTO
    documentTitle = isExempt ? 'BILL OF SUPPLY' : (sale.payment_method === 'CASH' ? 'CASH BILL' : 'RETAIL BILL');
  }

  const billNumberFormatted = formatBillNumber(sale.bill_number, docType);

  // 1. Setup or update #print-portal directly on document.body
  let portal = document.getElementById('print-portal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'print-portal';
    document.body.appendChild(portal);
  }

  // 2. Set dynamic @page stylesheet
  let pageStyle = document.getElementById('dynamic-print-page');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'dynamic-print-page';
    document.head.appendChild(pageStyle);
  }

  if (chosenFormat === 'a4') {
    pageStyle.innerHTML = '@page { size: A4 portrait; margin: 8mm; }';
  } else if (chosenFormat === '58mm') {
    pageStyle.innerHTML = '@page { size: 58mm auto; margin: 1mm; }';
  } else if (chosenFormat === '80mm') {
    pageStyle.innerHTML = '@page { size: 80mm auto; margin: 1.5mm; }';
  } else {
    // 'free' auto-size
    pageStyle.innerHTML = '@page { size: auto; margin: 4mm; }';
  }

  document.body.classList.remove('print-format-58mm', 'print-format-80mm', 'print-format-a4', 'print-format-free');
  document.body.classList.add(`print-format-${chosenFormat}`);

  // 3. Compute container width & font sizes
  const isA4 = chosenFormat === 'a4';
  const isFree = chosenFormat === 'free';
  const containerWidth = isFree || isA4 ? '100%' : chosenFormat === '58mm' ? '54mm' : '76mm';

  // Density typography
  let baseFontSize = '9.5px';
  let lineHeight = '1.25';
  let cellPadding = '2.5px 0';

  if (settings.density === 'compact') {
    baseFontSize = '8.5px';
    lineHeight = '1.15';
    cellPadding = '1.5px 0';
  } else if (settings.density === 'large') {
    baseFontSize = '11px';
    lineHeight = '1.35';
    cellPadding = '4px 0';
  }

  if (isA4) {
    baseFontSize = '12px';
  } else if (chosenFormat === '58mm') {
    baseFontSize = settings.density === 'compact' ? '8px' : '9px';
  }

  // Helper to generate a single receipt body HTML
  const generateReceiptBodyHtml = (copyLabel?: string) => {
    // Build items rows HTML with strict fixed table columns
    const itemsHtml = (sale.items || []).map((item, idx) => `
      <tr style="border-bottom: 1px dotted #ccc;">
        <td style="width: 48%; padding: ${cellPadding}; vertical-align: top; text-align: left; word-break: break-word;">
          <div style="font-weight: 600; color: #000; line-height: 1.25;">
            ${settings.showItemIndex ? `${idx + 1}. ` : ''}${escapeHtml(item.product_name_snapshot)}
          </div>
          ${settings.showModifiers && item.selected_modifiers && item.selected_modifiers.length > 0 ? `
            <div style="font-size: 8px; color: #666; margin-top: 1px; padding-left: 6px;">
              ${item.selected_modifiers.map((m: any) => `+ ${escapeHtml(m.modifierName || m.name || '')}`).join(', ')}
            </div>
          ` : ''}
          ${((settings.showHsn && item.hsn_snapshot) || (settings.showTaxRatePerItem && item.tax_rate > 0)) ? `
            <div style="font-size: 8px; color: #555; margin-top: 1px;">
              ${settings.showHsn && item.hsn_snapshot ? `HSN:${escapeHtml(item.hsn_snapshot)}` : ''}
              ${(settings.showHsn && item.hsn_snapshot && settings.showTaxRatePerItem && item.tax_rate > 0) ? ' · ' : ''}
              ${settings.showTaxRatePerItem && item.tax_rate > 0 ? `GST:${item.tax_rate}%` : ''}
            </div>
          ` : ''}
        </td>
        <td style="width: 14%; padding: ${cellPadding} 2px; text-align: center; vertical-align: top; font-weight: 600; font-variant-numeric: tabular-nums;">
          ${item.quantity}
        </td>
        <td style="width: 18%; padding: ${cellPadding} 2px; text-align: right; vertical-align: top; font-variant-numeric: tabular-nums; white-space: nowrap;">
          ${formatCurrency(item.unit_price)}
        </td>
        <td style="width: 20%; padding: ${cellPadding}; text-align: right; vertical-align: top; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap;">
          ${formatCurrency(item.line_total)}
        </td>
      </tr>
    `).join('');

    // Build GST Breakdown HTML if applicable
    let gstHtml = '';
    if (settings.showGstBreakdown && !isExempt && sale.tax > 0) {
      const cgstAmt = sale.cgst ?? Math.round((sale.tax / 2) * 100) / 100;
      const sgstAmt = sale.sgst ?? Math.round((sale.tax / 2) * 100) / 100;
      gstHtml = `
        <div style="border-top: 1px dashed #444; padding: 3px 0; margin-top: 3px; font-size: 0.9em;">
          <div style="font-weight: 700; color: #555; text-transform: uppercase; margin-bottom: 2px; font-size: 8.5px;">GST Breakdown</div>
          <table style="width: 100%; border-collapse: collapse; font-size: inherit;">
            <tbody>
              <tr>
                <td style="text-align: left; padding: 1px 0; color: #444;">Taxable Amount:</td>
                <td style="text-align: right; padding: 1px 0; font-variant-numeric: tabular-nums;">${formatCurrency(sale.subtotal)}</td>
              </tr>
              ${isInterState ? `
                <tr>
                  <td style="text-align: left; padding: 1px 0; color: #444;">IGST:</td>
                  <td style="text-align: right; padding: 1px 0; font-variant-numeric: tabular-nums;">+${formatCurrency(sale.igst || sale.tax)}</td>
                </tr>
              ` : `
                <tr>
                  <td style="text-align: left; padding: 1px 0; color: #444;">CGST:</td>
                  <td style="text-align: right; padding: 1px 0; font-variant-numeric: tabular-nums;">+${formatCurrency(cgstAmt)}</td>
                </tr>
                <tr>
                  <td style="text-align: left; padding: 1px 0; color: #444;">SGST:</td>
                  <td style="text-align: right; padding: 1px 0; font-variant-numeric: tabular-nums;">+${formatCurrency(sgstAmt)}</td>
                </tr>
              `}
              <tr style="border-top: 1px dotted #ccc; font-weight: 700;">
                <td style="text-align: left; padding: 2px 0;">Total GST:</td>
                <td style="text-align: right; padding: 2px 0; font-variant-numeric: tabular-nums;">+${formatCurrency(sale.tax)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    // Build Customer HTML if enabled & present
    let customerHtml = '';
    if (settings.showCustomerDetails && (sale.customer_name || sale.customer_phone || sale.customer_gstin)) {
      customerHtml = `
        <div style="border-top: 1px dotted #ccc; padding-top: 2px; margin-top: 2px;">
          ${sale.customer_name ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Customer:</span>
              <span style="font-weight: 600;">${escapeHtml(sale.customer_name)}</span>
            </div>
          ` : ''}
          ${sale.customer_phone ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Phone:</span>
              <span>${escapeHtml(sale.customer_phone)}</span>
            </div>
          ` : ''}
          ${sale.customer_gstin ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Cust GSTIN:</span>
              <span style="font-weight: 700;">${escapeHtml(sale.customer_gstin)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    const storeDisplayName = settings.headerStoreNameOverride?.trim() || store?.name || 'RETAIL STORE';
    const fssaiToDisplay = settings.showFssai ? (settings.fssaiNumber || (store as any)?.fssai || '') : '';

    return `
      <div style="
        width: ${containerWidth} !important;
        max-width: ${containerWidth} !important;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Nirmala UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: ${baseFontSize};
        line-height: ${lineHeight};
        color: #000;
        background: #fff;
        padding: ${isA4 ? '16px' : isFree ? '8px' : '2px'};
        box-sizing: border-box;
      ">
        ${copyLabel ? `
          <div style="text-align: center; font-size: 8px; font-weight: 800; letter-spacing: 1px; color: #555; text-transform: uppercase; margin-bottom: 2px;">
            [ ${escapeHtml(copyLabel)} ]
          </div>
        ` : ''}

        <!-- Store Header -->
        <div style="text-align: center; padding-bottom: 3px;">
          <div style="font-size: ${isA4 ? '18px' : '15px'}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
            ${escapeHtml(storeDisplayName)}
          </div>
          ${settings.headerTagline ? `
            <div style="font-size: 8.5px; color: #444; font-style: italic; margin-top: 1px;">
              ${escapeHtml(settings.headerTagline)}
            </div>
          ` : ''}
          ${settings.showStoreAddress && store?.address ? `
            <div style="font-size: 9px; color: #333; margin-top: 2px; white-space: pre-line;">
              ${escapeHtml(store.address)}
            </div>
          ` : ''}
          ${(settings.showPhone && store?.phone) || (settings.showEmail && store?.email) ? `
            <div style="font-size: 8.5px; color: #333; margin-top: 1px;">
              ${settings.showPhone && store?.phone ? `Ph: ${escapeHtml(store.phone)}` : ''}
              ${settings.showPhone && store?.phone && settings.showEmail && store?.email ? ' · ' : ''}
              ${settings.showEmail && store?.email ? `Email: ${escapeHtml(store.email)}` : ''}
            </div>
          ` : ''}
          ${settings.showGstin && store?.gstin ? `
            <div style="font-size: 9.5px; font-weight: 700; margin-top: 1px;">
              GSTIN: ${escapeHtml(store.gstin)}
            </div>
          ` : ''}
          ${fssaiToDisplay ? `
            <div style="font-size: 8.5px; font-weight: 600; color: #222; margin-top: 1px;">
              FSSAI Lic No: ${escapeHtml(fssaiToDisplay)}
            </div>
          ` : ''}
        </div>

        <!-- Title Divider -->
        <div style="
          border-top: 1px dashed #000;
          border-bottom: 1px dashed #000;
          text-align: center;
          font-weight: 800;
          padding: 3px 0;
          margin: 4px 0;
          font-size: ${isA4 ? '13px' : '10.5px'};
          letter-spacing: 1px;
        ">
          *** ${escapeHtml(documentTitle)} ***
        </div>

        <!-- Metadata Section -->
        <div style="padding-bottom: 3px; font-size: 9px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #666;">${isInvoice ? 'Invoice No:' : 'Bill No:'}</span>
            <span style="font-weight: 800; font-family: monospace;">${escapeHtml(billNumberFormatted)}</span>
          </div>
          ${settings.showDateTime ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Date:</span>
              <span>${escapeHtml(formatDateTime(sale.created_at))}</span>
            </div>
          ` : ''}
          ${settings.showCashierName ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Cashier:</span>
              <span>${escapeHtml(sale.employee_name || 'Staff')}</span>
            </div>
          ` : ''}
          ${settings.showPaymentMethod ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Payment:</span>
              <span style="font-weight: 700;">${escapeHtml(sale.payment_method)}</span>
            </div>
          ` : ''}
          ${customerHtml}
        </div>

        <!-- Items Table -->
        <table style="table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; font-size: inherit; border-top: 1px dashed #000;">
          <colgroup>
            <col style="width: 48%;" />
            <col style="width: 14%;" />
            <col style="width: 18%;" />
            <col style="width: 20%;" />
          </colgroup>
          <thead>
            <tr style="border-bottom: 1px dashed #444; font-weight: 700;">
              <th style="width: 48%; text-align: left; padding: 3px 0;">ITEM / DETAILS</th>
              <th style="width: 14%; text-align: center; padding: 3px 2px;">QTY</th>
              <th style="width: 18%; text-align: right; padding: 3px 2px;">RATE</th>
              <th style="width: 20%; text-align: right; padding: 3px 0;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- GST Summary -->
        ${gstHtml}

        <!-- Totals Section -->
        <div style="border-top: 1px dashed #000; padding: 3px 0; margin-top: 3px; font-size: inherit;">
          <table style="width: 100%; border-collapse: collapse;">
            <tbody>
              <tr>
                <td style="text-align: left; padding: 1px 0; color: #444;">Subtotal:</td>
                <td style="text-align: right; padding: 1px 0; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap;">
                  ${formatCurrency(sale.subtotal)}
                </td>
              </tr>
              ${sale.tax > 0 ? `
                <tr>
                  <td style="text-align: left; padding: 1px 0; color: #444;">GST Tax:</td>
                  <td style="text-align: right; padding: 1px 0; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap;">
                    +${formatCurrency(sale.tax)}
                  </td>
                </tr>
              ` : ''}
              ${settings.showDiscountLine && sale.discount > 0 ? `
                <tr>
                  <td style="text-align: left; padding: 1px 0; color: #047857;">Discount:</td>
                  <td style="text-align: right; padding: 1px 0; color: #047857; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap;">
                    -${formatCurrency(sale.discount)}
                  </td>
                </tr>
              ` : ''}
              ${settings.showRoundOff && sale.round_off !== undefined && sale.round_off !== 0 ? `
                <tr>
                  <td style="text-align: left; padding: 1px 0; color: #666; font-size: 8px;">Round Off:</td>
                  <td style="text-align: right; padding: 1px 0; font-size: 8px; font-variant-numeric: tabular-nums; white-space: nowrap;">
                    ${sale.round_off > 0 ? '+' : ''}${formatCurrency(sale.round_off)}
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          <!-- Grand Total Banner -->
          <div style="
            border-top: 2px solid #000;
            border-bottom: 2px solid #000;
            padding: 4px 0;
            margin: 4px 0;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            font-weight: 800;
            font-size: ${isA4 ? '14px' : '12px'};
          ">
            <span>GRAND TOTAL:</span>
            <span style="font-variant-numeric: tabular-nums; white-space: nowrap;">${formatCurrency(sale.total)}</span>
          </div>

          ${settings.showPaymentMethod ? `
            <div style="display: flex; justify-content: space-between; font-size: 8px; color: #555;">
              <span>Payment Status:</span>
              <span style="font-weight: 700; color: #065f46;">PAID VIA ${escapeHtml(sale.payment_method)}</span>
            </div>
          ` : ''}
        </div>

        ${sale.notes ? `
          <div style="border-top: 1px dotted #ccc; padding: 2px 0; font-size: 8px; font-style: italic;">
            Note: ${escapeHtml(sale.notes)}
          </div>
        ` : ''}

        <!-- Verification QR & Footer -->
        <div style="border-top: 1px dashed #000; padding-top: 5px; margin-top: 5px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            ${settings.showVerificationQr && qrCodeDataUrl ? `
              <img src="${qrCodeDataUrl}" style="width: 42px; height: 42px; border: 1px solid #ccc; padding: 2px; background: #fff;" alt="QR" />
            ` : ''}
            <div style="text-align: left;">
              ${settings.showVerificationQr ? `
                <div style="font-weight: 700; font-size: 8.5px;">Scan to Verify Authentic Bill</div>
              ` : ''}
              ${settings.showVerificationToken && sale.verification_token ? `
                <div style="font-size: 7.5px; color: #666; font-family: monospace;">
                  Token: ${escapeHtml((sale.verification_token || '').slice(0, 16))}...
                </div>
              ` : ''}
              <div style="font-weight: 800; font-size: 8.5px; margin-top: 2px; letter-spacing: 0.5px;">
                ${escapeHtml(settings.footerPrimaryMessage || '*** THANK YOU! VISIT AGAIN ***')}
              </div>
            </div>
          </div>
          ${settings.footerSecondaryNote ? `
            <div style="font-size: 8px; color: #555; margin-top: 3px; font-style: italic;">
              ${escapeHtml(settings.footerSecondaryNote)}
            </div>
          ` : ''}
        </div>

        <!-- Extra Feed Lines for Tear-off -->
        <div style="height: ${(settings.feedLines || 2) * 12}px;"></div>
      </div>
    `;
  };

  // Build full print markup (handles duplicate copy if copies === 2)
  if (settings.copies === 2) {
    portal.innerHTML = `
      ${generateReceiptBodyHtml('Customer Copy')}
      <div style="border-top: 2px dashed #000; margin: 15px 0; text-align: center; font-size: 8px; font-weight: 800; letter-spacing: 2px;">
        ------------------- CUT HERE -------------------
      </div>
      ${generateReceiptBodyHtml('Store / Kitchen Copy')}
    `;
  } else {
    portal.innerHTML = generateReceiptBodyHtml();
  }

  // 4. Set document title so print spooler/PDF saver names it cleanly
  const prevTitle = document.title;
  document.title = `${isInvoice ? 'Invoice' : 'Bill'}-${billNumberFormatted}`;

  // 5. Trigger print via native Electron silent direct print or browser window.print()
  setTimeout(() => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && typeof electronAPI.print === 'function') {
        electronAPI.print({
          silent: isSilent,
          deviceName: chosenDeviceName,
        });
      } else {
        window.print();
      }
    } catch (_) {
      window.print();
    }

    // Clean up after print spooler completes
    setTimeout(() => {
      document.title = prevTitle;
      document.body.classList.remove('print-format-58mm', 'print-format-80mm', 'print-format-a4', 'print-format-free');
      if (portal && portal.parentNode) {
        portal.innerHTML = '';
      }
      if (pageStyle && pageStyle.parentNode) {
        pageStyle.parentNode.removeChild(pageStyle);
      }
    }, 1200);
  }, 100);
}

/**
 * Quick alignment test print to verify printer connectivity and paper roll width.
 */
export function printTestReceipt(
  store: Store | null,
  deviceName?: string,
  customSettings?: Partial<PrinterCustomizationSettings>
): void {
  const testSale: Sale = {
    id: 'test-receipt-' + Date.now(),
    store_id: store?.id || 'store-01',
    bill_number: 'TEST-001',
    created_at: new Date().toISOString(),
    employee_id: 'emp-1',
    employee_name: 'Store Operator',
    verification_token: 'TEST_VERIFY_TOKEN_123',
    status: 'COMPLETED',
    payment_method: 'CASH',
    subtotal: 100,
    discount: 0,
    tax: 5,
    cgst: 2.5,
    sgst: 2.5,
    igst: 0,
    gst_type: 'INTRA_STATE',
    tax_mode: 'INCLUSIVE',
    round_off: 0,
    total: 100,
    customer_name: 'Walk-in Customer',
    customer_phone: '9876543210',
    notes: 'Thermal printer alignment test',
    items: [
      {
        id: 'test-item-1',
        sale_id: 'test-receipt-item',
        product_id: 'test-p1',
        product_name_snapshot: 'Belgian Chocolate Cone',
        sku_snapshot: 'ICE-CHOC-01',
        barcode_snapshot: '8901234567890',
        quantity: 1,
        unit_price: 100,
        purchase_price_snapshot: 60,
        tax_rate: 5,
        tax_amount: 4.76,
        taxable_value: 95.24,
        cgst_amount: 2.38,
        sgst_amount: 2.38,
        igst_amount: 0,
        discount: 0,
        line_total: 100,
        selected_modifiers: [
          { modifierId: 'm1', name: 'Roasted Almonds', additionalPriceMinor: 2000 } as any
        ],
        created_at: new Date().toISOString(),
      },
    ],
  };

  printReceipt({
    sale: testSale,
    store,
    docType: 'BILL',
    silent: true,
    deviceName: deviceName,
    customSettings,
  });
}

export interface PrintCreditNoteOptions {
  creditNote: CreditNote;
  store: Store | null;
  silent?: boolean;
  deviceName?: string;
  customSettings?: Partial<PrinterCustomizationSettings>;
}

/**
 * Print customer refund voucher / credit note to thermal or standard printer.
 */
export function printCreditNoteReceipt({
  creditNote,
  store,
  silent,
  deviceName,
  customSettings,
}: PrintCreditNoteOptions): void {
  const settings: PrinterCustomizationSettings = {
    ...getPrinterSettings(),
    ...(customSettings || {}),
  };

  const chosenFormat = settings.format || '80mm';
  const isSilent = silent !== undefined ? silent : settings.directPrint;
  const chosenDeviceName = deviceName || settings.deviceName || '';

  // Setup dynamic @page stylesheet
  let pageStyle = document.getElementById('dynamic-print-page');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'dynamic-print-page';
    document.head.appendChild(pageStyle);
  }

  if (chosenFormat === 'a4') {
    pageStyle.innerHTML = '@page { size: A4 portrait; margin: 8mm; }';
  } else if (chosenFormat === '58mm') {
    pageStyle.innerHTML = '@page { size: 58mm auto; margin: 1mm; }';
  } else if (chosenFormat === '80mm') {
    pageStyle.innerHTML = '@page { size: 80mm auto; margin: 1.5mm; }';
  } else {
    pageStyle.innerHTML = '@page { size: auto; margin: 4mm; }';
  }

  document.body.classList.remove('print-format-58mm', 'print-format-80mm', 'print-format-a4', 'print-format-free');
  document.body.classList.add(`print-format-${chosenFormat}`);

  const isA4 = chosenFormat === 'a4';
  const isFree = chosenFormat === 'free';
  const containerWidth = isFree || isA4 ? '100%' : chosenFormat === '58mm' ? '54mm' : '76mm';
  const baseFontSize = isA4 ? '12px' : chosenFormat === '58mm' ? '8.5px' : '9.5px';

  let portal = document.getElementById('print-portal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'print-portal';
    document.body.appendChild(portal);
  }

  const storeName = settings.headerStoreNameOverride || store?.name || 'FryFreeze';
  const itemsHtml = (creditNote.items || []).map((item, idx) => `
    <tr style="border-bottom: 1px dotted #ccc;">
      <td style="width: 50%; padding: 2px 0; vertical-align: top; text-align: left; word-break: break-word;">
        <div style="font-weight: 600; color: #000; line-height: 1.25;">
          ${idx + 1}. ${escapeHtml(item.product_name)}
        </div>
        ${item.restocked ? '<div style="font-size: 7.5px; color: #065f46;">[Restocked to inventory]</div>' : ''}
      </td>
      <td style="width: 15%; padding: 2px 2px; text-align: center; vertical-align: top; font-weight: 600;">
        ${item.quantity_refunded}
      </td>
      <td style="width: 15%; padding: 2px 2px; text-align: right; vertical-align: top; white-space: nowrap;">
        ${formatCurrency(item.unit_price)}
      </td>
      <td style="width: 20%; padding: 2px 0; text-align: right; vertical-align: top; font-weight: 700; white-space: nowrap;">
        ${formatCurrency(item.refund_amount)}
      </td>
    </tr>
  `).join('');

  portal.innerHTML = `
    <div style="
      width: ${containerWidth};
      max-width: ${containerWidth};
      margin: 0 auto;
      font-family: 'Courier New', Courier, monospace;
      font-size: ${baseFontSize};
      line-height: 1.25;
      color: #000000;
      background: #ffffff;
      padding: 0;
      box-sizing: border-box;
      overflow: hidden;
    ">
      <!-- Store Header -->
      <div style="text-align: center; margin-bottom: 4px;">
        <div style="font-size: ${isA4 ? '16px' : '13px'}; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">
          ${escapeHtml(storeName)}
        </div>
        ${store?.address ? `
          <div style="font-size: 8.5px; color: #333; margin-top: 1px;">
            ${escapeHtml(store.address)}
          </div>
        ` : ''}
        ${store?.phone ? `
          <div style="font-size: 8.5px; color: #333; margin-top: 1px;">
            Ph: ${escapeHtml(store.phone)}
          </div>
        ` : ''}
        ${store?.gstin ? `
          <div style="font-size: 9.5px; font-weight: 700; margin-top: 1px;">
            GSTIN: ${escapeHtml(store.gstin)}
          </div>
        ` : ''}
      </div>

      <!-- Title Divider -->
      <div style="
        border-top: 1px dashed #000;
        border-bottom: 1px dashed #000;
        text-align: center;
        font-weight: 800;
        padding: 3px 0;
        margin: 4px 0;
        font-size: ${isA4 ? '13px' : '10.5px'};
        letter-spacing: 1px;
      ">
        *** CREDIT NOTE / REFUND VOUCHER ***
      </div>

      <!-- Metadata Section -->
      <div style="padding-bottom: 3px; font-size: 9px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #666;">Credit Note #:</span>
          <span style="font-weight: 800; font-family: monospace;">${escapeHtml(creditNote.credit_note_number)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #666;">Original Bill #:</span>
          <span style="font-weight: 700;">${escapeHtml(creditNote.bill_number)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #666;">Date:</span>
          <span>${escapeHtml(formatDateTime(creditNote.created_at))}</span>
        </div>
        ${creditNote.created_by_name ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #666;">Issued By:</span>
            <span>${escapeHtml(creditNote.created_by_name)}</span>
          </div>
        ` : ''}
        ${creditNote.customer_name ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #666;">Customer:</span>
            <span style="font-weight: 600;">${escapeHtml(creditNote.customer_name)}</span>
          </div>
        ` : ''}
      </div>

      <!-- Refund Items Table -->
      <table style="table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; font-size: inherit; border-top: 1px dashed #000;">
        <colgroup>
          <col style="width: 50%;" />
          <col style="width: 15%;" />
          <col style="width: 15%;" />
          <col style="width: 20%;" />
        </colgroup>
        <thead>
          <tr style="border-bottom: 1px dashed #444; font-weight: 700;">
            <th style="width: 50%; text-align: left; padding: 3px 0;">REFUNDED ITEM</th>
            <th style="width: 15%; text-align: center; padding: 3px 2px;">QTY</th>
            <th style="width: 15%; text-align: right; padding: 3px 2px;">RATE</th>
            <th style="width: 20%; text-align: right; padding: 3px 0;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Totals Section -->
      <div style="border-top: 1px dashed #000; padding: 3px 0; margin-top: 3px;">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-weight: 800;
          font-size: ${isA4 ? '14px' : '12px'};
        ">
          <span>TOTAL REFUND:</span>
          <span style="font-variant-numeric: tabular-nums; white-space: nowrap;">${formatCurrency(creditNote.refund_amount)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 8.5px; color: #444; margin-top: 2px;">
          <span>Refund Method:</span>
          <span style="font-weight: 700;">${escapeHtml(creditNote.refund_method)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 8.5px; color: #444; margin-top: 2px;">
          <span>Reason:</span>
          <span style="font-style: italic;">${escapeHtml(creditNote.reason || 'Customer Request')}</span>
        </div>
      </div>

      <!-- Footer & Signatures -->
      <div style="border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; font-size: 8px; text-align: center;">
        <div style="display: flex; justify-content: space-between; margin-top: 15px; padding: 0 4px;">
          <div style="border-top: 1px solid #444; width: 45%; text-align: center; padding-top: 2px;">
            Customer Signature
          </div>
          <div style="border-top: 1px solid #444; width: 45%; text-align: center; padding-top: 2px;">
            Store Authorized Sign
          </div>
        </div>
        <div style="font-weight: 800; font-size: 8.5px; margin-top: 8px; letter-spacing: 0.5px;">
          *** OFFICIAL CREDIT NOTE RECORD ***
        </div>
      </div>

      <div style="height: ${(settings.feedLines || 2) * 12}px;"></div>
    </div>
  `;

  const prevTitle = document.title;
  document.title = `CreditNote-${creditNote.credit_note_number}`;

  setTimeout(() => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && typeof electronAPI.print === 'function') {
        electronAPI.print({
          silent: isSilent,
          deviceName: chosenDeviceName,
        });
      } else {
        window.print();
      }
    } catch (_) {
      window.print();
    }

    setTimeout(() => {
      document.title = prevTitle;
      document.body.classList.remove('print-format-58mm', 'print-format-80mm', 'print-format-a4', 'print-format-free');
      if (portal && portal.parentNode) {
        portal.innerHTML = '';
      }
      if (pageStyle && pageStyle.parentNode) {
        pageStyle.parentNode.removeChild(pageStyle);
      }
    }, 1200);
  }, 100);
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
