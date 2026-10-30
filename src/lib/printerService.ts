import { Sale, Store } from '../types';
import { formatCurrency, formatDateTime, formatBillNumber } from './utils';

export interface PrintReceiptOptions {
  sale: Sale;
  store: Store | null;
  format?: 'free' | '80mm' | '58mm' | 'a4';
  docType?: 'BILL' | 'INVOICE';
  qrCodeDataUrl?: string;
  silent?: boolean;
  deviceName?: string;
}

/**
 * Universal, isolated printing service.
 * Mounts the receipt into an isolated #print-portal container directly under document.body,
 * while hiding #root with display:none in print media.
 * 
 * Features:
 * 1. "Free Size" auto-adaptation:
 *    - Automatically fills 100% of the paper width whether printed on an 80mm thermal roll
 *      or on Microsoft Print to PDF / A4 paper.
 * 2. Mathematically locked table columns:
 *    - Fixed table-layout with colgroup percentages (48%, 14%, 18%, 20%).
 *    - Native system typography supporting Tamil (e.g. தயிர்) and currency without distortion.
 * 3. Default Document Type: "BILL" (Retail Bill / Cash Bill) — never "Invoice" unless explicitly selected.
 */
export function printReceipt({
  sale,
  store,
  format,
  docType = 'BILL',
  qrCodeDataUrl,
  silent,
  deviceName,
}: PrintReceiptOptions): void {
  const chosenFormat = format || (localStorage.getItem('ledger_printer_format') as any) || '80mm';
  const isSilent = silent !== undefined
    ? silent
    : (localStorage.getItem('ledger_direct_print') === 'true');
  const chosenDeviceName = deviceName || localStorage.getItem('ledger_default_printer') || '';
  const isInvoice = docType === 'INVOICE';
  const isExempt = sale.gst_type === 'EXEMPT';
  const isInterState = sale.gst_type === 'INTER_STATE';

  const documentTitle = isInvoice
    ? (isExempt ? 'BILL OF SUPPLY' : 'TAX INVOICE')
    : (isExempt ? 'BILL OF SUPPLY' : (sale.payment_method === 'CASH' ? 'CASH BILL' : 'RETAIL BILL'));

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
    // 'free' auto-size: adapts seamlessly to ANY printer (80mm thermal roll or A4 / Print to PDF)
    pageStyle.innerHTML = '@page { size: auto; margin: 5mm; }';
  }

  document.body.classList.remove('print-format-58mm', 'print-format-80mm', 'print-format-a4', 'print-format-free');
  document.body.classList.add(`print-format-${chosenFormat}`);

  // 3. Compute container width & font sizes
  const isA4 = chosenFormat === 'a4';
  const isFree = chosenFormat === 'free';
  const containerWidth = isFree || isA4 ? '100%' : chosenFormat === '58mm' ? '54mm' : '76mm';

  const fontSize = isA4 ? '12px' : isFree ? '11px' : format === '58mm' ? '9px' : '10px';
  const containerPadding = isA4 ? '16px' : isFree ? '10px' : '2px';

  // Build items rows HTML with strict fixed table columns
  const itemsHtml = (sale.items || []).map((item, idx) => `
    <tr style="border-bottom: 1px dotted #ccc;">
      <td style="width: 48%; padding: 3px 0; vertical-align: top; text-align: left; word-break: break-word;">
        <div style="font-weight: 600; color: #000; line-height: 1.25;">${idx + 1}. ${escapeHtml(item.product_name_snapshot)}</div>
        ${(item.hsn_snapshot || item.tax_rate > 0) ? `
          <div style="font-size: 8.5px; color: #555; margin-top: 1px;">
            ${item.hsn_snapshot ? `HSN:${escapeHtml(item.hsn_snapshot)}` : ''}
            ${item.tax_rate > 0 ? ` · GST:${item.tax_rate}%` : ''}
          </div>
        ` : ''}
      </td>
      <td style="width: 14%; padding: 3px 2px; text-align: center; vertical-align: top; font-weight: 600; font-variant-numeric: tabular-nums;">
        ${item.quantity}
      </td>
      <td style="width: 18%; padding: 3px 2px; text-align: right; vertical-align: top; font-variant-numeric: tabular-nums; white-space: nowrap;">
        ${formatCurrency(item.unit_price)}
      </td>
      <td style="width: 20%; padding: 3px 0; text-align: right; vertical-align: top; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap;">
        ${formatCurrency(item.line_total)}
      </td>
    </tr>
  `).join('');

  // Build GST Breakdown HTML if applicable
  let gstHtml = '';
  if (!isExempt && sale.tax > 0) {
    const cgstAmt = sale.cgst ?? Math.round((sale.tax / 2) * 100) / 100;
    const sgstAmt = sale.sgst ?? Math.round((sale.tax / 2) * 100) / 100;
    gstHtml = `
      <div style="border-top: 1px dashed #444; padding: 4px 0; margin-top: 4px; font-size: 0.9em;">
        <div style="font-weight: 700; color: #555; text-transform: uppercase; margin-bottom: 2px;">GST Breakdown</div>
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

  // Build Customer HTML if present
  let customerHtml = '';
  if (sale.customer_name || sale.customer_phone || sale.customer_gstin) {
    customerHtml = `
      <div style="border-top: 1px dotted #ccc; padding-top: 3px; margin-top: 3px;">
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

  portal.innerHTML = `
    <div style="
      width: ${containerWidth} !important;
      max-width: ${containerWidth} !important;
      margin: 0 auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Nirmala UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: ${fontSize};
      line-height: 1.3;
      color: #000;
      background: #fff;
      padding: ${containerPadding};
      box-sizing: border-box;
    ">
      <!-- Store Header -->
      <div style="text-align: center; padding-bottom: 4px;">
        <div style="font-size: ${isA4 ? '18px' : '15px'}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
          ${escapeHtml(store?.name || 'RETAIL STORE')}
        </div>
        ${store?.address ? `
          <div style="font-size: 9.5px; color: #333; margin-top: 2px; white-space: pre-line;">
            ${escapeHtml(store.address)}
          </div>
        ` : ''}
        <div style="font-size: 9.5px; color: #333; margin-top: 2px;">
          ${store?.phone ? `Ph: ${escapeHtml(store.phone)}` : ''}
          ${store?.phone && store?.email ? ' · ' : ''}
          ${store?.email ? `Email: ${escapeHtml(store.email)}` : ''}
        </div>
        ${store?.gstin ? `
          <div style="font-size: 10px; font-weight: 700; margin-top: 2px;">
            GSTIN: ${escapeHtml(store.gstin)}
          </div>
        ` : ''}
      </div>

      <!-- Title Divider (Default BILL, never Invoice unless explicitly selected) -->
      <div style="
        border-top: 1px dashed #000;
        border-bottom: 1px dashed #000;
        text-align: center;
        font-weight: 800;
        padding: 4px 0;
        margin: 5px 0;
        font-size: ${isA4 ? '13px' : '11px'};
        letter-spacing: 1px;
      ">
        *** ${escapeHtml(documentTitle)} ***
      </div>

      <!-- Metadata Section -->
      <div style="padding-bottom: 4px; font-size: 9.5px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #666;">${isInvoice ? 'Invoice No:' : 'Bill No:'}</span>
          <span style="font-weight: 800; font-family: monospace;">${escapeHtml(billNumberFormatted)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #666;">Date:</span>
          <span>${escapeHtml(formatDateTime(sale.created_at))}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #666;">Cashier:</span>
          <span>${escapeHtml(sale.employee_name || 'Staff')}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #666;">Payment:</span>
          <span style="font-weight: 700;">${escapeHtml(sale.payment_method)}</span>
        </div>
        ${customerHtml}
      </div>

      <!-- Items Table (Guaranteed Mathematical Column Alignment) -->
      <table style="table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; font-size: 9.5px; border-top: 1px dashed #000;">
        <colgroup>
          <col style="width: 48%;" />
          <col style="width: 14%;" />
          <col style="width: 18%;" />
          <col style="width: 20%;" />
        </colgroup>
        <thead>
          <tr style="border-bottom: 1px dashed #444; font-weight: 700;">
            <th style="width: 48%; text-align: left; padding: 4px 0;">ITEM / DETAILS</th>
            <th style="width: 14%; text-align: center; padding: 4px 2px;">QTY</th>
            <th style="width: 18%; text-align: right; padding: 4px 2px;">RATE</th>
            <th style="width: 20%; text-align: right; padding: 4px 0;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- GST Summary -->
      ${gstHtml}

      <!-- Totals Section (Right-Aligned Tabular Numerals) -->
      <div style="border-top: 1px dashed #000; padding: 4px 0; margin-top: 4px; font-size: 9.5px;">
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
            ${sale.discount > 0 ? `
              <tr>
                <td style="text-align: left; padding: 1px 0; color: #047857;">Discount:</td>
                <td style="text-align: right; padding: 1px 0; color: #047857; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap;">
                  -${formatCurrency(sale.discount)}
                </td>
              </tr>
            ` : ''}
            ${sale.round_off !== undefined && sale.round_off !== 0 ? `
              <tr>
                <td style="text-align: left; padding: 1px 0; color: #666; font-size: 8.5px;">Round Off:</td>
                <td style="text-align: right; padding: 1px 0; font-size: 8.5px; font-variant-numeric: tabular-nums; white-space: nowrap;">
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
          padding: 5px 0;
          margin: 5px 0;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-weight: 800;
          font-size: ${isA4 ? '14px' : '12px'};
        ">
          <span>GRAND TOTAL:</span>
          <span style="font-variant-numeric: tabular-nums; white-space: nowrap;">${formatCurrency(sale.total)}</span>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 8.5px; color: #555;">
          <span>Payment Status:</span>
          <span style="font-weight: 700; color: #065f46;">PAID VIA ${escapeHtml(sale.payment_method)}</span>
        </div>
      </div>

      ${sale.notes ? `
        <div style="border-top: 1px dotted #ccc; padding: 3px 0; font-size: 8.5px; font-style: italic;">
          Note: ${escapeHtml(sale.notes)}
        </div>
      ` : ''}

      <!-- Verification QR & Footer -->
      <div style="border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; text-align: center;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
          ${qrCodeDataUrl ? `
            <img src="${qrCodeDataUrl}" style="width: 44px; height: 44px; border: 1px solid #ccc; padding: 2px; background: #fff;" alt="QR" />
          ` : ''}
          <div style="text-align: left;">
            <div style="font-weight: 700; font-size: 9px;">Scan to Verify Authentic Bill</div>
            <div style="font-size: 7.5px; color: #666; font-family: monospace;">
              Token: ${escapeHtml((sale.verification_token || '').slice(0, 16))}...
            </div>
            <div style="font-weight: 800; font-size: 8.5px; margin-top: 2px; letter-spacing: 0.5px;">
              *** THANK YOU! VISIT AGAIN ***
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

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
export function printTestReceipt(store: Store | null, deviceName?: string): void {
  const testSale: Sale = {
    id: 'test-receipt-' + Date.now(),
    store_id: store?.id || 'store-01',
    bill_number: 'TEST-001',
    created_at: new Date().toISOString(),
    employee_id: 'emp-1',
    employee_name: 'Store Admin',
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
    notes: 'Test thermal alignment print',
    items: [
      {
        id: 'test-item-1',
        sale_id: 'test-receipt-item',
        product_id: 'test-p1',
        product_name_snapshot: 'Test Product 1kg',
        sku_snapshot: 'TEST-SKU-1',
        barcode_snapshot: '8901234567890',
        quantity: 1,
        unit_price: 100,
        purchase_price_snapshot: 80,
        tax_rate: 5,
        tax_amount: 4.76,
        taxable_value: 95.24,
        cgst_amount: 2.38,
        sgst_amount: 2.38,
        igst_amount: 0,
        discount: 0,
        line_total: 100,
        created_at: new Date().toISOString(),
      },
    ],
  };

  printReceipt({
    sale: testSale,
    store,
    format: (localStorage.getItem('ledger_printer_format') as any) || '80mm',
    docType: 'BILL',
    silent: true,
    deviceName: deviceName || localStorage.getItem('ledger_default_printer') || '',
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

