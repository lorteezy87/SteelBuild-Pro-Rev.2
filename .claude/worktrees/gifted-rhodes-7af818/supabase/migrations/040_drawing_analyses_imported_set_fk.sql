-- ============================================================================
-- 040_drawing_analyses_imported_set_fk.sql
--
-- Back-link from a drawing_analyses row to the drawing_sets row it was
-- imported into. Supports the auto-import flow that promotes an AI-analyzed
-- PDF + its extracted sheets into the canonical drawings / drawing_sets
-- tables so the sheets show up on the Drawings page for KPI tracking,
-- stage advancement, due-date alerts, etc.
--
-- NULL means the analysis has not been imported yet. Once set, the import
-- utility refuses to re-run (idempotency) so a user's manual edits on the
-- target drawing_sets / drawings rows are never overwritten by a later
-- re-analysis. The user can re-import by deleting the target set first.
-- ON DELETE SET NULL so deleting the drawing_sets row doesn't cascade back
-- into the analysis history.
-- ============================================================================

ALTER TABLE drawing_analyses
  ADD COLUMN IF NOT EXISTS imported_set_id UUID
  REFERENCES drawing_sets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drawing_analyses_imported_set
  ON drawing_analyses(imported_set_id)
  WHERE imported_set_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
