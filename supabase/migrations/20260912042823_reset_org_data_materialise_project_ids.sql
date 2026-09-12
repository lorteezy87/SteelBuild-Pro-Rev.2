-- Third and final defect in public.reset_org_data(): 55006 on the first project.
--
-- 20260912034015 fixed the arity and the ARCHIVE_FIRST ordering. Running it then
-- surfaced the next one:
--
--   55006: cannot ALTER TABLE "projects" because it is being used by active
--          queries in this session
--
-- Cause. hard_delete_project builds its table list as
--   v_tables := array(select jsonb_object_keys(v_counts)) || array['projects'];
-- and hands it to erasure_toggle_user_triggers, which runs
--   execute format('alter table public.%I disable trigger %I', ...)
-- so it ALTERs public.projects. reset_org_data was iterating with
--   for v_project in select id from public.projects where org_id = p_org_id loop
-- which holds an open cursor over that same table in the same session for the
-- whole loop. Postgres will not ALTER a table a live query is reading, so the
-- very first iteration aborted and the whole call rolled back. No data was lost
-- on either failed attempt: 24 projects, 16 archived, 3,057 pieces and zero
-- data_erasure_log rows before and after.
--
-- Fix. Materialise the project ids into an array first, which closes the query,
-- then FOREACH over the array. The loop body is otherwise unchanged.
--
-- This is a plpgsql cursor-lifetime problem, not something the arity or
-- ARCHIVE_FIRST fixes could have anticipated — each defect only became visible
-- once the one in front of it was cleared. Worth recording why a single function
-- needed three passes: it was authored in the sibling app against that schema,
-- applied here by 20260909090445_m19_reset_org_data, and never once executed, so
-- nothing forced any of the three to surface until an owner tried to use it.
--
-- Verified against the live catalog before writing: all six tables the tail
-- deletes from exist, and public.account_deletions has exactly the five columns
-- the insert names (org_id, org_name, deleted_by, projects_deleted, note) plus
-- id and created_at, both defaulted. No remaining unfilled NOT NULL columns.
--
-- CREATE OR REPLACE, never DROP + CREATE — a drop resets proacl and would revoke
-- the authenticated EXECUTE grant the RPC depends on.
--
-- Already applied to kjrwqagyeswwoxpjkcko directly on 2026-09-12 so the owner was
-- not blocked; this file brings the repo back in step. It is idempotent.

CREATE OR REPLACE FUNCTION public.reset_org_data(p_org_id uuid, p_confirmation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_org_name    text;
  v_project_ids uuid[];
  v_project     uuid;
  v_projects    integer := 0;
  v_vendors     integer := 0;
  v_folders     integer := 0;
  v_invites     integer := 0;
begin
  -- Erasing everything is an owner-level act (mirrors hard_delete_organization).
  if not public.user_org_role_at_least(p_org_id, 'owner') then
    raise exception 'Only an organization owner can reset organization %', p_org_id using errcode = '42501';
  end if;

  select name into v_org_name from public.organizations where id = p_org_id;
  if v_org_name is null then
    raise exception 'Organization % not found', p_org_id using errcode = 'P0002';
  end if;

  -- Typed confirmation must match the organization name, so a stray or replayed RPC call
  -- cannot wipe an account on its own.
  if lower(btrim(coalesce(p_confirmation, ''))) is distinct from lower(btrim(v_org_name)) then
    raise exception 'Confirmation text does not match the organization name' using errcode = '22023';
  end if;

  -- Materialise the ids BEFORE looping. hard_delete_project runs
  -- erasure_toggle_user_triggers, which ALTERs public.projects to disable its
  -- triggers; an open FOR-IN-SELECT cursor over that same table in the same
  -- session makes that ALTER fail with 55006.
  select array_agg(id) into v_project_ids
    from public.projects where org_id = p_org_id;

  foreach v_project in array coalesce(v_project_ids, '{}'::uuid[]) loop
    -- hard_delete_project refuses a project that is not archived (ARCHIVE_FIRST,
    -- P0001). A full reset necessarily includes live projects, so archive first
    -- rather than weakening that guard for every other caller.
    update public.projects
       set is_deleted = true
     where id = v_project
       and not coalesce(is_deleted, false);

    -- Two arguments, and p_reason must be >= 12 characters (23514). It is
    -- recorded against each project in public.data_erasure_log.
    perform public.hard_delete_project(v_project, 'Organization data reset via reset_org_data');
    v_projects := v_projects + 1;
  end loop;

  delete from public.organization_invitations where org_id = p_org_id;
  get diagnostics v_invites = row_count;

  delete from public.note_folder_audit_events      where org_id = p_org_id;
  delete from public.note_folder_mutation_receipts where org_id = p_org_id;
  delete from public.note_folder_migrations        where org_id = p_org_id;
  delete from public.note_folders                  where org_id = p_org_id;
  get diagnostics v_folders = row_count;

  delete from public.vendors where org_id = p_org_id;
  get diagnostics v_vendors = row_count;

  insert into public.account_deletions (org_id, org_name, deleted_by, projects_deleted, note)
    values (p_org_id, v_org_name, auth.uid(), v_projects, 'reset_org_data');

  return jsonb_build_object(
    'projects_deleted',     v_projects,
    'vendors_deleted',      v_vendors,
    'note_folders_deleted', v_folders,
    'invitations_deleted',  v_invites
  );
end;
$function$;
