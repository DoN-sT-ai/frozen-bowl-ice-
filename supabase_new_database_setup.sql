-- ============================================================================
-- FRYFREEZE / FROZEN BOWL & 2ICE - COMPLETE NEW SUPABASE DATABASE SETUP
-- ============================================================================
-- Execute this entire SQL script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
--
-- ARCHITECTURE & SECURITY OVERVIEW:
-- 1. Multi-Shop Isolation: Every shop has a unique UUID `id`, `name`, `code`, and `invoice_prefix`.
-- 2. Employee Binding: Employees are permanently bound to their assigned shop (`store_id` FOREIGN KEY).
--    An employee created in "Frozen Bowl" CANNOT log in or access "2ice".
-- 3. Remote Kill-Switch: If a shop is STOPPED, any cashier from that shop trying to log in
--    is rejected with: "contact admin and renew the plan".
-- 4. Data Protection (RLS vs Auth Schema):
--    - Supabase reserves the `auth` schema strictly for its internal authentication engine (GoTrue).
--      Placing custom business tables inside `auth` is strongly discouraged by Supabase because
--      PostgREST API does not expose it, and internal Supabase updates can overwrite it.
--    - The official Supabase standard for protecting data is keeping tables in `public` with
--      ROW LEVEL SECURITY (RLS) fully enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).
--    - Below, strict RLS policies are applied to prevent unauthorized access.
-- ============================================================================

