-- Restore archive as a hard visibility boundary for projects.
--
-- Regression: when user_has_project_access was rewritten for org-aware
-- membership, the is_deleted gate from 20260516143000 was dropped. Client
-- list() still filters is_deleted=false, but any remount / stale refetch that
-- missed that filter (or raced before the soft-delete committed) could put an
-- archived project back in the switcher. RLS must fail closed too.
--
-- Also: soft_delete_project previously returned success even when the root
-- UPDATE matched zero rows — archive appeared to work in the UI then the next
-- list resurrected the project.

BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.organization_members om
      ON om.org_id = p.org_id
     AND om.user_id = (SELECT auth.uid())
    WHERE p.id = p_project_id
      AND COALESCE(p.is_deleted, false) = false
      AND (
        om.role IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1
          FROM public.user_projects up
          WHERE up.project_id = p.id
            AND up.user_id = (SELECT auth.uid())
        )
      )
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
    AND (
      public.user_has_project_access(id)
      OR public.user_is_system_admin()
    )
  );

-- Keep a dedicated system-admin select policy only if one already existed as a
-- separate name historically; the combined USING above covers both paths.
DROP POLICY IF EXISTS project_select_system_admin ON public.projects;

CREATE OR REPLACE FUNCTION public.soft_delete_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_at timestamptz := now();
  v_table text;
  v_updated int;
  v_child_tables text[] := ARRAY[
    'rfis','change_orders','deliveries','work_packages','documents','drawings',
    'drawing_sets','expenses','inspections','punchlist_items','safety_incidents',
    'scope_items','sov_items','contacts','meetings','model_elements','submittals',
    'submittal_rounds','submittal_sheet_responses','submittal_comment_dispositions',
    'comments','document_folders',
    'daily_logs','photos','quality_control_records','budget_hour_items','risks',
    'email_messages','linked_folders','document_import_queue'
  ];
BEGIN
  IF NOT public.user_has_project_role_at_least(p_project_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized to delete project %', p_project_id
      USING ERRCODE = '42501';
  END IF;

  FOREACH v_table IN ARRAY v_child_tables LOOP
    EXECUTE format(
      'update public.%I set is_deleted = true, deleted_at = $1 where project_id = $2 and is_deleted = false',
      v_table
    ) USING v_deleted_at, p_project_id;
  END LOOP;

  UPDATE public.projects
     SET is_deleted = true,
         deleted_at = v_deleted_at
   WHERE id = p_project_id
     AND COALESCE(is_deleted, false) = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Project % not found or already archived', p_project_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_project(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_project(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
