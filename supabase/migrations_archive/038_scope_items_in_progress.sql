-- ============================================================================
-- 038_scope_items_in_progress.sql
--
-- Adds an "In Progress" state to scope_items so a user can distinguish:
--   - Open        (default)           → nothing pinned
--   - In Progress (in_progress = TRUE) → work has started but isn't finished
--   - Complete    (is_completed = TRUE) → done; completed supersedes in-progress
--
-- Both flags are additive — existing rows default to Open. When a row is
-- marked complete, the UI clears in_progress automatically so a single row
-- never shows both chips.
-- ============================================================================

ALTER TABLE scope_items ADD COLUMN IF NOT EXISTS in_progress    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE scope_items ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ;
ALTER TABLE scope_items ADD COLUMN IF NOT EXISTS in_progress_by TEXT;

CREATE INDEX IF NOT EXISTS idx_scope_items_in_progress
  ON scope_items (project_id, in_progress)
  WHERE in_progress = TRUE;

NOTIFY pgrst, 'reload schema';
