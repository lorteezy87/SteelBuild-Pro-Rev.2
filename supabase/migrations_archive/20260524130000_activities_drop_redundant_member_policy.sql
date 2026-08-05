-- activities carried a leftover legacy `project_member_access` ALL policy from
-- 011_rls_project_isolation. The per-command project_select/insert/update/delete
-- policies (using user_has_project_access) became the canonical model in
-- 080_rbac_rls_tightening, which dropped project_member_access on
-- drawings/drawing_sets but never on activities. Because permissive policies are
-- OR-combined, the leftover only widened access for rows with a NULL project_id
-- (any authenticated user could read/write them). Drop it so the per-command
-- policies are the single source of truth, matching every other project table.
DROP POLICY IF EXISTS project_member_access ON public.activities;

-- The per-command policies exist live but were never committed to a migration
-- (drift). Recreate them idempotently so a fresh build reproduces live state.
DROP POLICY IF EXISTS project_select ON public.activities;
CREATE POLICY project_select ON public.activities
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_insert ON public.activities;
CREATE POLICY project_insert ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_update ON public.activities;
CREATE POLICY project_update ON public.activities
  FOR UPDATE TO authenticated
  USING (public.user_has_project_access(project_id))
  WITH CHECK (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_delete ON public.activities;
CREATE POLICY project_delete ON public.activities
  FOR DELETE TO authenticated
  USING (public.user_has_project_access(project_id));
