-- ============================================================================
-- LEDGERSTORE BILLING & INVENTORY SYSTEM - SUPABASE DATABASE MIGRATION SCHEMA
-- Run this SQL script directly in your Supabase SQL Editor (https://app.supabase.com)
-- ============================================================================

-- 1. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. STORES TABLE
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    address TEXT NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    gstin VARCHAR(15) NOT NULL DEFAULT '',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV-',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. USERS (STAFF & ADMIN) TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PRODUCTS (INVENTORY) TABLE
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100) NOT NULL,
    hsn_code VARCHAR(20) DEFAULT '',
    description TEXT DEFAULT '',
    purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    purchase_tax_type VARCHAR(20) DEFAULT 'EXCLUSIVE' CHECK (purchase_tax_type IN ('EXCLUSIVE', 'INCLUSIVE')),
    selling_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    tax_type VARCHAR(20) DEFAULT 'EXCLUSIVE' CHECK (tax_type IN ('EXCLUSIVE', 'INCLUSIVE')),
    current_stock NUMERIC(12,3) NOT NULL DEFAULT 0.00,
    minimum_stock NUMERIC(12,3) NOT NULL DEFAULT 0.00,
    unit VARCHAR(20) NOT NULL DEFAULT 'piece',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_sku_per_store UNIQUE(store_id, sku),
    CONSTRAINT unique_barcode_per_store UNIQUE(store_id, barcode)
);

-- 6. STOCK MOVEMENTS (AUDIT TRAIL) TABLE
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('PURCHASE', 'SALE', 'ADJUSTMENT', 'DAMAGE', 'RETURN', 'VOID', 'INITIAL_STOCK')),
    quantity NUMERIC(12,3) NOT NULL,
    before_stock NUMERIC(12,3) NOT NULL,
    after_stock NUMERIC(12,3) NOT NULL,
    reason TEXT DEFAULT '',
    reference_type VARCHAR(50),
    reference_id UUID,
    purchase_cost NUMERIC(12,2),
    tax_rate NUMERIC(5,2),
    tax_amount NUMERIC(12,2),
    supplier_invoice VARCHAR(100),
    supplier_gstin VARCHAR(15),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. SALES (INVOICES / BILLS) TABLE
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    bill_number VARCHAR(100) NOT NULL UNIQUE,
    verification_token VARCHAR(100) NOT NULL UNIQUE,
    employee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    employee_name VARCHAR(255) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    cgst NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    sgst NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    igst NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    gst_type VARCHAR(20) DEFAULT 'INTRA_STATE' CHECK (gst_type IN ('INTRA_STATE', 'INTER_STATE', 'EXEMPT')),
    tax_mode VARCHAR(20) DEFAULT 'INCLUSIVE' CHECK (tax_mode IN ('INCLUSIVE', 'EXCLUSIVE', 'AUTO')),
    round_off NUMERIC(6,2) DEFAULT 0.00,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    customer_gstin VARCHAR(15),
    total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(20) NOT NULL DEFAULT 'UPI' CHECK (payment_method IN ('CASH', 'UPI', 'CARD', 'OTHER')),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED', 'REFUNDED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at TIMESTAMPTZ,
    voided_by UUID REFERENCES public.users(id),
    voided_by_name VARCHAR(255),
    void_reason TEXT
);

-- 8. SALE ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name_snapshot VARCHAR(255) NOT NULL,
    sku_snapshot VARCHAR(100) NOT NULL,
    barcode_snapshot VARCHAR(100) NOT NULL,
    hsn_snapshot VARCHAR(20),
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1.00,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    purchase_price_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_type_snapshot VARCHAR(20) DEFAULT 'EXCLUSIVE',
    taxable_value NUMERIC(12,2) DEFAULT 0.00,
    cgst_amount NUMERIC(12,2) DEFAULT 0.00,
    sgst_amount NUMERIC(12,2) DEFAULT 0.00,
    igst_amount NUMERIC(12,2) DEFAULT 0.00,
    discount NUMERIC(12,2) DEFAULT 0.00,
    line_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    description TEXT DEFAULT '',
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    before_data JSONB,
    after_data JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. BILL SEQUENCES TABLE
