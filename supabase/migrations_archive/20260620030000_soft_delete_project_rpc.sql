-- 20260620030000_soft_delete_project_rpc.sql
-- #13: project deletion was NON-ATOMIC. The client soft-deleted ~29 child tables
-- via Promise.all and then archived the project root EVEN IF child archival
-- failed (the error was caught + logged), leaving a project archived with some
-- children still active — inconsistent portfolio/global data. (The child updates
-- were also floored at field+ while the projects UPDATE policy is membership-only
-- `user_has_project_access`, so a viewer could archive the root but not the
-- children — the exact partial state, reachable by an under-privileged user.)
--
-- This RPC does the whole archive in ONE transaction (a plpgsql function body is
-- atomic): every project-scoped soft-deletable child + the project root, or
-- nothing. It is SECURITY DEFINER (it must touch every child table regardless of
-- the caller's per-table RLS), so it re-checks the caller is an admin/owner of
-- the project first — matching the UI, which already restricts project deletion
-- to admins (SecureDeleteDialog 'delete_project'). The client calls this instead
-- of its own multi-step delete.
--
-- The child-table list mirrors the client's PROJECT_CHILD_SOFT_DELETE_TABLES
-- (SOFT_DELETE_TABLES ∩ PROJECT_SCOPED_TABLES); all 29 verified to carry
-- is_deleted / deleted_at / project_id. Keep the two in sync when a new
-- soft-deletable project-scoped table is added.
--
-- Applied live via Supabase MCP 2026-06-20.

CREATE OR REPLACE FUNCTION public.soft_delete_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_deleted_at timestamptz := now();
  v_table text;
  v_child_tables text[] := array[
    'rfis','change_orders','deliveries','work_packages','documents','drawings',
    'drawing_sets','expenses','inspections','punchlist_items','safety_incidents',
    'scope_items','sov_items','contacts','meetings','model_elements','submittals',
    'submittal_rounds','submittal_sheet_responses','comments','document_folders',
    'daily_logs','photos','quality_control_records','budget_hour_items','risks',
    'email_messages','linked_folders','document_import_queue'
  ];
BEGIN
  -- Archiving a project is an admin/owner action (org owners/admins included via
  -- the helper's org override). DEFINER bypasses RLS, so re-check here.
  IF NOT public.user_has_project_role_at_least(p_project_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized to delete project %', p_project_id USING ERRCODE = '42501';
  END IF;

  -- Single transaction: all child soft-deletes + the project archive, or none.
  -- Table names are fixed literals (no user input), so format(%I) is injection-safe.
  FOREACH v_table IN ARRAY v_child_tables LOOP
    EXECUTE format(
      'update public.%I set is_deleted = true, deleted_at = $1 where project_id = $2 and is_deleted = false',
      v_table
    ) USING v_deleted_at, p_project_id;
  END LOOP;

  UPDATE public.projects SET is_deleted = true, deleted_at = v_deleted_at WHERE id = p_project_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.soft_delete_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_project(uuid) TO authenticated;
