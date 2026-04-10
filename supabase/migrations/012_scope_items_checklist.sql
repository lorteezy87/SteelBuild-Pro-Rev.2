-- 012_scope_items_checklist.sql
--
-- Fix two issues on the Scope & Exclusions page:
--
-- 1. "Adding scope items silently fails" — the ScopeItemFormModal always sent
--    an `added_by` field, but the scope_items table never had that column, so
--    every insert was rejected by Postgres.
--
-- 2. Items should be checklist-style so they can be marked complete.
--
-- Both are additive column changes with safe defaults; no data migration is
-- needed and no existing rows are altered.

ALTER TABLE scope_items
  ADD COLUMN IF NOT EXISTS added_by     TEXT,
  ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by TEXT;

-- Quick filter index for "show only incomplete" queries per project.
CREATE INDEX IF NOT EXISTS idx_scope_items_project_completed
  ON scope_items (project_id, is_completed);
