-- SteelBuild Pro — Storage Security Hardening
-- Migration 004: Make app-files bucket private
--
-- The app-files bucket was created as a PUBLIC bucket, meaning any anonymous
-- user with a direct URL could read uploaded files (contracts, drawings, SOVs,
-- safety photos, etc.). This migration removes the anonymous read policy.
--
-- File access after this change:
--   - Authenticated users continue to upload and read via the Supabase client
--     (the auth_read policy covers this).
--   - Shareable links must use signed URLs (createSignedUrl) with an expiry.
--     The UploadFile helper in supabaseClient.js now returns a signed URL.
--
-- NOTE: You must also update the bucket itself in the Supabase Dashboard:
--   Storage > app-files > Edit bucket > uncheck "Public bucket"
--   (SQL cannot change the bucket's public flag — only the Dashboard or CLI can.)

-- Remove anonymous/public read access
DROP POLICY IF EXISTS "public_read" ON storage.objects;

-- Add owner-check to delete: users can only delete files they uploaded
DROP POLICY IF EXISTS "auth_delete" ON storage.objects;
CREATE POLICY "auth_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'app-files'
    AND owner_id = auth.uid()::text
  );
