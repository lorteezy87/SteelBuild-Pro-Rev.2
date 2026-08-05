-- ============================================================================
-- 20260610030000_storage_tenant_isolation.sql — close the cross-tenant /
-- anonymous storage holes (applied live 2026-06-10 via Supabase MCP, captured
-- here so repo and live stay in sync)
-- ============================================================================
-- Findings (verified live 2026-06-10):
--   1. storage.objects carries full anon grants AND email-attachments' only
--      policy was `TO public FOR ALL` (named "Service role can manage email
--      attachments" — but service_role BYPASSES RLS, so the policy's only
--      effect was opening the bucket to everyone, including anonymous).
--      Net: an unauthenticated caller could list/download/overwrite/delete
--      every email attachment.
--   2. app-files policies allowed ANY authenticated user to UPDATE/DELETE any
--      object (bucket-wide). The app never updates/deletes storage objects
--      (uploads are upsert:false; no .remove() calls), so mutations can be
--      owner-scoped with zero workflow impact.
--
-- email-attachments paths are `<project_id>/<message_id>/<filename>` (195/195
-- verified), so reads get proper project-membership RLS. app-files paths are
-- flat (`uploads/<ts>-<rand>`), so its SELECT stays bucket-wide-authenticated
-- until a path restructure (tracked follow-up); mutations are owner-scoped now.
--
-- Client pairing (same commit): resolveFileUrl/getSignedUrl understand
-- bucket-prefixed paths ("email-attachments/<path>") and emailInbox filing
-- stores that form instead of a bare /storage/v1/object/ URL (which carried
-- no auth header and only worked via the dropped public policy).

-- 1) email-attachments: drop the public ALL policy; service role needs no policy.
DROP POLICY IF EXISTS "Service role can manage email attachments" ON storage.objects;

-- 2) email-attachments: project-scoped read for authenticated members.
DROP POLICY IF EXISTS email_attachments_select ON storage.objects;
CREATE POLICY email_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.user_has_project_access(((storage.foldername(name))[1])::uuid)
  );
-- No authenticated INSERT/UPDATE/DELETE on email-attachments: only the
-- email-ingest edge function writes there, with the service role.

-- 3) app-files: owner-scope mutations; reads/uploads unchanged.
DROP POLICY IF EXISTS auth_update ON storage.objects;
CREATE POLICY auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'app-files' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'app-files' AND owner = auth.uid());

DROP POLICY IF EXISTS auth_delete ON storage.objects;
CREATE POLICY auth_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'app-files' AND owner = auth.uid());

-- 4) Defense in depth (NOTE: no-op as applied). The anon grants on
--    storage.objects were issued by supabase_storage_admin (the table owner),
--    and Postgres REVOKE only removes grants made by the executing role — so
--    running this as postgres revokes nothing. Verified post-apply: the anon
--    grant remains, and that is acceptable because RLS is enabled on
--    storage.objects/buckets and NO policy targets anon or public anymore —
--    anon is blocked at the policy layer. Do not "fix" this by disabling RLS
--    or adding anon policies; the grant itself is platform-managed.
REVOKE ALL ON storage.objects FROM anon;

-- 5) Backfill: documents filed from email stored bare authenticated-endpoint
--    URLs that only worked via the public policy. Convert to bucket-prefixed
--    paths, which resolveFileUrl signs against the email-attachments bucket.
--    (Verified post-apply: 0 rows matched — the filing flow had not yet been
--    used in production; kept for any environment where it was.)
UPDATE public.documents
SET file_url = 'email-attachments/' || split_part(file_url, '/storage/v1/object/email-attachments/', 2)
WHERE file_url LIKE '%/storage/v1/object/email-attachments/%';
