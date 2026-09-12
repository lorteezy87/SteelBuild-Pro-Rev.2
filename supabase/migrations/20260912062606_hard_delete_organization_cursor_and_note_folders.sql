-- public.hard_delete_organization(): the 55006 cursor bug, plus a note_folders
-- cascade that cannot succeed.
--
-- This is the RPC behind the app's two destructive controls -- DangerZone
-- ("Delete this workspace", owner-only, feature-flagged) and DeleteAccountZone
-- ("Delete my account", every signed-in user, NOT flagged, required by Apple
-- App Store Guideline 5.1.1(v)). Both reach it through the account-delete edge
-- function. Neither has ever run against this project, because that function is
-- in supabase/functions/ but was never deployed -- so a user clicking either
-- control gets "Failed to send a request to the Edge Function". Fixing the
-- function is step one of making those controls work; deploying account-delete
-- is step two and is an owner decision, not part of this migration.
--
-- Two defects, both found by reading rather than by a failed run:
--
-- 1. 55006. It iterated with
--      for v_project in select id from public.projects where org_id = p_org_id loop
--    and calls hard_delete_project inside that loop. That function runs
--    erasure_toggle_user_triggers, which ALTERs public.projects to disable its
--    triggers, and Postgres will not ALTER a table an open cursor in the same
--    session is reading. Identical to the defect 20260912042823 fixed in
--    reset_org_data; identical fix -- materialise the ids into an array first,
--    then FOREACH. coalesce guards FOREACH over the NULL array_agg returns for
--    an org with no projects.
--
-- 2. note_folders was not in the tail at all, left to the ON DELETE CASCADE from
--    organizations. That cascade cannot satisfy note_folders.parent_folder_id,
--    which is ON DELETE RESTRICT: RESTRICT is checked immediately and does not
--    get the same-statement exemption NO ACTION would, so any org with a nested
--    folder tree aborts the whole erasure with 23503. The satellite tables
--    (audit_events, mutation_receipts, migrations) are now cleared explicitly
--    first, then the tree is peeled leaf-first -- delete every folder that is
--    nobody's parent, repeat until a pass removes nothing. The final unguarded
--    delete still runs, so anything that genuinely cannot go still raises.
--    Bounded at 12 passes; a folder tree deeper than that is not a thing.
--
-- The tail's v_tables list gains the four note_folder tables so their triggers
-- are suppressed alongside the rest. None of them has a trigger today, which
-- makes the addition free now and correct if one is ever added.
--
-- Scope-checked against the live catalog: the only NO ACTION / RESTRICT foreign
-- keys into public.organizations come from projects and vendors, and both are
-- already handled -- projects by the loop, vendors by the tail. Everything else
-- referencing organizations cascades or sets null. So this is the whole gap.
--
-- CREATE OR REPLACE, never DROP + CREATE: a drop resets proacl and would revoke
-- the authenticated EXECUTE grant. Verified intact after applying.
--
-- Already applied to kjrwqagyeswwoxpjkcko on 2026-09-12; this brings the repo
-- back in step. Idempotent.

