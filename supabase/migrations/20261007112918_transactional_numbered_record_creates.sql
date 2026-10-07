-- CANDIDATE ONLY. Manual reviewed application and exact ledger stamp required.
-- Additive API: existing create_* signatures, numbering and sibling callers stay intact.
-- Receipt stores no plaintext payload/result. Soft-deleting a result never permits
-- recreating it with the same operation; project erasure cascades the receipt.
BEGIN;

CREATE TABLE public.numbered_create_receipts (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('change_orders','change_requests','deliveries','sov_items','backcharges')),
  client_op_id uuid NOT NULL,
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  record_id uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, kind, client_op_id)
);
ALTER TABLE public.numbered_create_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numbered_create_receipts FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY numbered_create_receipts_no_direct_access ON public.numbered_create_receipts
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
COMMENT ON TABLE public.numbered_create_receipts IS
  'Private transaction receipts for numbered creates. No raw payload or row snapshot; retained across soft deletion, removed with project erasure. Original actor may be anonymized.';

CREATE FUNCTION public.create_numbered_record(
  p_project_id uuid, p_kind text, p_client_op_id uuid, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s'
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_role text;
  v_allowed text[];
  v_hash bytea;
  v_receipt public.numbered_create_receipts%ROWTYPE;
  v_result jsonb;
  v_id uuid;
  v_notice date;
  v_link uuid;
  v_numeric record;
  v_item jsonb;
  v_co_flag text := current_setting('steelbuild.co_rpc', true);
  v_cost_flag text := current_setting('steelbuild.cost_rpc', true);
  v_delivery_flag text := current_setting('steelbuild.delivery_rpc', true);
  v_bc_flag text := current_setting('steelbuild.bc_rpc', true);
BEGIN
  IF v_user IS NULL OR p_project_id IS NULL OR p_client_op_id IS NULL
    OR p_kind IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Numbered create requires project, operation, kind and object payload' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_payload::text) > 1048576 THEN
    RAISE EXCEPTION 'Numbered create payload is too large' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(steelbuild_security.satisfies_mfa(),false) THEN
    RAISE EXCEPTION 'MFA_REQUIRED: Complete multi-factor authentication to continue' USING ERRCODE = '42501';
  END IF;
  CASE p_kind
    WHEN 'change_orders' THEN
      v_role := 'pm';
      v_allowed := ARRAY['title','description','reason_code','status','cost_code_id','co_amount','margin_percent','schedule_impact_days','source_rfi_id','sov_line_item_id','change_request_id','submitted_date','notes','metadata','attachments'];
    WHEN 'change_requests' THEN
      v_role := 'field';
      v_allowed := ARRAY['title','description','requested_by','request_date','reason','affected_areas','estimated_cost_impact','estimated_schedule_impact_days','priority','status','scope_impact','metadata'];
    WHEN 'deliveries' THEN
      v_role := 'field';
      v_allowed := ARRAY['delivery_title','description','vendor','po_number','carrier','tracking_number','scheduled_date','required_date','expected_ship_date','work_package_id','priority','status','delivery_type','load_number','load_category','area','sequence_number','notes','special_instructions','inspection_required','receiving_location','contact_name','contact_phone','metadata','items','actual_date','is_long_lead','lead_time_weeks','order_placed_date','procurement_category'];
    WHEN 'sov_items' THEN
      v_role := 'pm';
      v_allowed := ARRAY['description','scheduled_value','previous_percent_complete','current_percent_complete','retainage_percent','status','cost_code','cost_code_name','cost_code_id','work_package_id','sort_order','metadata','application_number','period_from','period_to','submitted_date','payment_received_date','change_order_id'];
    WHEN 'backcharges' THEN
      v_role := 'pm';
      v_allowed := ARRAY['title','description','responsible_party','responsible_party_type','reason_code','status','amount','incident_date','cost_code_id','linked_co_id','source_rfi_id','notes','metadata','notice_date','attachments'];
    ELSE
      RAISE EXCEPTION 'Unsupported numbered record kind' USING ERRCODE = '22023';
  END CASE;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Unsupported numbered create fields; identifiers and authority stamps are server controlled' USING ERRCODE = '22023';
  END IF;

  -- Keep permission checks inside this definer boundary, independent of stale
  -- explicit project-role rows. Membership and active project are mandatory.
  IF NOT EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_members m ON m.org_id=p.org_id
    WHERE p.id=p_project_id AND NOT coalesce(p.is_deleted,false) AND m.user_id=v_user)
    OR NOT coalesce(public.user_has_project_role_at_least(p_project_id,v_role),false) THEN
    RAISE EXCEPTION 'Not authorized to create this project record' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('numbered-create:' || p_project_id::text || ':' || p_kind || ':' || p_client_op_id::text, 0));
  -- Waiting on another request must not preserve authorization revoked meanwhile.
  IF NOT EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_members m ON m.org_id=p.org_id
    WHERE p.id=p_project_id AND NOT coalesce(p.is_deleted,false) AND m.user_id=v_user)
    OR NOT coalesce(public.user_has_project_role_at_least(p_project_id,v_role),false) THEN
    RAISE EXCEPTION 'Not authorized to create this project record' USING ERRCODE = '42501';
  END IF;
  v_hash := sha256(convert_to(p_payload::text,'UTF8'));
  SELECT * INTO v_receipt FROM public.numbered_create_receipts
    WHERE project_id=p_project_id AND kind=p_kind AND client_op_id=p_client_op_id FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'NUMBERED_CREATE_PAYLOAD_MISMATCH: this operation already created a different draft' USING ERRCODE = '22023';
    END IF;
    -- Return the current row rather than restoring a stale financial snapshot.
    EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id=$1 AND project_id=$2 AND NOT coalesce(is_deleted,false)',p_kind)
      INTO v_result USING v_receipt.record_id,p_project_id;
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'NUMBERED_CREATE_RESULT_UNAVAILABLE: the original record was archived or removed' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_result;
  END IF;

  IF p_payload ? 'metadata' AND jsonb_typeof(p_payload->'metadata') NOT IN ('object','null') THEN
    RAISE EXCEPTION 'metadata must be an object or null' USING ERRCODE = '22023';
  END IF;
  -- Nullable DTO metadata means no metadata. Keep the receipt hash of the
  -- original request while letting legacy RPCs apply their empty-object default.
  IF p_payload->'metadata' = 'null'::jsonb THEN p_payload := p_payload - 'metadata'; END IF;
  IF p_kind='backcharges' AND p_payload ? 'attachments' AND jsonb_typeof(p_payload->'attachments') NOT IN ('array','null') THEN
    RAISE EXCEPTION 'Backcharge attachments must be an array or null' USING ERRCODE = '22023';
  END IF;
  IF p_kind='change_orders' AND p_payload ? 'attachments' AND jsonb_typeof(p_payload->'attachments') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'Change-order attachment references must be text' USING ERRCODE = '22023';
  END IF;
  FOR v_numeric IN SELECT key,value FROM jsonb_each_text(p_payload)
    WHERE key=ANY(ARRAY['co_amount','margin_percent','schedule_impact_days','estimated_cost_impact','estimated_schedule_impact_days','lead_time_weeks','scheduled_value','previous_percent_complete','current_percent_complete','retainage_percent','sort_order','application_number','amount']) LOOP
    IF lower(btrim(v_numeric.value)) IN ('nan','infinity','+infinity','-infinity','inf','+inf','-inf') THEN
      RAISE EXCEPTION 'Numeric inputs must be finite' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  CASE p_kind
    WHEN 'change_orders' THEN
      IF coalesce(nullif(p_payload->>'status',''),'Draft') NOT IN ('Draft','Submitted') THEN
        RAISE EXCEPTION 'A new change order starts Draft or Submitted' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(r) INTO v_result FROM public.create_change_order(p_project_id,p_payload) r;
      v_id := (v_result->>'id')::uuid;
      IF p_payload ? 'attachments' THEN
        UPDATE public.change_orders SET attachments=p_payload->>'attachments' WHERE id=v_id RETURNING to_jsonb(change_orders) INTO v_result;
      END IF;
    WHEN 'change_requests' THEN
      IF coalesce(nullif(p_payload->>'status',''),'Submitted') <> 'Submitted' THEN
        RAISE EXCEPTION 'A new change request starts Submitted' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(r) INTO v_result FROM public.create_change_request(p_project_id,p_payload) r;
    WHEN 'deliveries' THEN
      IF coalesce(nullif(p_payload->>'status',''),'Scheduled') NOT IN ('Scheduled','In Transit','Partial','Rejected','Delayed','Identified','Quoted','PO Issued','Confirmed','In Production','Shipped','Cancelled') THEN
        RAISE EXCEPTION 'Receive deliveries through receive_delivery so linked steel lots advance' USING ERRCODE = '22023';
      END IF;
      IF p_payload ? 'items' AND jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Delivery items must be an array' USING ERRCODE = '22023';
      END IF;
      -- The legacy RPC trusts piece_id. This elevated wrapper must prove its scope.
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) x
        WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
        OR (nullif(x->>'piece_id','') IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.pieces p WHERE p.id=(x->>'piece_id')::uuid AND p.project_id=p_project_id AND NOT coalesce(p.is_deleted,false)))) THEN
        RAISE EXCEPTION 'Delivery pieces must belong to this project' USING ERRCODE = '23503';
      END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) LOOP
        IF lower(btrim(v_item->>'weight_lbs')) IN ('nan','infinity','+infinity','-infinity','inf','+inf','-inf')
          OR lower(btrim(v_item->>'length_inches')) IN ('nan','infinity','+infinity','-infinity','inf','+inf','-inf')
          OR coalesce(nullif(v_item->>'qty','')::integer,1)<1
          OR coalesce(nullif(v_item->>'weight_lbs','')::numeric,0)<0
          OR coalesce(nullif(v_item->>'length_inches','')::numeric,0)<0 THEN
          RAISE EXCEPTION 'Delivery quantities must be positive and dimensions and weights finite and nonnegative' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      IF coalesce(nullif(p_payload->>'lead_time_weeks','')::integer,0)<0 THEN
        RAISE EXCEPTION 'Lead time cannot be negative' USING ERRCODE = '23514';
      END IF;
      SELECT to_jsonb(r) INTO v_result FROM public.create_delivery(p_project_id,p_payload) r;
      v_id := (v_result->>'id')::uuid;
      UPDATE public.deliveries SET
        actual_date=CASE WHEN p_payload ? 'actual_date' THEN nullif(p_payload->>'actual_date','')::date ELSE actual_date END,
        is_long_lead=CASE WHEN p_payload ? 'is_long_lead' THEN (p_payload->>'is_long_lead')::boolean ELSE is_long_lead END,
        lead_time_weeks=CASE WHEN p_payload ? 'lead_time_weeks' THEN nullif(p_payload->>'lead_time_weeks','')::integer ELSE lead_time_weeks END,
        order_placed_date=CASE WHEN p_payload ? 'order_placed_date' THEN nullif(p_payload->>'order_placed_date','')::date ELSE order_placed_date END,
        procurement_category=CASE WHEN p_payload ? 'procurement_category' THEN nullif(p_payload->>'procurement_category','') ELSE procurement_category END
      WHERE id=v_id RETURNING to_jsonb(deliveries) INTO v_result;
    WHEN 'sov_items' THEN
      -- These are existing SOV register states, not CO/backcharge approvals.
      IF coalesce(nullif(p_payload->>'status',''),'Draft') NOT IN ('Draft','Submitted','Certified','Paid') THEN
        RAISE EXCEPTION 'Unsupported SOV register status' USING ERRCODE = '22023';
      END IF;
      v_link := nullif(p_payload->>'change_order_id','')::uuid;
      IF v_link IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.change_orders WHERE id=v_link AND project_id=p_project_id AND NOT coalesce(is_deleted,false)) THEN
        RAISE EXCEPTION 'Change order must belong to this project' USING ERRCODE = '23503';
      END IF;
      IF nullif(p_payload->>'period_from','')::date > nullif(p_payload->>'period_to','')::date THEN
        RAISE EXCEPTION 'SOV billing period ends before it starts' USING ERRCODE = '23514';
      END IF;
      IF nullif(p_payload->>'application_number','')::integer<1 THEN
        RAISE EXCEPTION 'SOV application number must be positive' USING ERRCODE = '23514';
      END IF;
      SELECT to_jsonb(r) INTO v_result FROM public.create_sov_item(p_project_id,p_payload) r;
      v_id := (v_result->>'id')::uuid;
      UPDATE public.sov_items SET application_number=nullif(p_payload->>'application_number','')::integer,
        period_from=nullif(p_payload->>'period_from','')::date, period_to=nullif(p_payload->>'period_to','')::date,
        submitted_date=nullif(p_payload->>'submitted_date','')::date, payment_received_date=nullif(p_payload->>'payment_received_date','')::date,
        change_order_id=v_link WHERE id=v_id RETURNING to_jsonb(sov_items) INTO v_result;
    WHEN 'backcharges' THEN
      IF coalesce(nullif(p_payload->>'status',''),'draft') <> 'draft' THEN
        RAISE EXCEPTION 'A new backcharge starts draft' USING ERRCODE = '22023';
      END IF;
      SELECT to_jsonb(r) INTO v_result FROM public.create_backcharge(p_project_id,p_payload) r;
      v_id := (v_result->>'id')::uuid;
      v_notice := nullif(p_payload->>'notice_date','')::date;
      PERFORM set_config('steelbuild.bc_rpc','on',true);
      UPDATE public.backcharges SET notice_date=v_notice,
        attachments=CASE WHEN p_payload ? 'attachments' THEN coalesce(nullif(p_payload->'attachments','null'::jsonb),'[]'::jsonb) ELSE attachments END
      WHERE id=v_id RETURNING to_jsonb(backcharges) INTO v_result;
      IF v_notice IS NOT NULL THEN
        PERFORM public.log_backcharge_event(v_id,'notice_sent',NULL,NULL,'Notice dated ' || v_notice::text);
      END IF;
  END CASE;
  v_id := (v_result->>'id')::uuid;
  IF v_id IS NULL OR (v_result->>'project_id')::uuid IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'Numbered create did not return its project record' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.numbered_create_receipts(project_id,kind,client_op_id,payload_hash,record_id,actor_user_id)
    VALUES(p_project_id,p_kind,p_client_op_id,v_hash,v_id,v_user);
  PERFORM set_config('steelbuild.co_rpc',coalesce(v_co_flag,''),true);
  PERFORM set_config('steelbuild.cost_rpc',coalesce(v_cost_flag,''),true);
  PERFORM set_config('steelbuild.delivery_rpc',coalesce(v_delivery_flag,''),true);
  PERFORM set_config('steelbuild.bc_rpc',coalesce(v_bc_flag,''),true);
  RETURN v_result;
EXCEPTION
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
    -- Native cast errors can echo the supplied value. Keep project content out
    -- of error messages/logging while preserving a useful validation category.
    RAISE EXCEPTION 'Invalid number, date or identifier in numbered create payload' USING ERRCODE = '22023';
END;
$function$;
REVOKE ALL ON FUNCTION public.create_numbered_record(uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_numbered_record(uuid,text,uuid,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
