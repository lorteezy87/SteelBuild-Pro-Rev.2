-- LOCAL CANDIDATE. Review/apply/stamp manually; never db push or migration repair.
-- RLS-3: all client creation uses the atomic owner-bootstrap RPCs. A table
-- trigger enforces the existing active-project entitlement on every privileged
-- insert, reactivation and move, including future SECURITY DEFINER callers.
-- No new per-user workspace limit is introduced: free=1 active project,
-- pro=10, and other plans retain plan_project_limit's existing contract.
BEGIN;
SET LOCAL lock_timeout = '5s';

REVOKE INSERT ON public.organizations, public.projects FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS organizations_insert ON public.organizations;
DROP POLICY IF EXISTS project_insert ON public.projects;

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.project_creation_state (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
ALTER TABLE private.project_creation_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.project_creation_state FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.enforce_project_creation_cap()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_count bigint;
BEGIN
  -- Archival and unchanged active occupancy never consume another slot.
  IF coalesce(NEW.is_deleted, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT coalesce(OLD.is_deleted, false) AND NEW.org_id IS NOT DISTINCT FROM OLD.org_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Hold the organization row until commit so its billing entitlement cannot
  -- change between the check and the write. Billing uses this same row lock.
  SELECT o.plan INTO v_plan FROM public.organizations o
    WHERE o.id = NEW.org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target organization not found' USING ERRCODE = 'P0001';
  END IF;

  -- A row lock alone leaves a REPEATABLE READ transaction with a stale count.
  -- Actually write a shared revision: a stale higher-isolation contender must
  -- fail with a serialization error, while READ COMMITTED obtains a fresh
  -- snapshot for the count below after the preceding transaction commits.
  INSERT INTO private.project_creation_state AS quota (org_id, revision)
    VALUES (NEW.org_id, 1)
    ON CONFLICT (org_id) DO UPDATE SET revision = quota.revision + 1;

  v_limit := public.plan_project_limit(v_plan);
  IF v_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.projects p
      WHERE p.org_id = NEW.org_id AND NOT coalesce(p.is_deleted, false);
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'Your % plan is limited to % project(s). Upgrade to add more.', initcap(v_plan), v_limit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.enforce_project_creation_cap() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_project_creation_cap() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_project_creation_cap
  BEFORE INSERT OR UPDATE OF org_id, is_deleted ON public.projects
  FOR EACH ROW EXECUTE FUNCTION private.enforce_project_creation_cap();

-- Preserve workspace bootstrap and pin its schema. Its explicit column list
-- cannot accept client billing fields, and membership failure rolls it back.
ALTER FUNCTION public.create_organization(text, text) SET search_path TO '';

-- create_project's former unlocked preflight count is replaced by the trigger.
-- Membership admission, payload mapping, creator ownership and administrator
-- forward coverage remain the same as the baseline function.
CREATE OR REPLACE FUNCTION public.create_project(project_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid; v_project_id uuid; v_org_id uuid; v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001'; END IF;
  v_org_id := coalesce(
    (project_data->>'org_id')::uuid,
    (SELECT org_id FROM public.organization_members WHERE user_id = v_user_id ORDER BY created_at LIMIT 1)
  );
  IF v_org_id IS NULL OR NOT public.user_is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not a member of the target organization' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.projects (
    name, project_number, client, general_contractor, engineer_of_record,
    project_manager, superintendent, contract_type, original_contract_value,
    start_date, target_completion_date, forecast_completion_date,
    phase, health_status, retainage_percent, contingency_amount,
    address, notes, metadata, org_id
  )
  SELECT
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
  RETURNING id INTO v_project_id;

  INSERT INTO public.user_projects (user_id, project_id, role) VALUES (v_user_id, v_project_id, 'owner');
  INSERT INTO public.user_projects (user_id, project_id, role)
  SELECT m.user_id, v_project_id, CASE m.role WHEN 'owner' THEN 'owner' ELSE 'admin' END
    FROM public.organization_members m
    WHERE m.org_id = v_org_id AND m.role IN ('owner','admin') AND m.user_id <> v_user_id
    ON CONFLICT (user_id, project_id) DO NOTHING;

  SELECT to_jsonb(p) INTO v_result FROM public.projects p WHERE p.id = v_project_id;
  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
