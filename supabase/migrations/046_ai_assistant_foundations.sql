-- AI Scheduling Assistant (Path B minimum viable wiring).
-- Adds the scheduling link columns the assistant needs + the audit log table.
--
-- Path B notes:
--   * We don't yet have a proper schedule_activities table; the assistant
--     reads schedule_tasks via an adapter and treats its rows as activities
--     (with baseline/float reported as UNKNOWN → reasoning layer lowers
--     confidence accordingly).
--   * impacts_activity_ids stores schedule_tasks.id uuids today. When we
--     migrate to a proper schedule_activities table (Path C), we preserve
--     the uuids so existing links still resolve.
--   * RLS on ai_audit_log is intentionally permissive for every authed user
--     — matches the rest of SBP today. A project_members model + per-project
--     policies will tighten this in Path C.

ALTER TABLE rfis
  ADD COLUMN IF NOT EXISTS impacts_activity_ids uuid[] DEFAULT '{}'::uuid[];

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS impacts_activity_ids uuid[] DEFAULT '{}'::uuid[];

CREATE TABLE IF NOT EXISTS ai_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_messages jsonb NOT NULL,
  final_answer  text,
  tool_calls    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_log_project_created
  ON ai_audit_log(project_id, created_at DESC);

ALTER TABLE ai_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read audit logs" ON ai_audit_log;
CREATE POLICY "Authenticated users read audit logs"
  ON ai_audit_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users write audit logs" ON ai_audit_log;
CREATE POLICY "Authenticated users write audit logs"
  ON ai_audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