CREATE TABLE IF NOT EXISTS public.bill_sequences (
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    year INT NOT NULL,
    last_number INT NOT NULL DEFAULT 0,
    PRIMARY KEY (store_id, year)
);

-- 12. HIGH-PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_bill_number ON public.sales(bill_number);
CREATE INDEX IF NOT EXISTS idx_sales_verification_token ON public.sales(verification_token);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- 13. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- 14. ATOMIC BILL NUMBER GENERATOR FUNCTION
CREATE OR REPLACE FUNCTION generate_next_bill_number(p_store_id UUID, p_prefix VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_year INT;
    v_next_val INT;
    v_bill_num VARCHAR;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    
    INSERT INTO public.bill_sequences (store_id, year, last_number)
    VALUES (p_store_id, v_year, 1)
    ON CONFLICT (store_id, year)
    DO UPDATE SET last_number = public.bill_sequences.last_number + 1
    RETURNING last_number INTO v_next_val;

    v_bill_num := p_prefix || v_year || '-' || LPAD(v_next_val::TEXT, 5, '0');
    RETURN v_bill_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 15. ROW LEVEL SECURITY (RLS) POLICIES (CONFIGURED FOR ANON KEY ACCESS)
-- Enables RLS on all tables while granting full access to the app's anon key
-- ============================================================================
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_sequences ENABLE ROW LEVEL SECURITY;

-- Drop previous policies to avoid conflicts
DROP POLICY IF EXISTS "anon_stores_policy" ON public.stores;
DROP POLICY IF EXISTS "anon_users_policy" ON public.users;
DROP POLICY IF EXISTS "anon_categories_policy" ON public.categories;
DROP POLICY IF EXISTS "anon_products_policy" ON public.products;
DROP POLICY IF EXISTS "anon_stock_movements_policy" ON public.stock_movements;
DROP POLICY IF EXISTS "anon_sales_policy" ON public.sales;
DROP POLICY IF EXISTS "anon_sale_items_policy" ON public.sale_items;
DROP POLICY IF EXISTS "anon_expenses_policy" ON public.expenses;
DROP POLICY IF EXISTS "anon_audit_logs_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "anon_bill_sequences_policy" ON public.bill_sequences;

-- Grant full access to your app using the anon / authenticated / service_role keys
CREATE POLICY "anon_stores_policy" ON public.stores FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_users_policy" ON public.users FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_categories_policy" ON public.categories FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_products_policy" ON public.products FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_stock_movements_policy" ON public.stock_movements FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_sales_policy" ON public.sales FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_sale_items_policy" ON public.sale_items FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_expenses_policy" ON public.expenses FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_audit_logs_policy" ON public.audit_logs FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_bill_sequences_policy" ON public.bill_sequences FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 16. SEED STORE AND ADMIN USER
-- Login: admin@gmail.com | Password: admin
-- ============================================================================
INSERT INTO public.stores (id, name, code, address, phone, email, currency, timezone, invoice_prefix)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'FrostByte Gelato & Dessert Lounge',
  'FROSTBYTE-01',
  '123 Dessert Boulevard, Indiranagar, Bengaluru, KA 560038',
  '+91 98765 43210',
  'orders@frostbytegelato.com',
  'INR',
  'Asia/Kolkata',
  'FB'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.users (id, store_id, name, email, password_hash, salt, role, active)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Administrator',
  'admin@gmail.com',
  '7bfd8478d01c62156de8770cdc8e22b7f79723b80d7d99293c54e17736e723a7038ddbfae4030649b9ad13fb3527627c469ad3736fa79ba14dd62930b4461ffe',
  'f6a56d2404062ad6dd0c0f7117288002',
  'ADMIN',
  true
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  salt = EXCLUDED.salt,
  active = true,
  role = 'ADMIN';

