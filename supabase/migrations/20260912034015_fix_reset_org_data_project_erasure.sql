-- Fix public.reset_org_data(): it has never worked.
--
-- Discovered 2026-09-12 when the org owner invoked it for the first time. The
-- owner check and the typed-confirmation check both passed; it then failed at
--
--   42883: function public.hard_delete_project(uuid) does not exist
--
-- and the whole call rolled back, so no data was lost. Two independent defects:
--
-- 1. WRONG ARITY. The loop calls `hard_delete_project(v_project)` with one
--    argument. The function in this database is
--      hard_delete_project(p_project_id uuid, p_reason text)
--    and p_reason is not optional — it must be at least 12 characters or the
--    function raises 23514. The reason is written to public.data_erasure_log,
--    so it has to be a real sentence, not a placeholder.
--
-- 2. ARCHIVE_FIRST. hard_delete_project refuses any project whose is_deleted is
--    not true:
--      if not v_project.is_deleted then raise exception 'ARCHIVE_FIRST: ...'
--    reset_org_data loops over every project regardless of archive state, so
--    even with the arity fixed it would abort on the first live project. At the
--    time of writing 8 of 24 projects in the reporting org were not archived.
--
-- The fix archives each project immediately before erasing it, rather than
-- weakening ARCHIVE_FIRST. That guard exists to stop a live project being erased
-- by accident, and a function whose entire purpose is "erase everything in this
-- organization" is the one caller that legitimately means it. This also mirrors
-- the app's own archive-then-erase flow. Setting is_deleted trips neither
-- enforce_project_update_guard (which only protects org_id and contract fields)
-- nor any other trigger on public.projects.
--
-- WHY THIS FUNCTION EXISTS HERE AT ALL. reset_org_data arrived from the sibling
-- app's 20260909090000_m19_reset_org_data migration, applied to the shared
-- production project. Nothing in Rev 2 calls it — the "Settings -> Data" screen
-- its own comment refers to was never built here — which is exactly why a
-- function that cannot run went unnoticed. Ownership of this function between
-- the two repos is still undecided (CLAUDE.md, "Sibling app"); this migration
-- repairs it in place at the owner's request and takes no position on that.
--
-- CREATE OR REPLACE, never DROP + CREATE: a drop would reset proacl and silently
-- revoke the authenticated EXECUTE grant the RPC depends on. Everything except
-- the loop body is reproduced byte-for-byte from the live definition read on
-- 2026-09-12 — same signature, same SECURITY DEFINER, same search_path, same
-- guards, same return shape.
--
-- Apply with `supabase db push`, not MCP apply_migration.

CREATE OR REPLACE FUNCTION public.reset_org_data(p_org_id uuid, p_confirmation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_org_name text;
  v_project  uuid;
  v_projects integer := 0;
  v_vendors  integer := 0;
  v_folders  integer := 0;
  v_invites  integer := 0;
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

  for v_project in select id from public.projects where org_id = p_org_id loop
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

-- NOT APPLIED — related, deliberately out of scope.
--
-- 1. Storage is still not cleaned up. reset_org_data removes database rows only;
--    uploaded PDFs, thumbnails and photos remain in the bucket as orphans under
--    <org_id>/… . Only the account-delete edge function's hard_delete_organization
--    path sweeps Storage, and that also deletes the org, its members and their
--    auth.users rows. If orphaned objects matter, that is a separate change.
--
-- 2. There is still no UI. Nothing in src/ calls reset_org_data, so the only way
--    to invoke it is a PostgREST RPC with an owner's JWT. The "Settings -> Data"
--    control its comment describes remains unbuilt.
--
-- 3. account-delete is in supabase/functions/ but is NOT deployed to this
--    project, which is why Settings -> Delete Account and the Danger Zone both
--    return 404 / "Failed to send a request to the Edge Function".
