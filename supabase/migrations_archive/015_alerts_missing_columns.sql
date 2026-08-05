-- ============================================================================
-- Migration 015: Add missing columns to the alerts table
--
-- The application code (Layout.jsx, useAlerts.js, AlertsCenter.jsx, Alerts.jsx,
-- pages/RFIs.jsx, pages/Deliveries.jsx, pages/Submittals.jsx,
-- ExecutiveDashboard.jsx, and the generateAlerts / financialAlerts cloud
-- functions) reads and writes several columns that were never added to the
-- original schema.  This causes 400 errors on PostgREST filter queries such as:
--
--   GET /rest/v1/alerts?is_dismissed=eq.false  →  400 "column not found"
--
-- Columns added:
--   is_dismissed      – boolean flag used by every alerts consumer
--   is_read           – boolean flag used for unread badges / mark-read
--   message           – long-form body text (schema had only `description`)
--   record_type       – e.g. "RFI", "Drawing", "ChangeOrder", "Delivery"
--   record_id         – FK-style UUID pointing to the source record
--   related_entity    – same purpose as record_type, used by page-level alert
--                       creators (RFIs, Deliveries, Submittals)
--   related_record_id – same purpose as record_id, used by page-level creators
--   metric_snapshot   – JSON string with financial KPI data (financialAlerts)
-- ============================================================================

-- ─── 1. Boolean flags the UI filters / updates on ──────────────────────────

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_read      BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 2. Back-fill is_dismissed from the existing dismissed_at column ───────

UPDATE alerts
   SET is_dismissed = TRUE
 WHERE dismissed_at IS NOT NULL
   AND is_dismissed = FALSE;

-- ─── 3. Additional text / reference columns that code writes ───────────────

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS message           TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS record_type       TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS record_id         UUID;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS related_entity    TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS related_record_id UUID;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS metric_snapshot   TEXT;

-- ─── 4. Indexes for the most common query patterns ─────────────────────────

-- Layout.jsx: .filter({ is_dismissed: false, project_id: ... })
CREATE INDEX IF NOT EXISTS idx_alerts_active
  ON alerts (project_id, is_dismissed) WHERE NOT is_dismissed;

-- useAlerts.js / BellDropdown: unread + undismissed count
CREATE INDEX IF NOT EXISTS idx_alerts_unread
  ON alerts (project_id, is_read) WHERE NOT is_read AND NOT is_dismissed;
