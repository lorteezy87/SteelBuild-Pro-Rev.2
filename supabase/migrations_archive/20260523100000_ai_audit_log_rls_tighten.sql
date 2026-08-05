-- ─── Tighten ai_audit_log RLS ────────────────────────────────────────────────
-- The AI schedule-assistant logs each Q&A (user messages + final answer + tool
-- calls) to ai_audit_log, keyed by project_id + user_id. The original policies
-- were `auth.uid() IS NOT NULL` for BOTH read and insert, which let ANY
-- authenticated user:
--   * read every user's audit rows across all projects — a cross-tenant leak
--     of project schedule conversations, and
--   * insert forged rows attributed to any user_id / project_id (audit
--     poisoning).
--
-- New policies scope access to the row owner and project membership:
--   * SELECT — your own rows, or rows for a project you can access.
--   * INSERT — only rows attributed to yourself, for a project you can access.
--
-- No client reads this table directly; the schedule-assistant edge function
-- inserts via a user-JWT-scoped client (user_id = auth.uid()), so the tighter
-- policies do not break the existing write path. The function's optional
-- SERVICE_ROLE_OVERRIDE path bypasses RLS as before. UPDATE/DELETE remain
-- denied (no policy) so audit rows stay immutable.

ALTER TABLE ai_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read audit logs" ON ai_audit_log;
DROP POLICY IF EXISTS "Authenticated users write audit logs" ON ai_audit_log;

CREATE POLICY "ai_audit_log_read_own_or_project"
  ON ai_audit_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_has_project_access(project_id));

CREATE POLICY "ai_audit_log_insert_own"
  ON ai_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND user_has_project_access(project_id));

NOTIFY pgrst, 'reload schema';
