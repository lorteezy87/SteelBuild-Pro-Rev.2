-- Adopt production's soft_delete_project body. Production runs the sibling
-- app's newer definition (ledger 20260909014620 m2_projects_and_project_rbac),
-- which skips child tables that do not exist; no Rev.2 migration carried it.
-- Copied byte for byte from that sibling file, and its body MD5 matches
-- production. In production this changes nothing; grants and owner are kept.
SET LOCAL lock_timeout = '5s';

create or replace function public.soft_delete_project(p_project_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_deleted_at timestamptz := now(); v_table text; v_updated int;
  v_child_tables text[] := array[
    'rfis','change_orders','deliveries','work_packages','documents','drawings','drawing_sets','expenses','inspections',
    'punchlist_items','safety_incidents','scope_items','sov_items','contacts','meetings','model_elements','submittals',
    'submittal_rounds','submittal_sheet_responses','submittal_comment_dispositions','comments','document_folders',
    'daily_logs','photos','quality_control_records','budget_hour_items','risks','email_messages','linked_folders','document_import_queue'
  ];
begin
  perform set_config('app.skip_wp_progress_refresh', '1', true);
  if not public.user_has_project_role_at_least(p_project_id, 'admin') then
    raise exception 'Not authorized to delete project %', p_project_id using errcode = '42501';
  end if;
  foreach v_table in array v_child_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('update public.%I set is_deleted = true, deleted_at = $1 where project_id = $2 and is_deleted = false', v_table)
        using v_deleted_at, p_project_id;
    end if;
  end loop;
  update public.projects set is_deleted = true, deleted_at = v_deleted_at
   where id = p_project_id and coalesce(is_deleted, false) = false;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Project % not found or already archived', p_project_id using errcode = 'P0002';
  end if;
end;
$$;
