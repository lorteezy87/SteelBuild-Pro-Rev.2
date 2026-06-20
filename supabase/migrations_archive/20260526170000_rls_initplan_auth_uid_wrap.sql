-- Performance (Supabase auth_rls_initplan advisor): wrap auth.uid() as
-- (select auth.uid()) in 4 RLS policies so it is evaluated ONCE per query
-- (an InitPlan) instead of once per row. The access logic is byte-for-byte
-- identical to the prior policies — no grant or scope change; this is purely
-- a query-planner optimization that matters as these tables grow.
-- Applied live via Supabase MCP 2026-05-26 (user-authorized security-policy
-- change). Verified: all 4 policies retain identical USING/WITH CHECK logic.

DROP POLICY IF EXISTS ai_audit_log_insert_own ON public.ai_audit_log;
CREATE POLICY ai_audit_log_insert_own ON public.ai_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (((user_id = (select auth.uid())) AND user_has_project_access(project_id)));

DROP POLICY IF EXISTS ai_audit_log_read_own_or_project ON public.ai_audit_log;
CREATE POLICY ai_audit_log_read_own_or_project ON public.ai_audit_log
  FOR SELECT TO authenticated
  USING (((user_id = (select auth.uid())) OR user_has_project_access(project_id)));

DROP POLICY IF EXISTS bluebeam_connections_select_own ON public.bluebeam_connections;
CREATE POLICY bluebeam_connections_select_own ON public.bluebeam_connections
  FOR SELECT TO authenticated
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS default_cost_codes_admin_write ON public.default_cost_codes;
CREATE POLICY default_cost_codes_admin_write ON public.default_cost_codes
  FOR ALL TO authenticated
  USING (EXISTS ( SELECT 1 FROM user_profiles WHERE ((user_profiles.id = (select auth.uid())) AND (user_profiles.role = 'admin'::text))))
  WITH CHECK (EXISTS ( SELECT 1 FROM user_profiles WHERE ((user_profiles.id = (select auth.uid())) AND (user_profiles.role = 'admin'::text))));
