-- ============================================================================
-- 065_restore_project_read_access.sql
--
-- Fixes the app banner:
--   [projects.list] permission denied for table projects
--
-- RLS policies decide which rows an authenticated user may see, but Postgres
-- still requires the role to hold table privileges first. If the authenticated
-- grant is missing, PostgREST rejects the query before RLS can evaluate.
--
-- This migration restores the minimum grants required for the project picker
-- and rewires project RLS through SECURITY DEFINER helpers so membership checks
-- do not depend on recursively reading user_projects through client RLS.
-- ============================================================================

BEGIN;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_projects TO authenticated;

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
    WHERE up.user_id = auth.uid()
      AND up.project_id = p_project_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_project_access(uuid) TO authenticated;

DROP POLICY IF EXISTS users_see_own_memberships ON public.user_projects;
CREATE POLICY users_see_own_memberships
  ON public.user_projects
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS project_member_access ON public.projects;
DROP POLICY IF EXISTS project_select ON public.projects;
DROP POLICY IF EXISTS project_insert ON public.projects;
DROP POLICY IF EXISTS project_update ON public.projects;
DROP POLICY IF EXISTS project_delete ON public.projects;

CREATE POLICY project_select
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (public.user_has_project_access(id));

CREATE POLICY project_insert
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY project_update
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (public.user_has_project_access(id))
  WITH CHECK (public.user_has_project_access(id));

CREATE POLICY project_delete
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (public.user_has_project_access(id));

NOTIFY pgrst, 'reload schema';

COMMIT;
