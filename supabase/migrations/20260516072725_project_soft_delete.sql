-- 20260516072725_project_soft_delete.sql
--
-- Projects are the root record for project-scoped RFIs, drawings, budgets,
-- field logs, and audit history. Hard-deleting a project cascades into child
-- rows, whose audit triggers then try to write pma_audit_logs rows against the
-- project currently being deleted. That trips pma_audit_logs_project_id_fkey.
--
-- Keep projects auditable by making normal app deletes archival updates.

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_projects_active_created_at
  ON public.projects (created_at DESC)
  WHERE is_deleted = false;

-- App-level deletion now uses UPDATE is_deleted/deleted_at. Do not allow
-- authenticated clients to physically delete project roots through PostgREST.
DROP POLICY IF EXISTS project_delete ON public.projects;

NOTIFY pgrst, 'reload schema';

COMMIT;
