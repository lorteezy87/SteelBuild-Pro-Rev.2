-- ============================================================================
-- 039_drawing_revision_comparisons.sql
--
-- Phase 3 of the AI Drawing Analysis module — compare two uploaded drawing
-- PDFs (from the same project, different revisions) and persist the
-- delta set so a PM can review what changed between issues.
--
-- Distinct from drawing_findings because a delta is anchored to a PAIR of
-- analyses, not a single one. The UI surfaces them on their own list
-- ("Revision Comparisons") below the per-PDF analyses.
--
--   drawing_revision_comparisons — one row per (from, to) pair
--   drawing_revision_deltas      — per-change findings inside a comparison
-- ============================================================================

CREATE TABLE IF NOT EXISTS drawing_revision_comparisons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  from_analysis_id  UUID NOT NULL REFERENCES drawing_analyses(id) ON DELETE CASCADE,
  to_analysis_id    UUID NOT NULL REFERENCES drawing_analyses(id) ON DELETE CASCADE,
  compare_status    TEXT CHECK (compare_status IN ('pending','processing','complete','error')) DEFAULT 'pending',
  error_message     TEXT,
  ai_summary        TEXT,
  delta_count       INT,
  model             TEXT,
  requested_by      TEXT,
  raw_ai_response   JSONB,
  metadata          JSONB DEFAULT '{}',
  CONSTRAINT chk_diff_analyses_differ CHECK (from_analysis_id <> to_analysis_id)
);
SELECT add_updated_at_trigger('drawing_revision_comparisons');
CREATE INDEX IF NOT EXISTS idx_revision_comparisons_project ON drawing_revision_comparisons(project_id);
CREATE INDEX IF NOT EXISTS idx_revision_comparisons_status  ON drawing_revision_comparisons(compare_status);

CREATE TABLE IF NOT EXISTS drawing_revision_deltas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  comparison_id       UUID REFERENCES drawing_revision_comparisons(id) ON DELETE CASCADE,
  sheet_number        TEXT,
  delta_type          TEXT CHECK (delta_type IN (
    'sheet_added','sheet_removed',
    'grid_shift','connection_change','dimension_change',
    'detail_revised','callout_added','callout_removed',
    'material_change','elevation_change','other'
  )),
  severity            TEXT CHECK (severity IN ('critical','high','medium','low','info')),
  description         TEXT NOT NULL,
  recommended_action  TEXT,
  linked_rfi_id       UUID REFERENCES rfis(id) ON DELETE SET NULL,
  dismissed           BOOLEAN DEFAULT FALSE,
  dismissed_at        TIMESTAMPTZ,
  dismissed_by        TEXT
);
SELECT add_updated_at_trigger('drawing_revision_deltas');
CREATE INDEX IF NOT EXISTS idx_revision_deltas_comparison ON drawing_revision_deltas(comparison_id);
CREATE INDEX IF NOT EXISTS idx_revision_deltas_severity ON drawing_revision_deltas(severity) WHERE dismissed = FALSE;

ALTER TABLE drawing_revision_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_revision_deltas      ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON drawing_revision_comparisons FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON drawing_revision_deltas      FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
