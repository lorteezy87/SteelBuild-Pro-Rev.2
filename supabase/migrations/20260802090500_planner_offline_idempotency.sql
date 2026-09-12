-- Durable, user-bound receipts for Planner offline replay. Intentionally
-- unapplied; deploy only through the approved Supabase migration workflow.

CREATE TABLE IF NOT EXISTS public.planner_offline_operation_receipts (
  user_id uuid NOT NULL,
  client_op_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  operation_kind text NOT NULL,
  canonical_payload jsonb NOT NULL,
  stored_result jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_op_id)
);

ALTER TABLE public.planner_offline_operation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planner_offline_operation_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_planner_offline_operation(
  p_project_id uuid,
  p_entity_id uuid,
  p_kind text,
  p_patch jsonb,
  p_expected_updated_at timestamptz,
  p_client_op_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_receipt public.planner_offline_operation_receipts%ROWTYPE;
  v_action public.action_items%ROWTYPE;
  v_schedule public.schedule_tasks%ROWTYPE;
  v_result jsonb;
  v_entity_type text;
  v_progress numeric;
BEGIN
  IF v_user_id IS NULL OR p_project_id IS NULL OR p_entity_id IS NULL OR p_client_op_id IS NULL THEN
    RAISE EXCEPTION 'Planner offline operation identifiers are required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Planner offline replay requires field project access' USING ERRCODE = '42501';
  END IF;

  -- Serialize same-user, same-client-operation calls before receipt lookup.
  -- A second concurrent caller waits, then returns the durable receipt.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_client_op_id::text, 0));

  SELECT * INTO v_receipt
  FROM public.planner_offline_operation_receipts
  WHERE user_id = v_user_id AND client_op_id = p_client_op_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.project_id IS DISTINCT FROM p_project_id
       OR v_receipt.entity_id IS DISTINCT FROM p_entity_id
       OR v_receipt.operation_kind IS DISTINCT FROM p_kind
       OR v_receipt.canonical_payload IS DISTINCT FROM p_patch THEN
      RAISE EXCEPTION 'Planner offline receipt binding mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_receipt.stored_result;
  END IF;

  IF p_kind = 'action-status' THEN
    IF jsonb_typeof(p_patch) <> 'object'
       OR p_patch ?& ARRAY['status'] = false
       OR (SELECT count(*) FROM jsonb_object_keys(p_patch)) <> 1
       OR NOT (p_patch->>'status' IN ('Open', 'In Progress', 'Complete', 'Cancelled', 'Resolved', 'Closed')) THEN
      RAISE EXCEPTION 'Unsupported offline action patch' USING ERRCODE = '22023';
    END IF;
    v_entity_type := 'action_item';
    SELECT * INTO v_action FROM public.action_items WHERE id = p_entity_id AND project_id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Planner action is unavailable' USING ERRCODE = '42501'; END IF;
    IF p_expected_updated_at IS NULL OR v_action.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Planner action changed before offline replay' USING ERRCODE = '40001';
    END IF;
    UPDATE public.action_items
    SET status = p_patch->>'status'
    WHERE id = p_entity_id AND project_id = p_project_id AND updated_at = p_expected_updated_at
    RETURNING * INTO v_action;
    IF NOT FOUND THEN RAISE EXCEPTION 'Planner action changed before offline replay' USING ERRCODE = '40001'; END IF;
    v_result := to_jsonb(v_action);
  ELSIF p_kind = 'schedule-progress' THEN
    IF jsonb_typeof(p_patch) <> 'object'
       OR p_patch ?& ARRAY['percent_complete'] = false
       OR (SELECT count(*) FROM jsonb_object_keys(p_patch)) <> 1
       OR jsonb_typeof(p_patch->'percent_complete') <> 'number' THEN
      RAISE EXCEPTION 'Unsupported offline schedule patch' USING ERRCODE = '22023';
    END IF;
    v_progress := (p_patch->>'percent_complete')::numeric;
    IF v_progress < 0 OR v_progress > 100 THEN RAISE EXCEPTION 'Schedule progress must be between 0 and 100' USING ERRCODE = '22023'; END IF;
    v_entity_type := 'schedule_task';
    SELECT * INTO v_schedule FROM public.schedule_tasks WHERE id = p_entity_id AND project_id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Planner schedule activity is unavailable' USING ERRCODE = '42501'; END IF;
    IF p_expected_updated_at IS NULL OR v_schedule.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Planner schedule activity changed before offline replay' USING ERRCODE = '40001';
    END IF;
    UPDATE public.schedule_tasks
    SET percent_complete = v_progress,
        status = CASE WHEN v_progress = 100 THEN 'Complete' WHEN v_progress = 0 THEN 'Not Started' ELSE 'In Progress' END
    WHERE id = p_entity_id AND project_id = p_project_id AND updated_at = p_expected_updated_at
    RETURNING * INTO v_schedule;
    IF NOT FOUND THEN RAISE EXCEPTION 'Planner schedule activity changed before offline replay' USING ERRCODE = '40001'; END IF;
    v_result := to_jsonb(v_schedule);
  ELSE
    RAISE EXCEPTION 'Unsupported Planner offline operation kind' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.planner_offline_operation_receipts (
    user_id, client_op_id, project_id, entity_type, entity_id, operation_kind, canonical_payload, stored_result
  ) VALUES (
    v_user_id, p_client_op_id, p_project_id, v_entity_type, p_entity_id, p_kind, p_patch, v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_planner_offline_operation(uuid, uuid, text, jsonb, timestamptz, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_planner_offline_operation(uuid, uuid, text, jsonb, timestamptz, uuid) TO authenticated;
