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
