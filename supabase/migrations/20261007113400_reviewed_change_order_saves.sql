-- LOCAL CANDIDATE. Apply and stamp by hand only after release review.
-- Preserves the shared approve/move RPC signatures. The new command combines
-- reviewed optimistic concurrency, ordinary edits, and lifecycle effects.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_change_order_reviewed(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_status text,
  p_expected_amount numeric,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_current public.change_orders%rowtype;
  v_proposed public.change_orders%rowtype;
  v_saved public.change_orders%rowtype;
  v_ordinary jsonb;
  v_status text;
  v_field text;
  v_line_number integer;
  v_approval_date date;
  v_transition boolean;
  v_previous_co_rpc text := current_setting('steelbuild.co_rpc', true);
  v_previous_cost_rpc text := current_setting('steelbuild.cost_rpc', true);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(steelbuild_security.satisfies_mfa(), false) THEN
    RAISE EXCEPTION 'MFA_REQUIRED: Complete multi-factor authentication to continue' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Change-order patch must be an object' USING ERRCODE = '22023';
  END IF;
  FOR v_field IN SELECT jsonb_object_keys(p_patch) LOOP
    IF v_field <> ALL(ARRAY[
      'title','description','reason_code','cost_code_id','co_amount','margin_percent',
      'schedule_impact_days','submitted_date','notes','attachments','source_rfi_id',
      'sov_line_item_id','status','approved_by','approved_date','sov_mode',
      'decision_notes','void_reason'
    ]) THEN
      RAISE EXCEPTION 'Unsupported or immutable change-order field: %', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO v_current FROM public.change_orders
    WHERE id = p_id AND is_deleted = false FOR UPDATE;
  IF v_current.id IS NULL THEN
    RAISE EXCEPTION 'Change order not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.user_has_project_access(v_current.project_id)
     OR NOT public.user_has_project_role_at_least(v_current.project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized to save change orders for this project' USING ERRCODE = '42501';
  END IF;
  IF p_expected_status IS NULL
     OR v_current.status IS DISTINCT FROM p_expected_status
     OR v_current.co_amount IS DISTINCT FROM p_expected_amount
     OR v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'This change order changed after review. Reload it and review the current amount and status before saving.' USING ERRCODE = '40001';
  END IF;

  v_status := coalesce(p_patch->>'status', v_current.status);
  v_transition := v_status IS DISTINCT FROM v_current.status;
  IF NOT coalesce(public.change_order_transition_allowed(v_current.status, v_status), false) THEN
    RAISE EXCEPTION 'Change order cannot move from % to %', v_current.status, v_status USING ERRCODE = '23514';
  END IF;
  IF v_transition AND v_status = 'Void' AND NOT public.user_has_project_role_at_least(v_current.project_id, 'admin') THEN
    RAISE EXCEPTION 'Not authorized to void change orders for this project' USING ERRCODE = '42501';
  END IF;
  IF (p_patch ?| ARRAY['approved_by','approved_date','sov_mode']) AND NOT (v_transition AND v_status = 'Approved') THEN
    RAISE EXCEPTION 'Approval stamps may be supplied only for a new approval' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'void_reason' AND NOT (v_transition AND v_status = 'Void') THEN
    RAISE EXCEPTION 'A void reason requires a new void transition' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'decision_notes' AND NOT (v_transition AND v_status = 'Rejected') THEN
    RAISE EXCEPTION 'A rejection reason requires a new rejection transition' USING ERRCODE = '22023';
  END IF;
  IF v_transition AND v_status = 'Void' AND coalesce(btrim(p_patch->>'void_reason'), '') = '' THEN
    RAISE EXCEPTION 'Void needs a written reason' USING ERRCODE = '23514';
  END IF;
  IF v_transition AND v_status = 'Rejected' AND coalesce(btrim(p_patch->>'decision_notes'), '') = '' THEN
    RAISE EXCEPTION 'Rejected needs a written reason' USING ERRCODE = '23514';
  END IF;

  v_ordinary := p_patch - ARRAY['status','approved_by','approved_date','sov_mode','decision_notes','void_reason'];
  FOR v_field IN SELECT unnest(ARRAY['cost_code_id','source_rfi_id','sov_line_item_id','submitted_date']) LOOP
    IF v_ordinary->>v_field = '' THEN v_ordinary := jsonb_set(v_ordinary, ARRAY[v_field], 'null'::jsonb); END IF;
  END LOOP;
  v_proposed := jsonb_populate_record(v_current, v_ordinary);
  IF p_patch ? 'co_amount' AND (v_proposed.co_amount IS NULL OR v_proposed.co_amount::text IN ('NaN','Infinity','-Infinity')) THEN
    RAISE EXCEPTION 'CO amount must be finite' USING ERRCODE = '23514';
  END IF;
  IF p_patch ? 'margin_percent' AND (v_proposed.margin_percent IS NULL OR v_proposed.margin_percent::text IN ('NaN','Infinity','-Infinity') OR v_proposed.margin_percent < 0 OR v_proposed.margin_percent > 100) THEN
    RAISE EXCEPTION 'Margin must be finite and between 0 and 100' USING ERRCODE = '23514';
  END IF;
  IF p_patch ? 'schedule_impact_days' AND (v_proposed.schedule_impact_days IS NULL OR v_proposed.schedule_impact_days < 0) THEN
    RAISE EXCEPTION 'Schedule impact must be a nonnegative whole number of days' USING ERRCODE = '23514';
  END IF;
  IF p_patch ? 'title' AND coalesce(btrim(v_proposed.title), '') = '' THEN
    RAISE EXCEPTION 'A change-order title is required' USING ERRCODE = '23514';
  END IF;
  IF v_current.status = 'Approved' AND (
    v_proposed.co_amount IS DISTINCT FROM v_current.co_amount OR
    v_proposed.cost_code_id IS DISTINCT FROM v_current.cost_code_id OR
    v_proposed.sov_line_item_id IS DISTINCT FROM v_current.sov_line_item_id
  ) THEN
    RAISE EXCEPTION 'An approved change order is frozen. Void it and issue a new one.' USING ERRCODE = '42501';
  END IF;

  -- Unchanged historical links remain readable after the related record is
  -- archived. New financial decisions and changed links must still resolve.
  IF v_proposed.cost_code_id IS NOT NULL AND (
    v_proposed.cost_code_id IS DISTINCT FROM v_current.cost_code_id OR (v_transition AND v_status = 'Approved')
  ) THEN
    PERFORM 1 FROM public.cost_codes WHERE id = v_proposed.cost_code_id AND project_id = v_current.project_id AND is_deleted = false FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cost code must belong to this project' USING ERRCODE = '23503'; END IF;
  END IF;
  IF v_proposed.source_rfi_id IS NOT NULL AND v_proposed.source_rfi_id IS DISTINCT FROM v_current.source_rfi_id THEN
    PERFORM 1 FROM public.rfis WHERE id = v_proposed.source_rfi_id AND project_id = v_current.project_id AND is_deleted = false FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source RFI must belong to this project' USING ERRCODE = '23503'; END IF;
  END IF;
  IF v_proposed.sov_line_item_id IS NOT NULL AND (
    v_proposed.sov_line_item_id IS DISTINCT FROM v_current.sov_line_item_id OR
    (v_transition AND v_status = 'Approved' AND p_patch->>'sov_mode' = 'adjust_line')
  ) THEN
    SELECT line_item_number INTO v_line_number FROM public.sov_items WHERE id = v_proposed.sov_line_item_id AND project_id = v_current.project_id AND is_deleted = false FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SOV line must belong to this project' USING ERRCODE = '23503'; END IF;
    v_proposed.sov_line_number := v_line_number;
  ELSIF v_proposed.sov_line_item_id IS NULL AND v_ordinary ? 'sov_line_item_id' THEN
    v_proposed.sov_line_number := NULL;
  END IF;

  IF v_transition AND v_status = 'Approved' THEN
    IF coalesce(btrim(p_patch->>'approved_by'), '') = '' THEN
      RAISE EXCEPTION 'Enter the person who approved this change order' USING ERRCODE = '23514';
    END IF;
    IF p_patch->>'sov_mode' IS NULL OR p_patch->>'sov_mode' NOT IN ('new_line','adjust_line','none') THEN
      RAISE EXCEPTION 'Choose an explicit SOV treatment before approval' USING ERRCODE = '22023';
    END IF;
    IF v_proposed.co_amount IS NULL OR v_proposed.co_amount::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Approval requires a known finite CO amount' USING ERRCODE = '23514';
    END IF;
    IF p_patch->>'sov_mode' = 'adjust_line' AND (p_patch->>'sov_line_item_id' IS NULL OR v_proposed.sov_line_item_id IS NULL) THEN
      RAISE EXCEPTION 'Choose the existing SOV line to adjust' USING ERRCODE = '23514';
    END IF;
    IF p_patch->>'sov_mode' = 'new_line' AND v_proposed.co_amount < 0 THEN
      RAISE EXCEPTION 'A deduct cannot create a new SOV line' USING ERRCODE = '23514';
    END IF;
    IF p_patch ? 'approved_date' THEN
      IF coalesce(p_patch->>'approved_date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Enter a valid approval date' USING ERRCODE = '22007'; END IF;
      v_approval_date := (p_patch->>'approved_date')::date;
      IF to_char(v_approval_date,'YYYY-MM-DD') <> p_patch->>'approved_date' THEN RAISE EXCEPTION 'Enter a valid approval date' USING ERRCODE = '22007'; END IF;
    ELSE v_approval_date := current_date;
    END IF;
  END IF;

  -- No RPC bypass flag for ordinary edits: all existing table guards still run.
  IF v_ordinary <> '{}'::jsonb THEN
    UPDATE public.change_orders SET
      title = v_proposed.title, description = v_proposed.description, reason_code = v_proposed.reason_code,
      cost_code_id = v_proposed.cost_code_id, co_amount = v_proposed.co_amount,
      margin_percent = v_proposed.margin_percent, schedule_impact_days = v_proposed.schedule_impact_days,
      submitted_date = v_proposed.submitted_date, notes = v_proposed.notes, attachments = v_proposed.attachments,
      source_rfi_id = v_proposed.source_rfi_id, sov_line_item_id = v_proposed.sov_line_item_id,
      sov_line_number = v_proposed.sov_line_number
    WHERE id = v_current.id RETURNING * INTO v_saved;
    IF v_saved.id IS NULL THEN RAISE EXCEPTION 'Change order could not be saved' USING ERRCODE = '42501'; END IF;
  ELSE v_saved := v_current;
  END IF;
  IF v_transition THEN
    IF v_status = 'Approved' THEN
      v_saved := public.approve_change_order(v_current.id, btrim(p_patch->>'approved_by'), v_approval_date, p_patch->>'sov_mode', CASE WHEN p_patch->>'sov_mode' = 'adjust_line' THEN v_proposed.sov_line_item_id ELSE NULL END);
    ELSE
      v_saved := public.move_change_order(v_current.id, v_status, CASE v_status WHEN 'Void' THEN btrim(p_patch->>'void_reason') WHEN 'Rejected' THEN btrim(p_patch->>'decision_notes') ELSE NULL END);
    END IF;
    IF v_status IN ('Approved', 'Void') THEN
      -- The canonical lifecycle call now holds the project row lock. Recompute
      -- after that lock is acquired so a concurrent approval cannot leave the
      -- project total based on a snapshot taken before it committed.
      PERFORM public.refresh_project_change_total(v_current.project_id);
    END IF;
  END IF;
  PERFORM set_config('steelbuild.co_rpc', coalesce(v_previous_co_rpc, ''), true);
  PERFORM set_config('steelbuild.cost_rpc', coalesce(v_previous_cost_rpc, ''), true);
  RETURN to_jsonb(v_saved);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_change_order_reviewed(uuid,timestamptz,text,numeric,jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_change_order_reviewed(uuid,timestamptz,text,numeric,jsonb) TO authenticated;
COMMENT ON FUNCTION public.save_change_order_reviewed(uuid,timestamptz,text,numeric,jsonb)
IS 'Save reviewed change-order edits and lifecycle effects atomically; rejects stale amount/status/version before writing.';
NOTIFY pgrst, 'reload schema';
COMMIT;