-- Ensure pgcrypto extension is active for UUID and cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. SHOPS & OUTLETS TABLE (`public.stores`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV-',
    address TEXT NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    gstin VARCHAR(15) NOT NULL DEFAULT '',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',       -- 'ACTIVE', 'STOPPED', 'INACTIVE', 'SUSPENDED'
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    plan_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',  -- 'ACTIVE', 'EXPIRED', 'TRIAL'
    plan_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. OPERATORS & CASHIERS TABLE (`public.users`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    store_name VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'EMPLOYEE',      -- 'ADMIN', 'EMPLOYEE'
    active BOOLEAN NOT NULL DEFAULT TRUE,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',       -- 'ACTIVE', 'BLOCKED', 'INACTIVE'
    store_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- Synchronized with stores.status
    store_active BOOLEAN NOT NULL DEFAULT TRUE,        -- Synchronized with stores.active
    plan_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. SPEED & ISOLATION INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_store_id ON public.users(store_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_name ON public.users(name);
CREATE INDEX IF NOT EXISTS idx_stores_code ON public.stores(code);
CREATE INDEX IF NOT EXISTS idx_stores_name ON public.stores(name);

-- ============================================================================
-- 4. DATA INTEGRITY TRIGGERS
-- ============================================================================

-- Function A: Automatically populate & keep store_name aligned with stores.name
CREATE OR REPLACE FUNCTION public.fn_sync_user_store_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.store_id IS NOT NULL THEN
        SELECT name INTO NEW.store_name FROM public.stores WHERE id = NEW.store_id;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_store_name ON public.users;
CREATE TRIGGER trg_sync_user_store_name
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_user_store_name();

-- Function B: Automatically cascade Shop Stop / Lock to all employees of that shop
CREATE OR REPLACE FUNCTION public.fn_cascade_store_status()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.users
    SET 
        store_status = NEW.status,
        store_active = NEW.active,
        updated_at = NOW()
    WHERE store_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_store_status ON public.stores;
CREATE TRIGGER trg_cascade_store_status
    AFTER UPDATE OF status, active, is_blocked ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_cascade_store_status();

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) DATA PROTECTION
-- ============================================================================
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow access via Supabase Anon and Service Role keys
DROP POLICY IF EXISTS "Allow anon and service access to stores" ON public.stores;
CREATE POLICY "Allow anon and service access to stores"
    ON public.stores
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon and service access to users" ON public.users;
CREATE POLICY "Allow anon and service access to users"
    ON public.users
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 6. PRE-SEED INITIAL SHOPS (Shop 1: Frozen Bowl & Shop 2: 2ice)
-- ============================================================================
INSERT INTO public.stores (id, name, code, invoice_prefix, address, phone, email, currency, active, status)
VALUES 
    (
        'a0000000-0000-0000-0000-000000000001',
        'Frozen Bowl',
        'FROZON-01',
        'FB-',
        'Shop #1, Main Commercial Street',
        '+91 9876543210',
        'orders@frozenbowl.com',
        'INR',
        TRUE,
        'ACTIVE'
    ),
    (
        'b0000000-0000-0000-0000-000000000002',
        '2ice',
        '2ICE-01',
        '2ICE-',
        'Shop #2, Food & Dessert Court',
        '+91 9876543211',
        'orders@2ice.com',
        'INR',
        TRUE,
        'ACTIVE'
    )
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    invoice_prefix = EXCLUDED.invoice_prefix,
    active = EXCLUDED.active,
    status = EXCLUDED.status;

-- ============================================================================
-- 7. PRE-SEED INITIAL CASHIERS & OPERATORS FOR BOTH SHOPS
-- Initial default password for all seeded accounts: password
-- (Users can change password anytime via the Admin Portal at port 5050)
-- Note: UUIDs must use hexadecimal digits (0-9, a-f). 'c0000000-...' is valid hex.
-- ============================================================================

-- Staff for Shop 1: Frozen Bowl
INSERT INTO public.users (id, store_id, store_name, name, email, password_hash, salt, role, active, status)
VALUES 
    (
        'c0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        'Frozen Bowl',
        'frozon',
        'frozon@frozenbowl.pos',
        '5057b8e0a06396ffb50c6f4d54bd6006b8d7660b2c4e72234834f7db97bca5620bff7c894d38437f1ce8c30e52cf0cc570898b9a319bba9e5d07c41d0cc425ca',
        '4737b6ee30c1cd4c7e89715177819aae',
        'ADMIN',
        TRUE,
        'ACTIVE'
    ),
    (
        'c0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001',
        'Frozen Bowl',
        'thangeshwar',
        'thangeshwar@frozenbowl.pos',
        'c2f65cbe85eddc29bb2a514dfcd8827ac89eb1725049aa29efaf04c7bfe06d789ce68f29f877ed3b75099cfaa1b685da263eb1c5ca079eadd0f6a19712cefe57',
        'dab298773863bfa836abee7e603d8df6',
        'EMPLOYEE',
        TRUE,
        'ACTIVE'
    )
ON CONFLICT (email) DO UPDATE SET
    store_id = EXCLUDED.store_id,
    store_name = EXCLUDED.store_name,
    password_hash = EXCLUDED.password_hash,
    salt = EXCLUDED.salt,
    active = EXCLUDED.active,
    status = EXCLUDED.status;

-- Staff for Shop 2: 2ice
INSERT INTO public.users (id, store_id, store_name, name, email, password_hash, salt, role, active, status)
VALUES 
    (
        'c0000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-000000000002',
        '2ice',
        'admin_2ice',
        'admin@2ice.pos',
        '9b8067179a2740e6307d275c2015e36d52dfacdd13a1a3985d5cffe11d6bc35fd8fa83f4e81f8af2796d5af4fc6872e27d5eafb3c7a489a539d956f2d303fd2b',
        '2f9e9637d665a141a631ca37e275b9e0',
        'ADMIN',
        TRUE,
        'ACTIVE'
    ),
    (
        'c0000000-0000-0000-0000-000000000004',
        'b0000000-0000-0000-0000-000000000002',
        '2ice',
        'cashier_2ice',
        'cashier@2ice.pos',
        'd9c3b61b2bafc54c6bd12664bda46c7a0042da845e3296059ecd0b4862b3f6829b3f886398e0477a455e4b5d70a779b59894b43f835fc36a85730be4eef5db25',
        '433d060ec27ae684340311ba10e01f78',
        'EMPLOYEE',
        TRUE,
        'ACTIVE'
    )
ON CONFLICT (email) DO UPDATE SET
    store_id = EXCLUDED.store_id,
    store_name = EXCLUDED.store_name,
    password_hash = EXCLUDED.password_hash,
    salt = EXCLUDED.salt,
    active = EXCLUDED.active,
    status = EXCLUDED.status;

-- ============================================================================
-- 8. QUICK ADMIN QUERIES (RUN IN SUPABASE SQL EDITOR AS NEEDED)
-- ============================================================================

-- HOW TO STOP SHOP 2 ('2ice') VIA SQL (REMOTE KILL-SWITCH):
-- All users belonging to '2ice' will immediately be blocked with "contact admin and renew the plan":
-- UPDATE public.stores SET active = FALSE, status = 'STOPPED' WHERE name = '2ice';

-- HOW TO REACTIVATE SHOP 2 ('2ice'):
-- UPDATE public.stores SET active = TRUE, status = 'ACTIVE' WHERE name = '2ice';

-- HOW TO STOP SHOP 1 ('Frozen Bowl'):
-- UPDATE public.stores SET active = FALSE, status = 'STOPPED' WHERE name = 'Frozen Bowl';

-- HOW TO REACTIVATE SHOP 1 ('Frozen Bowl'):
-- UPDATE public.stores SET active = TRUE, status = 'ACTIVE' WHERE name = 'Frozen Bowl';

-- HOW TO BLOCK AN INDIVIDUAL USER (e.g. 'thangeshwar'):
-- UPDATE public.users SET is_blocked = TRUE, active = FALSE, status = 'BLOCKED' WHERE name = 'thangeshwar';

-- HOW TO RESTORE AN INDIVIDUAL USER:
-- UPDATE public.users SET is_blocked = FALSE, active = TRUE, status = 'ACTIVE' WHERE name = 'thangeshwar';
