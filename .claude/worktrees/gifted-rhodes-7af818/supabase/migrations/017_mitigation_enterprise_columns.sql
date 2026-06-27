-- ============================================================================
-- Migration 017: Enterprise columns for mitigation_logs
--
-- Adds probability weighting, root cause analysis, approval workflow,
-- and responsible-party tracking to the mitigations module.
-- These columns are consumed by the Mitigations page's Executive View,
-- Expected Value calculations, and PM-review workflow.
-- ============================================================================

-- ─── 1. Probability & Financial Forecasting ────────────────────────────────

ALTER TABLE mitigation_logs
  ADD COLUMN IF NOT EXISTS recovery_likelihood  INTEGER DEFAULT 50
    CHECK (recovery_likelihood BETWEEN 0 AND 100);
    -- Likelihood of cost recovery (0-100%). Used for Expected Value = cost_exposure × (recovery_likelihood / 100)

ALTER TABLE mitigation_logs
  ADD COLUMN IF NOT EXISTS expected_recovery NUMERIC(14,2) GENERATED ALWAYS AS (
    COALESCE(cost_exposure, 0) * COALESCE(recovery_likelihood, 50) / 100.0
  ) STORED;

-- ─── 2. Root Cause Analysis ────────────────────────────────────────────────

ALTER TABLE mitigation_logs
  ADD COLUMN IF NOT EXISTS root_cause_category TEXT CHECK (root_cause_category IS NULL OR root_cause_category IN (
    'Design Error', 'Site Readiness', 'Material Delay', 'Coordination Gap',
    'Scope Change', 'Weather/Force Majeure', 'Subcontractor', 'Owner Decision', 'Other'
  ));

-- ─── 3. Accountability ────────────────────────────────────────────────────

ALTER TABLE mitigation_logs
  ADD COLUMN IF NOT EXISTS responsible_party TEXT;
  -- Who is responsible for resolving this issue (person or company name)

-- ─── 4. Internal Review / Approval Workflow ───────────────────────────────

ALTER TABLE mitigation_logs
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

ALTER TABLE mitigation_logs
  ADD COLUMN IF NOT EXISTS approval_date DATE;

-- Expand status CHECK to include 'Pending PM Review'
-- We need to drop and recreate the constraint since ALTER CHECK isn't supported
ALTER TABLE mitigation_logs DROP CONSTRAINT IF EXISTS mitigation_logs_status_check;
ALTER TABLE mitigation_logs ADD CONSTRAINT mitigation_logs_status_check
  CHECK (status IN (
    'Open', 'Pending PM Review', 'Noticed', 'Action Taken', 'Resolved', 'Escalated'
  ));

-- ─── 5. Index for root cause reporting ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_mitigation_logs_root_cause
  ON mitigation_logs (project_id, root_cause_category)
  WHERE root_cause_category IS NOT NULL;
