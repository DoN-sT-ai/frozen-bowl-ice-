-- ============================================================================
-- FRYFREEZE / FROZEN BOWL MULTI-STORE & CLOUD CREDENTIALS MANAGEMENT
-- Execute this SQL in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ============================================================================

-- 1. CREATE STORES TABLE
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    address TEXT NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    gstin VARCHAR(15) NOT NULL DEFAULT '',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV-',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'STOPPED', 'INACTIVE', 'SUSPENDED'
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    plan_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXPIRED', 'TRIAL'
    plan_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) but allow service & anon read/write with valid key
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon and authenticated full access to stores" ON public.stores;
CREATE POLICY "Allow anon and authenticated full access to stores"
    ON public.stores
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 2. ENSURE USERS TABLE HAS MULTI-STORE & BLOCKING COLUMNS
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'EMPLOYEE',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add store_name, is_blocked, status, store_status if they do not exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS store_name VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS store_status VARCHAR(50) DEFAULT 'ACTIVE';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS store_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_status VARCHAR(50) DEFAULT 'ACTIVE';

-- Enable RLS for users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon and authenticated full access to users" ON public.users;
CREATE POLICY "Allow anon and authenticated full access to users"
    ON public.users
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. SEED THE DEFAULT STORES (Shop 1: Frozen Bowl & Shop 2: 2ice)
INSERT INTO public.stores (id, name, code, address, phone, email, currency, invoice_prefix, active, status)
VALUES 
    (
        'a0000000-0000-0000-0000-000000000001',
        'Frozen Bowl',
        'FROZON-01',
        'Shop #1, Commercial Street',
        '+91 9876543210',
        'orders@frozenbowl.com',
        'INR',
        'FB-',
        TRUE,
        'ACTIVE'
    ),
    (
        'b0000000-0000-0000-0000-000000000002',
        '2ice',
        '2ICE-01',
        'Shop #2, Gourmet Avenue',
        '+91 9876543211',
        'orders@2ice.com',
        'INR',
        '2ICE-',
        TRUE,
        'ACTIVE'
    )
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active,
    status = EXCLUDED.status;

-- 4. LINK EXISTING USERS TO THEIR SHOP
-- Point 'frozon' and 'thangeshwar' to 'Frozen Bowl'
UPDATE public.users
SET 
    store_id = 'a0000000-0000-0000-0000-000000000001',
    store_name = 'Frozen Bowl',
    is_blocked = FALSE,
    status = 'ACTIVE',
    active = TRUE
WHERE email ILIKE '%frozon%' OR email ILIKE '%thangeshwar%' OR name ILIKE '%frozon%' OR name ILIKE '%thangeshwar%';

-- ============================================================================
-- QUICK ADMIN ACTIONS IN SUPABASE TABLE / SQL EDITOR
-- ============================================================================

-- HOW TO STOP A STORE (e.g. '2ice'):
-- When stopped, ALL users belonging to '2ice' CANNOT login and see "contact admin and renew the plan"
-- UPDATE public.stores SET active = FALSE, status = 'STOPPED' WHERE name ILIKE '%2ice%';
-- UPDATE public.users SET store_status = 'STOPPED', store_active = FALSE WHERE store_name ILIKE '%2ice%';

-- HOW TO RE-ACTIVATE A STORE (e.g. '2ice'):
-- UPDATE public.stores SET active = TRUE, status = 'ACTIVE' WHERE name ILIKE '%2ice%';
-- UPDATE public.users SET store_status = 'ACTIVE', store_active = TRUE WHERE store_name ILIKE '%2ice%';

-- HOW TO STOP 'Frozen Bowl':
-- UPDATE public.stores SET active = FALSE, status = 'STOPPED' WHERE name ILIKE '%Frozen Bowl%';

-- HOW TO BLOCK AN INDIVIDUAL USER:
-- UPDATE public.users SET is_blocked = TRUE, status = 'BLOCKED', active = FALSE WHERE email = 'user@example.com';

