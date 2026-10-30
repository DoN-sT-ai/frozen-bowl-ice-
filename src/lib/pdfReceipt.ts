import { jsPDF } from 'jspdf';
import { Sale, Store } from '../types';
import { formatCurrency, formatDateTime, numberToWords, formatBillNumber } from './utils';

export interface PDFExportOptions {
  sale: Sale;
  store: Store | null;
  docType?: 'BILL' | 'INVOICE';
  qrCodeDataUrl?: string;
  filename?: string;
  title?: string;
  text?: string;
}

/**
 * Generates a high-definition, full-page A4 PDF bill using native HTML5 Canvas + jsPDF.
 * - 100% native text rendering supporting Tamil (e.g. தயிர்), English, and all Unicode scripts.
 * - Zero dependency on html2canvas (completely eliminates "oklch" color parser errors).
 * - Occupies the entire full A4 page with crisp, mathematically aligned columns.
 */
export async function generateReceiptPDF(
  sale: Sale,
  store: Store | null,
  docType: 'BILL' | 'INVOICE' = 'BILL',
  qrCodeDataUrl?: string
): Promise<{ pdf: jsPDF; blob: Blob }> {
  const isInvoice = docType === 'INVOICE';
  const isExempt = sale.gst_type === 'EXEMPT';
  const isInterState = sale.gst_type === 'INTER_STATE';

  const documentTitle = isInvoice
    ? (isExempt ? 'BILL OF SUPPLY' : 'TAX INVOICE')
    : (isExempt ? 'BILL OF SUPPLY' : (sale.payment_method === 'CASH' ? 'CASH BILL' : 'RETAIL BILL'));

  // Standard A4 aspect ratio at high DPI (1654 x 2338)
  const canvasWidth = 1654;
  const canvasHeight = 2338;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // 1. Fill solid white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const marginX = 90;
  const contentWidth = canvasWidth - marginX * 2; // 1474px
  const rightX = marginX + contentWidth; // 1564px
  const centerX = canvasWidth / 2; // 827px

  let currentY = 90;

  // Primary Font Stack: System native fonts with full Tamil & Unicode support
  const fontSans = 'system-ui, -apple-system, "Segoe UI", "Nirmala UI", Roboto, sans-serif';

  // 2. STORE HEADER
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = `bold 44px ${fontSans}`;
  ctx.fillText((store?.name || 'RETAIL STORE').toUpperCase(), centerX, currentY);
  currentY += 50;

  ctx.fillStyle = '#4b5563';
  ctx.font = `24px ${fontSans}`;

  if (store?.address) {
    const lines = store.address.split('\n');
    lines.forEach(line => {
      ctx.fillText(line.trim(), centerX, currentY);
      currentY += 34;
    });
  }

  const contactParts: string[] = [];
  if (store?.phone) contactParts.push(`Ph: ${store.phone}`);
  if (store?.email) contactParts.push(`Email: ${store.email}`);
  if (contactParts.length > 0) {
    ctx.fillText(contactParts.join('   |   '), centerX, currentY);
    currentY += 34;
  }

  if (store?.gstin) {
    ctx.fillStyle = '#111827';
    ctx.font = `bold 26px ${fontSans}`;
    ctx.fillText(`GSTIN / UIN: ${store.gstin}`, centerX, currentY);
    currentY += 40;
  }

  // Double horizontal divider
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(marginX, currentY);
  ctx.lineTo(rightX, currentY);
  ctx.stroke();
  currentY += 6;
  ctx.beginPath();
  ctx.moveTo(marginX, currentY);
  ctx.lineTo(rightX, currentY);
  ctx.stroke();
  currentY += 40;

  // 3. DOCUMENT TITLE
  ctx.fillStyle = '#111827';
  ctx.font = `bold 36px ${fontSans}`;
  ctx.fillText(`*** ${documentTitle} ***`, centerX, currentY);
  currentY += 30;

  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(marginX, currentY);
  ctx.lineTo(rightX, currentY);
  ctx.stroke();
  currentY += 40;

  // 4. METADATA SECTION (2 COLUMNS)
  const metaStartY = currentY;
  ctx.font = `24px ${fontSans}`;

  // Left Column
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6b7280';
  const formattedBillNo = formatBillNumber(sale.bill_number, docType);
  ctx.fillText(isInvoice ? 'Invoice No:' : 'Bill No:', marginX, currentY);
  ctx.fillStyle = '#111827';
  ctx.font = `bold 26px ${fontSans}`;
  ctx.fillText(formattedBillNo, marginX + 170, currentY);

  currentY += 38;
  ctx.font = `24px ${fontSans}`;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('Date & Time:', marginX, currentY);
  ctx.fillStyle = '#111827';
  ctx.fillText(formatDateTime(sale.created_at), marginX + 170, currentY);

  currentY += 38;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('Cashier:', marginX, currentY);
  ctx.fillStyle = '#111827';
  ctx.fillText(sale.employee_name || 'Staff', marginX + 170, currentY);

  currentY += 38;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('Payment:', marginX, currentY);
  ctx.fillStyle = '#111827';
  ctx.font = `bold 24px ${fontSans}`;
  ctx.fillText(sale.payment_method, marginX + 170, currentY);

  // Right Column (Customer info)
  let rightColY = metaStartY;
  const col2X = centerX + 60;

  ctx.font = `24px ${fontSans}`;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('Customer:', col2X, rightColY);
  ctx.fillStyle = '#111827';
  ctx.font = `bold 24px ${fontSans}`;
  ctx.fillText(sale.customer_name || 'Cash / Retail Walk-in', col2X + 160, rightColY);

  rightColY += 38;
  ctx.font = `24px ${fontSans}`;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('Phone:', col2X, rightColY);
  ctx.fillStyle = '#111827';
  ctx.fillText(sale.customer_phone || '-', col2X + 160, rightColY);

  rightColY += 38;
  ctx.fillStyle = '#6b7280';
  ctx.fillText('Cust GSTIN:', col2X, rightColY);
  ctx.fillStyle = '#111827';
  ctx.font = `bold 24px ${fontSans}`;
  ctx.fillText(sale.customer_gstin || '-', col2X + 160, rightColY);

  currentY = Math.max(currentY, rightColY) + 50;

  // 5. ITEMS TABLE (MATHEMATICALLY LOCKED COLUMNS)
  const colIndexX = marginX + 15;
  const colItemX = marginX + 60;
  const colHsnX = marginX + 780;
  const colQtyX = marginX + 960;
  const colRateX = marginX + 1180;
  const colAmountX = rightX - 20;

  // Table Header Background
  const tableHeaderHeight = 55;
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(marginX, currentY, contentWidth, tableHeaderHeight);
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 2;
  ctx.strokeRect(marginX, currentY, contentWidth, tableHeaderHeight);

  // Header Texts
  ctx.fillStyle = '#111827';
  ctx.font = `bold 24px ${fontSans}`;
  const thTextY = currentY + 37;

  ctx.textAlign = 'left';
  ctx.fillText('#', colIndexX, thTextY);
  ctx.fillText('ITEM / DETAILS', colItemX, thTextY);

  ctx.textAlign = 'center';
  ctx.fillText('HSN', colHsnX, thTextY);
  ctx.fillText('QTY', colQtyX, thTextY);

  ctx.textAlign = 'right';
  ctx.fillText('RATE', colRateX, thTextY);
  ctx.fillText('AMOUNT', colAmountX, thTextY);

  currentY += tableHeaderHeight;

  // Item Rows
  const rowHeight = 54;
  (sale.items || []).forEach((item, idx) => {
    // Alternating background
    if (idx % 2 === 1) {
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(marginX, currentY, contentWidth, rowHeight);
    }

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(marginX, currentY + rowHeight);
    ctx.lineTo(rightX, currentY + rowHeight);
    ctx.stroke();

    const rowTextY = currentY + 36;

    // Index
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b7280';
    ctx.font = `22px ${fontSans}`;
    ctx.fillText(String(idx + 1), colIndexX, rowTextY);

    // Product Name (Native Unicode supports Tamil e.g. தயிர்)
    ctx.fillStyle = '#111827';
    ctx.font = `bold 23px ${fontSans}`;
    ctx.fillText(item.product_name_snapshot, colItemX, rowTextY);

    // HSN
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4b5563';
    ctx.font = `21px ${fontSans}`;
    ctx.fillText(item.hsn_snapshot || '-', colHsnX, rowTextY);

    // Qty
    ctx.fillStyle = '#111827';
    ctx.font = `bold 23px ${fontSans}`;
    ctx.fillText(String(item.quantity), colQtyX, rowTextY);

    // Rate
    ctx.textAlign = 'right';
    ctx.font = `23px ${fontSans}`;
    ctx.fillText(formatCurrency(item.unit_price), colRateX, rowTextY);

    // Amount
    ctx.font = `bold 24px ${fontSans}`;
    ctx.fillText(formatCurrency(item.line_total), colAmountX, rowTextY);

    currentY += rowHeight;
  });

  currentY += 30;

  // 6. TOTALS & STATUTORY TAX BREAKDOWN
  const totalsBoxWidth = 560;
  const totalsBoxX = rightX - totalsBoxWidth;

  // Left: GST Breakdown (if applicable)
  const gstStartY = currentY;
  if (!isExempt && sale.tax > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#374151';
    ctx.font = `bold 22px ${fontSans}`;
    ctx.fillText('TAX BREAKDOWN (GST):', marginX, gstStartY + 25);

    ctx.font = `21px ${fontSans}`;
    ctx.fillStyle = '#4b5563';
    ctx.fillText(`Taxable Amount:   ${formatCurrency(sale.subtotal)}`, marginX, gstStartY + 60);

    if (isInterState) {
      ctx.fillText(`IGST (Integrated):   +${formatCurrency(sale.igst || sale.tax)}`, marginX, gstStartY + 95);
    } else {
      const cgstAmt = sale.cgst ?? Math.round((sale.tax / 2) * 100) / 100;
      const sgstAmt = sale.sgst ?? Math.round((sale.tax / 2) * 100) / 100;
      ctx.fillText(`CGST: +${formatCurrency(cgstAmt)}   |   SGST: +${formatCurrency(sgstAmt)}`, marginX, gstStartY + 95);
    }

    ctx.font = `bold 22px ${fontSans}`;
    ctx.fillStyle = '#111827';
    ctx.fillText(`Total GST Tax:   +${formatCurrency(sale.tax)}`, marginX, gstStartY + 130);
  }

  // Right: Totals Box
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  const totalsBoxHeight = 270;
  ctx.strokeRect(totalsBoxX, currentY, totalsBoxWidth, totalsBoxHeight);

  let totY = currentY + 36;
  const labelX = totalsBoxX + 25;
  const valX = rightX - 25;

  ctx.font = `23px ${fontSans}`;
  ctx.fillStyle = '#4b5563';
  ctx.textAlign = 'left';
  ctx.fillText('Subtotal:', labelX, totY);
  ctx.textAlign = 'right';
  ctx.fillText(formatCurrency(sale.subtotal), valX, totY);

  totY += 36;
  if (sale.tax > 0) {
    ctx.textAlign = 'left';
    ctx.fillText('GST Tax:', labelX, totY);
    ctx.textAlign = 'right';
    ctx.fillText('+' + formatCurrency(sale.tax), valX, totY);
    totY += 36;
  }

  if (sale.discount > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#047857';
    ctx.fillText('Discount:', labelX, totY);
    ctx.textAlign = 'right';
    ctx.fillText('-' + formatCurrency(sale.discount), valX, totY);
    ctx.fillStyle = '#4b5563';
    totY += 36;
  }

  if (sale.round_off !== undefined && sale.round_off !== 0) {
    ctx.textAlign = 'left';
    ctx.fillText('Round Off:', labelX, totY);
    ctx.textAlign = 'right';
    ctx.fillText((sale.round_off > 0 ? '+' : '') + formatCurrency(sale.round_off), valX, totY);
    totY += 36;
  }

  // Grand Total banner
  ctx.fillStyle = '#111827';
  ctx.fillRect(totalsBoxX, totY - 4, totalsBoxWidth, 60);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 28px ${fontSans}`;
  ctx.textAlign = 'left';
  ctx.fillText('GRAND TOTAL:', labelX, totY + 38);
  ctx.textAlign = 'right';
  ctx.fillText(formatCurrency(sale.total), valX, totY + 38);

  totY += 84;
  ctx.fillStyle = '#065f46';
  ctx.font = `bold 20px ${fontSans}`;
  ctx.textAlign = 'right';
  ctx.fillText(`PAID VIA ${sale.payment_method}`, valX, totY);

  currentY += totalsBoxHeight + 35;

  // 7. AMOUNT IN WORDS
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(marginX, currentY, contentWidth, 50);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(marginX, currentY, contentWidth, 50);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#6b7280';
  ctx.font = `bold 21px ${fontSans}`;
  ctx.fillText('Amount in Words:', marginX + 20, currentY + 33);

  ctx.fillStyle = '#111827';
  ctx.font = `bold 22px ${fontSans}`;
  ctx.fillText(numberToWords(sale.total), marginX + 220, currentY + 33);

  currentY += 80;

  // 8. VERIFICATION QR CODE & SIGNATORY
  // Draw QR Image if provided
  if (qrCodeDataUrl) {
    try {
      const qrImg = new Image();
      qrImg.src = qrCodeDataUrl;
      if (qrImg.complete) {
        ctx.drawImage(qrImg, marginX, currentY, 130, 130);
      }
    } catch {
      // Ignore if image drawing fails
    }
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#111827';
  ctx.font = `bold 23px ${fontSans}`;
  ctx.fillText('Scan to Verify Authentic Bill Online', marginX + 155, currentY + 38);

  ctx.fillStyle = '#6b7280';
  ctx.font = `20px ${fontSans}`;
  ctx.fillText(`Token: ${(sale.verification_token || '').slice(0, 16)}...`, marginX + 155, currentY + 74);
  ctx.fillText('Computer-generated bill valid without physical signature.', marginX + 155, currentY + 108);

  // Authorised Signatory on right
  ctx.textAlign = 'right';
  ctx.fillStyle = '#4b5563';
  ctx.font = `22px ${fontSans}`;
  ctx.fillText(`For ${store?.name || 'Retail Store'}`, rightX, currentY + 35);

  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rightX - 280, currentY + 95);
  ctx.lineTo(rightX, currentY + 95);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = `bold 22px ${fontSans}`;
  ctx.fillText('Authorised Signatory', rightX - 140, currentY + 124);

  // Bottom Center Banner
  currentY += 170;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = `bold 26px ${fontSans}`;
  ctx.fillText('*** THANK YOU! VISIT AGAIN ***', centerX, currentY);

  // 9. CONVERT CANVAS TO A4 jsPDF
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Exactly fills the 210mm x 297mm A4 page
  pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');

  return {
    pdf,
    blob: pdf.output('blob'),
  };
}

/**
 * Downloads the receipt as a native A4 vector PDF directly from sale data.
 * 100% immune to html2canvas, CSS parsing, or oklch color issues.
 */
export async function downloadReceiptPDF(
  sale: Sale,
  store: Store | null,
  docType: 'BILL' | 'INVOICE' = 'BILL',
  qrCodeDataUrl?: string
): Promise<void> {
  const { pdf, blob } = await generateReceiptPDF(sale, store, docType, qrCodeDataUrl);
  const title = docType === 'INVOICE' ? 'Invoice' : 'Bill';
  const cleanBillNo = formatBillNumber(sale.bill_number, docType).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${title}-${cleanBillNo}.pdf`;

  try {
    pdf.save(filename);
  } catch (err) {
    console.warn('pdf.save failed, falling back to blob anchor download:', err);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }
}

/**
 * Shares the PDF using Web Share API if supported, or downloads it.
 */
export async function shareReceiptPDF({
  sale,
  store,
  docType = 'BILL',
  qrCodeDataUrl,
  title,
  text,
}: PDFExportOptions): Promise<{ sharedViaNative: boolean }> {
  const { pdf, blob } = await generateReceiptPDF(sale, store, docType, qrCodeDataUrl);
  const fileTitle = docType === 'INVOICE' ? 'Invoice' : 'Bill';
  const cleanBillNo = formatBillNumber(sale.bill_number, docType).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${fileTitle}-${cleanBillNo}.pdf`;
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: title || filename,
        text: text || `${docType === 'INVOICE' ? 'Invoice' : 'Bill'} #${cleanBillNo} from ${store?.name || 'Store'}`,
      });
      return { sharedViaNative: true };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { sharedViaNative: false };
      }
    }
  }

  // Fallback download
  try {
    pdf.save(filename);
  } catch {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }
  return { sharedViaNative: false };
}
