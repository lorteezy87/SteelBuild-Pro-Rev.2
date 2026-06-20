-- Same leftover as activities: uploaded_files kept the legacy
-- `project_member_access` ALL policy from 011_rls_project_isolation alongside
-- the canonical per-command user_has_project_access policies. 080_rbac_rls_tightening
-- dropped it on drawings/drawing_sets but missed this table. uploaded_files.project_id
-- is NOT NULL, so the policy's `project_id IS NULL` branch is unreachable and the
-- drop is purely drift cleanup, leaving the per-command policies as the only source.
DROP POLICY IF EXISTS project_member_access ON public.uploaded_files;

-- The per-command policies exist live but were never committed to a migration.
-- Recreate them idempotently so a fresh build reproduces live state.
DROP POLICY IF EXISTS project_select ON public.uploaded_files;
CREATE POLICY project_select ON public.uploaded_files
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_insert ON public.uploaded_files;
CREATE POLICY project_insert ON public.uploaded_files
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_update ON public.uploaded_files;
CREATE POLICY project_update ON public.uploaded_files
  FOR UPDATE TO authenticated
  USING (public.user_has_project_access(project_id))
  WITH CHECK (public.user_has_project_access(project_id));

DROP POLICY IF EXISTS project_delete ON public.uploaded_files;
CREATE POLICY project_delete ON public.uploaded_files
  FOR DELETE TO authenticated
  USING (public.user_has_project_access(project_id));
