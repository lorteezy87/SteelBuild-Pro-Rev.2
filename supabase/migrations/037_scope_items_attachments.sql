-- ============================================================================
-- 037_scope_items_attachments.sql
--
-- Adds optional PDF (or other file) attachment columns to scope_items so a
-- user can pin the source bid-scope page, contract excerpt, or clarification
-- letter to the individual item for reference during project execution.
--
-- New columns (all nullable):
--   - file_url      TEXT — signed URL (1 h) or public URL if the bucket is
--                          configured as public. Client code should
--                          re-issue via getSignedUrl(storage_path) when a
--                          stale link fails.
--   - storage_path  TEXT — path inside the `uploads/` bucket, used to
--                          re-sign the URL and to download for AI review.
--   - file_name     TEXT — original filename the user picked — useful as
--                          the display label on the item row.
-- ============================================================================

ALTER TABLE scope_items ADD COLUMN IF NOT EXISTS file_url     TEXT;
ALTER TABLE scope_items ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE scope_items ADD COLUMN IF NOT EXISTS file_name    TEXT;

NOTIFY pgrst, 'reload schema';
