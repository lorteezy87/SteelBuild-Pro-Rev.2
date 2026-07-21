-- Security hardening for the piece-station trigger and the four remaining
-- viewer-adjacent tables that still used permissive FOR ALL write policies.
--
-- Trigger functions are invoked by PostgreSQL through their triggers; browser
-- and service roles do not need direct EXECUTE. The write-policy split keeps
-- the existing field-role predicates byte-for-byte while removing SELECT from
-- the old FOR ALL policies and setting an explicit authenticated role floor.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.maintenance_jobs (
  job_key text primary key,
  token_sha256 text,
  expected_project_ref text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completion_details jsonb not null default '{}'::jsonb,
  constraint maintenance_jobs_token_sha256_check check (
    token_sha256 is null or token_sha256 ~ '^[0-9a-f]{64}$'
  )
);

alter table private.maintenance_jobs enable row level security;
revoke all on table private.maintenance_jobs from public, anon, authenticated, service_role;

insert into private.maintenance_jobs (job_key, expected_project_ref)
values
  ('legacy_app_files_copy', 'kjrwqagyeswwoxpjkcko'),
  ('staging_e2e_bootstrap', 'abbeavtbifuddtrifvae')
on conflict (job_key) do nothing;

create or replace function public.get_maintenance_job_context(p_job_key text)
returns table (
  token_sha256 text,
  expected_project_ref text,
  completed_at timestamptz,
  founding_org_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    job.token_sha256,
    job.expected_project_ref,
    job.completed_at,
    public.founding_org_id()
  from private.maintenance_jobs job
  where job.job_key = p_job_key;
$$;

revoke all on function public.get_maintenance_job_context(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_maintenance_job_context(text) to service_role;

create or replace function public.complete_staging_e2e_bootstrap(
  p_user_id uuid,
  p_org_id uuid,
  p_project_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from auth.users user_row
    where user_row.id = p_user_id
      and user_row.email_confirmed_at is not null
      and user_row.raw_user_meta_data ->> 'purpose' = 'steelbuild-pro-staging-e2e'
  ) then
    raise exception 'staging E2E bootstrap completion blocked: confirmed synthetic user missing';
  end if;

  if not exists (
    select 1
    from public.organizations org
    where org.id = p_org_id
      and org.created_by = p_user_id
      and org.metadata ->> 'purpose' = 'steelbuild-pro-staging-e2e'
  ) then
    raise exception 'staging E2E bootstrap completion blocked: synthetic organization missing';
  end if;

  if not exists (
    select 1
    from public.projects project_row
    where project_row.id = p_project_id
      and project_row.org_id = p_org_id
      and project_row.metadata ->> 'purpose' = 'steelbuild-pro-staging-e2e'
  ) then
    raise exception 'staging E2E bootstrap completion blocked: synthetic project missing';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.org_id = p_org_id
      and member.user_id = p_user_id
      and member.role = 'owner'
  ) or not exists (
    select 1
    from public.user_projects membership
    where membership.project_id = p_project_id
      and membership.user_id = p_user_id
      and membership.role = 'owner'
  ) then
    raise exception 'staging E2E bootstrap completion blocked: owner memberships missing';
  end if;

  update private.maintenance_jobs
     set completed_at = coalesce(completed_at, now()),
         token_sha256 = null,
         completion_details = jsonb_build_object(
           'users', 1,
           'organizations', 1,
           'projects', 1,
           'organization_memberships', 1,
           'project_memberships', 1
         )
   where job_key = 'staging_e2e_bootstrap';

  if not found then
    raise exception 'staging E2E bootstrap completion blocked: maintenance marker missing';
  end if;

  return true;
end;
$$;

revoke all on function public.complete_staging_e2e_bootstrap(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_staging_e2e_bootstrap(uuid, uuid, uuid)
  to service_role;

revoke all on function public.seed_default_piece_stations_for_project()
  from public, anon, authenticated, service_role;

drop policy if exists delivery_items_write on public.delivery_items;
drop policy if exists delivery_items_insert on public.delivery_items;
drop policy if exists delivery_items_update on public.delivery_items;
drop policy if exists delivery_items_delete on public.delivery_items;

create policy delivery_items_insert on public.delivery_items
  for insert to authenticated
  with check (
    delivery_id in (
      select d.id
      from public.deliveries d
      where user_has_project_role_at_least(d.project_id, 'field')
    )
  );

create policy delivery_items_update on public.delivery_items
  for update to authenticated
  using (
    delivery_id in (
      select d.id
      from public.deliveries d
      where user_has_project_role_at_least(d.project_id, 'field')
    )
  )
  with check (
    delivery_id in (
      select d.id
      from public.deliveries d
      where user_has_project_role_at_least(d.project_id, 'field')
    )
  );

create policy delivery_items_delete on public.delivery_items
  for delete to authenticated
  using (
    delivery_id in (
      select d.id
      from public.deliveries d
      where user_has_project_role_at_least(d.project_id, 'field')
    )
  );

drop policy if exists drawing_sheets_write on public.drawing_sheets;
drop policy if exists drawing_sheets_insert on public.drawing_sheets;
drop policy if exists drawing_sheets_update on public.drawing_sheets;
drop policy if exists drawing_sheets_delete on public.drawing_sheets;

create policy drawing_sheets_insert on public.drawing_sheets
  for insert to authenticated
  with check (
    analysis_id in (
      select a.id
      from public.drawing_analyses a
      where user_has_project_role_at_least(a.project_id, 'field')
    )
  );

create policy drawing_sheets_update on public.drawing_sheets
  for update to authenticated
  using (
    analysis_id in (
      select a.id
      from public.drawing_analyses a
      where user_has_project_role_at_least(a.project_id, 'field')
    )
  )
  with check (
    analysis_id in (
      select a.id
      from public.drawing_analyses a
      where user_has_project_role_at_least(a.project_id, 'field')
    )
  );

create policy drawing_sheets_delete on public.drawing_sheets
  for delete to authenticated
  using (
    analysis_id in (
      select a.id
      from public.drawing_analyses a
      where user_has_project_role_at_least(a.project_id, 'field')
    )
  );

drop policy if exists submittal_activity_write on public.submittal_activity;
drop policy if exists submittal_activity_insert on public.submittal_activity;
drop policy if exists submittal_activity_update on public.submittal_activity;
drop policy if exists submittal_activity_delete on public.submittal_activity;

create policy submittal_activity_insert on public.submittal_activity
  for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'field'));

create policy submittal_activity_update on public.submittal_activity
  for update to authenticated
  using (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));

create policy submittal_activity_delete on public.submittal_activity
  for delete to authenticated
  using (user_has_project_role_at_least(project_id, 'field'));

drop policy if exists task_dependencies_write on public.task_dependencies;
drop policy if exists task_dependencies_insert on public.task_dependencies;
drop policy if exists task_dependencies_update on public.task_dependencies;
drop policy if exists task_dependencies_delete on public.task_dependencies;

create policy task_dependencies_insert on public.task_dependencies
  for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'field'));

create policy task_dependencies_update on public.task_dependencies
  for update to authenticated
  using (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));

create policy task_dependencies_delete on public.task_dependencies
  for delete to authenticated
  using (user_has_project_role_at_least(project_id, 'field'));

notify pgrst, 'reload schema';

commit;
