-- ============================================================================
-- 20260616120000_revision_diff_revision_keys.sql
--
-- Re-key drawing_revision_comparisons to the LIVE per-sheet revision model so
-- the revived AI "Revision Impact Report" can persist its deltas.
--
-- Background:
--   Migration 039 keyed each comparison to a PAIR of drawing_analyses rows.
--   That analysis pathway (the DrawingAnalysis page + analyzeDrawing/
--   compareRevisions) was removed in the 2026-05-26 scope reduction; both
--   drawing_revision_comparisons and drawing_revision_deltas are empty (0 rows).
--
--   The shipping app instead tracks revisions as per-sheet drawing_revisions
--   snapshots (file_url + pdf_page, written by the slip-sheet flow in
--   src/lib/drawingHub/revisions.js). This migration lets a comparison be keyed
--   to a PAIR of drawing_revisions instead, so the on-demand "what changed
--   between two revisions of one sheet" diff can find-or-create + cache its
--   result.
--
--   drawing_revision_deltas is reused verbatim — its delta_type / severity
--   CHECK sets already match the engine. RLS is unchanged: the existing
--   project_member_access policy keys on project_id, which revision-path rows
--   continue to populate.
--
-- Safe on empty data: the analysis FKs become nullable, a `source`
-- discriminator is added, and a CHECK enforces exactly one fully-populated key
-- pair per row. No existing rows to violate it.
-- ============================================================================

ALTER TABLE drawing_revision_comparisons
  ALTER COLUMN from_analysis_id DROP NOT NULL,
  ALTER COLUMN to_analysis_id   DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS from_revision_id UUID REFERENCES drawing_revisions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS to_revision_id   UUID REFERENCES drawing_revisions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS drawing_id       UUID REFERENCES drawings(id)          ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source           TEXT NOT NULL DEFAULT 'analysis';

-- Exactly one source per row, with that source's key pair fully populated.
-- The legacy chk_diff_analyses_differ (from_analysis_id <> to_analysis_id)
-- evaluates to NULL — i.e. passes — for revision-path rows where both analysis
-- ids are NULL, so it does not conflict.
ALTER TABLE drawing_revision_comparisons
  DROP CONSTRAINT IF EXISTS chk_revision_comparison_source;
ALTER TABLE drawing_revision_comparisons
  ADD CONSTRAINT chk_revision_comparison_source CHECK (
    (source = 'analysis'
      AND from_analysis_id IS NOT NULL
      AND to_analysis_id   IS NOT NULL)
    OR
    (source = 'revision'
      AND from_revision_id IS NOT NULL
      AND to_revision_id   IS NOT NULL
      AND drawing_id       IS NOT NULL
      AND from_revision_id <> to_revision_id)
  );

-- Idempotency for the on-demand diff: one comparison per (sheet, from, to).
CREATE UNIQUE INDEX IF NOT EXISTS ux_revision_comparison_pair
  ON drawing_revision_comparisons (drawing_id, from_revision_id, to_revision_id)
  WHERE source = 'revision';

CREATE INDEX IF NOT EXISTS idx_revision_comparisons_drawing
  ON drawing_revision_comparisons (drawing_id)
  WHERE source = 'revision';

NOTIFY pgrst, 'reload schema';
