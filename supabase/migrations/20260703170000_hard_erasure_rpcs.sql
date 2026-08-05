-- ─────────────────────────────────────────────────────────────────────────────
-- H11 — Right-to-erasure (GDPR/CCPA) + enterprise offboarding.
--
-- DESTRUCTIVE, IRREVERSIBLE hard-delete RPCs for a project and an organization.
-- These delete Postgres ROWS only. Storage objects (drawing PDFs, attachments)
-- and auth.users are erased by the `account-delete` edge function (service role),
-- which orchestrates: verify owner -> call hard_delete_organization -> purge
-- Storage -> delete now-orphaned auth users.
--
-- Design notes:
--   * hard_delete_project sweeps the handful of project-scoped tables that do NOT
--     cascade-delete from `projects` (dynamically detected, so new tables are
--     covered automatically), then deletes the project row — the ~84 FKs with
--     ON DELETE CASCADE clear the rest. As-built the non-cascading set is
--     {fab_releases, llm_telemetry, number_sequences, submittal_activity}.
--   * Authz reuses the canonical helpers. user_has_project_role_at_least already
--     grants org owners/admins access to every project in their org, so an org
--     owner erasing the whole org passes the per-project admin check.
--   * account_deletions is an append-only compliance record that SURVIVES the
--     erasure (no FK to organizations) — erasure itself must be auditable.
-- ─────────────────────────────────────────────────────────────────────────────

-- Permanent, append-only erasure audit (survives the org it records).
create table if not exists public.account_deletions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,           -- intentionally NO fk (org is deleted)
  org_name         text,
  deleted_by       uuid,                    -- auth.uid() of the actor
  projects_deleted integer not null default 0,
  note             text,
  created_at       timestamptz not null default now()
);
alter table public.account_deletions enable row level security;
-- Readable only by system admins; inserts happen inside SECURITY DEFINER fns
-- (which run as owner and bypass RLS) — no client insert/update/delete policy.
drop policy if exists account_deletions_admin_read on public.account_deletions;
create policy account_deletions_admin_read on public.account_deletions
  for select to authenticated using (public.user_is_system_admin());
revoke all on public.account_deletions from anon;

-- ── hard_delete_project ──────────────────────────────────────────────────────
create or replace function public.hard_delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_table text;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'admin') then
    raise exception 'Not authorized to erase project %', p_project_id using errcode = '42501';
  end if;

  -- Delete rows from project-scoped tables that will NOT cascade from projects.
  for v_table in
    select c.table_name
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.column_name = 'project_id'
       and c.table_name <> 'projects'
       and c.table_name in (select tablename from pg_tables where schemaname = 'public')
       and not exists (
             select 1
               from pg_constraint con
               join pg_class ch on ch.oid = con.conrelid and ch.relnamespace = 'public'::regnamespace
              where con.contype = 'f'
                and con.confdeltype = 'c'
                and (select relname from pg_class where oid = con.confrelid) = 'projects'
                and ch.relname = c.table_name)
  loop
    execute format('delete from public.%I where project_id = $1', v_table) using p_project_id;
  end loop;

  -- The remaining project-scoped tables cascade-delete with the project row.
  delete from public.projects where id = p_project_id;
end;
$$;
alter function public.hard_delete_project(uuid) owner to postgres;
revoke all on function public.hard_delete_project(uuid) from public, anon;
grant execute on function public.hard_delete_project(uuid) to authenticated, service_role;

-- ── hard_delete_organization ─────────────────────────────────────────────────
create or replace function public.hard_delete_organization(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_project  uuid;
  v_org_name text;
  v_count    integer := 0;
begin
  if not public.user_org_role_at_least(p_org_id, 'owner') then
    raise exception 'Only an organization owner can erase organization %', p_org_id using errcode = '42501';
  end if;

  select name into v_org_name from public.organizations where id = p_org_id;

  for v_project in select id from public.projects where org_id = p_org_id loop
    perform public.hard_delete_project(v_project);
    v_count := v_count + 1;
  end loop;

  delete from public.billing_events           where org_id = p_org_id;
  delete from public.organization_invitations where org_id = p_org_id;
  delete from public.vendors                  where org_id = p_org_id;
  delete from public.organization_members     where org_id = p_org_id;

  insert into public.account_deletions (org_id, org_name, deleted_by, projects_deleted)
    values (p_org_id, v_org_name, auth.uid(), v_count);

  delete from public.organizations where id = p_org_id;
end;
$$;
alter function public.hard_delete_organization(uuid) owner to postgres;
revoke all on function public.hard_delete_organization(uuid) from public, anon;
grant execute on function public.hard_delete_organization(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
