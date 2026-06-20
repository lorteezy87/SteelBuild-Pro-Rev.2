-- ============================================================================
-- Migration 018: Impact type tags for mitigation_logs
--
-- Adds a comma-separated impact_types field (Schedule, Cost, Safety) to
-- enable filtering and dashboard aggregation by impact category.
-- ============================================================================

ALTER TABLE mitigation_logs
  ADD COLUMN IF NOT EXISTS impact_types TEXT;
  -- Comma-separated values: "Schedule", "Cost", "Safety"
  -- Stored as text for simplicity; parsed in frontend

-- Index for filtering by impact type substring
CREATE INDEX IF NOT EXISTS idx_mitigation_logs_impact
  ON mitigation_logs (project_id, impact_types)
  WHERE impact_types IS NOT NULL;
