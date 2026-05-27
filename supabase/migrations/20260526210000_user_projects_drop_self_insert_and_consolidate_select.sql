-- 20260526210000_user_projects_drop_self_insert_and_consolidate_select.sql
--
-- (1) SECURITY: re-apply migration 082's intent. users_insert_own_membership
--     (WITH CHECK auth.uid() = user_id, with NO project/role constraint and no
--     BEFORE INSERT trigger) let any authenticated user INSERT
--     (self, <any project>, 'owner') and grant themselves owner on any project
--     -- a privilege-escalation vector. It was dropped in 082 but later
--     re-introduced by a policy rebuild. Project onboarding does NOT need it:
--     public.create_project(jsonb) is SECURITY DEFINER and inserts the creator as
--     owner (bypassing RLS), and member management is admin-only via
--     admins_insert_memberships. No client path relies on self-insert. After this
--     drop, INSERT is governed solely by admins_insert_memberships.
DROP POLICY IF EXISTS users_insert_own_membership ON public.user_projects;

-- (2) CONSOLIDATE the two legitimate SELECT policies (a member seeing their own
--     rows; an admin seeing a project's rows) into one. Permissive policies are
--     OR'd by Postgres, so this is byte-identical, read-only access. Clears the
--     last multiple_permissive_policies finding (143 -> 0).
DROP POLICY IF EXISTS users_see_own_memberships ON public.user_projects;
DROP POLICY IF EXISTS admins_select_memberships ON public.user_projects;
CREATE POLICY members_select_memberships ON public.user_projects
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR user_is_system_admin()
    OR user_has_project_role_at_least(project_id, 'admin')
  );

NOTIFY pgrst, 'reload schema';
