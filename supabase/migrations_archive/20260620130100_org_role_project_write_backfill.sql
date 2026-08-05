-- 20260620130100_org_role_project_write_backfill.sql
-- I3: an org owner/admin who joined by INVITE has no user_projects row, so the
-- WRITE gate (user_has_project_role_at_least, which reads only user_projects)
-- silently RLS-rejects every write — even though the READ gate
-- (user_has_project_access) grants org owners/admins access to every org project.
-- Result: they see all projects but cannot edit anything. Fix = backfill
-- user_projects rows that mirror their org standing, at BOTH seeding points so
-- the cover stays complete: (1) invite-accept covers projects that exist now,
-- (2) create_project covers projects created later. owner -> project 'owner',
-- admin -> project 'admin'; org 'member' stays project-scoped (no backfill).
--
-- Applied live via Supabase MCP (apply_migration) 2026-06-20 and field-verified
-- with rolled-back DO-blocks: accept_invitation makes the invitee an org admin
-- AND backfills the existing project's write role; create_project seeds the
-- creator (owner) and backfills every other org owner/admin onto the new project.

create or replace function public.accept_invitation(p_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_uid uuid; v_email text; v_inv record; v_result jsonb; v_plan text; v_limit int; v_count int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid;

  select * into v_inv from public.organization_invitations where token = p_token;
  if v_inv.id is null then raise exception 'Invitation not found' using errcode = 'P0001'; end if;
  if v_inv.status <> 'pending' then raise exception 'This invitation is no longer valid' using errcode = 'P0001'; end if;
  if v_inv.expires_at < now() then raise exception 'This invitation has expired' using errcode = 'P0001'; end if;
  if lower(v_inv.email) <> lower(coalesce(v_email, '')) then
    raise exception 'This invitation was sent to a different email address' using errcode = 'P0001';
  end if;

  -- Plan member-limit enforcement (skip when the caller is already a member = re-accept).
  if not exists (select 1 from public.organization_members where org_id = v_inv.org_id and user_id = v_uid) then
    select plan into v_plan from public.organizations where id = v_inv.org_id;
    v_limit := public.plan_member_limit(v_plan);
    if v_limit is not null then
      select count(*) into v_count from public.organization_members where org_id = v_inv.org_id;
      if v_count >= v_limit then
        raise exception 'This workspace is on the % plan, limited to % member(s). The owner must upgrade to add more.', initcap(v_plan), v_limit
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do nothing;

  -- I3: give an invited org owner/admin project-write access matching their org
  -- standing, for all projects that exist today (create_project covers later ones).
  if v_inv.role in ('owner','admin') then
    insert into public.user_projects (user_id, project_id, role)
    select v_uid, p.id, case v_inv.role when 'owner' then 'owner' else 'admin' end
    from public.projects p
    where p.org_id = v_inv.org_id
    on conflict (user_id, project_id) do nothing;
  end if;

  update public.organization_invitations set status = 'accepted' where id = v_inv.id;

  select jsonb_build_object('org_id', o.id, 'org_name', o.name) into v_result
  from public.organizations o where o.id = v_inv.org_id;
  return v_result;
end;
$function$;

create or replace function public.create_project(project_data jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid; v_project_id uuid; v_org_id uuid; v_result jsonb;
  v_plan text; v_limit int; v_count int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated' using errcode = 'P0001'; end if;

  v_org_id := coalesce(
    (project_data->>'org_id')::uuid,
    (select org_id from public.organization_members where user_id = v_user_id order by created_at limit 1)
  );
  if v_org_id is null or not public.user_is_org_member(v_org_id) then
    raise exception 'Not a member of the target organization' using errcode = 'P0001';
  end if;

  -- Plan project-limit enforcement.
  select plan into v_plan from public.organizations where id = v_org_id;
  v_limit := public.plan_project_limit(v_plan);
  if v_limit is not null then
    select count(*) into v_count from public.projects
      where org_id = v_org_id and coalesce(is_deleted, false) = false;
    if v_count >= v_limit then
      raise exception 'Your % plan is limited to % project(s). Upgrade to add more.', initcap(v_plan), v_limit
        using errcode = 'P0001';
    end if;
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

  -- I3 (forward cover): every other org owner/admin gets write access to each new
  -- org project, so the invite-accept backfill stays complete for later projects.
  insert into user_projects (user_id, project_id, role)
  select m.user_id, v_project_id, case m.role when 'owner' then 'owner' else 'admin' end
  from organization_members m
  where m.org_id = v_org_id and m.role in ('owner','admin') and m.user_id <> v_user_id
  on conflict (user_id, project_id) do nothing;

  select to_jsonb(p) into v_result from projects p where p.id = v_project_id;
  return v_result;
end;
$function$;
