-- ============================================================================
-- 032_security_tighten_rls.sql
--
-- Closes two critical RLS findings from the enterprise-readiness audit
-- (docs/enterprise-audit-20260417.md, Section 5.1 and 5.2):
--
-- 1. DROP user_projects.auth_all — a policy granting {authenticated} role
--    unrestricted ALL access to the membership table. Because every other
--    project-isolation policy resolves this table, this policy was forgeable:
--    any authenticated user could INSERT a row granting themselves access
--    to any project, and every RLS check across the app would then let them
--    through.
--
-- 2. DROP the {public}-role policies on mitigation_actions and mitigation_logs
--    (mitigation_actions_all, mitigation_logs_all). The {public} role in
--    Postgres includes anon — the Supabase anon key is embedded in the
--    deployed JS bundle, so these tables were readable and writable by
--    anyone with no authentication at all.
--
-- Replace with the same 5-policy pattern used on action_items, alerts, and
-- every other project-scoped table:
--   - project_member_access (ALL, authenticated, EXISTS user_projects)
--   - project_select (SELECT, authenticated, user_has_project_access)
--   - project_insert (INSERT, authenticated, user_has_project_access)
--   - project_update (UPDATE, authenticated, user_has_project_access)
--   - project_delete (DELETE, authenticated, user_has_project_access)
--
-- Pre-migration verification (recorded in commit message and audit doc):
--   - user_projects is never queried from app code (grep src/ returned 0)
--   - user_has_project_access() is SECURITY DEFINER, bypasses RLS on
--     user_projects, so cross-table policies still resolve correctly
--   - Remaining user_projects policies cover legitimate access paths:
--       users_see_own_memberships, users_insert_own_membership,
--       admins_update_memberships, admins_delete_memberships
--   - Mitigation tables have project_id UUID NOT NULL — compatible with
--     the action_items policy pattern
--   - Mitigation modules access the tables via the authenticated
--     base44.entities.{MitigationLog,MitigationAction} client
-- ============================================================================

BEGIN;

-- ─── 1. user_projects: drop the forgeable auth_all policy ─────────────────

DROP POLICY IF EXISTS auth_all ON public.user_projects;

-- Remaining policies after this migration:
--   users_see_own_memberships  (SELECT,  user_id = auth.uid())
--   users_insert_own_membership(INSERT,  with_check user_id = auth.uid())
--   admins_update_memberships  (UPDATE,  admin role on project)
--   admins_delete_memberships  (DELETE,  admin role on project)
--   postgres_full_access       (ALL,    role postgres — backend)


-- ─── 2. mitigation_actions: drop the public-role wildcard policy ──────────

DROP POLICY IF EXISTS mitigation_actions_all ON public.mitigation_actions;

CREATE POLICY project_member_access ON public.mitigation_actions
  FOR ALL TO authenticated
  USING (
    (project_id IS NULL) OR (EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = mitigation_actions.project_id
    ))
  )
  WITH CHECK (
    (project_id IS NULL) OR (EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = mitigation_actions.project_id
    ))
  );

CREATE POLICY project_select ON public.mitigation_actions
  FOR SELECT TO authenticated
  USING (user_has_project_access(project_id));

CREATE POLICY project_insert ON public.mitigation_actions
  FOR INSERT TO authenticated
  WITH CHECK (user_has_project_access(project_id));

CREATE POLICY project_update ON public.mitigation_actions
  FOR UPDATE TO authenticated
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));

CREATE POLICY project_delete ON public.mitigation_actions
  FOR DELETE TO authenticated
  USING (user_has_project_access(project_id));


-- ─── 3. mitigation_logs: same transformation ──────────────────────────────

DROP POLICY IF EXISTS mitigation_logs_all ON public.mitigation_logs;

CREATE POLICY project_member_access ON public.mitigation_logs
  FOR ALL TO authenticated
  USING (
    (project_id IS NULL) OR (EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = mitigation_logs.project_id
    ))
  )
  WITH CHECK (
    (project_id IS NULL) OR (EXISTS (
      SELECT 1 FROM user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = mitigation_logs.project_id
    ))
  );

CREATE POLICY project_select ON public.mitigation_logs
  FOR SELECT TO authenticated
  USING (user_has_project_access(project_id));

CREATE POLICY project_insert ON public.mitigation_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_has_project_access(project_id));

CREATE POLICY project_update ON public.mitigation_logs
  FOR UPDATE TO authenticated
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));

CREATE POLICY project_delete ON public.mitigation_logs
  FOR DELETE TO authenticated
  USING (user_has_project_access(project_id));

COMMIT;
