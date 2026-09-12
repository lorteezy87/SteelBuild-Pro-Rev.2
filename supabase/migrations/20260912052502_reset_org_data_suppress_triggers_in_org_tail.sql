-- Fifth and last defect in public.reset_org_data(): the org-level tail runs with
-- every guard live, and enforce_vendor_guards refuses a DELETE outright.
--
-- Found by inspection before the owner hit it, after four rounds of discovering
-- these one failure at a time. The four already fixed:
--   20260912034015  42883  wrong arity on hard_delete_project
--   20260912034015  P0001  ARCHIVE_FIRST on live projects
--   20260912042823  55006  open cursor over projects vs ALTER TABLE
--   20260912045532  23503  delivery_items guard vs the FK cascade
--
-- This one would have fired only after all 24 projects had already been erased,
-- and rolled every one of them back:
--
--   42501: vendors rows are never hard-deleted; set is_deleted instead
--
-- Cause. hard_delete_project sets steelbuild.erasure_rpc on entry and restores it
-- to its prior value on exit:
--   v_prev := coalesce(current_setting('steelbuild.erasure_rpc', true), '');
--   ...
--   perform set_config('steelbuild.erasure_rpc', v_prev, true);
-- so once the project loop finishes the flag is off again and no triggers are
-- suppressed. reset_org_data then deletes straight from six org-scoped tables.
-- public.vendors carries trg_enforce_vendor_guards, whose first line is an
-- unconditional
--   if tg_op = 'DELETE' then raise exception '...' using errcode = '42501';
-- and the reporting org has 12 vendor rows, so the delete cannot succeed.
--
-- Fix. Do what hard_delete_organization already does around its own org-level
-- tail: set the erasure flag, disable user triggers on exactly the tables the
-- tail deletes from, delete, re-enable from the returned list, restore the flag.
-- erasure_toggle_user_triggers refuses to run unless the flag is on, which is why
-- the set_config has to come first. That function is a no-op for a named table
-- that has no triggers, so listing all six is free and keeps this correct if a
-- guard is added to note_folders later; today only vendors actually has one.
--
-- Deliberately NOT done: weakening enforce_vendor_guards. Its refusal is right
-- for every ordinary caller -- vendors are soft-deleted -- and the erasure RPCs
-- are the one caller that legitimately means it. Suppressing the trigger for the
-- duration of an audited erasure is the established pattern in this schema, and
-- it leaves the guard intact for application traffic.
--
-- Scope-checked against live data rather than assumed. Everything the tail can
-- reach was walked:
--   * deliveries.project_id is NOT NULL with zero NULL rows, so no delivery -- and
--     so no delivery_item -- survives the project loop to be cascaded from here.
--   * expenses.vendor_id is ON DELETE SET NULL, not CASCADE, and all 149 expense
--     rows sit under projects in this org, so they are gone before the tail runs.
--   * note_folders.parent_folder_id and production_notes.folder_id are ON DELETE
--     RESTRICT, which would block the note_folders delete. There are zero child
--     folders, and all 130 production_notes rows carry a NOT NULL project_id in
--     this org, so both are erased in the project loop first.
--   * organization_invitations' only trigger is INSERT-only; the four note_folder
--     tables have no triggers at all; account_deletions has none.
-- So vendors is the only blocker in the tail, not merely the next one.
--
-- CREATE OR REPLACE, never DROP + CREATE: a drop resets proacl and would revoke
-- the authenticated EXECUTE grant the RPC depends on. Verified after applying
-- that the grant is still authenticated=X/postgres.
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
  v_prev        text := coalesce(current_setting('steelbuild.erasure_rpc', true), '');
  v_disabled    text[];
  v_tables      text[] := array[
    'organization_invitations',
    'note_folder_audit_events',
    'note_folder_mutation_receipts',
    'note_folder_migrations',
    'note_folders',
    'vendors'
  ];
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

  -- The org-level tail needs the same trigger suppression hard_delete_project
  -- gives the project-level one. hard_delete_project restores the erasure flag
  -- to its prior value on the way out, so by here it is off again and every
  -- guard is live -- including enforce_vendor_guards, which raises 42501
  -- unconditionally on DELETE ("vendors rows are never hard-deleted"). Without
  -- this block the whole reset rolls back at the vendors delete, after every
  -- project had already been erased. Same shape as hard_delete_organization.
  perform set_config('steelbuild.erasure_rpc', 'on', true);
  v_disabled := public.erasure_toggle_user_triggers(v_tables, true);

  delete from public.organization_invitations where org_id = p_org_id;
  get diagnostics v_invites = row_count;

  delete from public.note_folder_audit_events      where org_id = p_org_id;
  delete from public.note_folder_mutation_receipts where org_id = p_org_id;
  delete from public.note_folder_migrations        where org_id = p_org_id;
  delete from public.note_folders                  where org_id = p_org_id;
  get diagnostics v_folders = row_count;

  delete from public.vendors where org_id = p_org_id;
  get diagnostics v_vendors = row_count;

  perform public.erasure_toggle_user_triggers(v_tables, false, v_disabled);
  perform set_config('steelbuild.erasure_rpc', v_prev, true);

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

-- NOT APPLIED -- found while tracing this, worth an owner's attention separately.
--
-- 1. public.hard_delete_organization has the 55006 bug this function was cured of
--    in 20260912042823. It still iterates with
--      for v_project in select id from public.projects where org_id = p_org_id loop
--    and hard_delete_project ALTERs public.projects inside that loop, so the very
--    first iteration should abort exactly as reset_org_data's did. It is the code
--    path behind Settings -> Delete Account, which cannot be reached today because
--    the account-delete edge function is not deployed to this project, so nothing
--    has forced it to surface. Same one-line fix: materialise the ids first.
