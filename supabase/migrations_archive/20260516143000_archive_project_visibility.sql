-- 20260516143000_archive_project_visibility.sql
--
-- A project archive must be a hard visibility boundary. If the root project is
-- archived, its child rows must no longer feed KPI, production, cost, schedule,
-- or reporting reads through RLS-backed Data API calls.

BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_projects up
    JOIN public.projects p ON p.id = up.project_id
    WHERE up.user_id = auth.uid()
      AND up.project_id = p_project_id
      AND COALESCE(p.is_deleted, false) = false
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_project_access(uuid) TO authenticated;

DROP POLICY IF EXISTS project_select ON public.projects;
CREATE POLICY project_select
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_deleted, false) = false
    AND public.user_has_project_access(id)
  );

DROP POLICY IF EXISTS project_select_system_admin ON public.projects;
CREATE POLICY project_select_system_admin
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_deleted, false) = false
    AND public.user_is_system_admin()
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
