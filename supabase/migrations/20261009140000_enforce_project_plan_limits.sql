-- Close direct project inserts and concurrent admissions that bypassed the RPC quota.
-- Required candidate only: apply and stamp the exact reviewed source by hand.
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.enforce_project_plan_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_plan text;
  v_limit integer;
  v_used bigint;
BEGIN
  -- Existing active projects remain usable after downgrade. Only admitting an
  -- active project consumes a new slot; archives and ordinary edits do not.
  IF coalesce(NEW.is_deleted, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND NOT coalesce(OLD.is_deleted, false)
     AND NEW.org_id IS NOT DISTINCT FROM OLD.org_id THEN
    RETURN NEW;
  END IF;
  -- A parent lock cannot refresh an already pinned REPEATABLE READ snapshot
  -- unless the parent tuple changed. PostgREST uses READ COMMITTED; privileged
  -- import/maintenance transactions must use the same admission contract.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'PROJECT_PLAN_ISOLATION: Retry project admission in a READ COMMITTED transaction'
      USING ERRCODE = '40001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT o.plan INTO v_plan FROM public.organizations o
    WHERE o.id = NEW.org_id FOR UPDATE;
  ELSE
    -- PostgreSQL UPDATE owns the project row before its BEFORE ROW trigger.
    -- Never wait project -> organization against erasure's parent-first locks.
    -- This includes privileged restores and privileged workspace reassignment.
    BEGIN
      SELECT o.plan INTO v_plan FROM public.organizations o
      WHERE o.id = NEW.org_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'PROJECT_PLAN_BUSY: Workspace capacity is changing; retry the restore'
        USING ERRCODE = '55P03';
    END;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_PLAN_NOT_AUTHORIZED: Target workspace does not exist'
      USING ERRCODE = '42501';
  END IF;

  -- Recheck after any parent lock wait; pre-statement RLS/RPC observations can
  -- be stale. Service/maintenance writes still obey capacity (no quota bypass).
  IF auth.role() = 'authenticated' THEN
    IF auth.uid() IS NULL OR NOT public.user_is_org_member(NEW.org_id) THEN
      RAISE EXCEPTION 'PROJECT_PLAN_NOT_AUTHORIZED: Workspace membership changed; reload and retry'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NOT public.user_has_project_role_at_least(OLD.id, 'admin') THEN
      RAISE EXCEPTION 'PROJECT_PLAN_NOT_AUTHORIZED: Restoring a project requires an admin'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_limit := public.plan_project_limit(v_plan);
  IF v_limit IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.projects p
    WHERE p.org_id = NEW.org_id AND NOT coalesce(p.is_deleted, false)
      AND p.id IS DISTINCT FROM NEW.id;
    IF v_used >= v_limit THEN
      RAISE EXCEPTION 'PROJECT_PLAN_LIMIT: Your % plan is limited to % active project(s). Upgrade to add or restore another.',
        initcap(v_plan), v_limit USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_project_plan_limit() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_enforce_project_plan_limit
BEFORE INSERT OR UPDATE OF org_id, is_deleted ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_project_plan_limit();

-- Live create_project payload retained, including current job type/vendor fields.
-- The only behavioral addition here is serialization and membership revalidation.
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

  -- Serialize the normal RPC before its early quota read. The table trigger also
  -- protects direct inserts and rechecks the live plan at the write boundary.
  select plan into v_plan from public.organizations where id = v_org_id for update;
  if not found or not public.user_is_org_member(v_org_id) then
    raise exception 'PROJECT_PLAN_NOT_AUTHORIZED: Workspace membership changed; reload and retry' using errcode = '42501';
  end if;
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

