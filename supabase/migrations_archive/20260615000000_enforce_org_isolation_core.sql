-- Tier-0 multi-tenant isolation: make the ORG the authoritative boundary for
-- project access, so a user in org A can never read/write org B's project data.
-- Until now user_has_project_access checked only user_projects and ignored
-- projects.org_id, and create_project trusted a client-supplied org_id with no
-- membership check. Single-org today (S&H Steel, 1 member) so this is a no-op for
-- the current user (verified: 0 projects lost) and a hard boundary for every
-- future tenant. Access model = Option A: org membership grants project access;
-- user_projects rows are preserved and still drive project ROLE.

-- 1. Integrity: every project must belong to an org (0 nulls today; defensive
--    backfill to the sole org, then constrain).
update public.projects p
set org_id = (select id from public.organizations order by created_at limit 1)
where p.org_id is null;

alter table public.projects alter column org_id set not null;

-- 2. The isolation chokepoint (used by ~60 project-scoped policies). SECURITY
--    DEFINER -> internal reads bypass RLS (projects/org_members have no FORCE RLS,
--    owner postgres), so no recursion against the projects policy it backs.
create or replace function public.user_has_project_access(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.projects p
    join public.organization_members om
      on om.org_id = p.org_id
     and om.user_id = auth.uid()
    where p.id = p_project_id
  );
$$;

-- 3. Close the create_project hole: you may only create a project in an org you
--    belong to. Body otherwise identical to the shipped function.
create or replace function public.create_project(project_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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

  -- Org boundary: reject creation into an org the caller is not a member of
  -- (also guards the projects.org_id NOT NULL constraint).
  if v_org_id is null or not public.user_is_org_member(v_org_id) then
    raise exception 'Not a member of the target organization' using errcode = 'P0001';
  end if;

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

-- 4. Tighten the direct projects INSERT policy to require org membership. The app
--    creates projects via the SECURITY DEFINER create_project RPC (bypasses this),
--    so this only blocks a raw client insert into an arbitrary org. ALTER keeps
--    the policy's cmd/roles (authenticated) intact.
alter policy project_insert on public.projects
  with check (public.user_is_org_member(org_id));

notify pgrst, 'reload schema';
