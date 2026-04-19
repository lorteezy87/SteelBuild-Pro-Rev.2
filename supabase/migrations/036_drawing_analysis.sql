-- ============================================================================
-- 036_drawing_analysis.sql
--
-- Adds the Drawing Analysis module: PM uploads a drawing PDF, llm-proxy runs
-- an AI review, and the result is persisted as:
--   drawing_analyses  — one row per uploaded PDF
--   drawing_sheets    — extracted sheet index (S1.01, E2.03, …)
--   drawing_findings  — AI-flagged issues per sheet (severity + type)
--
-- Cross-refs to projects + rfis so a finding can be promoted into an RFI.
-- ============================================================================

CREATE TABLE IF NOT EXISTS drawing_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  storage_path    TEXT,
  drawing_stage   TEXT CHECK (drawing_stage IN ('OFA','BFA','OFS','BFS','FFF','Released','IFA','IFC','Shop','Revision')),
  revision        TEXT,
  issue_date      DATE,
  uploaded_by     TEXT,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
  analysis_status TEXT CHECK (analysis_status IN ('pending','processing','complete','error')) DEFAULT 'pending',
  error_message   TEXT,
  sheet_count     INT,
  ai_summary      TEXT,
  model           TEXT,
  raw_ai_response JSONB,
  metadata        JSONB DEFAULT '{}'
);
SELECT add_updated_at_trigger('drawing_analyses');
CREATE INDEX IF NOT EXISTS idx_drawing_analyses_project ON drawing_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_analyses_status  ON drawing_analyses(analysis_status);

CREATE TABLE IF NOT EXISTS drawing_sheets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  analysis_id    UUID REFERENCES drawing_analyses(id) ON DELETE CASCADE,
  sheet_number   TEXT NOT NULL,
  sheet_title    TEXT,
  sheet_category TEXT,
  page_index     INT
);
CREATE INDEX IF NOT EXISTS idx_drawing_sheets_analysis ON drawing_sheets(analysis_id);

CREATE TABLE IF NOT EXISTS drawing_findings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  analysis_id         UUID REFERENCES drawing_analyses(id) ON DELETE CASCADE,
  sheet_number        TEXT,
  finding_type        TEXT CHECK (finding_type IN ('missing_info','coordination_conflict','callout_issue','revision_delta','dimension_concern','aess_concern')),
  severity            TEXT CHECK (severity IN ('critical','high','medium','low','info')),
  description         TEXT NOT NULL,
  recommended_action  TEXT,
  linked_rfi_id       UUID REFERENCES rfis(id) ON DELETE SET NULL,
  dismissed           BOOLEAN DEFAULT FALSE,
  dismissed_at        TIMESTAMPTZ,
  dismissed_by        TEXT
);
SELECT add_updated_at_trigger('drawing_findings');
CREATE INDEX IF NOT EXISTS idx_drawing_findings_analysis ON drawing_findings(analysis_id);
CREATE INDEX IF NOT EXISTS idx_drawing_findings_severity ON drawing_findings(severity) WHERE dismissed = FALSE;

-- RLS: match the "authenticated users can do anything" pattern used elsewhere
ALTER TABLE drawing_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_sheets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON drawing_analyses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON drawing_sheets   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON drawing_findings FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
