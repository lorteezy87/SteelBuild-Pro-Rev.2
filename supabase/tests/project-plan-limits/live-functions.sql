-- Exact production definitions captured read-only 2026-10-09; quota tests retain the live create payload.
CREATE OR REPLACE FUNCTION public.plan_limits(p_plan text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_plan
    when 'free' then jsonb_build_object('members', 2, 'projects', 1)
    when 'pro' then jsonb_build_object('members', 15, 'projects', 10)
    when 'business' then jsonb_build_object('members', null, 'projects', null)
    when 'enterprise' then jsonb_build_object('members', null, 'projects', null)
    else jsonb_build_object('members', 2, 'projects', 1)  -- unknown plan → the free limits (fail closed)
  end;
$function$;

CREATE OR REPLACE FUNCTION public.create_project(project_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid; v_project_id uuid; v_org_id uuid; v_result jsonb; v_plan text; v_limit int; v_count int;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  if length(trim(coalesce(project_data->>'name', ''))) = 0 then raise exception 'Project name is required' using errcode = 'P0001'; end if;

  v_org_id := coalesce(
    (project_data->>'org_id')::uuid,
    (select org_id from public.organization_members where user_id = v_user_id order by created_at limit 1)
  );
  if v_org_id is null or not public.user_is_org_member(v_org_id) then
    raise exception 'Not a member of the target organization' using errcode = 'P0001';
  end if;

  select plan into v_plan from public.organizations where id = v_org_id;
  v_limit := public.plan_project_limit(v_plan);
  if v_limit is not null then
    select count(*) into v_count from public.projects where org_id = v_org_id and coalesce(is_deleted, false) = false;
    if v_count >= v_limit then
      raise exception 'Your % plan is limited to % project(s). Upgrade to add more.', initcap(v_plan), v_limit using errcode = 'P0001';
    end if;
  end if;

  insert into public.projects (
    name, project_number, client, general_contractor, engineer_of_record, project_manager, superintendent,
    contract_type, original_contract_value, start_date, target_completion_date, forecast_completion_date,
    phase, health_status, retainage_percent, contingency_amount, address, notes, metadata, org_id,
    job_type, joist_manufacturer, deck_manufacturer
  )
  select
    trim(project_data->>'name'), nullif(trim(project_data->>'project_number'), ''), project_data->>'client',
    project_data->>'general_contractor', project_data->>'engineer_of_record', project_data->>'project_manager',
    project_data->>'superintendent', project_data->>'contract_type', (project_data->>'original_contract_value')::numeric,
    (project_data->>'start_date')::date, (project_data->>'target_completion_date')::date, (project_data->>'forecast_completion_date')::date,
    coalesce(project_data->>'phase', 'Pre-Construction'), coalesce(project_data->>'health_status', 'On Track'),
    coalesce((project_data->>'retainage_percent')::numeric, 10), (project_data->>'contingency_amount')::numeric,
    project_data->>'address', project_data->>'notes', coalesce((project_data->'metadata')::jsonb, '{}'::jsonb), v_org_id,
    nullif(project_data->>'job_type', ''), project_data->>'joist_manufacturer', project_data->>'deck_manufacturer'
  returning id into v_project_id;

  insert into public.user_projects (user_id, project_id, role) values (v_user_id, v_project_id, 'owner');

  -- Every other org owner/admin gets matching project-write access.
  insert into public.user_projects (user_id, project_id, role)
  select m.user_id, v_project_id, case m.role when 'owner' then 'owner' else 'admin' end
  from public.organization_members m
  where m.org_id = v_org_id and m.role in ('owner','admin') and m.user_id <> v_user_id
  on conflict (user_id, project_id) do nothing;

  select to_jsonb(p) into v_result from public.projects p where p.id = v_project_id;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.plan_member_limit(p_plan text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (public.plan_limits(p_plan) ->> 'members')::int;
$function$;

CREATE OR REPLACE FUNCTION public.plan_project_limit(p_plan text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (public.plan_limits(p_plan) ->> 'projects')::int;
$function$;

CREATE OR REPLACE FUNCTION public.user_is_org_member(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = (select auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_org_role_at_least(p_org_id uuid, p_min_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = (select auth.uid())
      and (case m.role when 'owner' then 3 when 'admin' then 2 when 'member' then 1 else 0 end)
        >= (case p_min_role when 'owner' then 3 when 'admin' then 2 when 'member' then 1 else 0 end)
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_project_role_at_least(p_project_id uuid, p_min_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with role_levels(name, level) as (
    values ('viewer', 0), ('field', 1), ('pm', 2), ('admin', 3), ('owner', 3)
  ), explicit_role as (
    select rl.level from public.user_projects up join role_levels rl on rl.name = up.role
     where up.user_id = (select auth.uid()) and up.project_id = p_project_id
  ), default_role as (
    select rl.level from public.projects p
      join public.organizations o on o.id = p.org_id
      join public.organization_members om on om.org_id = p.org_id and om.user_id = (select auth.uid())
      join role_levels rl on rl.name = o.member_default_project_role
     where p.id = p_project_id
  ), required as (
    select level from role_levels where name = p_min_role
  )
  select exists (
           select 1 from public.projects p
             join public.organization_members om on om.org_id = p.org_id and om.user_id = (select auth.uid())
            where p.id = p_project_id and om.role in ('owner','admin')
         )
      or exists (select 1 from explicit_role m, required r where m.level >= r.level)
      or (not exists (select 1 from explicit_role)
          and exists (select 1 from default_role d, required r where d.level >= r.level));
$function$;

CREATE POLICY project_insert ON public.projects FOR INSERT TO authenticated WITH CHECK(public.user_is_org_member(org_id));
CREATE POLICY project_select ON public.projects FOR SELECT TO authenticated USING (NOT coalesce(is_deleted,false) AND public.user_is_org_member(org_id));
CREATE POLICY project_update ON public.projects FOR UPDATE TO authenticated USING(public.user_has_project_role_at_least(id,'pm')) WITH CHECK(public.user_has_project_role_at_least(id,'pm'));

