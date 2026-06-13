-- ════════════════════════════════════════════════════════════════════════════
-- Multi-tenant SaaS P0 — the organization / workspace layer (keystone).
--
-- The org is the unit that billing, invites, and entitlements attach to. This
-- is ADDITIVE and non-disruptive: per-project access (user_projects + the
-- user_has_project_access RLS) stays authoritative for project DATA — that
-- working policy is untouched, so no one loses access. A project now belongs to
-- exactly one org; org members are added to specific projects within their org.
-- Existing data is backfilled into one "S&H Steel" org so nothing breaks.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  plan        text not null default 'free',          -- entitlement anchor; billing fills this in
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb
);

create table if not exists public.organization_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists idx_org_members_user on public.organization_members (user_id);
create index if not exists idx_org_members_org on public.organization_members (org_id);

alter table public.projects add column if not exists org_id uuid references public.organizations (id);
create index if not exists idx_projects_org on public.projects (org_id);

-- ── SECURITY DEFINER membership helpers (mirror the project helpers; avoid RLS
--    recursion when a policy on organization_members queries the same table) ──
create or replace function public.user_is_org_member(p_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.user_org_role_at_least(p_org_id uuid, p_min_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
      and (case m.role when 'owner' then 3 when 'admin' then 2 when 'member' then 1 else 0 end)
        >= (case p_min_role when 'owner' then 3 when 'admin' then 2 when 'member' then 1 else 0 end)
  );
$$;

-- ── Onboarding: create an org + make the caller its owner (bypasses the
--    members INSERT policy so the first member can bootstrap) ──
create or replace function public.create_organization(p_name text, p_slug text default null)
returns jsonb language plpgsql security definer set search_path = 'public' as $$
declare v_uid uuid; v_org uuid; v_result jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  insert into public.organizations (name, slug, created_by)
    values (p_name, nullif(p_slug, ''), v_uid) returning id into v_org;
  insert into public.organization_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  select to_jsonb(o) into v_result from public.organizations o where o.id = v_org;
  return v_result;
end;
$$;

-- ── Extend create_project so a new project is stamped with the caller's org
--    (explicit org_id in the payload wins; else their first org) ──
create or replace function public.create_project(project_data jsonb)
returns jsonb language plpgsql security definer set search_path = 'public' as $$
declare
  v_user_id uuid;
  v_project_id uuid;
  v_org_id uuid;
  v_result jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;

  v_org_id := coalesce(
    (project_data->>'org_id')::uuid,
    (select org_id from public.organization_members where user_id = v_user_id order by created_at limit 1)
  );

  insert into projects (
    name, project_number, client, general_contractor, engineer_of_record,
    project_manager, superintendent, contract_type, original_contract_value,
    start_date, target_completion_date, forecast_completion_date,
    phase, health_status, retainage_percent, contingency_amount,
    address, notes, metadata, org_id
  )
  select
    (project_data->>'name'), (project_data->>'project_number'), (project_data->>'client'),
    (project_data->>'general_contractor'), (project_data->>'engineer_of_record'),
    (project_data->>'project_manager'), (project_data->>'superintendent'),
    (project_data->>'contract_type'), (project_data->>'original_contract_value')::numeric,
    (project_data->>'start_date')::date, (project_data->>'target_completion_date')::date,
    (project_data->>'forecast_completion_date')::date,
    coalesce(project_data->>'phase', 'Pre-Construction'),
    coalesce(project_data->>'health_status', 'On Track'),
    coalesce((project_data->>'retainage_percent')::numeric, 10),
    (project_data->>'contingency_amount')::numeric,
    (project_data->>'address'), (project_data->>'notes'),
    coalesce((project_data->'metadata')::jsonb, '{}'::jsonb), v_org_id
  returning id into v_project_id;

  insert into user_projects (user_id, project_id, role) values (v_user_id, v_project_id, 'owner');

  select to_jsonb(p) into v_result from projects p where p.id = v_project_id;
  return v_result;
end;
$$;

-- ── Backfill the existing single-shop data into one org ──
do $$
declare v_org uuid; v_creator uuid;
begin
  if not exists (select 1 from public.organizations) then
    select up.user_id into v_creator
    from public.user_projects up
    group by up.user_id order by count(*) desc, up.user_id limit 1;

    insert into public.organizations (name, slug, plan, created_by)
    values ('S&H Steel', 'sh-steel', 'enterprise', v_creator)
    returning id into v_org;

    insert into public.organization_members (org_id, user_id, role)
    select v_org, u.user_id, case when u.user_id = v_creator then 'owner' else 'admin' end
    from (select distinct user_id from public.user_projects) u
    on conflict (org_id, user_id) do nothing;

    update public.projects set org_id = v_org where org_id is null;
  end if;
end $$;

-- ── RLS ──
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (public.user_is_org_member(id));
drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
  for insert with check (auth.uid() is not null and created_by = auth.uid());
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update using (public.user_org_role_at_least(id, 'admin'))
  with check (public.user_org_role_at_least(id, 'admin'));
drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete using (public.user_org_role_at_least(id, 'owner'));

drop policy if exists org_members_select on public.organization_members;
create policy org_members_select on public.organization_members
  for select using (public.user_is_org_member(org_id));
drop policy if exists org_members_insert on public.organization_members;
create policy org_members_insert on public.organization_members
  for insert with check (public.user_org_role_at_least(org_id, 'admin'));
drop policy if exists org_members_update on public.organization_members;
create policy org_members_update on public.organization_members
  for update using (public.user_org_role_at_least(org_id, 'admin'))
  with check (public.user_org_role_at_least(org_id, 'admin'));
drop policy if exists org_members_delete on public.organization_members;
create policy org_members_delete on public.organization_members
  for delete using (public.user_org_role_at_least(org_id, 'admin') or user_id = auth.uid());

create or replace function public.organizations_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations
  for each row execute function public.organizations_touch_updated_at();

notify pgrst, 'reload schema';
