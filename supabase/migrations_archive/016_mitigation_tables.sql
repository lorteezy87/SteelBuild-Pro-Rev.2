-- ============================================================================
-- Migration 016: Create mitigation_logs and mitigation_actions tables
--
-- The Mitigations page (src/pages/Mitigations.jsx) requires two tables that
-- were never created in the original schema. Without them, navigating to the
-- Mitigations page produces 404 errors:
--
--   GET /rest/v1/mitigation_logs?... → 404 (Not Found)
--
-- Tables created:
--   mitigation_logs    – main mitigation/claims-protection records
--   mitigation_actions – action items / documentation trail per mitigation
-- ============================================================================

-- ─── 1. Mitigation Logs ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mitigation_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Identification
  mitigation_number TEXT,
  title             TEXT NOT NULL,
  issue_source      TEXT CHECK (issue_source IN (
    'Alert', 'RFI', 'Constraint', 'Delivery', 'Drawing',
    'WorkPackage', 'ChangeOrder', 'Manual'
  )),
  source_entity_ref TEXT,      -- e.g. "RFI-012"
  source_entity_id  UUID,      -- FK-style ref to originating record

  -- Timeline
  identified_date   DATE DEFAULT CURRENT_DATE,
  identified_by     TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN (
    'Open', 'Noticed', 'Action Taken', 'Resolved', 'Escalated'
  )),

  -- Financial exposure
  cost_exposure          NUMERIC(14,2) DEFAULT 0,
  schedule_exposure_days INTEGER DEFAULT 0,
  is_co_candidate        BOOLEAN DEFAULT FALSE,

  -- Notice tracking
  notice_sent_date DATE,
  notice_sent_to   TEXT,
  notice_method    TEXT CHECK (notice_method IS NULL OR notice_method IN (
    'Email', 'Certified Letter', 'Hand Delivered', 'Verbal',
    'Portal Upload', 'Other'
  )),

  -- Notes
  internal_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Mitigation Actions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mitigation_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mitigation_id UUID NOT NULL REFERENCES mitigation_logs(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Action details
  action_type   TEXT CHECK (action_type IN (
    'Email Sent', 'RFI Submitted', 'Meeting Held', 'Drawing Revised',
    'Schedule Updated', 'Verbal Notice', 'Document Uploaded', 'Other'
  )),
  action_date    DATE DEFAULT CURRENT_DATE,
  performed_by   TEXT,
  description    TEXT NOT NULL,
  outcome        TEXT,

  -- Proof / documentation
  proof_url      TEXT,
  proof_filename TEXT,

  -- Follow-up
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date     DATE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. Indexes ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_mitigation_logs_project
  ON mitigation_logs (project_id, status);

CREATE INDEX IF NOT EXISTS idx_mitigation_logs_co_candidate
  ON mitigation_logs (project_id) WHERE is_co_candidate = TRUE;

CREATE INDEX IF NOT EXISTS idx_mitigation_actions_mitigation
  ON mitigation_actions (mitigation_id, action_date DESC);

-- ─── 4. RLS Policies ────────────────────────────────────────────────────

ALTER TABLE mitigation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mitigation_actions ENABLE ROW LEVEL SECURITY;

-- Allow full access (matches the pattern used in other tables)
CREATE POLICY "mitigation_logs_all" ON mitigation_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "mitigation_actions_all" ON mitigation_actions
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 5. Updated_at trigger ───────────────────────────────────────────────

-- Reuse the existing trigger function if available, otherwise create it
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_mitigation_logs_updated_at
  BEFORE UPDATE ON mitigation_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_mitigation_actions_updated_at
  BEFORE UPDATE ON mitigation_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
