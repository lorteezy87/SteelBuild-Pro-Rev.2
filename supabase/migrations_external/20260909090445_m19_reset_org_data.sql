-- M19: "Reset all account data" (Settings -> Data).
--
-- Reset = erase every project in the org and all of its project data, while KEEPING the
-- organization row, its members and its billing linkage, so the account stays usable and
-- the owner is never locked out. Contrast with hard_delete_organization(), which also
-- removes the org and its members.
--
-- Per-project erasure reuses hard_delete_project(), which already sweeps the project-scoped
-- tables whose FKs do NOT cascade from projects and then lets the cascade take the rest.
-- Reusing it keeps this correct as new project-scoped tables are added later.
--
-- NOTE: storage objects (uploaded PDFs, thumbnails, photos) are not removed here; the DB
-- rows that point at them are. The UI says so plainly before the user confirms.

create or replace function public.reset_org_data(p_org_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    perform public.hard_delete_project(v_project);
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
$$;

revoke all on function public.reset_org_data(uuid, text) from public;
grant execute on function public.reset_org_data(uuid, text) to authenticated;

comment on function public.reset_org_data(uuid, text) is
  'Owner-only. Erases every project (and all project data) in the org plus org-scoped vendors, note folders and pending invitations. Keeps the organization, its members and billing. p_confirmation must equal the organization name.';