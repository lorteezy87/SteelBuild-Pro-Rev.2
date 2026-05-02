-- ============================================================
-- 069: Submittal Rounds, Sheet Responses, Activity Log
-- Adds first-class round tracking, per-sheet response capture,
-- and an audit trail for the submittal workflow.
-- ============================================================

-- 1. submittal_rounds: one row per round of a submittal
CREATE TABLE IF NOT EXISTS submittal_rounds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submittal_id      UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
  round_number      INTEGER NOT NULL DEFAULT 1,
  submitted_date    DATE,
  returned_date     DATE,
  status            TEXT NOT NULL DEFAULT 'Submitted'
    CHECK (status IN ('Submitted','Under Review','Approved','Approved as Noted','Revise and Resubmit','Rejected')),
  ball_in_court     TEXT,
  submitted_by      TEXT,
  reviewer          TEXT,
  response_notes    TEXT,
  file_url          TEXT,
  markup_file_url   TEXT,
  drawing_set_ids   UUID[] NOT NULL DEFAULT '{}',
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  deleted_at        TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT uq_submittal_round UNIQUE (submittal_id, round_number)
);

CREATE INDEX idx_submittal_rounds_submittal ON submittal_rounds (submittal_id, round_number);
CREATE INDEX idx_submittal_rounds_project   ON submittal_rounds (project_id);

-- RLS
ALTER TABLE submittal_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_member_access ON submittal_rounds
  FOR ALL TO authenticated
  USING  (project_id IN (SELECT project_id FROM user_projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT project_id FROM user_projects WHERE user_id = auth.uid()));

-- 2. submittal_sheet_responses: per-sheet response within a round
CREATE TABLE IF NOT EXISTS submittal_sheet_responses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submittal_round_id  UUID NOT NULL REFERENCES submittal_rounds(id) ON DELETE CASCADE,
  drawing_id          UUID REFERENCES drawings(id) ON DELETE SET NULL,
  drawing_set_id      UUID REFERENCES drawing_sets(id) ON DELETE SET NULL,
  sheet_number        TEXT,
  response_status     TEXT NOT NULL DEFAULT 'No Exception'
    CHECK (response_status IN ('No Exception','Approved as Noted','Revise and Resubmit','Rejected','See Comments')),
  reviewer_comment    TEXT,
  markup_file_url     TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  is_deleted          BOOLEAN NOT NULL DEFAULT false,
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_sheet_responses_round   ON submittal_sheet_responses (submittal_round_id);
CREATE INDEX idx_sheet_responses_drawing ON submittal_sheet_responses (drawing_id) WHERE drawing_id IS NOT NULL;
CREATE INDEX idx_sheet_responses_project ON submittal_sheet_responses (project_id);

-- RLS
ALTER TABLE submittal_sheet_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_member_access ON submittal_sheet_responses
  FOR ALL TO authenticated
  USING  (project_id IN (SELECT project_id FROM user_projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT project_id FROM user_projects WHERE user_id = auth.uid()));

-- 3. submittal_activity: audit trail mirroring drawing_activity
CREATE TABLE IF NOT EXISTS submittal_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL,
  submittal_id  UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL
    CHECK (event_type IN (
      'created','status_changed','round_created','round_returned',
      'file_uploaded','rfi_linked','task_linked','deleted','restored',
      'sheet_response_added','bic_changed'
    )),
  from_value    TEXT,
  to_value      TEXT,
  actor_id      UUID,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submittal_activity_submittal ON submittal_activity (submittal_id, created_at DESC);
CREATE INDEX idx_submittal_activity_project   ON submittal_activity (project_id, created_at DESC);

-- RLS
ALTER TABLE submittal_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_member_access ON submittal_activity
  FOR ALL TO authenticated
  USING  (project_id IN (SELECT project_id FROM user_projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT project_id FROM user_projects WHERE user_id = auth.uid()));

-- 4. Add columns to submittals for round tracking & transmittal info
ALTER TABLE submittals ADD COLUMN IF NOT EXISTS current_round_id UUID REFERENCES submittal_rounds(id);
ALTER TABLE submittals ADD COLUMN IF NOT EXISTS total_rounds INTEGER NOT NULL DEFAULT 1;
ALTER TABLE submittals ADD COLUMN IF NOT EXISTS days_in_review INTEGER;
ALTER TABLE submittals ADD COLUMN IF NOT EXISTS received_from TEXT;
ALTER TABLE submittals ADD COLUMN IF NOT EXISTS distributed_to TEXT;
ALTER TABLE submittals ADD COLUMN IF NOT EXISTS transmittal_number TEXT;

-- 5. Add columns to drawing_sets for submittal cross-reference
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS current_submittal_id UUID REFERENCES submittals(id);
ALTER TABLE drawing_sets ADD COLUMN IF NOT EXISTS submittal_status TEXT;

-- 6. Auto-update updated_at on submittal_rounds
CREATE OR REPLACE FUNCTION tg_submittal_rounds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_submittal_rounds_updated_at
  BEFORE UPDATE ON submittal_rounds
  FOR EACH ROW EXECUTE FUNCTION tg_submittal_rounds_updated_at();

-- 7. Auto-update updated_at on submittal_sheet_responses
CREATE TRIGGER trg_sheet_responses_updated_at
  BEFORE UPDATE ON submittal_sheet_responses
  FOR EACH ROW EXECUTE FUNCTION tg_submittal_rounds_updated_at();
