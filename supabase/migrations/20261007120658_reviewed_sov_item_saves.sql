-- LOCAL CANDIDATE. Apply/stamp by hand only after reviewed release approval.
-- A stale SOV editor must not overwrite a later approved CO adjustment.
-- Existing SOV triggers, audit, constraints and sibling RPCs remain in force.
BEGIN;

CREATE FUNCTION public.save_sov_item_reviewed(
  p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_current public.sov_items%ROWTYPE;
  v_proposed public.sov_items%ROWTYPE;
  v_saved public.sov_items%ROWTYPE;
  v_field text;
  v_date date;
  v_number numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce(steelbuild_security.satisfies_mfa(),false) THEN
    RAISE EXCEPTION 'MFA_REQUIRED: Complete multi-factor authentication to continue' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR octet_length(p_patch::text)>1048576 THEN
    RAISE EXCEPTION 'SOV patch must be an object within the size limit' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE NOT k=ANY(ARRAY[
    'description','scheduled_value','previous_percent_complete','current_percent_complete',
    'retainage_percent','status','application_number','period_from','period_to',
    'submitted_date','payment_received_date','cost_code','cost_code_name','cost_code_id',
    'work_package_id','sort_order'
  ])) THEN
    RAISE EXCEPTION 'Unsupported or immutable SOV field' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current FROM public.sov_items WHERE id=p_id AND is_deleted=false FOR UPDATE;
  IF v_current.id IS NULL THEN RAISE EXCEPTION 'SOV line not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_members m ON m.org_id=p.org_id
    WHERE p.id=v_current.project_id AND NOT coalesce(p.is_deleted,false) AND m.user_id=(SELECT auth.uid()))
    OR NOT coalesce(public.user_has_project_access(v_current.project_id),false)
    OR NOT coalesce(public.user_has_project_role_at_least(v_current.project_id,'pm'),false) THEN
    RAISE EXCEPTION 'Not authorized to edit this project SOV' USING ERRCODE = '42501';
  END IF;
  IF v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'This SOV line changed after review. Reload its current value and completion before saving.' USING ERRCODE = '40001';
  END IF;

  FOR v_field IN SELECT unnest(ARRAY['description','status','cost_code','cost_code_name','cost_code_id','work_package_id']) LOOP
    IF p_patch ? v_field AND jsonb_typeof(p_patch->v_field) NOT IN ('string','null') THEN
      RAISE EXCEPTION 'SOV text and reference fields must be text or null' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR v_field IN SELECT unnest(ARRAY['cost_code_id','work_package_id','period_from','period_to','submitted_date','payment_received_date']) LOOP
    IF p_patch->>v_field='' THEN p_patch := jsonb_set(p_patch,ARRAY[v_field],'null'::jsonb); END IF;
  END LOOP;
  FOR v_field IN SELECT unnest(ARRAY['scheduled_value','previous_percent_complete','current_percent_complete','retainage_percent','application_number','sort_order']) LOOP
    IF p_patch ? v_field AND p_patch->>v_field IS NOT NULL THEN
      IF jsonb_typeof(p_patch->v_field) NOT IN ('number','string') THEN
        RAISE EXCEPTION 'SOV values must be finite numbers or null' USING ERRCODE = '22023';
      END IF;
      v_number := (p_patch->>v_field)::numeric;
      IF v_number::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'SOV values must be finite' USING ERRCODE = '22023';
      END IF;
      IF v_field=ANY(ARRAY['application_number','sort_order']) AND v_number<>trunc(v_number) THEN
        RAISE EXCEPTION 'SOV application and sort numbers must be whole numbers' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  FOR v_field IN SELECT unnest(ARRAY['period_from','period_to','submitted_date','payment_received_date']) LOOP
    IF p_patch ? v_field AND p_patch->>v_field IS NOT NULL THEN
      IF jsonb_typeof(p_patch->v_field)<>'string' OR p_patch->>v_field !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'SOV dates must be valid calendar dates' USING ERRCODE = '22023';
      END IF;
      v_date := (p_patch->>v_field)::date;
      IF to_char(v_date,'YYYY-MM-DD')<>p_patch->>v_field THEN
        RAISE EXCEPTION 'SOV dates must be valid calendar dates' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  v_proposed := jsonb_populate_record(v_current,p_patch);
  IF p_patch ? 'description' AND coalesce(btrim(v_proposed.description),'')='' THEN
    RAISE EXCEPTION 'An SOV description is required' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_proposed.scheduled_value,0)<0
    OR coalesce(v_proposed.previous_percent_complete,0) NOT BETWEEN 0 AND 100
    OR coalesce(v_proposed.current_percent_complete,0) NOT BETWEEN 0 AND 100
    OR coalesce(v_proposed.retainage_percent,0) NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'SOV values must be nonnegative and percentages between 0 and 100' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_proposed.current_percent_complete,0)<coalesce(v_proposed.previous_percent_complete,0) THEN
    RAISE EXCEPTION 'Current completion cannot be less than previous completion' USING ERRCODE = '23514';
  END IF;
  IF v_proposed.status IS NOT NULL AND v_proposed.status NOT IN ('Draft','Submitted','Certified','Paid') THEN
    RAISE EXCEPTION 'Unsupported SOV register status' USING ERRCODE = '23514';
  END IF;
  IF v_proposed.application_number<1 THEN RAISE EXCEPTION 'SOV application number must be positive' USING ERRCODE = '23514'; END IF;
  IF v_proposed.period_to<v_proposed.period_from OR v_proposed.payment_received_date<v_proposed.submitted_date THEN
    RAISE EXCEPTION 'SOV billing dates are out of order' USING ERRCODE = '23514';
  END IF;
  -- Unchanged historical references remain editable after archival. New links
  -- must resolve to a live row in this project; no CO provenance is writable.
  IF v_proposed.cost_code_id IS NOT NULL AND v_proposed.cost_code_id IS DISTINCT FROM v_current.cost_code_id THEN
    PERFORM 1 FROM public.cost_codes WHERE id=v_proposed.cost_code_id AND project_id=v_current.project_id AND is_deleted=false FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cost code must belong to this project' USING ERRCODE = '23503'; END IF;
  END IF;
  IF v_proposed.work_package_id IS NOT NULL AND v_proposed.work_package_id IS DISTINCT FROM v_current.work_package_id THEN
    PERFORM 1 FROM public.work_packages WHERE id=v_proposed.work_package_id AND project_id=v_current.project_id AND is_deleted=false FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work package must belong to this project' USING ERRCODE = '23503'; END IF;
  END IF;

  -- No trigger bypass or client timestamp. The existing update_updated_at()
  -- triggers also run on CO adjustments, so every competing write advances it.
  UPDATE public.sov_items SET
    description=v_proposed.description,scheduled_value=v_proposed.scheduled_value,
    previous_percent_complete=v_proposed.previous_percent_complete,current_percent_complete=v_proposed.current_percent_complete,
    retainage_percent=v_proposed.retainage_percent,status=v_proposed.status,application_number=v_proposed.application_number,
    period_from=v_proposed.period_from,period_to=v_proposed.period_to,submitted_date=v_proposed.submitted_date,
    payment_received_date=v_proposed.payment_received_date,cost_code=v_proposed.cost_code,cost_code_name=v_proposed.cost_code_name,
    cost_code_id=v_proposed.cost_code_id,work_package_id=v_proposed.work_package_id,sort_order=v_proposed.sort_order
  WHERE id=v_current.id RETURNING * INTO v_saved;
  IF v_saved.id IS NULL THEN RAISE EXCEPTION 'SOV line could not be saved' USING ERRCODE = '42501'; END IF;
  RETURN to_jsonb(v_saved);
EXCEPTION
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Invalid number, date or identifier in SOV patch' USING ERRCODE = '22023';
END;
$function$;
REVOKE ALL ON FUNCTION public.save_sov_item_reviewed(uuid,timestamptz,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_sov_item_reviewed(uuid,timestamptz,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
