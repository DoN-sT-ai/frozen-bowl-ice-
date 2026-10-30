import { db } from '../db.ts';

export class VerificationService {
  static verifyBill(token: string) {
    if (!token || typeof token !== 'string') {
      return {
        valid: false,
        error: 'Invalid or missing verification token',
      };
    }

    const cleanToken = token.trim();
    const sale = db.sales.find(s => s.verification_token === cleanToken);

    if (!sale) {
      return {
        valid: false,
        error: 'No bill found matching this verification token. The bill may be counterfeit or invalid.',
      };
    }

    const store = db.stores.find(s => s.id === sale.store_id);
    const items = db.sale_items.filter(si => si.sale_id === sale.id);

    return {
      valid: true,
      store: {
        name: store?.name || 'Retail Store',
        address: store?.address || '',
        gstin: store?.gstin || '',
        phone: store?.phone || '',
        email: store?.email || '',
      },
      bill: {
        billNumber: sale.bill_number,
        date: sale.created_at,
        status: sale.status, // COMPLETED, VOIDED, REFUNDED
        items: items.map(i => ({
          name: i.product_name_snapshot,
          hsn: i.hsn_snapshot,
          quantity: i.quantity,
          unitPrice: i.unit_price,
          taxRate: i.tax_rate,
          taxAmount: i.tax_amount,
          cgstAmount: i.cgst_amount,
          sgstAmount: i.sgst_amount,
          lineTotal: i.line_total,
        })),
        subtotal: sale.subtotal,
        discount: sale.discount,
        tax: sale.tax,
        cgst: sale.cgst ?? Math.round((sale.tax / 2) * 100) / 100,
        sgst: sale.sgst ?? Math.round((sale.tax / 2) * 100) / 100,
        igst: sale.igst,
        gstType: sale.gst_type,
        roundOff: sale.round_off,
        customerName: sale.customer_name,
        customerPhone: sale.customer_phone,
        customerGstin: sale.customer_gstin,
        total: sale.total,
        paymentMethod: sale.payment_method,
        paymentStatus: sale.status === 'COMPLETED' ? 'PAID' : sale.status,
        voidReason: sale.status === 'VOIDED' ? sale.void_reason : undefined,
        voidedAt: sale.status === 'VOIDED' ? sale.voided_at : undefined,
      },
    };
  }
}