CREATE OR REPLACE FUNCTION public.hard_delete_organization(p_org_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_org record; v_project uuid; v_live int; v_count int := 0; v_counts jsonb := '{}'::jsonb; v_prev text := coalesce(current_setting('steelbuild.erasure_rpc', true), '');
  v_uid uuid := (select auth.uid()); v_email text := (select auth.jwt() ->> 'email');
  v_tables text[] := array['billing_events', 'organization_invitations', 'note_folder_audit_events', 'note_folder_mutation_receipts', 'note_folder_migrations', 'note_folders', 'vendors', 'organization_members', 'organizations']; v_disabled text[];
  v_project_ids uuid[]; v_pass integer; v_removed integer;
begin
  if not public.user_org_role_at_least(p_org_id, 'owner') then
    raise exception 'Only an organization owner can erase organization %', p_org_id using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 12 then raise exception 'A written reason (12+ characters) is required to erase an organization' using errcode = '23514'; end if;
  select id, name into v_org from public.organizations where id = p_org_id;
  if v_org.id is null then raise exception 'Organization % not found', p_org_id using errcode = 'P0002'; end if;
  select count(*) into v_live from public.projects where org_id = p_org_id and coalesce(is_deleted, false) = false;
  if v_live > 0 then raise exception 'ARCHIVE_FIRST: % project(s) are still active — archive every project before erasing the organization', v_live using errcode = 'P0001'; end if;

  -- Materialise the ids BEFORE looping. hard_delete_project runs
  -- erasure_toggle_user_triggers, which ALTERs public.projects to disable its
  -- triggers, and an open FOR-IN-SELECT cursor over that same table in this
  -- session makes that ALTER fail with 55006. Same defect, same fix, as
  -- 20260912042823 applied to reset_org_data.
  select array_agg(id) into v_project_ids from public.projects where org_id = p_org_id;

  foreach v_project in array coalesce(v_project_ids, '{}'::uuid[]) loop
    v_counts := v_counts || jsonb_build_object(v_project::text, (public.hard_delete_project(v_project, p_reason)) -> 'row_counts');
    v_count := v_count + 1;
  end loop;

  perform set_config('steelbuild.erasure_rpc', 'on', true);
  insert into public.data_erasure_log (kind, org_id, org_name, requested_by, requested_by_email, reason, row_counts, storage_prefix)
    values ('organization', p_org_id, v_org.name, v_uid, v_email, btrim(p_reason),
            jsonb_build_object('projects', v_count, 'members', (select count(*) from public.organization_members where org_id = p_org_id), 'vendors', (select count(*) from public.vendors where org_id = p_org_id), 'per_project', v_counts),
            p_org_id::text || '/*');
  insert into public.account_deletions (org_id, org_name, deleted_by, projects_deleted, note) values (p_org_id, v_org.name, v_uid, v_count, btrim(p_reason));

  v_disabled := public.erasure_toggle_user_triggers(v_tables, true);
  delete from public.billing_events where org_id = p_org_id;
  delete from public.organization_invitations where org_id = p_org_id;

  -- note_folders was previously left to the cascade from organizations, but that
  -- cascade cannot satisfy note_folders.parent_folder_id, which is ON DELETE
  -- RESTRICT: a nested folder tree would abort the delete with 23503. Clear the
  -- satellites first, then peel the tree leaf-first. Bounded, and the final
  -- unguarded delete still raises if anything genuinely cannot go.
  delete from public.note_folder_audit_events      where org_id = p_org_id;
  delete from public.note_folder_mutation_receipts where org_id = p_org_id;
  delete from public.note_folder_migrations        where org_id = p_org_id;
  for v_pass in 1..12 loop
    delete from public.note_folders f
     where f.org_id = p_org_id
       and not exists (select 1 from public.note_folders c
                        where c.parent_folder_id = f.id and c.org_id = p_org_id);
    get diagnostics v_removed = row_count;
    exit when v_removed = 0;
  end loop;
  delete from public.note_folders where org_id = p_org_id;

  delete from public.vendors where org_id = p_org_id;
  delete from public.organization_members where org_id = p_org_id;
  delete from public.organizations where id = p_org_id;
  perform public.erasure_toggle_user_triggers(v_tables, false, v_disabled);
  perform set_config('steelbuild.erasure_rpc', v_prev, true);
  return jsonb_build_object('org_id', p_org_id, 'projects_erased', v_count);
end $function$;

-- NOT APPLIED -- adjacent, deliberately out of scope.
--
-- 1. public.reset_org_data shares the note_folders self-FK exposure: its tail
--    also does a flat `delete from public.note_folders where org_id = ...`, which
--    would hit the same RESTRICT on a nested tree. It survived the 2026-09-12
--    reset because that org had zero child folders -- data, not structure. The
--    same leaf-first loop belongs there, but that function has already been
--    replaced three times tonight and it currently works; folding in a
--    data-dependent hardening is a separate, calmer change.
--
-- 2. account-delete is still not deployed. Until it is, DangerZone and
--    DeleteAccountZone both fail with "Failed to send a request to the Edge
--    Function" -- and DeleteAccountZone is not behind a feature flag, so every
--    signed-in user can reach a broken irreversible control. Deploying is an
--    owner decision (`supabase functions deploy account-delete`, WITH jwt
--    verification); this migration only makes the RPC underneath it correct.
