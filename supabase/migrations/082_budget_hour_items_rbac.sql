-- 082_budget_hour_items_rbac.sql
-- Tighten budget_hour_items RLS so project members can read,
-- but only PM/Admin/Owner roles can write.

ALTER TABLE public.budget_hour_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_member_access" ON public.budget_hour_items;
DROP POLICY IF EXISTS "budget_hour_items_select" ON public.budget_hour_items;
DROP POLICY IF EXISTS "budget_hour_items_insert" ON public.budget_hour_items;
DROP POLICY IF EXISTS "budget_hour_items_update" ON public.budget_hour_items;
DROP POLICY IF EXISTS "budget_hour_items_delete" ON public.budget_hour_items;

CREATE POLICY "budget_hour_items_select" ON public.budget_hour_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_projects
      WHERE user_projects.user_id = auth.uid()
        AND user_projects.project_id = budget_hour_items.project_id
    )
  );

CREATE POLICY "budget_hour_items_insert" ON public.budget_hour_items
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

CREATE POLICY "budget_hour_items_update" ON public.budget_hour_items
  FOR UPDATE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'))
  WITH CHECK (public.user_has_project_role_at_least(project_id, 'pm'));

CREATE POLICY "budget_hour_items_delete" ON public.budget_hour_items
  FOR DELETE TO authenticated
  USING (public.user_has_project_role_at_least(project_id, 'pm'));


-- ============================================================================
-- Consolidated from 082_feature_flags_admin_write_rls.sql
-- This migration shared a numeric version prefix with 082_budget_hour_items_rbac.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
-- 082_feature_flags_admin_write_rls.sql
-- Tighten feature flag writes so only admins can mutate flags.

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_flags_write ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_insert ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_update ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_delete ON public.feature_flags;

CREATE POLICY feature_flags_insert ON public.feature_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY feature_flags_update ON public.feature_flags
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY feature_flags_delete ON public.feature_flags
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
    )
  );


-- ============================================================================
-- Consolidated from 082_fix_user_projects_insert_rls.sql
-- This migration shared a numeric version prefix with 082_budget_hour_items_rbac.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
-- Prevent authenticated users from self-adding memberships to arbitrary projects.
-- Project creation is handled by public.create_project(...) under SECURITY DEFINER,
-- and membership administration should be limited to project owners/admins.

DROP POLICY IF EXISTS users_insert_own_membership ON public.user_projects;

CREATE POLICY admins_insert_memberships ON public.user_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_project_role(project_id) = ANY (ARRAY['owner', 'admin'])
    AND role IN ('owner', 'admin', 'pm', 'field', 'viewer')
  );


-- ============================================================================
-- Consolidated from 082_projects_update_role_guard.sql
-- This migration shared a numeric version prefix with 082_budget_hour_items_rbac.sql, so Supabase's
-- migration runner (which keys on the leading numeric token) silently skipped
-- it on a clean apply, leaving its objects uncreated on fresh branch DBs.
-- Folded here so a from-scratch apply runs it in order. Production already
-- recorded it under a separate timestamp version, so prod is unaffected.
-- ============================================================================
-- 082_projects_update_role_guard.sql
-- Restrict project-row updates to PM/Admin/Owner roles.

BEGIN;

DROP POLICY IF EXISTS project_update ON public.projects;

CREATE POLICY project_update
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (public.user_has_project_access(id))
  WITH CHECK (public.user_has_project_role_at_least(id, 'pm'));

NOTIFY pgrst, 'reload schema';

COMMIT;
