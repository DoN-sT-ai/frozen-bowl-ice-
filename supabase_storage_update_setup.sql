-- ============================================================================
-- SUPABASE STORAGE BUCKET: APP-UPDATES (PRIVATE WIRELESS AUTO-UPDATES)
-- ============================================================================
-- Execute this SQL in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================================

-- 1. Create Storage Bucket for Installer Files, latest.yml, and Blockmaps
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
    'app-updates',
    'app-updates',
    false, -- Private bucket: access only via signed URLs or authorized keys
    524288000 -- 500 MB max file size limit
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 524288000;

-- 2. Storage RLS Policies: Allow Service Role full read/write
DROP POLICY IF EXISTS "Allow service role full access to app-updates" ON storage.objects;
CREATE POLICY "Allow service role full access to app-updates"
    ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'app-updates')
    WITH CHECK (bucket_id = 'app-updates');

-- 3. Allow authorized anon/authenticated upload & update of releases
DROP POLICY IF EXISTS "Allow upload to app-updates" ON storage.objects;
CREATE POLICY "Allow upload to app-updates"
    ON storage.objects
    FOR INSERT
    TO anon, authenticated, service_role
    WITH CHECK (bucket_id = 'app-updates');

DROP POLICY IF EXISTS "Allow update to app-updates" ON storage.objects;
CREATE POLICY "Allow update to app-updates"
    ON storage.objects
    FOR UPDATE
    TO anon, authenticated, service_role
    USING (bucket_id = 'app-updates');

DROP POLICY IF EXISTS "Allow read of app-updates" ON storage.objects;
CREATE POLICY "Allow read of app-updates"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated, service_role
    USING (bucket_id = 'app-updates');
