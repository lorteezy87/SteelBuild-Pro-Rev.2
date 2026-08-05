-- 053_daily_logs_punchlist_gap_fill.sql
-- Adds gap-fill columns for the field-ops modules:
--   daily_logs.related_action_item_ids JSONB   - optional cross-links to action_items
--   daily_logs.related_rfi_ids         JSONB   - optional cross-links to RFIs
--   punchlist_items.photos             JSONB   - mirrors daily_logs.photos pattern

ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS related_action_item_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_rfi_ids         JSONB DEFAULT '[]'::jsonb;

ALTER TABLE punchlist_items
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN daily_logs.related_action_item_ids IS
  'Optional array of action_items.id strings linked from this daily log';
COMMENT ON COLUMN daily_logs.related_rfi_ids IS
  'Optional array of rfis.id strings linked from this daily log';
COMMENT ON COLUMN punchlist_items.photos IS
  'Array of {file_url, name, uploaded_at} objects (matches daily_logs.photos shape)';
