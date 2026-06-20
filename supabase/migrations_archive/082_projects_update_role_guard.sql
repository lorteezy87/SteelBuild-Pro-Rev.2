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
