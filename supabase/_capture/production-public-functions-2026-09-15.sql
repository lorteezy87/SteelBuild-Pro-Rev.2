-- ============================================================================
-- Production `public` functions that no migration defines
--
--   Captured     2026-09-15
--   Source       Supabase project kjrwqagyeswwoxpjkcko (PostgreSQL 17.6, us-east-1)
--   Method       pg_get_functiondef(oid), joined with E'\n\n' in ascending oid
--                order, pulled in 12 md5-verified batches
--   Contents     171 function definitions, 311550 characters
--   Body md5     287433bb530f5ff3c940d8547d826c4c
--
-- DO NOT RUN THIS FILE. It is a reference dump, not a migration.
--
-- It is ordered by oid (roughly creation order), which is usually but not
-- provably dependency order, and it has not been replayed against an empty
-- Postgres. Executing it against a database that lacks the referenced tables
-- will fail partway through. See supabase/_capture/README.md.
--
-- Why it exists
-- -------------
-- Of the 351 functions live in `public` (extension-owned functions excluded),
-- 180 are defined by a migration in supabase/migrations/ and 171 — the ones
-- below — are defined nowhere in this repository. 86 of the 171 are
-- SECURITY DEFINER; 65 are wired to a live trigger. Among them are the RFI
-- workflow (answer_rfi, close_rfi, create_rfi, enforce_rfi_guards), release-gate
-- helpers, the piece-control impl functions and ops_snapshot.
--
-- A `supabase db reset` therefore cannot reproduce production, and separately
-- fails outright: 20260911062832_pin_workflow_helper_search_paths.sql ALTERs
-- submittal_derived_stage and 20260914020000_revoke_internal_helper_execute_
-- from_authenticated.sql ALTERs erase_my_account, neither of which any
-- migration creates.
--
-- Verifying this file is intact
-- -----------------------------
--   sed -n '/^-- >>> BEGIN CAPTURED DEFINITIONS/,$p' "$0" | tail -n +2 | md5sum
--   # -> 287433bb530f5ff3c940d8547d826c4c
--
-- Checking whether production has since changed: see the query in
-- supabase/_capture/README.md (it covers all 351, not just these 171).
--
-- One oddity worth deleting rather than promoting: `_tmp_timeout_probe()` is a
-- leftover diagnostic that sleeps 3 seconds. It is captured here for
-- completeness because it is live, not because it should be kept.
-- ============================================================================

-- >>> BEGIN CAPTURED DEFINITIONS
CREATE OR REPLACE FUNCTION public.acknowledge_transmittal(p_transmittal_id uuid, p_by_name text, p_notes text DEFAULT NULL::text, p_at timestamp with time zone DEFAULT now())
 RETURNS drawing_transmittals
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_t public.drawing_transmittals%rowtype;
begin
  select * into v_t from public.drawing_transmittals where id = p_transmittal_id for update;
  if not found then raise exception 'Transmittal not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_t.project_id, 'pm') then raise exception 'Acknowledging transmittals requires PM or admin' using errcode = '42501'; end if;
  if v_t.status <> 'sent' then raise exception 'Only a sent transmittal can be acknowledged (% is %)', v_t.transmittal_number, v_t.status using errcode = '22023'; end if;
  if coalesce(btrim(p_by_name), '') = '' then raise exception 'Record who acknowledged receipt' using errcode = '23514'; end if;
  perform set_config('steelbuild.transmittal_rpc', '1', true);
  update public.drawing_transmittals set status = 'acknowledged', acknowledged_at = coalesce(p_at, now()), acknowledged_by_name = btrim(p_by_name), acknowledged_notes = nullif(p_notes, '')
   where id = p_transmittal_id returning * into v_t;
  perform set_config('steelbuild.transmittal_rpc', '', true);
  perform public.log_transmittal_event(v_t.project_id, p_transmittal_id, 'acknowledged', 'sent', 'acknowledged', p_notes, jsonb_build_object('by', btrim(p_by_name), 'at', v_t.acknowledged_at));
  return v_t;
end;
$function$


CREATE OR REPLACE FUNCTION public.action_item_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_from is null or p_from = p_to then true
    when p_from in ('Open', 'In Progress') then p_to in ('Open', 'In Progress', 'Complete', 'Resolved', 'Closed', 'Cancelled')
    when p_from in ('Complete', 'Resolved', 'Closed') then p_to in ('Open', 'In Progress')
    when p_from = 'Cancelled' then p_to = 'Open'
    else false
  end $function$


CREATE OR REPLACE FUNCTION public.actor_display_name()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v text;
begin
  select coalesce(nullif(btrim(up.full_name), ''), up.email) into v from public.user_profiles up where up.id = (select auth.uid());
  return coalesce(v, (select auth.jwt() ->> 'email'), 'system');
end $function$


CREATE OR REPLACE FUNCTION public.add_tm_ticket(p_backcharge_id uuid, p_payload jsonb)
 RETURNS backcharge_tm_tickets
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_bc public.backcharges%rowtype; v_n integer; v_row public.backcharge_tm_tickets;
begin
  select * into v_bc from public.backcharges where id = p_backcharge_id and is_deleted = false for update;
  if v_bc.id is null then raise exception 'Backcharge not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_bc.project_id, 'pm') then raise exception 'Not authorized to add tickets for this project' using errcode = '42501'; end if;
  if v_bc.status in ('approved', 'collected', 'void', 'rejected') then raise exception 'Backcharge is % — no more tickets', v_bc.status using errcode = '22023'; end if;
  select count(*) + 1 into v_n from public.backcharge_tm_tickets where backcharge_id = p_backcharge_id;
  perform set_config('steelbuild.bc_rpc', 'on', true);
  insert into public.backcharge_tm_tickets (backcharge_id, project_id, ticket_number, ticket_date, description, labor_hours, labor_rate, equipment_cost, material_cost, markup_percent, amount, signed_by, sort_order)
  values (p_backcharge_id, v_bc.project_id, 'T-' || v_n, coalesce(nullif(p_payload ->> 'ticket_date', '')::date, current_date), nullif(p_payload ->> 'description', ''),
          coalesce(nullif(p_payload ->> 'labor_hours', '')::numeric, 0), coalesce(nullif(p_payload ->> 'labor_rate', '')::numeric, 0), coalesce(nullif(p_payload ->> 'equipment_cost', '')::numeric, 0),
          coalesce(nullif(p_payload ->> 'material_cost', '')::numeric, 0), coalesce(nullif(p_payload ->> 'markup_percent', '')::numeric, 0), 0, nullif(p_payload ->> 'signed_by', ''), v_n)
  returning * into v_row;
  perform set_config('steelbuild.bc_rpc', 'off', true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.advance_piece_station_impl(p_project_id uuid, p_piece_id uuid, p_station_key text, p_override boolean DEFAULT false, p_override_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_piece "public"."pieces"%ROWTYPE;
  v_station "public"."piece_station_configurations"%ROWTYPE;
  v_missing_previous integer := 0;
  v_max_station_order integer;
  v_current_station_key text;
  v_current_station_order integer;
  v_lifecycle text;
  v_override_used boolean := false;
  v_existing_completion "public"."piece_station_completions"%ROWTYPE;
  v_completion "public"."piece_station_completions"%ROWTYPE;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to advance production stations in this project'
      USING errcode = '42501';
  END IF;

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  SELECT * INTO v_piece
  FROM "public"."pieces"
  WHERE "id" = p_piece_id
    AND "project_id" = p_project_id
  FOR UPDATE;

  IF v_piece.id IS NULL
     OR v_piece.is_deleted = true
     OR v_piece.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active piece lot not found';
  END IF;
  IF v_piece.is_container = true
     OR EXISTS (
       SELECT 1
       FROM "public"."pieces" AS child
       WHERE child."parent_piece_id" = v_piece.id
         AND child."is_deleted" = false
         AND child."deleted_at" IS NULL
     ) THEN
    RAISE EXCEPTION 'Production actions are allowed only on actionable leaf lots';
  END IF;
  IF v_piece.on_hold = true THEN
    RAISE EXCEPTION 'Piece lot is on hold and cannot advance';
  END IF;
  IF v_piece.lifecycle_status = ANY (ARRAY['shipped', 'delivered', 'erected']::text[]) THEN
    RAISE EXCEPTION 'A shipped, delivered, or erected lot cannot advance in production';
  END IF;
  IF v_piece.work_package_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM "public"."fab_releases"
       WHERE "work_package_id" = v_piece.work_package_id
         AND "project_id" = p_project_id
         AND "canonical_release" = true
         AND "status" = 'Released'
         AND "is_deleted" = false
     ) THEN
    RAISE EXCEPTION 'Work package must have an active canonical release before production can advance';
  END IF;

  SELECT * INTO v_station
  FROM "public"."piece_station_configurations"
  WHERE "project_id" = p_project_id
    AND "station_key" = lower(btrim(p_station_key))
    AND "is_active" = true;
  IF v_station.id IS NULL THEN
    RAISE EXCEPTION 'Active production station not found';
  END IF;

  SELECT * INTO v_existing_completion
  FROM "public"."piece_station_completions"
  WHERE "piece_id" = p_piece_id
    AND "station_configuration_id" = v_station.id;

  IF v_existing_completion.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'piece_id', p_piece_id,
      'station_key', v_station.station_key,
      'unchanged', true,
      'completed_at', v_existing_completion.completed_at,
      'is_override', v_existing_completion.is_override
    );
  END IF;

  SELECT count(*) INTO v_missing_previous
  FROM "public"."piece_station_configurations" AS prior_station
  WHERE prior_station."project_id" = p_project_id
    AND prior_station."is_active" = true
    AND prior_station."sort_order" < v_station.sort_order
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."piece_station_completions" AS prior_completion
      WHERE prior_completion."piece_id" = p_piece_id
        AND prior_completion."station_configuration_id" = prior_station.id
    );

  IF v_missing_previous > 0 AND NOT coalesce(p_override, false) THEN
    RAISE EXCEPTION 'Previous production stations must be completed before %', v_station.station_name;
  END IF;
  IF v_missing_previous > 0 AND nullif(btrim(p_override_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Out-of-sequence station advancement requires a non-empty override reason';
  END IF;
  v_override_used := v_missing_previous > 0;

  INSERT INTO "public"."piece_station_completions" (
    "project_id", "piece_id", "station_configuration_id", "station_key",
    "station_name", "sort_order", "earned_percent", "completed_by",
    "is_override", "override_reason", "metadata"
  ) VALUES (
    p_project_id,
    p_piece_id,
    v_station.id,
    v_station.station_key,
    v_station.station_name,
    v_station.sort_order,
    v_station.earned_percent,
    v_actor,
    v_override_used,
    CASE WHEN v_override_used THEN btrim(p_override_reason) ELSE NULL END,
    jsonb_build_object('missing_previous_station_count', v_missing_previous)
  )
  RETURNING * INTO v_completion;

  SELECT max("sort_order") INTO v_max_station_order
  FROM "public"."piece_station_configurations"
  WHERE "project_id" = p_project_id
    AND "is_active" = true;

  SELECT station."station_key", station."sort_order"
  INTO v_current_station_key, v_current_station_order
  FROM "public"."piece_station_completions" AS completion
  JOIN "public"."piece_station_configurations" AS station
    ON station."id" = completion."station_configuration_id"
  WHERE completion."piece_id" = p_piece_id
    AND station."is_active" = true
  ORDER BY station."sort_order" DESC
  LIMIT 1;

  v_lifecycle := CASE
    WHEN v_current_station_order = v_max_station_order THEN 'fabricated'
    ELSE 'in_fabrication'
  END;

  UPDATE "public"."pieces"
  SET "current_station" = v_current_station_key,
      "lifecycle_status" = v_lifecycle,
      "updated_at" = now()
  WHERE "id" = p_piece_id;

  INSERT INTO "public"."piece_events" (
    "project_id", "piece_id", "event_type", "previous_state", "next_state",
    "reason", "source_system", "created_by"
  ) VALUES (
    p_project_id,
    p_piece_id,
    CASE WHEN v_override_used THEN 'station_override' ELSE 'station_advanced' END,
    jsonb_build_object(
      'station', v_piece.current_station,
      'lifecycle_status', v_piece.lifecycle_status
    ),
    jsonb_build_object(
      'station', v_current_station_key,
      'completed_station', v_station.station_key,
      'lifecycle_status', v_lifecycle,
      'earned_percent', v_station.earned_percent,
      'is_override', v_override_used
    ),
    CASE
      WHEN v_override_used THEN btrim(p_override_reason)
      ELSE 'Completed canonical production station'
    END,
    'piece_control',
    v_actor
  );

  RETURN jsonb_build_object(
    'piece_id', p_piece_id,
    'station_key', v_station.station_key,
    'completion_id', v_completion.id,
    'completed_at', v_completion.completed_at,
    'is_override', v_override_used,
    'lifecycle_status', v_lifecycle,
    'earned_percent', v_station.earned_percent,
    'unchanged', false
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.answer_rfi(p_rfi_id uuid, p_answer text, p_answered_by text DEFAULT NULL::text, p_date_answered date DEFAULT CURRENT_DATE, p_release_holds boolean DEFAULT false, p_release_notes text DEFAULT NULL::text)
 RETURNS rfis
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_rfi public.rfis%rowtype; v_hold record; v_released integer := 0; v_name text;
begin
  select * into v_rfi from public.rfis where id = p_rfi_id for update;
  if not found then raise exception 'RFI not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_rfi.project_id, 'pm') then raise exception 'Answering an RFI requires PM or admin' using errcode = '42501'; end if;
  if v_rfi.status not in ('Open','Under Review','Incomplete Response','Answered') then raise exception '% is % and cannot be answered', v_rfi.rfi_number, v_rfi.status using errcode = '22023'; end if;
  if length(btrim(coalesce(p_answer, ''))) = 0 then raise exception 'Record the answer' using errcode = '23514'; end if;
  select coalesce(nullif(btrim(up.full_name), ''), up.email) into v_name from public.user_profiles up where up.id = (select auth.uid());
  if p_release_holds then
    for v_hold in
      select h.id from public.drawing_holds h
       where h.project_id = v_rfi.project_id and h.is_active = true
         and ((v_rfi.drawing_id is not null and h.drawing_id = v_rfi.drawing_id) or h.metadata->>'rfi_id' = v_rfi.id::text)
    loop
      perform public.release_drawing_hold(v_hold.id, coalesce(nullif(p_release_notes, ''), 'Released — ' || v_rfi.rfi_number || ' answered'));
      v_released := v_released + 1;
    end loop;
  end if;
  update public.rfis
     set answer = btrim(p_answer), response_text = btrim(p_answer), answered_by = coalesce(nullif(p_answered_by, ''), answered_by, v_name), answered_by_id = (select auth.uid()),
         date_answered = coalesce(p_date_answered, current_date), responded_date = coalesce(p_date_answered, current_date), status = 'Answered', ball_in_court = 'Contractor',
         holds_released_count = holds_released_count + v_released,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_answer', jsonb_build_object('at', now(), 'by', v_name, 'holds_released', v_released))
   where id = p_rfi_id returning * into v_rfi;
  return v_rfi;
end;
$function$


CREATE OR REPLACE FUNCTION public.apply_schedule_changes(p_project_id uuid, p_changes jsonb)
 RETURNS SETOF schedule_tasks
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_change jsonb; v_id uuid; v_ids uuid[] := '{}'::uuid[]; v_start date; v_end date;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then
    raise exception 'Only a project pm or above may move schedule dates' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'changes must be a non-empty array of {task_id, start_date, end_date}' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 2000 then raise exception 'Too many changes in one call' using errcode = '22023'; end if;
  for v_change in select value from jsonb_array_elements(p_changes) loop
    v_id := (v_change ->> 'task_id')::uuid;
    v_start := (v_change ->> 'start_date')::date;
    v_end := (v_change ->> 'end_date')::date;
    if v_id is null or v_start is null or v_end is null then raise exception 'Each change needs task_id, start_date and end_date' using errcode = '22023'; end if;
    if v_end < v_start then raise exception 'end_date before start_date for task %', v_id using errcode = '23514'; end if;
    update public.schedule_tasks set start_date = v_start, end_date = v_end
     where id = v_id and project_id = p_project_id and is_deleted = false;
    if not found then raise exception 'Task % is not a live task of this project', v_id using errcode = 'P0002'; end if;
    v_ids := array_append(v_ids, v_id);
  end loop;
  return query select * from public.schedule_tasks where id = any(v_ids) order by start_date, sort_order, task_name;
end $function$


CREATE OR REPLACE FUNCTION public.approve_change_order(p_id uuid, p_approved_by text, p_approved_date date DEFAULT CURRENT_DATE, p_sov_mode text DEFAULT 'new_line'::text, p_sov_line_item_id uuid DEFAULT NULL::uuid)
 RETURNS change_orders
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_co public.change_orders%rowtype; v_line public.sov_items%rowtype; v_seq integer; v_line_id uuid; v_line_no integer; v_applied boolean := false;
begin
  select * into v_co from public.change_orders where id = p_id and is_deleted = false for update;
  if v_co.id is null then raise exception 'Change order not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_co.project_id, 'pm') then raise exception 'Not authorized to approve change orders for this project' using errcode = '42501'; end if;
  if not public.change_order_transition_allowed(v_co.status, 'Approved') or v_co.status = 'Approved' then raise exception 'Change order cannot move from % to Approved', v_co.status using errcode = 'P0001'; end if;
  if coalesce(btrim(p_approved_by), '') = '' then raise exception 'approved_by is required' using errcode = '23514'; end if;
  if p_sov_mode not in ('new_line', 'adjust_line', 'none') then raise exception 'sov_mode must be new_line, adjust_line or none' using errcode = '22023'; end if;
  perform set_config('steelbuild.co_rpc', 'on', true);
  perform set_config('steelbuild.cost_rpc', 'on', true);
  if p_sov_mode = 'new_line' then
    if v_co.co_amount < 0 then raise exception 'A deduct cannot become a new SOV line — adjust an existing line instead' using errcode = '22023'; end if;
    v_seq := public.get_next_sequence_number(v_co.project_id, 'SOV');
    insert into public.sov_items (project_id, project_name, line_item_number, description, scheduled_value, previous_percent_complete, current_percent_complete, retainage_percent, status, cost_code, cost_code_name, cost_code_id, sort_order, change_order_id, metadata)
    select v_co.project_id, p.name, v_seq, v_co.co_number || ' · ' || v_co.title, v_co.co_amount, 0, 0, coalesce(p.retainage_percent, 10), 'Draft', c.cost_code_number, c.description, v_co.cost_code_id, v_seq, v_co.id,
           jsonb_build_object('source', 'change_order', 'change_order_id', v_co.id)
      from public.projects p left join public.cost_codes c on c.id = v_co.cost_code_id where p.id = v_co.project_id
    returning id, line_item_number into v_line_id, v_line_no;
    v_applied := true;
  elsif p_sov_mode = 'adjust_line' then
    v_line_id := coalesce(p_sov_line_item_id, v_co.sov_line_item_id);
    if v_line_id is null then raise exception 'adjust_line needs an SOV line' using errcode = '22023'; end if;
    select * into v_line from public.sov_items where id = v_line_id and project_id = v_co.project_id and is_deleted = false for update;
    if v_line.id is null then raise exception 'SOV line must be a live line of this project' using errcode = '23503'; end if;
    if coalesce(v_line.scheduled_value, 0) + v_co.co_amount < 0 then raise exception 'This deduct would take SOV line % below zero', v_line.line_item_number using errcode = '23514'; end if;
    update public.sov_items set scheduled_value = coalesce(scheduled_value, 0) + v_co.co_amount, change_order_id = coalesce(change_order_id, v_co.id) where id = v_line.id;
    v_line_no := v_line.line_item_number;
    v_applied := true;
  end if;
  update public.change_orders
     set status = 'Approved', approved_by = btrim(p_approved_by), approved_date = coalesce(p_approved_date, current_date), approved_at = now(),
         sov_mode = p_sov_mode, sov_applied_at = case when v_applied then now() else null end,
         sov_line_item_id = coalesce(v_line_id, sov_line_item_id), sov_line_number = coalesce(v_line_no, sov_line_number)
   where id = v_co.id returning * into v_co;
  perform public.refresh_project_change_total(v_co.project_id);
  perform set_config('steelbuild.co_rpc', 'off', true);
  perform set_config('steelbuild.cost_rpc', 'off', true);
  return v_co;
end $function$


CREATE OR REPLACE FUNCTION public.attach_revision_to_submittal_round(p_submittal_id uuid, p_drawing_id uuid, p_revision_id uuid)
 RETURNS submittal_rounds
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_sub public.submittals%rowtype; v_round public.submittal_rounds%rowtype; v_rev public.drawing_revisions%rowtype; v_sheet public.drawings%rowtype; v_entry jsonb; v_existing jsonb;
begin
  select * into v_sub from public.submittals where id = p_submittal_id for update;
  if not found then raise exception 'Submittal not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_sub.project_id, 'pm') then raise exception 'Attaching a revision to a submittal requires PM or admin' using errcode = '42501'; end if;
  if v_sub.status in ('Void', 'Released for Fabrication') then raise exception '% is % — open a new submittal instead', v_sub.submittal_number, v_sub.status using errcode = '22023'; end if;
  select * into v_sheet from public.drawings where id = p_drawing_id and project_id = v_sub.project_id and is_deleted = false;
  if not found then raise exception 'Sheet not found in this project' using errcode = 'P0002'; end if;
  select * into v_rev from public.drawing_revisions where id = p_revision_id and drawing_id = p_drawing_id;
  if not found then raise exception 'Revision not found for this sheet' using errcode = 'P0002'; end if;
  -- Target round: the current one, else the latest; a Draft submittal with no round yet only gets the set link + event.
  if v_sub.current_round_id is not null then
    select * into v_round from public.submittal_rounds where id = v_sub.current_round_id for update;
  end if;
  if v_round.id is null then
    select * into v_round from public.submittal_rounds where submittal_id = p_submittal_id and is_deleted = false order by round_number desc limit 1 for update;
  end if;
  v_entry := jsonb_build_object('drawing_id', p_drawing_id, 'revision_id', p_revision_id, 'revision_code', v_rev.revision_code, 'sheet_number', coalesce(v_rev.sheet_number, v_sheet.sheet_number), 'attached_at', now(), 'attached_by', (select auth.uid()));
  if v_round.id is not null then
    v_existing := coalesce(v_round.metadata->'attached_revisions', '[]'::jsonb);
    if not (v_existing @> jsonb_build_array(jsonb_build_object('revision_id', p_revision_id))) then
      update public.submittal_rounds
         set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{attached_revisions}', v_existing || v_entry),
             drawing_set_ids = case when v_sheet.drawing_set_id is not null and not (v_sheet.drawing_set_id = any(coalesce(drawing_set_ids, '{}'::uuid[]))) then array_append(coalesce(drawing_set_ids, '{}'::uuid[]), v_sheet.drawing_set_id) else drawing_set_ids end
       where id = v_round.id returning * into v_round;
    end if;
  end if;
  update public.submittals
     set drawing_set_ids = case when v_sheet.drawing_set_id is not null and not (v_sheet.drawing_set_id = any(coalesce(drawing_set_ids, '{}'::uuid[]))) then array_append(coalesce(drawing_set_ids, '{}'::uuid[]), v_sheet.drawing_set_id) else drawing_set_ids end
   where id = p_submittal_id;
  perform public.log_submittal_event(v_sub.project_id, p_submittal_id, 'file_uploaded', null, coalesce(v_sheet.sheet_number, 'sheet') || ' Rev ' || v_rev.revision_code, v_entry || jsonb_build_object('round_id', v_round.id, 'round_number', v_round.round_number));
  return v_round;
end;
$function$


CREATE OR REPLACE FUNCTION public.backcharge_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_to = 'void' then p_from in ('draft', 'notice_sent', 'pending', 'disputed')
    when p_from = 'draft' then p_to in ('notice_sent', 'pending')
    when p_from = 'notice_sent' then p_to in ('pending', 'disputed', 'approved', 'rejected')
    when p_from = 'pending' then p_to in ('approved', 'disputed', 'rejected')
    when p_from = 'disputed' then p_to in ('pending', 'approved', 'rejected')
    when p_from = 'approved' then p_to = 'collected'
    else false end;
$function$


CREATE OR REPLACE FUNCTION public.billing_plans_available()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'pro', coalesce((select nullif(stripe_price_pro, '') is not null from public.billing_config where scope = 'default'), false),
    'business', coalesce((select nullif(stripe_price_business, '') is not null from public.billing_config where scope = 'default'), false),
    'livemode', coalesce((select livemode from public.billing_config where scope = 'default'), true)
  );
$function$


CREATE OR REPLACE FUNCTION public.build_revision_impact_report(p_drawing_set_id uuid)
 RETURNS drawing_revision_summaries
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.drawing_sets; row public.drawing_revision_summaries; v_changed jsonb; v_high jsonb; v_sheets int; v_high_n int; v_max text; v_likely boolean; v_reason text;
        v_open_rfi int; v_wps jsonb; v_fab jsonb; v_fab_blocked boolean; v_level text; v_note text; v_ids uuid[];
        v_prev text := coalesce(current_setting('steelbuild.revcmp_rpc', true), '');
begin
  select * into s from public.drawing_sets where id = p_drawing_set_id and coalesce(is_deleted, false) = false;
  if not found then raise exception 'Drawing set not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(s.project_id, 'pm') then raise exception 'Impact reports need a project manager' using errcode = '42501'; end if;
  with sheets as (select d.id, d.sheet_number from public.drawings d where d.drawing_set_id = s.id and coalesce(d.is_deleted, false) = false),
  latest as (
    select distinct on (c.drawing_id) c.id as comparison_id, c.drawing_id, c.ai_summary
    from public.drawing_revision_comparisons c join sheets sh on sh.id = c.drawing_id
    where c.compare_status = 'complete' and not c.is_deleted order by c.drawing_id, coalesce(c.completed_at, c.created_at) desc),
  live as (
    select dl.*, sh.sheet_number as sheet_no from public.drawing_revision_deltas dl join latest l on l.comparison_id = dl.comparison_id join sheets sh on sh.id = l.drawing_id
    where not dl.is_deleted and not dl.dismissed),
  per_sheet as (
    select drawing_id, sheet_no, comparison_id, count(*) as delta_count,
           (array_agg(severity order by case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end))[1] as max_severity
    from live group by drawing_id, sheet_no, comparison_id)
  select coalesce(jsonb_agg(jsonb_build_object('drawingId', drawing_id, 'sheetNumber', sheet_no, 'comparisonId', comparison_id, 'deltaCount', delta_count, 'maxSeverity', max_severity) order by sheet_no), '[]'::jsonb),
         count(*), coalesce(array_agg(drawing_id), '{}')
    into v_changed, v_sheets, v_ids from per_sheet;
  select coalesce(jsonb_agg(jsonb_build_object('drawingId', dl.drawing_id, 'sheetNumber', dl.sheet_number, 'deltaId', dl.id, 'deltaType', dl.delta_type, 'severity', dl.severity, 'description', left(dl.description, 300)) order by case dl.severity when 'critical' then 0 else 1 end, dl.sheet_number), '[]'::jsonb), count(*)
    into v_high, v_high_n
    from public.drawing_revision_deltas dl
    where dl.comparison_id in (select c.id from public.drawing_revision_comparisons c where c.drawing_id = any(v_ids) and c.compare_status = 'complete' and not c.is_deleted
                                 and c.id in (select (jsonb_array_elements(v_changed) ->> 'comparisonId')::uuid))
      and not dl.is_deleted and not dl.dismissed and dl.severity in ('critical', 'high');
  select bool_or(dl.severity = 'critical' or dl.delta_type in ('connection_change', 'dimension_change', 'grid_shift', 'elevation_change', 'material_change', 'sheet_removed')),
         string_agg(distinct dl.delta_type, ', ')
    into v_likely, v_reason
    from public.drawing_revision_deltas dl
    where dl.comparison_id in (select (jsonb_array_elements(v_changed) ->> 'comparisonId')::uuid) and not dl.is_deleted and not dl.dismissed;
  v_likely := coalesce(v_likely, false);
  select count(*) into v_open_rfi from public.rfis r where coalesce(r.is_deleted, false) = false and r.status in ('Open', 'Under Review', 'Incomplete Response') and (r.drawing_set_id = s.id or r.drawing_id = any(v_ids));
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'wpNumber', w.wp_number, 'name', w.name) order by w.wp_number), '[]'::jsonb) into v_wps
    from public.work_packages w where w.project_id = s.project_id and coalesce(w.is_deleted, false) = false and (w.drawing_ids && v_ids or s.id = any(coalesce(w.drawing_set_ids, '{}')));
  begin v_fab := public.evaluate_fab_release_set(s.project_id, s.id); exception when others then v_fab := null; end;
  v_fab_blocked := coalesce(jsonb_array_length(v_fab -> 'blockers') > 0, false);
  v_max := coalesce((select max_severity from (select (e ->> 'maxSeverity') as max_severity from jsonb_array_elements(v_changed) e order by case e ->> 'maxSeverity' when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end limit 1) m), null);
  v_level := case when v_sheets = 0 then 'none' when v_max in ('critical', 'high') then 'high' when v_max = 'medium' then 'medium' else 'low' end;
  v_note := case v_level when 'none' then 'No material changes detected' when 'high' then v_high_n || ' high-risk change(s) across ' || v_sheets || ' sheet(s)' else v_sheets || ' sheet(s) changed, no high-risk findings' end;
  perform set_config('steelbuild.revcmp_rpc', 'on', true);
  insert into public.drawing_revision_summaries (project_id, drawing_set_id, set_name, sheets_changed, high_risk_count, likely_rfi, impact_level, summary, generated_at, generated_by)
    values (s.project_id, s.id, s.set_name, v_sheets, v_high_n, v_likely, v_level,
            jsonb_build_object('setId', s.id, 'setName', s.set_name, 'generatedAt', to_char(now(), 'YYYY-MM-DD'), 'sheetsChanged', v_sheets, 'changedSheets', v_changed,
                               'highRisk', v_high, 'highRiskCount', v_high_n, 'likelyRfi', jsonb_build_object('needed', v_likely, 'reason', coalesce(v_reason, ''), 'sheets', (select coalesce(jsonb_agg(e ->> 'sheetNumber'), '[]'::jsonb) from jsonb_array_elements(v_changed) e)),
                               'openRfiCount', v_open_rfi, 'affectedWorkPackages', v_wps, 'fabBlocked', v_fab_blocked, 'fabBlockers', coalesce(v_fab -> 'blockers', '[]'::jsonb), 'impact', jsonb_build_object('level', v_level, 'note', v_note)),
            now(), (select auth.uid()))
    returning * into row;
  perform set_config('steelbuild.revcmp_rpc', v_prev, true);
  return row;
end $function$


CREATE OR REPLACE FUNCTION public.change_order_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_to = 'Void' then p_from <> 'Void'
    when p_from = 'Draft' then p_to in ('Submitted', 'Approved')
    when p_from = 'Submitted' then p_to in ('Under Review', 'Approved', 'Rejected')
    when p_from = 'Under Review' then p_to in ('Approved', 'Rejected')
    when p_from = 'Rejected' then p_to in ('Under Review', 'Submitted')
    else false end;
$function$


CREATE OR REPLACE FUNCTION public.close_punchlist_item(p_item_id uuid, p_photo_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS punchlist_items
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_item public.punchlist_items%rowtype; v_photo public.photos%rowtype;
begin
  select * into v_item from public.punchlist_items where id = p_item_id and is_deleted = false for update;
  if v_item.id is null then raise exception 'Punch item not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_item.project_id, 'field') then raise exception 'Not authorized to close punch items for this project' using errcode = '42501'; end if;
  if v_item.status = 'Completed' then raise exception 'Punch item is already completed' using errcode = '22023'; end if;
  if p_photo_id is null then raise exception 'A closing photo is required' using errcode = '22023'; end if;
  select * into v_photo from public.photos where id = p_photo_id and is_deleted = false;
  if v_photo.id is null or v_photo.project_id <> v_item.project_id then raise exception 'Closing photo must be a live photo of this project' using errcode = '23503'; end if;
  if v_photo.punchlist_item_id is not null and v_photo.punchlist_item_id <> v_item.id then raise exception 'Photo is attached to another punch item' using errcode = '23503'; end if;
  update public.photos set punchlist_item_id = v_item.id where id = v_photo.id;
  update public.punchlist_items
     set status = 'Completed', percent_complete = 100, closing_photo_id = v_photo.id, closed_at = now(), closed_by = coalesce(auth.jwt() ->> 'email', auth.uid()::text),
         notes = case when coalesce(btrim(p_notes), '') = '' then notes else concat_ws(E'\n', nullif(notes, ''), 'Closed: ' || btrim(p_notes)) end
   where id = v_item.id returning * into v_item;
  return v_item;
end $function$


CREATE OR REPLACE FUNCTION public.close_rfi(p_rfi_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS rfis
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_rfi public.rfis%rowtype;
begin
  select * into v_rfi from public.rfis where id = p_rfi_id for update;
  if not found then raise exception 'RFI not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_rfi.project_id, 'pm') then raise exception 'Closing an RFI requires PM or admin' using errcode = '42501'; end if;
  if v_rfi.status <> 'Answered' then raise exception 'Only an answered RFI can be closed (% is %)', v_rfi.rfi_number, v_rfi.status using errcode = '22023'; end if;
  update public.rfis set status = 'Closed', closed_at = now(), closed_by = (select auth.uid()), ball_in_court = 'Closed',
         internal_notes = case when nullif(p_notes, '') is null then internal_notes else coalesce(internal_notes || E'\n', '') || p_notes end
   where id = p_rfi_id returning * into v_rfi;
  return v_rfi;
end;
$function$


CREATE OR REPLACE FUNCTION public.complete_project_closeout(p_project_id uuid, p_notes text DEFAULT NULL::text, p_override_reason text DEFAULT NULL::text)
 RETURNS project_closeout
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_row public.project_closeout; v_eval jsonb; v_blockers jsonb; v_reason text := nullif(btrim(coalesce(p_override_reason, '')), '');
        v_prev text := coalesce(current_setting('steelbuild.closeout_rpc', true), ''); v_name text;
begin
  v_row := public.ensure_project_closeout(p_project_id);
  if v_row.status = 'Complete' then raise exception 'Closeout is already complete' using errcode = '22023'; end if;
  v_eval := public.evaluate_project_closeout(p_project_id);
  v_blockers := v_eval -> 'blockers';
  if not (v_eval ->> 'ready')::boolean then
    if v_reason is null then
      raise exception 'CLOSEOUT_BLOCKED: %', (select string_agg(b, ', ') from jsonb_array_elements_text(v_blockers) b) using errcode = 'P0001';
    end if;
    if length(v_reason) < 12 then raise exception 'Override reason must be at least 12 characters' using errcode = '23514'; end if;
    if not public.user_has_project_role_at_least(p_project_id, 'admin') then raise exception 'Only a project admin may override a blocked closeout' using errcode = '42501'; end if;
  else
    v_reason := null;
  end if;
  select coalesce(nullif(btrim(up.full_name), ''), up.email) into v_name from public.user_profiles up where up.id = (select auth.uid());
  perform set_config('steelbuild.closeout_rpc', 'on', true);
  update public.project_closeout
     set status = 'Complete', closeout_date = coalesce(closeout_date, current_date), final_completion_date = coalesce(final_completion_date, current_date),
         punchlist_complete = (v_eval ->> 'punch_open')::int = 0,
         completed_by = v_name, completed_at = now(), override_reason = v_reason, override_by = case when v_reason is null then null else (select auth.uid()) end,
         blockers_at_completion = v_blockers, reopen_reason = null,
         notes = case when nullif(btrim(coalesce(p_notes, '')), '') is null then notes else concat_ws(E'\n', nullif(notes, ''), to_char(current_date, 'YYYY-MM-DD') || ' — ' || btrim(p_notes)) end
   where id = v_row.id returning * into v_row;
  perform set_config('steelbuild.closeout_rpc', v_prev, true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.compute_expense_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.unit_cost is not null and new.quantity is not null then new.amount := round(new.quantity * new.unit_cost, 2); end if;
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.compute_pay_application_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rate numeric;
begin
  select retainage_percent into v_rate from public.pay_applications where id = new.pay_application_id;
  new.total_completed_stored := round(coalesce(new.work_completed_previous, 0) + coalesce(new.work_completed_this_period, 0) + coalesce(new.materials_stored, 0), 2);
  new.percent_complete := case when coalesce(new.scheduled_value, 0) > 0 then round(new.total_completed_stored / new.scheduled_value * 100, 3) else 0 end;
  new.retainage := round(new.total_completed_stored * coalesce(v_rate, 0) / 100, 2);
  new.balance_to_finish := round(coalesce(new.scheduled_value, 0) - new.total_completed_stored, 2);
  new.updated_at := now();
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.compute_tm_ticket_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.amount := round((coalesce(new.labor_hours, 0) * coalesce(new.labor_rate, 0) + coalesce(new.equipment_cost, 0) + coalesce(new.material_cost, 0)) * (1 + coalesce(new.markup_percent, 0) / 100), 2);
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  if tg_op = 'UPDATE' and new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.convert_change_request(p_id uuid)
 RETURNS change_orders
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_cr public.change_requests%rowtype; v_co public.change_orders;
begin
  select * into v_cr from public.change_requests where id = p_id and is_deleted = false for update;
  if v_cr.id is null then raise exception 'Change request not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_cr.project_id, 'pm') then raise exception 'Not authorized to convert change requests for this project' using errcode = '42501'; end if;
  if v_cr.change_order_id is not null then raise exception 'Change request % already has a change order', v_cr.cr_number using errcode = '22023'; end if;
  v_co := public.create_change_order(v_cr.project_id, jsonb_build_object('title', v_cr.title, 'description', v_cr.description, 'reason_code', v_cr.reason, 'co_amount', coalesce(v_cr.estimated_cost_impact, 0),
                                                                      'schedule_impact_days', coalesce(v_cr.estimated_schedule_impact_days, 0), 'change_request_id', v_cr.id));
  update public.change_requests set status = 'Approved', change_order_id = v_co.id where id = v_cr.id;
  return v_co;
end $function$


CREATE OR REPLACE FUNCTION public.create_backcharge(p_project_id uuid, p_payload jsonb)
 RETURNS backcharges
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.backcharges; v_cc uuid; v_co uuid; v_rfi uuid;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Not authorized to raise backcharges for this project' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload ->> 'title'), '') = '' then raise exception 'title is required' using errcode = '23514'; end if;
  if coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0) < 0 then raise exception 'amount cannot be negative' using errcode = '23514'; end if;
  v_cc := nullif(p_payload ->> 'cost_code_id', '')::uuid;
  if v_cc is not null and not exists (select 1 from public.cost_codes where id = v_cc and project_id = p_project_id and is_deleted = false) then raise exception 'cost code must belong to this project' using errcode = '23503'; end if;
  v_co := nullif(p_payload ->> 'linked_co_id', '')::uuid;
  if v_co is not null and not exists (select 1 from public.change_orders where id = v_co and project_id = p_project_id and is_deleted = false) then raise exception 'change order must belong to this project' using errcode = '23503'; end if;
  v_rfi := nullif(p_payload ->> 'source_rfi_id', '')::uuid;
  if v_rfi is not null and not exists (select 1 from public.rfis where id = v_rfi and project_id = p_project_id) then raise exception 'RFI must belong to this project' using errcode = '23503'; end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'backcharge');
  perform set_config('steelbuild.bc_rpc', 'on', true);
  insert into public.backcharges (project_id, backcharge_number, title, description, responsible_party, responsible_party_type, reason_code, status, amount, incident_date, cost_code_id, linked_co_id, source_rfi_id, notes, metadata)
  values (p_project_id, 'BC-' || lpad(v_seq::text, 3, '0'), btrim(p_payload ->> 'title'), nullif(p_payload ->> 'description', ''), nullif(p_payload ->> 'responsible_party', ''),
          coalesce(nullif(p_payload ->> 'responsible_party_type', ''), 'subcontractor'), coalesce(nullif(p_payload ->> 'reason_code', ''), 'other'), 'draft', coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0),
          nullif(p_payload ->> 'incident_date', '')::date, v_cc, v_co, v_rfi, nullif(p_payload ->> 'notes', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb))
  returning * into v_row;
  perform public.log_backcharge_event(v_row.id, 'created', null, 'draft', v_row.backcharge_number || ' · ' || v_row.title);
  perform set_config('steelbuild.bc_rpc', 'off', true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.create_change_order(p_project_id uuid, p_payload jsonb)
 RETURNS change_orders
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.change_orders; v_cc uuid; v_line uuid; v_rfi uuid; v_cr uuid; v_status text;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Not authorized to raise change orders for this project' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload ->> 'title'), '') = '' then raise exception 'title is required' using errcode = '23514'; end if;
  if nullif(p_payload ->> 'co_amount', '') is null then raise exception 'co_amount is required (negative for a deduct)' using errcode = '23514'; end if;
  v_status := coalesce(nullif(p_payload ->> 'status', ''), 'Draft');
  if v_status not in ('Draft', 'Submitted') then raise exception 'A new change order starts as Draft or Submitted' using errcode = '22023'; end if;
  v_cc := nullif(p_payload ->> 'cost_code_id', '')::uuid;
  if v_cc is not null and not exists (select 1 from public.cost_codes where id = v_cc and project_id = p_project_id and is_deleted = false) then raise exception 'cost code must belong to this project' using errcode = '23503'; end if;
  v_line := nullif(p_payload ->> 'sov_line_item_id', '')::uuid;
  if v_line is not null and not exists (select 1 from public.sov_items where id = v_line and project_id = p_project_id and is_deleted = false) then raise exception 'SOV line must belong to this project' using errcode = '23503'; end if;
  v_rfi := nullif(p_payload ->> 'source_rfi_id', '')::uuid;
  if v_rfi is not null and not exists (select 1 from public.rfis where id = v_rfi and project_id = p_project_id) then raise exception 'RFI must belong to this project' using errcode = '23503'; end if;
  v_cr := nullif(p_payload ->> 'change_request_id', '')::uuid;
  if v_cr is not null and not exists (select 1 from public.change_requests where id = v_cr and project_id = p_project_id and is_deleted = false) then raise exception 'change request must belong to this project' using errcode = '23503'; end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'CO');
  perform set_config('steelbuild.co_rpc', 'on', true);
  insert into public.change_orders (project_id, project_name, co_number, title, description, reason_code, status, cost_code_id, co_amount, margin_percent, schedule_impact_days, source_rfi_id, sov_line_item_id,
                                    sov_line_number, change_request_id, submitted_date, submitted_by, notes, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'CO-' || lpad(v_seq::text, 3, '0'), btrim(p_payload ->> 'title'), nullif(p_payload ->> 'description', ''),
          nullif(p_payload ->> 'reason_code', ''), v_status, v_cc, (p_payload ->> 'co_amount')::numeric, coalesce(nullif(p_payload ->> 'margin_percent', '')::numeric, 0),
          coalesce(nullif(p_payload ->> 'schedule_impact_days', '')::int, 0), v_rfi, v_line, (select line_item_number from public.sov_items where id = v_line), v_cr,
          case when v_status = 'Submitted' then current_date else nullif(p_payload ->> 'submitted_date', '')::date end, case when v_status = 'Submitted' then coalesce(auth.jwt() ->> 'email', auth.uid()::text) end,
          nullif(p_payload ->> 'notes', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb))
  returning * into v_row;
  if v_cr is not null then update public.change_requests set change_order_id = v_row.id where id = v_cr and change_order_id is null; end if;
  perform set_config('steelbuild.co_rpc', 'off', true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.create_change_request(p_project_id uuid, p_payload jsonb)
 RETURNS change_requests
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.change_requests;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'field') then raise exception 'Not authorized to raise change requests for this project' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload ->> 'title'), '') = '' then raise exception 'title is required' using errcode = '23514'; end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'change_request');
  perform set_config('steelbuild.co_rpc', 'on', true);
  insert into public.change_requests (project_id, project_name, cr_number, title, description, requested_by, request_date, reason, affected_areas, estimated_cost_impact, estimated_schedule_impact_days, priority, status, scope_impact, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'CR-' || lpad(v_seq::text, 3, '0'), btrim(p_payload ->> 'title'), nullif(p_payload ->> 'description', ''),
          coalesce(nullif(p_payload ->> 'requested_by', ''), auth.jwt() ->> 'email'), coalesce(nullif(p_payload ->> 'request_date', '')::date, current_date), nullif(p_payload ->> 'reason', ''),
          nullif(p_payload ->> 'affected_areas', ''), nullif(p_payload ->> 'estimated_cost_impact', '')::numeric, nullif(p_payload ->> 'estimated_schedule_impact_days', '')::int,
          coalesce(nullif(p_payload ->> 'priority', ''), 'Medium'), coalesce(nullif(p_payload ->> 'status', ''), 'Submitted'), nullif(p_payload ->> 'scope_impact', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb))
  returning * into v_row;
  perform set_config('steelbuild.co_rpc', 'off', true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.create_delivery(p_project_id uuid, p_payload jsonb)
 RETURNS deliveries
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_seq integer; v_row public.deliveries; v_item jsonb; v_wp uuid; v_piece uuid; v_line integer := 0; v_pieces integer := 0; v_lbs numeric := 0;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'field') then raise exception 'Not authorized to log deliveries for this project' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload ->> 'delivery_title'), '') = '' then raise exception 'delivery_title is required' using errcode = '23514'; end if;
  v_wp := nullif(p_payload ->> 'work_package_id', '')::uuid;
  if v_wp is not null and not exists (select 1 from public.work_packages where id = v_wp and project_id = p_project_id and is_deleted = false) then
    raise exception 'work package must belong to this project' using errcode = '23503';
  end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'delivery');
  perform set_config('steelbuild.delivery_rpc', 'on', true);
  insert into public.deliveries (project_id, project_name, delivery_number, delivery_title, description, vendor, po_number, carrier, tracking_number, scheduled_date, required_date, expected_ship_date,
                                 work_package_id, priority, status, delivery_type, load_number, load_category, area, sequence_number, notes, special_instructions, inspection_required, receiving_location, contact_name, contact_phone, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'DEL-' || lpad(v_seq::text, 3, '0'), btrim(p_payload ->> 'delivery_title'), nullif(p_payload ->> 'description', ''),
          nullif(p_payload ->> 'vendor', ''), nullif(p_payload ->> 'po_number', ''), nullif(p_payload ->> 'carrier', ''), nullif(p_payload ->> 'tracking_number', ''),
          nullif(p_payload ->> 'scheduled_date', '')::date, nullif(p_payload ->> 'required_date', '')::date, nullif(p_payload ->> 'expected_ship_date', '')::date,
          v_wp, coalesce(nullif(p_payload ->> 'priority', ''), 'Normal'), coalesce(nullif(p_payload ->> 'status', ''), 'Scheduled'), nullif(p_payload ->> 'delivery_type', ''),
          nullif(p_payload ->> 'load_number', ''), nullif(p_payload ->> 'load_category', ''), nullif(p_payload ->> 'area', ''), nullif(p_payload ->> 'sequence_number', ''),
          nullif(p_payload ->> 'notes', ''), nullif(p_payload ->> 'special_instructions', ''), coalesce((p_payload ->> 'inspection_required')::boolean, false),
          nullif(p_payload ->> 'receiving_location', ''), nullif(p_payload ->> 'contact_name', ''), nullif(p_payload ->> 'contact_phone', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb))
  returning * into v_row;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb)) loop
    v_line := v_line + 1;
    v_piece := nullif(v_item ->> 'piece_id', '')::uuid;
    insert into public.delivery_items (delivery_id, line_no, qty, assembly_mark, sequence, profile, length_inches, grade, weight_lbs, notes, piece_id)
    values (v_row.id, v_line, greatest(1, coalesce((v_item ->> 'qty')::int, 1)), nullif(v_item ->> 'assembly_mark', ''), nullif(v_item ->> 'sequence', ''), nullif(v_item ->> 'profile', ''),
            nullif(v_item ->> 'length_inches', '')::numeric, nullif(v_item ->> 'grade', ''), nullif(v_item ->> 'weight_lbs', '')::numeric, nullif(v_item ->> 'notes', ''), v_piece);
    v_pieces := v_pieces + greatest(1, coalesce((v_item ->> 'qty')::int, 1));
    v_lbs := v_lbs + coalesce(nullif(v_item ->> 'weight_lbs', '')::numeric, 0);
  end loop;
  if v_line > 0 then
    update public.deliveries set pieces = coalesce(pieces, v_pieces), weight_tons = coalesce(weight_tons, round(v_lbs / 2000.0, 2)) where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.create_expense(p_project_id uuid, p_payload jsonb)
 RETURNS expenses
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.expenses; v_cc public.cost_codes%rowtype; v_wp uuid; v_line uuid; v_vendor public.vendors%rowtype; v_status text;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'field') then raise exception 'Not authorized to log expenses for this project' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload ->> 'description'), '') = '' then raise exception 'description is required' using errcode = '23514'; end if;
  if coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0) < 0 then raise exception 'amount cannot be negative' using errcode = '23514'; end if;
  v_status := coalesce(nullif(p_payload ->> 'payment_status', ''), 'Pending');
  if v_status not in ('Pending', 'Submitted') then raise exception 'A new expense starts Pending or Submitted' using errcode = '22023'; end if;
  if nullif(p_payload ->> 'cost_code_id', '') is not null then
    select * into v_cc from public.cost_codes where id = (p_payload ->> 'cost_code_id')::uuid and project_id = p_project_id and is_deleted = false;
    if v_cc.id is null then raise exception 'cost code must belong to this project' using errcode = '23503'; end if;
  end if;
  v_wp := nullif(p_payload ->> 'work_package_id', '')::uuid;
  if v_wp is not null and not exists (select 1 from public.work_packages where id = v_wp and project_id = p_project_id and is_deleted = false) then raise exception 'work package must belong to this project' using errcode = '23503'; end if;
  v_line := nullif(p_payload ->> 'sov_line_item_id', '')::uuid;
  if v_line is not null and not exists (select 1 from public.sov_items where id = v_line and project_id = p_project_id and is_deleted = false) then raise exception 'SOV line must belong to this project' using errcode = '23503'; end if;
  if nullif(p_payload ->> 'vendor_id', '') is not null then
    select * into v_vendor from public.vendors where id = (p_payload ->> 'vendor_id')::uuid and is_deleted = false and org_id = (select org_id from public.projects where id = p_project_id);
    if v_vendor.id is null then raise exception 'vendor must belong to this organization' using errcode = '23503'; end if;
  end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'EXPENSE');
  perform set_config('steelbuild.expense_rpc', 'on', true);
  insert into public.expenses (project_id, project_name, expense_number, description, expense_type, cost_code, cost_code_name, cost_code_id, amount, quantity, unit_cost, unit, vendor, vendor_id, invoice_number, invoice_date,
                               payment_status, work_package_id, sov_line_item_id, expense_date, submitted_by, submitted_date, notes, receipt_path, tags, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'EXP-' || lpad(v_seq::text, 3, '0'), btrim(p_payload ->> 'description'), coalesce(nullif(p_payload ->> 'expense_type', ''), v_cc.category, 'Misc.'),
          coalesce(nullif(p_payload ->> 'cost_code', ''), v_cc.cost_code_number), coalesce(nullif(p_payload ->> 'cost_code_name', ''), v_cc.description), v_cc.id,
          coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0), nullif(p_payload ->> 'quantity', '')::numeric, nullif(p_payload ->> 'unit_cost', '')::numeric, coalesce(nullif(p_payload ->> 'unit', ''), 'EA'),
          coalesce(nullif(p_payload ->> 'vendor', ''), v_vendor.company_name), v_vendor.id, nullif(p_payload ->> 'invoice_number', ''), nullif(p_payload ->> 'invoice_date', '')::date,
          v_status, v_wp, v_line, coalesce(nullif(p_payload ->> 'expense_date', '')::date, current_date), coalesce(auth.jwt() ->> 'email', auth.uid()::text),
          case when v_status = 'Submitted' then current_date end, nullif(p_payload ->> 'notes', ''), nullif(p_payload ->> 'receipt_path', ''), nullif(p_payload ->> 'tags', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb))
  returning * into v_row;
  perform set_config('steelbuild.expense_rpc', 'off', true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.create_inspection(p_project_id uuid, p_payload jsonb)
 RETURNS inspections
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.inspections; v_wp uuid; v_drawing uuid;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'field') then raise exception 'Not authorized to log inspections for this project' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload ->> 'inspection_type'), '') = '' then raise exception 'inspection_type is required' using errcode = '23514'; end if;
  v_wp := nullif(p_payload ->> 'work_package_id', '')::uuid;
  if v_wp is not null and not exists (select 1 from public.work_packages where id = v_wp and project_id = p_project_id and is_deleted = false) then raise exception 'work package must belong to this project' using errcode = '23503'; end if;
  v_drawing := nullif(p_payload ->> 'drawing_id', '')::uuid;
  if v_drawing is not null and not exists (select 1 from public.drawings where id = v_drawing and project_id = p_project_id and is_deleted = false) then raise exception 'drawing must belong to this project' using errcode = '23503'; end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'inspection');
  perform set_config('steelbuild.quality_rpc', 'on', true);
  insert into public.inspections (project_id, project_name, inspection_number, inspection_type, inspection_date, location, inspector_name, inspector_role, description, status, findings, deficiencies_count,
                                  corrective_actions, sign_off_status, notes, phase, work_package_id, drawing_id, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'INSP-' || lpad(v_seq::text, 3, '0'), btrim(p_payload ->> 'inspection_type'), coalesce(nullif(p_payload ->> 'inspection_date', '')::date, current_date),
          nullif(p_payload ->> 'location', ''), nullif(p_payload ->> 'inspector_name', ''), nullif(p_payload ->> 'inspector_role', ''), nullif(p_payload ->> 'description', ''),
          coalesce(nullif(p_payload ->> 'status', ''), 'Scheduled'), nullif(p_payload ->> 'findings', ''), coalesce(nullif(p_payload ->> 'deficiencies_count', '')::int, 0),
          nullif(p_payload ->> 'corrective_actions', ''), coalesce(nullif(p_payload ->> 'sign_off_status', ''), 'Pending'), nullif(p_payload ->> 'notes', ''), nullif(p_payload ->> 'phase', ''),
          v_wp, v_drawing, coalesce(p_payload -> 'metadata', '{}'::jsonb))
  returning * into v_row;
  perform set_config('steelbuild.quality_rpc', 'off', true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.create_qc_record(p_project_id uuid, p_payload jsonb)
 RETURNS quality_control_records
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.quality_control_records; v_wp uuid; v_insp uuid; v_piece uuid;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'field') then raise exception 'Not authorized to log QC records for this project' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload ->> 'test_type'), '') = '' then raise exception 'test_type is required' using errcode = '23514'; end if;
  v_wp := nullif(p_payload ->> 'work_package_id', '')::uuid;
  if v_wp is not null and not exists (select 1 from public.work_packages where id = v_wp and project_id = p_project_id and is_deleted = false) then raise exception 'work package must belong to this project' using errcode = '23503'; end if;
  v_insp := nullif(p_payload ->> 'inspection_id', '')::uuid;
  if v_insp is not null and not exists (select 1 from public.inspections where id = v_insp and project_id = p_project_id and is_deleted = false) then raise exception 'inspection must belong to this project' using errcode = '23503'; end if;
  v_piece := nullif(p_payload ->> 'piece_id', '')::uuid;
  if v_piece is not null and not exists (select 1 from public.pieces where id = v_piece and project_id = p_project_id) then raise exception 'piece must belong to this project' using errcode = '23503'; end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'qc_record');
  perform set_config('steelbuild.quality_rpc', 'on', true);
  insert into public.quality_control_records (project_id, project_name, record_number, test_type, test_date, material_or_component, location, test_lab_or_inspector, specification, result, test_value,
                                              acceptance_criteria, quantity_tested, quantity_passed, notes, status, inspection_id, work_package_id, piece_id, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'QC-' || lpad(v_seq::text, 3, '0'), btrim(p_payload ->> 'test_type'), coalesce(nullif(p_payload ->> 'test_date', '')::date, current_date),
          nullif(p_payload ->> 'material_or_component', ''), nullif(p_payload ->> 'location', ''), nullif(p_payload ->> 'test_lab_or_inspector', ''), nullif(p_payload ->> 'specification', ''),
          coalesce(nullif(p_payload ->> 'result', ''), 'Pending'), nullif(p_payload ->> 'test_value', ''), nullif(p_payload ->> 'acceptance_criteria', ''),
          nullif(p_payload ->> 'quantity_tested', '')::int, nullif(p_payload ->> 'quantity_passed', '')::int, nullif(p_payload ->> 'notes', ''), coalesce(nullif(p_payload ->> 'status', ''), 'Pending'),
          v_insp, v_wp, v_piece, coalesce(p_payload -> 'metadata', '{}'::jsonb))
  returning * into v_row;
  perform set_config('steelbuild.quality_rpc', 'off', true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.create_revision_comparison(p_drawing_id uuid, p_from_revision_id uuid, p_to_revision_id uuid)
 RETURNS drawing_revision_comparisons
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.drawings; f public.drawing_revisions; t public.drawing_revisions; row public.drawing_revision_comparisons;
        v_prev text := coalesce(current_setting('steelbuild.revcmp_rpc', true), '');
begin
  select * into d from public.drawings where id = p_drawing_id and coalesce(is_deleted, false) = false;
  if not found then raise exception 'Sheet not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(d.project_id, 'pm') then raise exception 'Revision analysis needs a project manager' using errcode = '42501'; end if;
  select * into f from public.drawing_revisions where id = p_from_revision_id and drawing_id = p_drawing_id;
  select * into t from public.drawing_revisions where id = p_to_revision_id and drawing_id = p_drawing_id;
  if f.id is null or t.id is null then raise exception 'Both revisions must belong to the sheet' using errcode = '22023'; end if;
  if f.id = t.id then raise exception 'Pick two different revisions' using errcode = '22023'; end if;
  if f.version_number > t.version_number then raise exception 'The FROM revision must be older than the TO revision' using errcode = '22023'; end if;
  perform set_config('steelbuild.revcmp_rpc', 'on', true);
  insert into public.drawing_revision_comparisons (project_id, drawing_id, from_revision_id, to_revision_id, source, compare_status, requested_by, metadata)
    values (d.project_id, d.id, f.id, t.id, 'revision', 'processing', public.actor_display_name(),
            jsonb_build_object('sheet_number', d.sheet_number, 'from_code', f.revision_code, 'to_code', t.revision_code, 'from_version', f.version_number, 'to_version', t.version_number))
    returning * into row;
  perform set_config('steelbuild.revcmp_rpc', v_prev, true);
  return row;
end $function$


CREATE OR REPLACE FUNCTION public.create_rfi(p_project_id uuid, p_payload jsonb)
 RETURNS rfis
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.rfis%rowtype; v_name text; v_drawing uuid; v_gc uuid; v_set uuid; v_ref text;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'field') then raise exception 'Raising an RFI requires field access or above' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload->>'title'), '') = '' then raise exception 'An RFI needs a title' using errcode = '23514'; end if;
  if coalesce(btrim(p_payload->>'question'), '') = '' then raise exception 'State the question' using errcode = '23514'; end if;
  v_drawing := nullif(p_payload->>'drawing_id', '')::uuid;
  v_gc := nullif(p_payload->>'gc_drawing_id', '')::uuid;
  v_set := nullif(p_payload->>'drawing_set_id', '')::uuid;
  if v_drawing is not null then
    select d.drawing_set_id, d.sheet_number into v_set, v_ref from public.drawings d where d.id = v_drawing and d.project_id = p_project_id and d.is_deleted = false;
    if not found then raise exception 'Sheet not found in this project' using errcode = 'P0002'; end if;
  end if;
  if v_gc is not null then
    select g.drawing_number into v_ref from public.gc_drawings g where g.id = v_gc and g.project_id = p_project_id and g.is_deleted = false;
    if not found then raise exception 'GC drawing not found in this project' using errcode = 'P0002'; end if;
  end if;
  if v_set is not null and not exists (select 1 from public.drawing_sets s where s.id = v_set and s.project_id = p_project_id) then
    raise exception 'Drawing set not found in this project' using errcode = 'P0002';
  end if;
  select coalesce(nullif(btrim(up.full_name), ''), up.email) into v_name from public.user_profiles up where up.id = (select auth.uid());
  v_seq := public.get_next_sequence_number(p_project_id, 'RFI');
  insert into public.rfis (project_id, project_name, rfi_number, title, description, question, drawing_reference, spec_section, priority, status, submitted_by, submitted_date, date_required,
                           assigned_to, ball_in_court, cost_impact, cost_impact_amount, schedule_impact, schedule_impact_days, distribution_list, discipline, drawing_set_id, drawing_id, gc_drawing_id, created_by, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'RFI-' || lpad(v_seq::text, 3, '0'), btrim(p_payload->>'title'), nullif(p_payload->>'description', ''), btrim(p_payload->>'question'),
          coalesce(nullif(p_payload->>'drawing_reference', ''), v_ref), nullif(p_payload->>'spec_section', ''), coalesce(nullif(p_payload->>'priority', ''), 'Medium'), 'Open',
          coalesce(nullif(p_payload->>'submitted_by', ''), v_name), coalesce(nullif(p_payload->>'submitted_date', '')::date, current_date), nullif(p_payload->>'date_required', '')::date,
          nullif(p_payload->>'assigned_to', ''), coalesce(nullif(p_payload->>'ball_in_court', ''), 'Contractor'),
          coalesce((p_payload->>'cost_impact')::boolean, false), nullif(p_payload->>'cost_impact_amount', '')::numeric, coalesce((p_payload->>'schedule_impact')::boolean, false), nullif(p_payload->>'schedule_impact_days', '')::integer,
          nullif(p_payload->>'distribution_list', ''), coalesce(nullif(p_payload->>'discipline', ''), 'Structural'), v_set, v_drawing, v_gc, (select auth.uid()), coalesce(p_payload->'metadata', '{}'::jsonb))
  returning * into v_row;
  return v_row;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_rfi_from_delta(p_delta_id uuid, p_payload jsonb)
 RETURNS rfis
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare dl public.drawing_revision_deltas; r public.rfis; v_payload jsonb; v_prev text := coalesce(current_setting('steelbuild.revcmp_rpc', true), '');
begin
  select * into dl from public.drawing_revision_deltas where id = p_delta_id and not is_deleted;
  if not found then raise exception 'Delta not found' using errcode = 'P0002'; end if;
  if dl.linked_rfi_id is not null then raise exception 'This delta already has an RFI' using errcode = '22023'; end if;
  v_payload := coalesce(p_payload, '{}'::jsonb);
  if v_payload ->> 'drawing_id' is null and dl.drawing_id is not null then v_payload := v_payload || jsonb_build_object('drawing_id', dl.drawing_id); end if;
  r := public.create_rfi(dl.project_id, v_payload);
  perform set_config('steelbuild.revcmp_rpc', 'on', true);
  update public.drawing_revision_deltas set linked_rfi_id = r.id where id = dl.id;
  perform set_config('steelbuild.revcmp_rpc', v_prev, true);
  return r;
end $function$


CREATE OR REPLACE FUNCTION public.create_safety_incident(p_project_id uuid, p_payload jsonb)
 RETURNS safety_incidents
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.safety_incidents;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'field') then raise exception 'Not authorized to report incidents for this project' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload ->> 'description'), '') = '' then raise exception 'description is required' using errcode = '23514'; end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'safety_incident');
  perform set_config('steelbuild.quality_rpc', 'on', true);
  insert into public.safety_incidents (project_id, project_name, incident_number, incident_type, severity, incident_date, incident_time, location, reported_by, description, injuries, root_cause,
                                       corrective_actions, responsible_party, action_due_date, status, investigation_completed, safety_trained, witnesses, notes, phase, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'SI-' || lpad(v_seq::text, 3, '0'), nullif(p_payload ->> 'incident_type', ''), coalesce(nullif(p_payload ->> 'severity', ''), 'Medium'),
          coalesce(nullif(p_payload ->> 'incident_date', '')::date, current_date), nullif(p_payload ->> 'incident_time', '')::time, nullif(p_payload ->> 'location', ''), nullif(p_payload ->> 'reported_by', ''),
          btrim(p_payload ->> 'description'), nullif(p_payload ->> 'injuries', ''), nullif(p_payload ->> 'root_cause', ''), nullif(p_payload ->> 'corrective_actions', ''), nullif(p_payload ->> 'responsible_party', ''),
          nullif(p_payload ->> 'action_due_date', '')::date, coalesce(nullif(p_payload ->> 'status', ''), 'Open'), coalesce((p_payload ->> 'investigation_completed')::boolean, false),
          coalesce((p_payload ->> 'safety_trained')::boolean, false), nullif(p_payload ->> 'witnesses', ''), nullif(p_payload ->> 'notes', ''), nullif(p_payload ->> 'phase', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb))
  returning * into v_row;
  perform set_config('steelbuild.quality_rpc', 'off', true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.create_sov_item(p_project_id uuid, p_payload jsonb)
 RETURNS sov_items
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.sov_items; v_cc public.cost_codes%rowtype; v_wp uuid; v_ret numeric;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Not authorized to edit the schedule of values for this project' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload ->> 'description'), '') = '' then raise exception 'description is required' using errcode = '23514'; end if;
  if coalesce(nullif(p_payload ->> 'scheduled_value', '')::numeric, 0) < 0 then raise exception 'scheduled_value cannot be negative' using errcode = '23514'; end if;
  if nullif(p_payload ->> 'cost_code_id', '') is not null then
    select * into v_cc from public.cost_codes where id = (p_payload ->> 'cost_code_id')::uuid and project_id = p_project_id and is_deleted = false;
    if v_cc.id is null then raise exception 'cost code must belong to this project' using errcode = '23503'; end if;
  end if;
  v_wp := nullif(p_payload ->> 'work_package_id', '')::uuid;
  if v_wp is not null and not exists (select 1 from public.work_packages where id = v_wp and project_id = p_project_id and is_deleted = false) then raise exception 'work package must belong to this project' using errcode = '23503'; end if;
  v_ret := coalesce(nullif(p_payload ->> 'retainage_percent', '')::numeric, (select retainage_percent from public.projects where id = p_project_id), 10);
  v_seq := public.get_next_sequence_number(p_project_id, 'SOV');
  perform set_config('steelbuild.cost_rpc', 'on', true);
  insert into public.sov_items (project_id, project_name, line_item_number, description, scheduled_value, previous_percent_complete, current_percent_complete, retainage_percent, status, cost_code, cost_code_name, cost_code_id, work_package_id, sort_order, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), v_seq, btrim(p_payload ->> 'description'), coalesce(nullif(p_payload ->> 'scheduled_value', '')::numeric, 0),
          coalesce(nullif(p_payload ->> 'previous_percent_complete', '')::numeric, 0), coalesce(nullif(p_payload ->> 'current_percent_complete', '')::numeric, 0), v_ret,
          coalesce(nullif(p_payload ->> 'status', ''), 'Draft'), coalesce(nullif(p_payload ->> 'cost_code', ''), v_cc.cost_code_number), coalesce(nullif(p_payload ->> 'cost_code_name', ''), v_cc.description),
          v_cc.id, v_wp, coalesce(nullif(p_payload ->> 'sort_order', '')::int, v_seq), coalesce(p_payload -> 'metadata', '{}'::jsonb))
  returning * into v_row;
  perform set_config('steelbuild.cost_rpc', 'off', true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.create_submittal(p_project_id uuid, p_payload jsonb)
 RETURNS submittals
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.submittals%rowtype; v_sets uuid[];
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then
    raise exception 'Creating submittals requires PM or admin' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payload->>'title'), '') = '' then raise exception 'A submittal needs a title' using errcode = '23514'; end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'submittal');
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_sets from jsonb_array_elements_text(coalesce(p_payload->'drawing_set_ids', '[]'::jsonb)) x;
  insert into public.submittals (project_id, project_name, submittal_number, title, spec_section, submittal_type, discipline, revision, round_number, total_rounds,
                                 required_date, status, ball_in_court, submitted_by, reviewer, drawing_set_ids, notes, received_from, distributed_to, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'SUB-' || lpad(v_seq::text, 3, '0'), btrim(p_payload->>'title'),
          nullif(btrim(p_payload->>'spec_section'), ''), coalesce(nullif(p_payload->>'submittal_type', ''), 'Shop Drawing'), coalesce(nullif(p_payload->>'discipline', ''), 'Structural'),
          nullif(p_payload->>'revision', ''), 0, 0, nullif(p_payload->>'required_date', '')::date, 'Draft', coalesce(nullif(p_payload->>'ball_in_court', ''), 'Detailer'),
          nullif(p_payload->>'submitted_by', ''), nullif(p_payload->>'reviewer', ''), v_sets, nullif(p_payload->>'notes', ''), nullif(p_payload->>'received_from', ''), nullif(p_payload->>'distributed_to', ''),
          jsonb_build_object('ofs_checklist', jsonb_build_object('markups_incorporated', false, 'comments_addressed', false, 'sheets_ready', false, 'authorized_to_issue', false)))
  returning * into v_row;
  return v_row;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_transmittal(p_project_id uuid, p_payload jsonb)
 RETURNS drawing_transmittals
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.drawing_transmittals%rowtype; v_refs jsonb; v_sets uuid[]; v_round public.submittal_rounds%rowtype; v_sub public.submittals%rowtype;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Creating transmittals requires PM or admin' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload->>'subject'), '') = '' then raise exception 'A transmittal needs a subject' using errcode = '23514'; end if;
  if nullif(p_payload->>'submittal_round_id', '') is not null then
    select * into v_round from public.submittal_rounds where id = (p_payload->>'submittal_round_id')::uuid and project_id = p_project_id;
    if not found then raise exception 'Submittal round not found in this project' using errcode = 'P0002'; end if;
    select * into v_sub from public.submittals where id = v_round.submittal_id;
  elsif nullif(p_payload->>'submittal_id', '') is not null then
    select * into v_sub from public.submittals where id = (p_payload->>'submittal_id')::uuid and project_id = p_project_id;
    if not found then raise exception 'Submittal not found in this project' using errcode = 'P0002'; end if;
  end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'transmittal');
  insert into public.drawing_transmittals (project_id, transmittal_number, direction, status, subject, purpose, sent_to, recipient_company, recipient_email, notes, submittal_id, submittal_round_id, created_by)
  values (p_project_id, 'T-' || lpad(v_seq::text, 3, '0'), coalesce(nullif(p_payload->>'direction', ''), 'outgoing'), 'draft', btrim(p_payload->>'subject'),
          nullif(p_payload->>'purpose', ''), nullif(btrim(coalesce(p_payload->>'sent_to', '')), ''), nullif(p_payload->>'recipient_company', ''), nullif(p_payload->>'recipient_email', ''),
          nullif(p_payload->>'notes', ''), v_sub.id, v_round.id, (select auth.uid()))
  returning * into v_row;
  perform public.log_transmittal_event(p_project_id, v_row.id, 'created', null, 'draft', null, jsonb_build_object('submittal_id', v_sub.id, 'submittal_round_id', v_round.id));
  -- Items: explicit refs first, then every live sheet of the listed sets (defaulting to the round's sets).
  v_refs := coalesce(p_payload->'item_refs', '[]'::jsonb);
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_sets from jsonb_array_elements_text(coalesce(p_payload->'drawing_set_ids', '[]'::jsonb)) x;
  if cardinality(v_sets) = 0 and v_round.id is not null then v_sets := coalesce(v_round.drawing_set_ids, '{}'::uuid[]); end if;
  if cardinality(v_sets) > 0 then
    select v_refs || coalesce(jsonb_agg('shop:' || d.id order by d.drawing_set_id, d.sheet_number), '[]'::jsonb) into v_refs
      from public.drawings d where d.project_id = p_project_id and d.is_deleted = false and d.drawing_set_id = any(v_sets)
       and not (v_refs ? ('shop:' || d.id));
  end if;
  if jsonb_array_length(v_refs) > 0 then perform public.set_transmittal_items(v_row.id, v_refs); end if;
  return v_row;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_work_package(p_project_id uuid, p_payload jsonb)
 RETURNS work_packages
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.work_packages%rowtype; v_shop uuid[]; v_gc uuid[]; v_sets uuid[]; v_rfis uuid[]; v_bad integer;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Creating work packages requires PM or admin' using errcode = '42501'; end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'A work package needs a name' using errcode = '23514'; end if;
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_shop from jsonb_array_elements_text(coalesce(p_payload->'drawing_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_gc from jsonb_array_elements_text(coalesce(p_payload->'gc_drawing_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_sets from jsonb_array_elements_text(coalesce(p_payload->'drawing_set_ids', '[]'::jsonb)) x;
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into v_rfis from jsonb_array_elements_text(coalesce(p_payload->'rfi_ids', '[]'::jsonb)) x;
  select count(*) into v_bad from unnest(v_shop) s where not exists (select 1 from public.drawings d where d.id = s and d.project_id = p_project_id);
  if v_bad > 0 then raise exception '% linked sheet(s) do not belong to this project', v_bad using errcode = '23503'; end if;
  select count(*) into v_bad from unnest(v_gc) g where not exists (select 1 from public.gc_drawings d where d.id = g and d.project_id = p_project_id);
  if v_bad > 0 then raise exception '% linked GC drawing(s) do not belong to this project', v_bad using errcode = '23503'; end if;
  select count(*) into v_bad from unnest(v_rfis) r where not exists (select 1 from public.rfis x where x.id = r and x.project_id = p_project_id);
  if v_bad > 0 then raise exception '% linked RFI(s) do not belong to this project', v_bad using errcode = '23503'; end if;
  v_seq := public.get_next_sequence_number(p_project_id, 'wp_number');
  insert into public.work_packages (project_id, project_name, wp_number, name, description, phase, status, released_date, tonnage, shop_hours_budget, field_hours_budget, crew, area, sequence_number,
                                    trade_phase, shipping_phase, install_phase, scheduled_start_date, scheduled_end_date, drawing_ids, gc_drawing_ids, drawing_set_ids, rfi_ids, notes, created_by, metadata)
  values (p_project_id, (select name from public.projects where id = p_project_id), 'WP-' || lpad(v_seq::text, 3, '0'), btrim(p_payload->>'name'), nullif(p_payload->>'description', ''),
          nullif(p_payload->>'phase', ''), coalesce(nullif(p_payload->>'status', ''), 'Not Started'), nullif(p_payload->>'released_date', '')::date, nullif(p_payload->>'tonnage', '')::numeric,
          nullif(p_payload->>'shop_hours_budget', '')::numeric, nullif(p_payload->>'field_hours_budget', '')::numeric, nullif(p_payload->>'crew', ''), nullif(p_payload->>'area', ''), nullif(p_payload->>'sequence_number', ''),
          nullif(p_payload->>'trade_phase', ''), nullif(p_payload->>'shipping_phase', ''), nullif(p_payload->>'install_phase', ''), nullif(p_payload->>'scheduled_start_date', '')::date, nullif(p_payload->>'scheduled_end_date', '')::date,
          v_shop, v_gc, v_sets, v_rfis, nullif(p_payload->>'notes', ''), (select auth.uid()), coalesce(p_payload->'metadata', '{}'::jsonb))
  returning * into v_row;
  return v_row;
end;
$function$


CREATE OR REPLACE FUNCTION public.deliver_piece_lots_impl(p_project_id uuid, p_piece_ids uuid[], p_reference_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT "public"."transition_piece_lots_canonical"(
    p_project_id, p_piece_ids, 'shipped', 'delivered', 'delivered',
    coalesce(p_reference_data, '{}'::jsonb)
  );
$function$


CREATE OR REPLACE FUNCTION public.document_folder_has_cycle(p_folder_id uuid, p_parent_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with recursive up as (
    select f.id, f.parent_folder_id, 1 as depth from public.document_folders f where f.id = p_parent_id
    union all
    select f.id, f.parent_folder_id, up.depth + 1 from public.document_folders f join up on f.id = up.parent_folder_id where up.depth < 64
  )
  select p_parent_id is not null and (p_parent_id = p_folder_id or exists (select 1 from up where up.id = p_folder_id)) $function$


CREATE OR REPLACE FUNCTION public.enforce_action_item_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_done constant text[] := array['Complete', 'Resolved', 'Closed'];
begin
  if tg_op = 'DELETE' then raise exception 'action items are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.action_number is not null and new.action_number is distinct from old.action_number then raise exception 'action_number is immutable' using errcode = '42501'; end if;
  if new.title is null or length(btrim(new.title)) = 0 then raise exception 'An action item needs a title' using errcode = '23514'; end if;
  new.title := btrim(new.title);
  if new.meeting_id is distinct from old.meeting_id and new.meeting_id is not null
     and not exists (select 1 from public.meetings m where m.id = new.meeting_id and m.project_id = new.project_id) then
    raise exception 'The meeting belongs to another project' using errcode = '23503';
  end if;
  if new.work_package_id is distinct from old.work_package_id and new.work_package_id is not null
     and not exists (select 1 from public.work_packages w where w.id = new.work_package_id and w.project_id = new.project_id) then
    raise exception 'The work package belongs to another project' using errcode = '23503';
  end if;
  if new.status is distinct from old.status then
    if not public.action_item_transition_allowed(old.status, new.status) then
      raise exception 'ACTION_TRANSITION: % → % is not allowed', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status = any (v_done) then new.completed_by := (select auth.uid()); else new.completed_by := null; end if;
  end if;
  if new.is_deleted and not old.is_deleted then
    if auth.role() = 'authenticated' and not public.user_has_project_role_at_least(new.project_id, 'pm') then
      raise exception 'Archiving an action item needs pm access' using errcode = '42501';
    end if;
    new.deleted_at := now();
  elsif not new.is_deleted then
    new.deleted_at := null;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_assumption_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'assumptions are never hard-deleted; retire them' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    new.status := coalesce(new.status, 'Open');
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_backcharge_event_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op <> 'INSERT' then raise exception 'backcharge_events are append-only' using errcode = '42501'; end if;
  if coalesce(current_setting('steelbuild.bc_rpc', true), '') <> 'on' then raise exception 'backcharge_events are written by the backcharge RPCs' using errcode = '42501'; end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_backcharge_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.bc_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'backcharges rows are never hard-deleted; void or soft-delete instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc then raise exception 'Use create_backcharge() — numbers are minted there' using errcode = '42501'; end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.backcharge_number is not null and new.backcharge_number is distinct from old.backcharge_number then raise exception 'backcharge_number is immutable' using errcode = '42501'; end if;
  if not v_rpc then
    if new.status is distinct from old.status or new.notice_date is distinct from old.notice_date or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by
       or new.collected_at is distinct from old.collected_at or new.collected_amount is distinct from old.collected_amount or new.void_reason is distinct from old.void_reason or new.ticket_total is distinct from old.ticket_total then
      raise exception 'Backcharge status, stamps and ticket total move only through the RPCs' using errcode = '42501';
    end if;
    if new.amount is distinct from old.amount and old.ticket_total > 0 then raise exception 'The amount comes from the T&M tickets while tickets exist' using errcode = '42501'; end if;
    if old.status in ('approved', 'collected') and (new.amount is distinct from old.amount or new.responsible_party is distinct from old.responsible_party or new.linked_co_id is distinct from old.linked_co_id) then
      raise exception 'An approved backcharge is frozen' using errcode = '42501';
    end if;
    if new.is_deleted and not old.is_deleted and old.status not in ('draft', 'void', 'rejected') then raise exception 'Only a draft, void or rejected backcharge can be deleted' using errcode = '42501'; end if;
  elsif new.status is distinct from old.status and not public.backcharge_transition_allowed(old.status, new.status) then
    raise exception 'Backcharge cannot move from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_billing_event_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role() = 'authenticated' then
    raise exception 'billing_events are written only by the billing webhook' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_budget_hour_item_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'budget_hour_items are never hard-deleted; set is_deleted instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    if coalesce(btrim(new.scope_item), '') = '' then raise exception 'scope_item is required' using errcode = '23514'; end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_change_order_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.co_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'change_orders rows are never hard-deleted; void or soft-delete instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc then raise exception 'Use create_change_order() — CO numbers are minted there' using errcode = '42501'; end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.co_number is not null and new.co_number is distinct from old.co_number then raise exception 'co_number is immutable' using errcode = '42501'; end if;
  if not v_rpc then
    if new.status is distinct from old.status then raise exception 'Change-order status moves only through the RPCs (move_change_order / approve_change_order)' using errcode = '42501'; end if;
    if new.approved_date is distinct from old.approved_date or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
       or new.sov_applied_at is distinct from old.sov_applied_at or new.sov_mode is distinct from old.sov_mode or new.void_reason is distinct from old.void_reason then
      raise exception 'Approval / SOV stamps are written only by the RPCs' using errcode = '42501';
    end if;
    if old.status = 'Approved' and (new.co_amount is distinct from old.co_amount or new.sov_line_item_id is distinct from old.sov_line_item_id or new.cost_code_id is distinct from old.cost_code_id) then
      raise exception 'An approved change order is frozen — void it and issue a new one' using errcode = '42501';
    end if;
    if new.is_deleted and not old.is_deleted and old.status = 'Approved' then raise exception 'An approved change order cannot be deleted — void it' using errcode = '42501'; end if;
  elsif new.status is distinct from old.status and not public.change_order_transition_allowed(old.status, new.status) then
    raise exception 'Change order cannot move from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_change_request_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.co_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'change_requests rows are never hard-deleted; set is_deleted instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc then raise exception 'Use create_change_request() — CR numbers are minted there' using errcode = '42501'; end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.cr_number is not null and new.cr_number is distinct from old.cr_number then raise exception 'cr_number is immutable' using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_client_event_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_n int;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if coalesce(current_setting('steelbuild.ops_rpc', true), '') = 'on' and tg_op = 'DELETE' then return old; end if;
    raise exception 'client_events are append-only' using errcode = '42501';
  end if;
  if auth.role() = 'authenticated' then
    new.user_id := (select auth.uid());
    if new.org_id is not null and not public.user_is_org_member(new.org_id) then new.org_id := null; end if;
    select count(*) into v_n from public.client_events where user_id = new.user_id and occurred_at > now() - interval '1 minute';
    if v_n >= 60 then raise exception 'CLIENT_EVENT_RATE_LIMIT: too many events from this user' using errcode = 'P0001'; end if;
  end if;
  new.message := left(new.message, 2000);
  new.stack := left(new.stack, 8000);
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_cost_row_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.cost_rpc', true), '') = 'on'; v_exp boolean := coalesce(current_setting('steelbuild.expense_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception '% rows are never hard-deleted; set is_deleted instead', tg_table_name using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if tg_table_name = 'sov_items' and not v_rpc then raise exception 'Use create_sov_item() — SOV line numbers are minted there' using errcode = '42501'; end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  -- (json access: cost_codes has no line_item_number column, and plpgsql resolves record fields per table)
  if tg_table_name = 'sov_items' and (to_jsonb(old) ->> 'line_item_number') is not null and (to_jsonb(new) ->> 'line_item_number') is distinct from (to_jsonb(old) ->> 'line_item_number') then raise exception 'line_item_number is immutable' using errcode = '42501'; end if;
  if tg_table_name = 'cost_codes' and not v_exp then
    if (to_jsonb(new) ->> 'expense_actual') is distinct from (to_jsonb(old) ->> 'expense_actual') then raise exception 'expense_actual is maintained from the expenses' using errcode = '42501'; end if;
    if (to_jsonb(new) ->> 'actual_cost') is distinct from (to_jsonb(old) ->> 'actual_cost') and coalesce((to_jsonb(old) ->> 'expense_actual')::numeric, 0) > 0 then
      raise exception 'This cost code''s actual comes from its Approved / Paid expenses' using errcode = '42501';
    end if;
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_data_erasure_log_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('steelbuild.erasure_rpc', true), '') <> 'on' then
    raise exception 'data_erasure_log is written only by the erasure RPCs' using errcode = '42501';
  end if;
  if tg_op <> 'INSERT' then raise exception 'data_erasure_log is append-only' using errcode = '42501'; end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_decision_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'decisions are never hard-deleted; supersede or reverse them' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.decision_number is null then new.decision_number := 'DEC-' || lpad(public.get_next_sequence_number(new.project_id, 'decision')::text, 3, '0'); end if;
    new.status := coalesce(new.status, 'Proposed');
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
  else
    if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
    if old.decision_number is not null and new.decision_number is distinct from old.decision_number then raise exception 'decision_number is immutable' using errcode = '42501'; end if;
    if old.status in ('Decided', 'Superseded', 'Reversed') and (new.title is distinct from old.title or new.description is distinct from old.description or new.rationale is distinct from old.rationale
       or new.alternatives is distinct from old.alternatives or new.decided_by is distinct from old.decided_by or new.decision_date is distinct from old.decision_date or new.category is distinct from old.category or new.impact is distinct from old.impact) then
      raise exception 'A decided decision is frozen — supersede it with a new one' using errcode = '42501';
    end if;
    if old.status = 'Decided' and new.status = 'Proposed' then raise exception 'A decision cannot go back to Proposed' using errcode = 'P0001'; end if;
    if old.status in ('Superseded', 'Reversed') and new.status is distinct from old.status then raise exception 'A superseded or reversed decision is final' using errcode = 'P0001'; end if;
    if new.is_deleted and not old.is_deleted then
      if old.status <> 'Proposed' then raise exception 'Only a proposed decision can be archived' using errcode = '42501'; end if;
      new.deleted_at := coalesce(new.deleted_at, now());
    end if;
  end if;
  if new.status = 'Decided' and (coalesce(btrim(new.decided_by), '') = '' or new.decision_date is null) then
    raise exception 'A decided decision needs who decided and when' using errcode = '23514';
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_delivery_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.delivery_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'deliveries are never hard-deleted; set is_deleted instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc then raise exception 'Deliveries are created through create_delivery(); numbers are minted there' using errcode = '42501'; end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if new.delivery_number is distinct from old.delivery_number and not (old.delivery_number is null and v_rpc) then raise exception 'delivery_number is immutable' using errcode = '42501'; end if;
  if new.status in ('Delivered', 'Received') and old.status not in ('Delivered', 'Received') and not v_rpc then
    raise exception 'RECEIVE_VIA_RPC: mark a delivery received through receive_delivery() so linked piece lots advance with it' using errcode = 'P0001';
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_document_folder_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'document folders are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if new.name is null or length(btrim(new.name)) = 0 then raise exception 'A folder needs a name' using errcode = '23514'; end if;
  new.name := btrim(new.name);
  if new.parent_folder_id is not null then
    if not exists (select 1 from public.document_folders p where p.id = new.parent_folder_id and p.project_id = new.project_id and p.is_deleted = false) then
      raise exception 'The parent folder must be a live folder of the same project' using errcode = '23503';
    end if;
    if tg_op = 'UPDATE' and public.document_folder_has_cycle(new.id, new.parent_folder_id) then
      raise exception 'FOLDER_CYCLE: a folder cannot sit inside itself' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if auth.role() = 'authenticated' then
      new.created_by_id := coalesce(new.created_by_id, (select auth.uid()));
      new.created_by := coalesce(new.created_by, public.actor_display_name());
    end if;
    new.is_deleted := false; new.deleted_at := null;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then
    if auth.role() = 'authenticated' and not public.user_has_project_role_at_least(new.project_id, 'pm') then
      raise exception 'Archiving a folder needs pm access' using errcode = '42501';
    end if;
    if exists (select 1 from public.documents d where d.folder_id = new.id and d.is_deleted = false)
       or exists (select 1 from public.document_folders c where c.parent_folder_id = new.id and c.is_deleted = false) then
      raise exception 'FOLDER_NOT_EMPTY: move or archive its documents and sub-folders first' using errcode = 'P0001';
    end if;
    new.deleted_at := now();
  elsif not new.is_deleted then
    new.deleted_at := null;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_document_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.doc_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'documents are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.document_number is not null and new.document_number is distinct from old.document_number then raise exception 'document_number is immutable' using errcode = '42501'; end if;
  if old.file_url is not null and new.file_url is distinct from old.file_url and not v_rpc then
    raise exception 'A document file is never replaced in place — revise it with supersede_document()' using errcode = '42501';
  end if;
  if (new.status is distinct from old.status and (new.status = 'Superseded' or old.status = 'Superseded'))
     or new.is_current is distinct from old.is_current
     or new.superseded_by_id is distinct from old.superseded_by_id
     or new.supersedes_id is distinct from old.supersedes_id
     or new.revision_number is distinct from old.revision_number then
    if not v_rpc then raise exception 'Revision state changes only through supersede_document()' using errcode = '42501'; end if;
  end if;
  if old.status in ('Superseded', 'Void') and not v_rpc and not (new.is_deleted is distinct from old.is_deleted) then
    if row(new.title, new.file_name, new.category, new.status, new.discipline, new.folder_id, new.rfi_id, new.work_package_id, new.submittal_id, new.change_order_id, new.delivery_id, new.due_date, new.revision_date, new.file_size_kb, new.mime_type)
       is distinct from row(old.title, old.file_name, old.category, old.status, old.discipline, old.folder_id, old.rfi_id, old.work_package_id, old.submittal_id, old.change_order_id, old.delivery_id, old.due_date, old.revision_date, old.file_size_kb, old.mime_type) then
      raise exception 'A superseded or void document is frozen except its description, tags, notes and metadata' using errcode = '42501';
    end if;
  end if;
  new.title := nullif(btrim(coalesce(new.title, '')), '');
  new.file_name := nullif(btrim(coalesce(new.file_name, '')), '');
  if new.title is null and new.file_name is null then raise exception 'A document needs a title or a file name' using errcode = '23514'; end if;
  new.display_name := coalesce(new.title, new.file_name);
  if new.folder_id is distinct from old.folder_id and new.folder_id is not null
     and not exists (select 1 from public.document_folders f where f.id = new.folder_id and f.project_id = new.project_id and f.is_deleted = false) then
    raise exception 'The folder must be a live folder of the same project' using errcode = '23503';
  end if;
  if new.rfi_id is distinct from old.rfi_id and new.rfi_id is not null and not exists (select 1 from public.rfis r where r.id = new.rfi_id and r.project_id = new.project_id) then
    raise exception 'The RFI belongs to another project' using errcode = '23503';
  end if;
  if new.work_package_id is distinct from old.work_package_id and new.work_package_id is not null and not exists (select 1 from public.work_packages w where w.id = new.work_package_id and w.project_id = new.project_id) then
    raise exception 'The work package belongs to another project' using errcode = '23503';
  end if;
  if new.is_deleted and not old.is_deleted then
    if auth.role() = 'authenticated' and not public.user_has_project_role_at_least(new.project_id, 'pm') then
      raise exception 'Archiving a document needs pm access' using errcode = '42501';
    end if;
    new.deleted_at := now();
  elsif not new.is_deleted then
    new.deleted_at := null;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_expense_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.expense_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'expenses rows are never hard-deleted; void or soft-delete instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc then raise exception 'Use create_expense() — expense numbers are minted there' using errcode = '42501'; end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.expense_number is not null and new.expense_number is distinct from old.expense_number then raise exception 'expense_number is immutable' using errcode = '42501'; end if;
  if not v_rpc then
    if new.payment_status is distinct from old.payment_status or new.submitted_date is distinct from old.submitted_date or new.approved_by is distinct from old.approved_by or new.approved_date is distinct from old.approved_date
       or new.payment_date is distinct from old.payment_date or new.paid_by is distinct from old.paid_by or new.void_reason is distinct from old.void_reason then
      raise exception 'Expense status and stamps move only through move_expense()' using errcode = '42501';
    end if;
    if old.payment_status in ('Approved', 'Paid') and (new.amount is distinct from old.amount or new.quantity is distinct from old.quantity or new.unit_cost is distinct from old.unit_cost or new.cost_code_id is distinct from old.cost_code_id) then
      raise exception 'An approved expense is frozen — reject it to change the money or the cost code' using errcode = '42501';
    end if;
    if old.payment_status <> 'Pending' and auth.role() = 'authenticated' and not public.user_has_project_role_at_least(old.project_id, 'pm') then
      raise exception 'Only a Pending expense can be edited by the field' using errcode = '42501';
    end if;
    if new.is_deleted and not old.is_deleted and old.payment_status not in ('Pending', 'Void', 'Rejected') then raise exception 'Only a Pending, Void or Rejected expense can be deleted' using errcode = '42501'; end if;
  elsif new.payment_status is distinct from old.payment_status and not public.expense_transition_allowed(old.payment_status, new.payment_status) then
    raise exception 'Expense cannot move from % to %', old.payment_status, new.payment_status using errcode = 'P0001';
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_feature_flag_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.flag_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'feature flags are turned off, never deleted' using errcode = '42501'; end if;
  if auth.role() = 'authenticated' and not v_rpc then
    raise exception 'Feature flags change only through set_feature_flag() / set_feature_flag_override()' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.flag_key is distinct from old.flag_key then raise exception 'flag_key is immutable' using errcode = '42501'; end if;
  if auth.role() = 'authenticated' then new.updated_by := (select auth.uid()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_field_row_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception '% rows are never hard-deleted; set is_deleted instead', tg_table_name using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if new.client_op_id is distinct from old.client_op_id and old.client_op_id is not null then raise exception 'client_op_id is immutable' using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_handoff_item_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_name text;
begin
  if tg_op = 'DELETE' then raise exception 'project_handoff_items are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.seq is null then new.seq := public.get_next_sequence_number(new.project_id, 'handoff_item'); end if;
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
    new.category := coalesce(nullif(btrim(new.category), ''), 'General');
  else
    if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
    if new.seq is distinct from old.seq then raise exception 'seq is immutable' using errcode = '42501'; end if;
    if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  end if;
  if new.status = 'Completed' and (tg_op = 'INSERT' or old.status is distinct from 'Completed') then
    new.date_completed := coalesce(new.date_completed, current_date);
    if auth.role() = 'authenticated' then
      select coalesce(nullif(btrim(up.full_name), ''), up.email) into v_name from public.user_profiles up where up.id = (select auth.uid());
      new.completed_by := coalesce(nullif(btrim(new.completed_by), ''), v_name);
      new.completed_by_id := coalesce(new.completed_by_id, (select auth.uid()));
    end if;
  elsif new.status <> 'Completed' and tg_op = 'UPDATE' and old.status = 'Completed' then
    new.date_completed := null; new.completed_by := null; new.completed_by_id := null;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_linked_folder_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'linked folders are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then
    if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
    if new.is_deleted and not old.is_deleted then new.deleted_at := now(); elsif not new.is_deleted then new.deleted_at := null; end if;
  elsif auth.role() = 'authenticated' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_meeting_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'meetings are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.meeting_number is not null and new.meeting_number is distinct from old.meeting_number then raise exception 'meeting_number is immutable' using errcode = '42501'; end if;
  if new.title is null or length(btrim(new.title)) = 0 then raise exception 'A meeting needs a title' using errcode = '23514'; end if;
  new.title := btrim(new.title);
  if new.status is distinct from old.status then
    if not public.meeting_transition_allowed(old.status, new.status) then
      raise exception 'MEETING_TRANSITION: % → % is not allowed', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status = 'Held' then
      if new.meeting_date is null then raise exception 'A held meeting needs its date' using errcode = '23514'; end if;
      new.held_at := now(); new.held_by := (select auth.uid());
    else
      new.held_at := null; new.held_by := null;
    end if;
  end if;
  if new.is_deleted and not old.is_deleted then
    if auth.role() = 'authenticated' and not public.user_has_project_role_at_least(new.project_id, 'pm') then
      raise exception 'Archiving a meeting needs pm access' using errcode = '42501';
    end if;
    new.deleted_at := now();
  elsif not new.is_deleted then
    new.deleted_at := null;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_mitigation_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception '% rows are never hard-deleted; archive them instead', tg_table_name using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
    if tg_table_name = 'mitigation_logs' then
      if new.mitigation_number is null then new.mitigation_number := 'ML-' || lpad(public.get_next_sequence_number(new.project_id, 'mitigation')::text, 3, '0'); end if;
      new.identified_date := coalesce(new.identified_date, current_date);
      new.status := coalesce(new.status, 'Open');
    else
      if not exists (select 1 from public.mitigation_logs m where m.id = new.mitigation_id and m.project_id = new.project_id) then
        raise exception 'mitigation_id must belong to the same project' using errcode = '23503';
      end if;
      new.action_date := coalesce(new.action_date, current_date);
    end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if tg_table_name = 'mitigation_logs' and old.mitigation_number is not null and (to_jsonb(new) ->> 'mitigation_number') is distinct from old.mitigation_number then
    raise exception 'mitigation_number is immutable' using errcode = '42501';
  end if;
  if (to_jsonb(new) ->> 'is_deleted') = 'true' and coalesce(to_jsonb(old) ->> 'is_deleted', 'false') <> 'true' then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_model_element_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'model_elements are never hard-deleted' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then
    if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
    if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_model_registry_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.model_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'model_registry rows are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
    new.upload_date := coalesce(new.upload_date, now());
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if new.file_url is distinct from old.file_url and old.file_url is not null and not v_rpc then raise exception 'A registered model file is immutable; register a new version' using errcode = '42501'; end if;
  if new.status is distinct from old.status and new.status = 'superseded' then new.superseded_at := coalesce(new.superseded_at, now()); end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_pay_application_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.payapp_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'pay_applications rows are never hard-deleted; void or soft-delete instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc then raise exception 'Use generate_pay_application() — application numbers are minted there' using errcode = '42501'; end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if new.application_number is distinct from old.application_number then raise exception 'application_number is immutable' using errcode = '42501'; end if;
  if not v_rpc then
    if new.status is distinct from old.status or new.submitted_date is distinct from old.submitted_date or new.certified_date is distinct from old.certified_date or new.paid_date is distinct from old.paid_date
       or new.approved_by is distinct from old.approved_by or new.submitted_by is distinct from old.submitted_by or new.void_reason is distinct from old.void_reason then
      raise exception 'Pay-application status and stamps move only through move_pay_application()' using errcode = '42501';
    end if;
    if new.original_contract_sum is distinct from old.original_contract_sum or new.net_change_orders is distinct from old.net_change_orders or new.total_completed_stored is distinct from old.total_completed_stored
       or new.total_retainage is distinct from old.total_retainage or new.less_previous_certificates is distinct from old.less_previous_certificates or new.current_payment_due is distinct from old.current_payment_due
       or new.total_earned_less_retainage is distinct from old.total_earned_less_retainage or new.balance_to_finish is distinct from old.balance_to_finish then
      raise exception 'G702 totals are computed from the G703 lines, never typed' using errcode = '42501';
    end if;
    if old.status <> 'draft' and (new.period_from is distinct from old.period_from or new.period_to is distinct from old.period_to or new.retainage_percent is distinct from old.retainage_percent) then
      raise exception 'Only a draft pay application can change its period or retainage' using errcode = '42501';
    end if;
    if new.is_deleted and not old.is_deleted and old.status not in ('draft', 'void') then raise exception 'Only a draft or void pay application can be deleted' using errcode = '42501'; end if;
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_pay_application_line_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.payapp_rpc', true), '') = 'on';
begin
  if tg_op in ('INSERT', 'DELETE') and not v_rpc then raise exception 'G703 lines are generated from the SOV — use generate_pay_application() / regenerate_pay_application_lines()' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' then
    if new.pay_application_id is distinct from old.pay_application_id or new.project_id is distinct from old.project_id then raise exception 'line ownership is immutable' using errcode = '42501'; end if;
    if not v_rpc and (new.scheduled_value is distinct from old.scheduled_value or new.work_completed_previous is distinct from old.work_completed_previous or new.sov_item_id is distinct from old.sov_item_id) then
      raise exception 'Scheduled value and previous work come from the SOV snapshot — only this period and materials stored are typed' using errcode = '42501';
    end if;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_pma_audit_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Writes come from triggers only: the risk-hub log_pma_change() (flag) or the legacy audit_log_trigger() on
  -- drawing_sets / drawing_revisions / … (trigger depth > 1). A direct client insert runs at depth 1 with no flag.
  if coalesce(current_setting('steelbuild.pma_audit', true), '') <> 'on' and pg_trigger_depth() <= 1 then
    raise exception 'pma_audit_logs are written only by database triggers' using errcode = '42501';
  end if;
  if tg_op <> 'INSERT' then raise exception 'pma_audit_logs are append-only' using errcode = '42501'; end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_project_change_total_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role() = 'authenticated' and new.approved_change_total is distinct from old.approved_change_total and coalesce(current_setting('steelbuild.co_rpc', true), '') <> 'on' then
    raise exception 'approved_change_total is maintained by the change-order RPCs' using errcode = '42501';
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_project_closeout_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.closeout_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'project_closeout rows are never hard-deleted' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
    if new.status = 'Complete' and not v_rpc then raise exception 'Complete a closeout through complete_project_closeout()' using errcode = '42501'; end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if not v_rpc then
    if new.status is distinct from old.status then raise exception 'Closeout status moves only through complete_project_closeout() / reopen_project_closeout()' using errcode = '42501'; end if;
    if new.completed_by is distinct from old.completed_by or new.completed_at is distinct from old.completed_at or new.override_reason is distinct from old.override_reason
       or new.override_by is distinct from old.override_by or new.blockers_at_completion is distinct from old.blockers_at_completion or new.reopen_reason is distinct from old.reopen_reason then
      raise exception 'Completion stamps are written only by the closeout RPCs' using errcode = '42501';
    end if;
    if old.status = 'Complete' then
      if new.is_deleted and not old.is_deleted then raise exception 'A completed closeout cannot be archived; reopen it first' using errcode = '42501'; end if;
      if to_jsonb(new) - 'notes' - 'metadata' - 'updated_at' is distinct from to_jsonb(old) - 'notes' - 'metadata' - 'updated_at' then
        raise exception 'A completed closeout is frozen; reopen it to change it' using errcode = '42501';
      end if;
    end if;
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_punchlist_close_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'Completed' and old.status is distinct from 'Completed' then
    if new.closing_photo_id is null then raise exception 'Closing a punch item requires a closing photo — use close_punchlist_item()' using errcode = '23514'; end if;
    new.closed_at := coalesce(new.closed_at, now());
    new.closed_by := coalesce(new.closed_by, auth.jwt() ->> 'email', auth.uid()::text);
    new.percent_complete := 100;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_quality_row_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_num_col text; v_old_num text; v_new_num text; v_rpc boolean := coalesce(current_setting('steelbuild.quality_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception '% rows are never hard-deleted; set is_deleted instead', tg_table_name using errcode = '42501'; end if;
  v_num_col := case tg_table_name when 'inspections' then 'inspection_number' when 'quality_control_records' then 'record_number' else 'incident_number' end;
  v_new_num := to_jsonb(new) ->> v_num_col;
  if tg_op = 'INSERT' then
    if not v_rpc then raise exception 'Use the create RPC for % — official numbers are minted there', tg_table_name using errcode = '42501'; end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  v_old_num := to_jsonb(old) ->> v_num_col;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if v_old_num is not null and v_new_num is distinct from v_old_num then raise exception '% is immutable', v_num_col using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  if tg_table_name = 'inspections' then
    if new.sign_off_status is distinct from old.sign_off_status and new.sign_off_status <> 'Pending' then
      if not public.user_has_project_role_at_least(new.project_id, 'pm') then raise exception 'Signing off an inspection needs pm+' using errcode = '42501'; end if;
      new.signed_off_at := coalesce(new.signed_off_at, now());
      new.signed_off_by := coalesce(new.signed_off_by, auth.jwt() ->> 'email', auth.uid()::text);
    end if;
    if new.status = 'Completed' and old.status is distinct from 'Completed' then new.completed_at := coalesce(new.completed_at, now()); end if;
  elsif tg_table_name = 'safety_incidents' then
    if new.status = 'Closed' and old.status is distinct from 'Closed' then
      new.closed_at := coalesce(new.closed_at, now());
      new.closed_by := coalesce(new.closed_by, auth.jwt() ->> 'email', auth.uid()::text);
    end if;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_revision_comparison_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.revcmp_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'drawing_revision_comparisons are never hard-deleted' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc and auth.role() = 'authenticated' then raise exception 'Open a comparison through create_revision_comparison()' using errcode = '42501'; end if;
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id or new.drawing_id is distinct from old.drawing_id or new.from_revision_id is distinct from old.from_revision_id or new.to_revision_id is distinct from old.to_revision_id then
    raise exception 'A comparison''s subject is immutable' using errcode = '42501';
  end if;
  if not v_rpc and auth.role() = 'authenticated' then
    if new.compare_status is distinct from old.compare_status or new.ai_summary is distinct from old.ai_summary or new.delta_count is distinct from old.delta_count
       or new.raw_ai_response is distinct from old.raw_ai_response or new.model is distinct from old.model or new.error_message is distinct from old.error_message then
      raise exception 'Comparison results are written only by record_revision_comparison()' using errcode = '42501';
    end if;
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_revision_delta_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.revcmp_rpc', true), '') = 'on'; c public.drawing_revision_comparisons;
begin
  if tg_op = 'DELETE' then raise exception 'drawing_revision_deltas are never hard-deleted; dismiss them instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    select * into c from public.drawing_revision_comparisons where id = new.comparison_id;
    if not found then raise exception 'comparison_id must reference a comparison' using errcode = '23503'; end if;
    new.project_id := coalesce(new.project_id, c.project_id);
    new.drawing_id := coalesce(new.drawing_id, c.drawing_id);
    if new.project_id is distinct from c.project_id then raise exception 'delta project must match its comparison' using errcode = '23503'; end if;
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
    if not v_rpc and auth.role() = 'authenticated' then new.classification_source := 'manual'; end if;
    new.classification_source := coalesce(new.classification_source, 'ai');
    return new;
  end if;
  if new.comparison_id is distinct from old.comparison_id or new.project_id is distinct from old.project_id then raise exception 'A delta''s comparison is immutable' using errcode = '42501'; end if;
  if not v_rpc and auth.role() = 'authenticated' then
    if new.linked_rfi_id is distinct from old.linked_rfi_id then raise exception 'Link an RFI through create_rfi_from_delta()' using errcode = '42501'; end if;
    if new.description is distinct from old.description or new.delta_type is distinct from old.delta_type or new.severity is distinct from old.severity or new.sheet_number is distinct from old.sheet_number then
      raise exception 'The finding itself is frozen; triage it (dismiss, categorise, assign) or raise an RFI' using errcode = '42501';
    end if;
    if new.change_category is distinct from old.change_category or new.likely_owner is distinct from old.likely_owner or new.impact_summary is distinct from old.impact_summary then
      new.classification_source := 'manual'; new.classification_confidence := 'high';
    end if;
  end if;
  if new.dismissed and not old.dismissed then new.dismissed_at := coalesce(new.dismissed_at, now()); new.dismissed_by := coalesce(new.dismissed_by, public.actor_display_name());
  elsif not new.dismissed and old.dismissed then new.dismissed_at := null; new.dismissed_by := null; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_revision_summary_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.revcmp_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'drawing_revision_summaries are never hard-deleted' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not v_rpc and auth.role() = 'authenticated' then raise exception 'Build a report through build_revision_impact_report()' using errcode = '42501'; end if;
    return new;
  end if;
  if to_jsonb(new) - 'is_deleted' - 'deleted_at' is distinct from to_jsonb(old) - 'is_deleted' - 'deleted_at' then raise exception 'A generated report is immutable; generate a new one' using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_rfi_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_ok boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'RFIs are never deleted — void them (audited) or soft-delete a draft' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.drawing_id is not null and new.drawing_set_id is null then
      select d.drawing_set_id into new.drawing_set_id from public.drawings d where d.id = new.drawing_id;
    end if;
    return new;
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if new.rfi_number is distinct from old.rfi_number then raise exception 'rfi_number is minted by create_rfi and never edited' using errcode = '42501'; end if;
  if new.status is distinct from old.status then
    v_ok := case old.status
      when 'Open' then new.status in ('Under Review','Incomplete Response','Answered','Void')
      when 'Under Review' then new.status in ('Open','Incomplete Response','Answered','Void')
      when 'Incomplete Response' then new.status in ('Under Review','Answered','Void')
      when 'Answered' then new.status in ('Closed','Incomplete Response','Under Review','Void')
      when 'Closed' then new.status in ('Under Review','Void')
      else false end;
    if not v_ok then raise exception 'RFI % cannot move from % to %', old.rfi_number, old.status, new.status using errcode = '22023'; end if;
    if new.status = 'Answered' and length(btrim(coalesce(new.answer, new.response_text, ''))) = 0 then
      raise exception 'An answered RFI needs an answer' using errcode = '23514';
    end if;
    if new.status = 'Closed' then new.closed_at := coalesce(new.closed_at, now()); new.closed_by := coalesce(new.closed_by, (select auth.uid())); end if;
    if old.status = 'Void' then raise exception 'A void RFI is final' using errcode = '22023'; end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_risk_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.risk_rpc', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'risks are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then return new; end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.risk_number is not null and new.risk_number is distinct from old.risk_number then raise exception 'risk_number is immutable' using errcode = '42501'; end if;
  if new.status is distinct from old.status then
    if not v_rpc then raise exception 'Risk status moves only through move_risk()' using errcode = '42501'; end if;
    if not public.risk_transition_allowed(old.status, new.status) then raise exception 'Risk cannot move from % to %', old.status, new.status using errcode = 'P0001'; end if;
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_runtime_config_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('steelbuild.ops_rpc', true), '') <> 'on' then
    raise exception 'runtime_config changes only through set_runtime_config()' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  if auth.role() = 'authenticated' then new.updated_by := (select auth.uid()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_schedule_task_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_pm boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'schedule_tasks rows are never hard-deleted; set is_deleted instead' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    if coalesce(new.status, 'Not Started') = 'Complete' and new.percent_complete is distinct from 100 then new.percent_complete := 100; end if;
    return new;
  end if;
  -- UPDATE
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if auth.uid() is null then return new; end if; -- service-role / definer paths
  v_is_pm := public.user_has_project_role_at_least(new.project_id, 'pm');
  if not v_is_pm then
    if new.task_name is distinct from old.task_name or new.task_type is distinct from old.task_type or new.phase is distinct from old.phase
       or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date or new.priority is distinct from old.priority
       or new.assigned_to is distinct from old.assigned_to or new.parent_task_id is distinct from old.parent_task_id or new.wbs_code is distinct from old.wbs_code
       or new.milestone is distinct from old.milestone or new.is_milestone is distinct from old.is_milestone or new.work_package_id is distinct from old.work_package_id
       or new.crew_id is distinct from old.crew_id or new.crew_name is distinct from old.crew_name or new.sort_order is distinct from old.sort_order
       or new.is_deleted is distinct from old.is_deleted or new.target_release is distinct from old.target_release or new.duration is distinct from old.duration then
      raise exception 'Only a project pm or above may change schedule structure or dates; field users report progress only' using errcode = '42501';
    end if;
  end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  if new.status = 'Complete' and old.status is distinct from 'Complete' then
    new.percent_complete := 100;
    new.actual_finish_date := coalesce(new.actual_finish_date, current_date);
  end if;
  if new.status = 'In Progress' and old.status is distinct from 'In Progress' and new.actual_start_date is null then new.actual_start_date := current_date; end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_scope_item_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'scope items are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if old.scope_number is not null and new.scope_number is distinct from old.scope_number then raise exception 'scope_number is immutable' using errcode = '42501'; end if;
  if new.description is null or length(btrim(new.description)) = 0 then
    raise exception 'A scope item needs a description' using errcode = '23514';
  end if;
  new.description := btrim(new.description);
  if new.document_id is distinct from old.document_id or new.change_order_id is distinct from old.change_order_id or new.item_type is distinct from old.item_type then
    perform public.scope_item_check_links(new);
  end if;
  new := public.scope_item_apply_progress(new, old);
  if new.is_deleted and not old.is_deleted then
    if auth.role() = 'authenticated' and not public.user_has_project_role_at_least(new.project_id, 'pm') then
      raise exception 'Archiving a scope item needs pm access' using errcode = '42501';
    end if;
    new.deleted_at := now();
  elsif not new.is_deleted then
    new.deleted_at := null;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_signoff_void_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.is_voided and not new.is_voided then raise exception 'A voided signoff cannot be restored' using errcode = '42501'; end if;
  if old.is_voided and (new.stamp_type <> old.stamp_type or new.notes is distinct from old.notes) then
    raise exception 'A voided signoff is read-only' using errcode = '42501';
  end if;
  if new.is_voided and not old.is_voided then
    if not (public.user_has_project_role_at_least(new.project_id, 'admin') or old.stamped_by_id = (select auth.uid())) then
      raise exception 'Only an admin or the original signer can void a signoff' using errcode = '42501';
    end if;
    if length(trim(coalesce(new.voided_reason, ''))) = 0 then raise exception 'A reason is required to void a signoff' using errcode = 'P0001'; end if;
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(new.voided_by, (select auth.uid()));
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_submittal_workflow_gates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_from text; v_to text; v_open int; v_reasons text[] := '{}'; v_override boolean;
begin
  new.derived_stage := public.submittal_derived_stage(new.status, new.ball_in_court, new.approved_date);
  if tg_op = 'INSERT' then
    new.stage_entered_at := coalesce(new.stage_entered_at, now());
    return new;
  end if;
  v_from := coalesce(old.derived_stage, public.submittal_derived_stage(old.status, old.ball_in_court, old.approved_date));
  v_to := new.derived_stage;
  if v_to is distinct from v_from then
    new.stage_entered_at := now();
    if v_to in ('IFC','Released') and v_from in ('Not Started','IFA','OFA','BFA','R&R','OFS')
       and not public.submittal_ofs_checklist_complete(coalesce(new.metadata, '{}'::jsonb)) then
      v_reasons := array_append(v_reasons, 'OFS scrub checklist incomplete (metadata.ofs_checklist)');
    end if;
    if (v_to in ('IFC','Released') and v_from in ('Not Started','IFA','OFA','BFA','R&R','OFS')) or (v_from = 'R&R' and v_to = 'OFA') then
      select count(*) into v_open from public.submittal_comment_dispositions d
       where d.submittal_id = new.id and d.is_deleted = false and d.is_required = true
         and d.status not in ('Complete','Not Applicable','Incorporated');
      if v_open > 0 then v_reasons := array_append(v_reasons, v_open || ' required comment disposition(s) unresolved'); end if;
    end if;
    if array_length(v_reasons, 1) is not null then
      v_override := coalesce(btrim(new.gate_override_reason), '') <> '' and new.gate_override_reason is distinct from old.gate_override_reason;
      if not v_override then
        raise exception 'SUBMITTAL_GATE_BLOCKED: % → % blocked: %. Record an audited override reason to proceed.', v_from, v_to, array_to_string(v_reasons, '; ') using errcode = 'P0001';
      end if;
      if not public.user_has_project_role_at_least(new.project_id, 'pm') then
        raise exception 'SUBMITTAL_GATE_BLOCKED: only PM+ may override a workflow gate' using errcode = '42501';
      end if;
      new.gate_override_by := (select auth.uid());
      new.gate_override_at := now();
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_task_dependency_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pred_project uuid; v_succ_project uuid; v_cycle boolean;
begin
  if new.predecessor_id = new.successor_id then raise exception 'A task cannot depend on itself' using errcode = '23514'; end if;
  if new.dependency_type not in ('FS', 'SS', 'FF', 'SF') then raise exception 'dependency_type must be FS, SS, FF or SF' using errcode = '23514'; end if;
  if coalesce(new.lag_days, 0) < -365 or coalesce(new.lag_days, 0) > 365 then raise exception 'lag_days out of range' using errcode = '23514'; end if;
  select project_id into v_pred_project from public.schedule_tasks where id = new.predecessor_id and is_deleted = false;
  select project_id into v_succ_project from public.schedule_tasks where id = new.successor_id and is_deleted = false;
  if v_pred_project is null or v_succ_project is null then raise exception 'Both tasks must be live schedule tasks' using errcode = '23503'; end if;
  if v_pred_project <> new.project_id or v_succ_project <> new.project_id then raise exception 'Both tasks must belong to the dependency''s project' using errcode = '23514'; end if;
  -- Cycle: is the predecessor reachable from the successor through existing edges?
  with recursive downstream(task_id, depth) as (
    select new.successor_id, 0
    union
    select d.successor_id, downstream.depth + 1
      from public.task_dependencies d join downstream on d.predecessor_id = downstream.task_id
     where downstream.depth < 500 and (tg_op = 'INSERT' or d.id <> new.id)
  )
  select exists (select 1 from downstream where task_id = new.predecessor_id) into v_cycle;
  if v_cycle then raise exception 'DEPENDENCY_CYCLE: this link would make the schedule circular' using errcode = '23514'; end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_tm_ticket_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text;
begin
  if tg_op = 'DELETE' then raise exception 'backcharge_tm_tickets rows are never hard-deleted; set is_deleted instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' and coalesce(current_setting('steelbuild.bc_rpc', true), '') <> 'on' then raise exception 'Use add_tm_ticket() — ticket numbers are minted there' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and (new.backcharge_id is distinct from old.backcharge_id or new.project_id is distinct from old.project_id or new.ticket_number is distinct from old.ticket_number) then raise exception 'ticket ownership / number is immutable' using errcode = '42501'; end if;
  select status into v_status from public.backcharges where id = new.backcharge_id;
  if v_status in ('approved', 'collected', 'void', 'rejected') then raise exception 'Backcharge is % — its tickets are frozen', v_status using errcode = '42501'; end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_transmittal_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.transmittal_rpc', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    raise exception 'Transmittals are never deleted — void them (audited) instead' using errcode = '42501';
  end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if v_rpc then return new; end if;
  if new.transmittal_number is distinct from old.transmittal_number then raise exception 'transmittal_number is minted by create_transmittal and never edited' using errcode = '42501'; end if;
  if new.status is distinct from old.status then raise exception 'Use send_transmittal / acknowledge_transmittal / void_transmittal to change status' using errcode = '42501'; end if;
  if new.date_sent is distinct from old.date_sent or new.sent_by is distinct from old.sent_by or new.voided_at is distinct from old.voided_at or new.acknowledged_at is distinct from old.acknowledged_at then
    raise exception 'Send / acknowledge / void stamps are written only by their RPCs' using errcode = '42501';
  end if;
  if old.status <> 'draft' then
    -- A sent / acknowledged / void transmittal is a record: only notes and metadata may still change.
    if new.is_deleted is distinct from old.is_deleted then raise exception 'A sent transmittal is never deleted; void it with a reason' using errcode = '42501'; end if;
    if row(new.subject, new.sent_to, new.recipient_company, new.recipient_email, new.purpose, new.direction, new.source_company, new.received_from, new.date_received, new.submittal_id, new.submittal_round_id)
       is distinct from row(old.subject, old.sent_to, old.recipient_company, old.recipient_email, old.purpose, old.direction, old.source_company, old.received_from, old.date_received, old.submittal_id, old.submittal_round_id) then
      raise exception 'Only notes may change on a transmittal that has been sent' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_transmittal_item_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_rpc boolean := coalesce(current_setting('steelbuild.transmittal_rpc', true), '') = '1'; v_parent public.drawing_transmittals%rowtype; v_row public.drawing_transmittal_items%rowtype;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select * into v_parent from public.drawing_transmittals where id = v_row.transmittal_id;
  if not found then raise exception 'Transmittal not found' using errcode = 'P0002'; end if;
  if not v_rpc and v_parent.status <> 'draft' then
    raise exception 'Items are frozen once a transmittal is sent (%)', v_parent.transmittal_number using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.project_id := v_parent.project_id;
  if new.drawing_id is not null and not exists (select 1 from public.drawings d where d.id = new.drawing_id and d.project_id = v_parent.project_id) then
    raise exception 'Sheet belongs to another project' using errcode = '23503';
  end if;
  if new.gc_drawing_id is not null and not exists (select 1 from public.gc_drawings g where g.id = new.gc_drawing_id and g.project_id = v_parent.project_id) then
    raise exception 'GC drawing belongs to another project' using errcode = '23503';
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_vendor_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'vendors rows are never hard-deleted; set is_deleted instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then if new.created_by is null then new.created_by := auth.uid(); end if; return new; end if;
  if old.org_id is not null and new.org_id is distinct from old.org_id then raise exception 'org_id is immutable' using errcode = '42501'; end if;
  if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_warranty_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'warranties are never hard-deleted; archive them instead' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
  else
    if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
    if new.is_deleted and not old.is_deleted then new.deleted_at := coalesce(new.deleted_at, now()); end if;
  end if;
  if new.expiration_date is null and new.start_date is not null and new.warranty_term_years is not null then
    new.expiration_date := (new.start_date + make_interval(days => round(new.warranty_term_years * 365.25)::int))::date;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_work_package_budget_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_item_project uuid;
begin
  if new.budget_hour_item_id is distinct from old.budget_hour_item_id then
    -- Header column: pm+ only (the M8 guard lists header columns explicitly, so this one guards itself).
    if auth.uid() is not null and not public.user_has_project_role_at_least(new.project_id, 'pm') then
      raise exception 'Only a project pm or above may point a work package at a budget line' using errcode = '42501';
    end if;
    if new.budget_hour_item_id is not null then
      select project_id into v_item_project from public.budget_hour_items where id = new.budget_hour_item_id and is_deleted = false;
      if v_item_project is null or v_item_project <> new.project_id then raise exception 'budget line must be a live line of the same project' using errcode = '23503'; end if;
    end if;
  end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.enforce_work_package_guards()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'Work packages are never deleted — soft-delete them' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then return new; end if;
  if new.project_id is distinct from old.project_id then raise exception 'project_id is immutable' using errcode = '42501'; end if;
  if new.wp_number is distinct from old.wp_number then raise exception 'wp_number is minted by create_work_package and never edited' using errcode = '42501'; end if;
  if not public.user_has_project_role_at_least(new.project_id, 'pm') then
    if row(new.name, new.description, new.phase, new.status, new.released_date, new.tonnage, new.shop_hours_budget, new.field_hours_budget, new.crew, new.drawing_ids, new.gc_drawing_ids, new.drawing_set_ids, new.rfi_ids,
           new.area, new.sequence_number, new.trade_phase, new.shipping_phase, new.install_phase, new.scheduled_start_date, new.scheduled_end_date, new.is_deleted, new.deleted_at, new.linked_drawing_ids, new.linked_rfi_ids)
       is distinct from
       row(old.name, old.description, old.phase, old.status, old.released_date, old.tonnage, old.shop_hours_budget, old.field_hours_budget, old.crew, old.drawing_ids, old.gc_drawing_ids, old.drawing_set_ids, old.rfi_ids,
           old.area, old.sequence_number, old.trade_phase, old.shipping_phase, old.install_phase, old.scheduled_start_date, old.scheduled_end_date, old.is_deleted, old.deleted_at, old.linked_drawing_ids, old.linked_rfi_ids) then
      raise exception 'Field access may only report progress on a work package (percent, flags, actual hours, notes)' using errcode = '42501';
    end if;
  end if;
  if new.vif_confirmed and not coalesce(old.vif_confirmed, false) then
    new.vif_confirmed_date := coalesce(new.vif_confirmed_date, current_date);
    new.vif_confirmed_by := coalesce(new.vif_confirmed_by, (select coalesce(nullif(btrim(up.full_name), ''), up.email) from public.user_profiles up where up.id = (select auth.uid())));
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.ensure_project_closeout(p_project_id uuid)
 RETURNS project_closeout
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_row public.project_closeout; v_prev text := coalesce(current_setting('steelbuild.closeout_rpc', true), '');
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Closeout needs a project manager' using errcode = '42501'; end if;
  select * into v_row from public.project_closeout where project_id = p_project_id and not is_deleted order by created_at limit 1;
  if found then return v_row; end if;
  perform set_config('steelbuild.closeout_rpc', 'on', true);
  insert into public.project_closeout (project_id, project_name, status)
    select p.id, p.name, 'In Progress' from public.projects p where p.id = p_project_id returning * into v_row;
  perform set_config('steelbuild.closeout_rpc', v_prev, true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.erase_my_account(p_confirm_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid()); v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  v_sole text[]; r record; v_cleared jsonb := '{}'::jsonb; v_blocking text[] := '{}'; v_n bigint;
  v_prev text := coalesce(current_setting('steelbuild.erasure_rpc', true), '');
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) <> v_email then raise exception 'Type your sign-in email exactly to confirm' using errcode = '23514'; end if;
  if not public.feature_flag_enabled_for('account_deletion', v_email) then
    raise exception 'Account deletion is not enabled for this account — contact support' using errcode = '42501';
  end if;
  -- The sole owner of an organization must transfer ownership or erase the organization first.
  select coalesce(array_agg(o.name order by o.name), '{}') into v_sole
    from public.organization_members m join public.organizations o on o.id = m.org_id
   where m.user_id = v_uid and m.role = 'owner'
     and not exists (select 1 from public.organization_members m2 where m2.org_id = m.org_id and m2.role = 'owner' and m2.user_id <> v_uid);
  if cardinality(v_sole) > 0 then
    raise exception 'SOLE_OWNER: transfer ownership of % before deleting your account', array_to_string(v_sole, ', ') using errcode = 'P0001';
  end if;

  -- Author references: nullable ones are cleared; a NOT NULL reference would block the auth delete, so refuse clearly.
  for r in
    select ch.relname as tbl, a.attname as col, a.attnotnull as notnull
      from pg_constraint con
      join pg_class ch on ch.oid = con.conrelid and ch.relnamespace = 'public'::regnamespace
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
     where con.contype = 'f' and con.confrelid = 'auth.users'::regclass and con.confdeltype in ('a', 'r')
       and ch.relname not in ('user_profiles', 'organization_members', 'user_projects')
  loop
    execute format('select count(*) from public.%I where %I = $1', r.tbl, r.col) into v_n using v_uid;
    if v_n = 0 then continue; end if;
    if r.notnull then v_blocking := v_blocking || (r.tbl || '.' || r.col); continue; end if;
    execute format('update public.%I set %I = null where %I = $1', r.tbl, r.col, r.col) using v_uid;
    v_cleared := v_cleared || jsonb_build_object(r.tbl || '.' || r.col, v_n);
  end loop;
  if cardinality(v_blocking) > 0 then
    raise exception 'Cannot erase: records still require this account as their author (%)', array_to_string(v_blocking, ', ') using errcode = 'P0001';
  end if;

  perform set_config('steelbuild.erasure_rpc', 'on', true);
  insert into public.data_erasure_log (kind, subject_user_id, subject_email, requested_by, requested_by_email, reason, row_counts)
    values ('account', v_uid, v_email, v_uid, v_email, 'Self-service account deletion (account_deletion flag)', jsonb_build_object('cleared_references', v_cleared, 'memberships', (select count(*) from public.organization_members where user_id = v_uid), 'project_roles', (select count(*) from public.user_projects where user_id = v_uid)));
  perform set_config('steelbuild.erasure_rpc', v_prev, true);

  delete from public.user_projects where user_id = v_uid;
  delete from public.organization_members where user_id = v_uid;
  delete from public.organization_invitations where lower(email) = v_email and status = 'pending';
  update public.user_profiles set email = 'erased+' || v_uid::text || '@erased.invalid', full_name = 'Erased user', avatar_url = null, metadata = '{}'::jsonb where id = v_uid;
  delete from auth.users where id = v_uid;
  return jsonb_build_object('erased', true, 'cleared_references', v_cleared);
end $function$


CREATE OR REPLACE FUNCTION public.erasure_toggle_user_triggers(p_tables text[], p_disable boolean, p_list text[] DEFAULT '{}'::text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rec record; v_out text[] := '{}'; x text;
begin
  if coalesce(current_setting('steelbuild.erasure_rpc', true), '') <> 'on' then
    raise exception 'erasure_toggle_user_triggers is internal to the erasure RPCs' using errcode = '42501';
  end if;
  -- ALTER TABLE refuses while deferred trigger events are pending in this transaction: flush them first.
  set constraints all immediate;
  if p_disable then
    for rec in
      select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relnamespace = 'public'::regnamespace and c.relname = any(p_tables) and not t.tgisinternal and t.tgenabled = 'O'
       order by c.relname, t.tgname
    loop
      execute format('alter table public.%I disable trigger %I', rec.relname, rec.tgname);
      v_out := v_out || (rec.relname || '|' || rec.tgname);
    end loop;
    return v_out;
  end if;
  foreach x in array p_list loop
    execute format('alter table public.%I enable trigger %I', split_part(x, '|', 1), split_part(x, '|', 2));
  end loop;
  return p_list;
end $function$


CREATE OR REPLACE FUNCTION public.erect_piece_lots_impl(p_project_id uuid, p_piece_ids uuid[], p_reference_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT "public"."transition_piece_lots_canonical"(
    p_project_id, p_piece_ids, 'delivered', 'erected', 'erected',
    coalesce(p_reference_data, '{}'::jsonb)
  );
$function$


CREATE OR REPLACE FUNCTION public.evaluate_fab_release_set(p_project_id uuid, p_drawing_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_set public.drawing_sets%rowtype; v_sub record; v_stage text; v_blockers jsonb := '[]'::jsonb;
  v_sheets uuid[]; v_names text[]; v_rfis text[]; v_hold_names text[]; v_super text[]; v_nofile text[];
begin
  if not public.user_has_project_access(p_project_id) then raise exception 'Not authorized for this project' using errcode = '42501'; end if;
  select * into v_set from public.drawing_sets where id = p_drawing_set_id and project_id = p_project_id and is_deleted = false;
  if not found then raise exception 'Drawing set not found in this project' using errcode = 'P0002'; end if;
  select coalesce(array_agg(d.id), '{}'::uuid[]), coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_sheets, v_names
    from public.drawings d where d.drawing_set_id = p_drawing_set_id and d.is_deleted = false;
  -- Governing submittal: the newest non-void submittal linked to this set (a resubmittal for a revision governs over an older release).
  select s.id, s.submittal_number, public.submittal_derived_stage(s.status, s.ball_in_court, s.approved_date) as stage into v_sub
    from public.submittals s where s.project_id = p_project_id and s.is_deleted = false and s.status <> 'Void' and p_drawing_set_id = any(coalesce(s.drawing_set_ids, '{}'::uuid[]))
   order by s.created_at desc limit 1;
  v_stage := coalesce(v_sub.stage, 'Not Started');
  if cardinality(v_sheets) = 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_sheets', 'title', 'The package has no sheets', 'sheet_numbers', '[]'::jsonb, 'rfi_numbers', '[]'::jsonb);
  end if;
  if v_sub.id is null then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_submittal', 'title', 'No submittal governs this package', 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb);
  elsif v_stage not in ('IFC', 'Released') then
    v_blockers := v_blockers || jsonb_build_object('kind', 'not_ifc', 'title', format('Governing submittal %s is at %s — fab release needs IFC or Released', v_sub.submittal_number, v_stage), 'sheet_numbers', to_jsonb(v_names), 'rfi_numbers', '[]'::jsonb, 'submittal_number', v_sub.submittal_number, 'stage', v_stage);
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_hold_names
    from public.drawing_holds h join public.drawings d on d.id = h.drawing_id
   where h.project_id = p_project_id and h.is_active = true and d.drawing_set_id = p_drawing_set_id and d.is_deleted = false;
  if cardinality(v_hold_names) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'active_holds', 'title', format('%s sheet(s) on hold', cardinality(v_hold_names)), 'sheet_numbers', to_jsonb(v_hold_names), 'rfi_numbers', '[]'::jsonb);
  end if;
  select coalesce(array_agg(distinct x.rfi_number order by x.rfi_number), '{}'::text[]) into v_rfis from (
    select r.rfi_number from public.rfis r
     where r.project_id = p_project_id and r.is_deleted = false and coalesce(r.status, 'Open') not in ('Answered', 'Closed', 'Void')
       and (r.drawing_set_id = p_drawing_set_id or r.drawing_id = any(v_sheets))
    union
    select b.rfi_number from public.fab_release_blocking_rfis(v_sheets) b
  ) x where x.rfi_number is not null;
  if cardinality(v_rfis) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'open_rfis', 'title', format('%s open RFI(s) reference this package', cardinality(v_rfis)), 'sheet_numbers', '[]'::jsonb, 'rfi_numbers', to_jsonb(v_rfis));
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_super from public.drawings d
   where d.drawing_set_id = p_drawing_set_id and d.is_deleted = false and d.is_superseded is true;
  if cardinality(v_super) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'superseded', 'title', format('%s sheet(s) superseded by a newer revision', cardinality(v_super)), 'sheet_numbers', to_jsonb(v_super), 'rfi_numbers', '[]'::jsonb);
  end if;
  select coalesce(array_agg(d.sheet_number order by d.sheet_number), '{}'::text[]) into v_nofile from public.drawings d
   where d.drawing_set_id = p_drawing_set_id and d.is_deleted = false and d.file_url is null;
  if cardinality(v_nofile) > 0 then
    v_blockers := v_blockers || jsonb_build_object('kind', 'no_file', 'title', format('%s sheet(s) have no PDF attached', cardinality(v_nofile)), 'sheet_numbers', to_jsonb(v_nofile), 'rfi_numbers', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', jsonb_array_length(v_blockers) = 0, 'drawing_set_id', p_drawing_set_id, 'set_name', v_set.set_name, 'sheet_count', cardinality(v_sheets),
    'sheet_ids', to_jsonb(v_sheets), 'governing_stage', v_stage, 'submittal_id', v_sub.id, 'submittal_number', v_sub.submittal_number,
    'blocking_rfi_numbers', to_jsonb(v_rfis), 'blockers', v_blockers, 'evaluated_at', now());
end;
$function$


CREATE OR REPLACE FUNCTION public.evaluate_project_closeout(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_row public.project_closeout; v_handoff_total int; v_handoff_open int; v_handoff_overdue int; v_punch_open int;
  v_warr_total int; v_warr_no_exp int; v_blockers text[] := '{}';
begin
  if not public.user_has_project_access(p_project_id) then raise exception 'Not authorized for this project' using errcode = '42501'; end if;
  select * into v_row from public.project_closeout where project_id = p_project_id and not is_deleted order by created_at limit 1;
  select count(*), count(*) filter (where status in ('Not Completed', 'In Progress')),
         count(*) filter (where status in ('Not Completed', 'In Progress') and date_required is not null and date_required < current_date)
    into v_handoff_total, v_handoff_open, v_handoff_overdue
    from public.project_handoff_items where project_id = p_project_id and not is_deleted;
  select count(*) into v_punch_open from public.punchlist_items where project_id = p_project_id and coalesce(is_deleted, false) = false and coalesce(status, 'Open') <> 'Completed';
  select count(*), count(*) filter (where expiration_date is null) into v_warr_total, v_warr_no_exp
    from public.warranties where project_id = p_project_id and not is_deleted and coalesce(is_active, true);
  if v_handoff_open > 0 then v_blockers := array_append(v_blockers, 'handoff_open'); end if;
  if v_punch_open > 0 then v_blockers := array_append(v_blockers, 'punch_open'); end if;
  if not coalesce(v_row.as_built_complete, false) then v_blockers := array_append(v_blockers, 'as_built_incomplete'); end if;
  if not coalesce(v_row.manuals_complete, false) then v_blockers := array_append(v_blockers, 'manuals_incomplete'); end if;
  if not coalesce(v_row.warranties_complete, false) then v_blockers := array_append(v_blockers, 'warranties_incomplete'); end if;
  if v_warr_no_exp > 0 then v_blockers := array_append(v_blockers, 'warranty_missing_expiration'); end if;
  return jsonb_build_object(
    'project_id', p_project_id, 'closeout_id', v_row.id, 'status', coalesce(v_row.status, 'Not Started'),
    'handoff_total', v_handoff_total, 'handoff_open', v_handoff_open, 'handoff_overdue', v_handoff_overdue,
    'punch_open', v_punch_open, 'warranties', v_warr_total, 'warranties_missing_expiration', v_warr_no_exp,
    'as_built_complete', coalesce(v_row.as_built_complete, false), 'manuals_complete', coalesce(v_row.manuals_complete, false),
    'warranties_complete', coalesce(v_row.warranties_complete, false), 'punchlist_complete', v_punch_open = 0,
    'blockers', to_jsonb(v_blockers), 'ready', cardinality(v_blockers) = 0, 'evaluated_at', now());
end $function$


CREATE OR REPLACE FUNCTION public.expense_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_to = 'Void' then p_from in ('Pending', 'Submitted', 'Rejected')
    when p_from = 'Pending' then p_to = 'Submitted'
    when p_from = 'Submitted' then p_to in ('Approved', 'Rejected', 'Pending')
    when p_from = 'Approved' then p_to in ('Paid', 'Rejected')
    when p_from = 'Rejected' then p_to = 'Submitted'
    else false end;
$function$


CREATE OR REPLACE FUNCTION public.expenses_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.cost_code_id is not null then perform public.refresh_cost_code_actual(old.cost_code_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and new.cost_code_id is not null and (tg_op = 'INSERT' or new.cost_code_id is distinct from old.cost_code_id) then perform public.refresh_cost_code_actual(new.cost_code_id); end if;
  return null;
end $function$


CREATE OR REPLACE FUNCTION public.fab_release_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'Fab release records are immutable (%)', tg_op using errcode = '42501';
end;
$function$


CREATE OR REPLACE FUNCTION public.feature_flag_enabled_for(p_key text, p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select case when f.user_overrides ? lower(btrim(coalesce(p_email, ''))) then (f.user_overrides ->> lower(btrim(coalesce(p_email, ''))))::boolean else f.enabled end
       from public.feature_flags f where f.flag_key = p_key),
    false);
$function$


CREATE OR REPLACE FUNCTION public.field_sync_op(p_project_id uuid, p_kind text, p_client_op_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_created boolean := false; v_wp uuid; v_pct numeric;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'field') then raise exception 'Not authorized to write field records for this project' using errcode = '42501'; end if;
  if p_client_op_id is null then raise exception 'client_op_id is required' using errcode = '22023'; end if;
  if p_kind = 'punch_create' then
    if coalesce(btrim(p_payload ->> 'description'), '') = '' then raise exception 'A punch item needs a description' using errcode = '23514'; end if;
    insert into public.punchlist_items (project_id, project_name, client_op_id, description, category, location, assigned_to, priority, status, target_completion_date, notes, drawing_id, work_package_id, phase, metadata)
    values (p_project_id, (select name from public.projects where id = p_project_id), p_client_op_id, btrim(p_payload ->> 'description'), nullif(p_payload ->> 'category', ''), nullif(p_payload ->> 'location', ''),
            nullif(p_payload ->> 'assigned_to', ''), coalesce(nullif(p_payload ->> 'priority', ''), 'Medium'), 'Open', nullif(p_payload ->> 'target_completion_date', '')::date, nullif(p_payload ->> 'notes', ''),
            nullif(p_payload ->> 'drawing_id', '')::uuid, nullif(p_payload ->> 'work_package_id', '')::uuid, nullif(p_payload ->> 'phase', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb))
    on conflict (client_op_id) where client_op_id is not null do nothing
    returning id into v_id;
    v_created := v_id is not null;
    if v_id is null then select id into v_id from public.punchlist_items where client_op_id = p_client_op_id; end if;
  elsif p_kind = 'photo_create' then
    if coalesce(btrim(p_payload ->> 'file_url'), '') = '' then raise exception 'A photo needs a file' using errcode = '23514'; end if;
    insert into public.photos (project_id, project_name, client_op_id, category, title, description, location, taken_date, file_url, file_name, daily_log_id, punchlist_item_id, work_package_id, metadata)
    values (p_project_id, (select name from public.projects where id = p_project_id), p_client_op_id, coalesce(nullif(p_payload ->> 'category', ''), 'Progress'), nullif(p_payload ->> 'title', ''), nullif(p_payload ->> 'description', ''),
            nullif(p_payload ->> 'location', ''), coalesce(nullif(p_payload ->> 'taken_date', '')::date, current_date), p_payload ->> 'file_url', nullif(p_payload ->> 'file_name', ''),
            nullif(p_payload ->> 'daily_log_id', '')::uuid, nullif(p_payload ->> 'punchlist_item_id', '')::uuid, nullif(p_payload ->> 'work_package_id', '')::uuid, coalesce(p_payload -> 'metadata', '{}'::jsonb))
    on conflict (client_op_id) where client_op_id is not null do nothing
    returning id into v_id;
    v_created := v_id is not null;
    if v_id is null then select id into v_id from public.photos where client_op_id = p_client_op_id; end if;
  elsif p_kind = 'daily_log_create' then
    insert into public.daily_logs (project_id, project_name, client_op_id, date, superintendent, crew_name, headcount, hours_worked, weather_description, temperature, activities, equipment_used, delays, delay_hours,
                                   safety_incidents, safety_notes, toolbox_talk_completed, status, materials_received, phase, metadata)
    values (p_project_id, (select name from public.projects where id = p_project_id), p_client_op_id, coalesce(nullif(p_payload ->> 'date', '')::date, current_date), nullif(p_payload ->> 'superintendent', ''),
            nullif(p_payload ->> 'crew_name', ''), nullif(p_payload ->> 'headcount', '')::int, nullif(p_payload ->> 'hours_worked', '')::numeric, nullif(p_payload ->> 'weather_description', ''), nullif(p_payload ->> 'temperature', ''),
            nullif(p_payload ->> 'activities', ''), nullif(p_payload ->> 'equipment_used', ''), nullif(p_payload ->> 'delays', ''), nullif(p_payload ->> 'delay_hours', '')::numeric,
            coalesce(nullif(p_payload ->> 'safety_incidents', '')::int, 0), nullif(p_payload ->> 'safety_notes', ''), coalesce((p_payload ->> 'toolbox_talk_completed')::boolean, false),
            coalesce(nullif(p_payload ->> 'status', ''), 'Draft'), nullif(p_payload ->> 'materials_received', ''), nullif(p_payload ->> 'phase', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb))
    on conflict (client_op_id) where client_op_id is not null do nothing
    returning id into v_id;
    v_created := v_id is not null;
    if v_id is null then select id into v_id from public.daily_logs where client_op_id = p_client_op_id; end if;
  elsif p_kind = 'wp_progress' then
    -- Absolute value → replaying is harmless. Field users may write progress columns (M8 guard).
    v_wp := (p_payload ->> 'work_package_id')::uuid;
    v_pct := greatest(0, least(100, coalesce((p_payload ->> 'percent_complete')::numeric, 0)));
    update public.work_packages set percent_complete = v_pct,
           shop_hours_actual = coalesce(nullif(p_payload ->> 'shop_hours_actual', '')::numeric, shop_hours_actual),
           field_hours_actual = coalesce(nullif(p_payload ->> 'field_hours_actual', '')::numeric, field_hours_actual),
           notes = coalesce(nullif(p_payload ->> 'notes', ''), notes)
     where id = v_wp and project_id = p_project_id and is_deleted = false;
    if not found then raise exception 'Work package % is not a live package of this project', v_wp using errcode = 'P0002'; end if;
    v_id := v_wp; v_created := true;
  else
    raise exception 'Unknown field op kind %', p_kind using errcode = '22023';
  end if;
  return jsonb_build_object('id', v_id, 'created', v_created, 'kind', p_kind, 'client_op_id', p_client_op_id);
end $function$


CREATE OR REPLACE FUNCTION public.generate_pay_application(p_project_id uuid, p_period_from date, p_period_to date, p_notes text DEFAULT NULL::text)
 RETURNS pay_applications
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_app public.pay_applications; v_proj public.projects%rowtype; v_sov_total numeric; v_n integer;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Not authorized to bill this project' using errcode = '42501'; end if;
  if p_period_from is null or p_period_to is null or p_period_to < p_period_from then raise exception 'A billing period needs a from and a to date, in order' using errcode = '23514'; end if;
  if exists (select 1 from public.pay_applications where project_id = p_project_id and is_deleted = false and status = 'draft') then raise exception 'Finish or void the open draft pay application first' using errcode = '22023'; end if;
  select * into v_proj from public.projects where id = p_project_id;
  select coalesce(sum(scheduled_value), 0) into v_sov_total from public.sov_items where project_id = p_project_id and is_deleted = false;
  v_seq := public.get_next_sequence_number(p_project_id, 'pay_application');
  perform set_config('steelbuild.payapp_rpc', 'on', true);
  insert into public.pay_applications (project_id, application_number, application_label, period_from, period_to, status, retainage_percent, original_contract_sum, net_change_orders, total_completed_stored, total_retainage, less_previous_certificates, current_payment_due, notes, sov_reconciles, metadata)
  values (p_project_id, v_seq, 'PA-' || lpad(v_seq::text, 3, '0'), p_period_from, p_period_to, 'draft', coalesce(v_proj.retainage_percent, 10), coalesce(v_proj.original_contract_value, 0), coalesce(v_proj.approved_change_total, 0), 0, 0, 0, 0, nullif(p_notes, ''),
          abs(v_sov_total - (coalesce(v_proj.original_contract_value, 0) + coalesce(v_proj.approved_change_total, 0))) < 0.5,
          jsonb_build_object('sov_total_at_generation', v_sov_total, 'generated_at', now()))
  returning * into v_app;
  v_n := public.build_pay_application_lines(v_app);
  perform public.refresh_pay_application_totals(v_app.id);
  perform set_config('steelbuild.payapp_rpc', 'off', true);
  select * into v_app from public.pay_applications where id = v_app.id;
  return v_app;
end $function$


CREATE OR REPLACE FUNCTION public.hard_delete_allowlist()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select array[
    'rfis', 'submittals', 'submittal_rounds',
    'drawings', 'drawing_sets', 'gc_drawings', 'gc_drawing_sets', 'drawing_transmittals',
    'change_orders', 'change_requests',
    'work_packages', 'pieces', 'deliveries', 'delivery_items', 'schedule_tasks', 'task_dependencies', 'look_ahead',
    'expenses', 'sov_items', 'cost_codes', 'pay_applications', 'backcharges', 'budget_hour_items',
    'inspections', 'quality_control_records', 'safety_incidents', 'punchlist_items', 'daily_logs', 'photos',
    'risks', 'mitigation_logs', 'pma_decisions', 'pma_assumptions',
    'warranties', 'project_handoff_items',
    'model_registry', 'model_elements',
    'documents', 'comments'
  ]::text[];
$function$


CREATE OR REPLACE FUNCTION public.hard_delete_merge_counts(a jsonb, b jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    (select jsonb_object_agg(k, s) from (
       select k, sum(v) as s from (
         select key as k, value::bigint as v from jsonb_each_text(coalesce(a, '{}'::jsonb))
         union all
         select key, value::bigint from jsonb_each_text(coalesce(b, '{}'::jsonb))
       ) u group by k) g),
    '{}'::jsonb);
$function$


CREATE OR REPLACE FUNCTION public.hard_delete_record(p_table text, p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return public.hard_delete_records(p_table, array[p_id], p_reason);
end $function$


CREATE OR REPLACE FUNCTION public.hard_delete_records(p_table text, p_ids uuid[], p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table text := lower(btrim(coalesce(p_table, '')));
  v_uid uuid := (select auth.uid());
  v_email text := (select auth.jwt() ->> 'email');
  v_prev text := coalesce(current_setting('steelbuild.erasure_rpc', true), '');
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) as x where x is not null);
  v_i int; v_row jsonb; v_project uuid;
  v_labels text[] := '{}'; v_projects uuid[] := '{}'; v_counts jsonb[] := '{}';
  v_family text[]; v_disabled text[] := '{}'; v_disabled_all text[] := '{}';
  v_dep jsonb; v_total jsonb := '{}'::jsonb; v_fallback boolean := false; v_first_error text;
  v_detail text; v_blocking text;
begin
  -- 1. Identity and input hygiene. The table name is matched EXACTLY against the fixed allowlist before it is ever
  --    interpolated; format(%I) is used everywhere after that. A name with anything but [a-z_] is refused outright.
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_table !~ '^[a-z_]+$' or not (v_table = any(public.hard_delete_allowlist())) then
    raise exception 'Rows in "%" cannot be hard-deleted through this path', coalesce(p_table, '') using errcode = '42501';
  end if;
  if cardinality(v_ids) = 0 then raise exception 'Nothing to delete' using errcode = '22023'; end if;
  if cardinality(v_ids) > 500 then raise exception 'Delete at most 500 rows per call (asked for %)', cardinality(v_ids) using errcode = '22023'; end if;

  -- 2. Per-row authorization. Resolve the owning project FROM THE ROW (delivery_items reach it through their
  --    delivery), then require project admin. A row we cannot place in a project is refused, never assumed.
  for v_i in 1 .. cardinality(v_ids) loop
    if v_table = 'delivery_items' then
      select to_jsonb(di), d.project_id into v_row, v_project
        from public.delivery_items di join public.deliveries d on d.id = di.delivery_id where di.id = v_ids[v_i];
    else
      execute format('select to_jsonb(t), t.project_id from public.%I t where t.id = $1', v_table) into v_row, v_project using v_ids[v_i];
    end if;
    if v_row is null then raise exception 'No % row with id %', v_table, v_ids[v_i] using errcode = 'P0002'; end if;
    if v_project is null then raise exception 'Row % in % has no project and cannot be authorized for deletion', v_ids[v_i], v_table using errcode = '42501'; end if;
    if not public.user_has_project_role_at_least(v_project, 'admin') then
      raise exception 'Only a project admin can permanently delete from %', v_table using errcode = '42501';
    end if;
    v_projects[v_i] := v_project;
    -- A human handle for the audit row: the record's official number / mark / name, whichever it carries.
    v_labels[v_i] := coalesce(
      v_row ->> 'rfi_number', v_row ->> 'submittal_number', v_row ->> 'co_number', v_row ->> 'cr_number', v_row ->> 'wp_number',
      v_row ->> 'delivery_number', v_row ->> 'transmittal_number', v_row ->> 'application_number', v_row ->> 'backcharge_number',
      v_row ->> 'risk_number', v_row ->> 'mitigation_number', v_row ->> 'decision_number', v_row ->> 'inspection_number',
      v_row ->> 'qc_number', v_row ->> 'incident_number', v_row ->> 'expense_number', v_row ->> 'line_item_number',
      v_row ->> 'sheet_number', v_row ->> 'drawing_number', v_row ->> 'set_name', v_row ->> 'piece_mark', v_row ->> 'assembly_mark',
      v_row ->> 'element_guid', v_row ->> 'task_name', v_row ->> 'file_name', v_row ->> 'code', v_row ->> 'warranty_type',
      v_row ->> 'name', v_row ->> 'title', left(v_row ->> 'description', 80), left(v_row ->> 'content', 80), left(v_row ->> 'question', 80),
      v_ids[v_i]::text);
  end loop;

  -- 3. The FK family: the table plus every table that references it, transitively (cascade, set-null and no-action
  --    alike), so a child's own BEFORE guard can never refuse the cascade / detach / dependent delete.
  with recursive fam(relname) as (
    select v_table collate "C"
    union
    select ch.relname::text from fam f
      join pg_class pr on pr.relname = f.relname and pr.relnamespace = 'public'::regnamespace
      join pg_constraint con on con.confrelid = pr.oid and con.contype = 'f'
      join pg_class ch on ch.oid = con.conrelid and ch.relnamespace = 'public'::regnamespace
  ) select array_agg(distinct relname) into v_family from fam;

  perform set_config('steelbuild.erasure_rpc', 'on', true);
  v_disabled := public.hard_delete_toggle_triggers(v_family, true, true);

  -- 4. Delete, dependents first, one record at a time so the audit row carries that record's own counts. A remaining
  --    multi-column / unforeseen reference is a readable sentence naming the blocking table, never a raw 23503. Any
  --    other refusal (an AFTER trigger of a module this path does not know) is retried once with every user trigger
  --    on the family off; the savepoint semantics of the block undo the first attempt completely.
  begin
    for v_i in 1 .. cardinality(v_ids) loop
      v_dep := public.hard_delete_release_dependents(v_table, array[v_ids[v_i]]);
      execute format('delete from public.%I where id = $1', v_table) using v_ids[v_i];
      v_counts[v_i] := jsonb_build_object(v_table, 1) || v_dep;
      v_total := public.hard_delete_merge_counts(v_total, v_dep);
    end loop;
  exception
    when foreign_key_violation then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_blocking := coalesce(substring(v_detail from 'referenced from table "([^"]+)"'), 'another table');
      raise exception 'DELETE_BLOCKED: % is still referenced from % — remove or reassign those rows first', v_table, v_blocking using errcode = 'P0001';
    when others then
      if sqlerrm like 'DELETE_BLOCKED:%' then raise; end if;
      v_fallback := true; v_first_error := sqlerrm;
  end;
  if v_fallback then
    v_counts := '{}'; v_total := '{}'::jsonb;
    v_disabled_all := public.hard_delete_toggle_triggers(v_family, true, false);
    begin
      for v_i in 1 .. cardinality(v_ids) loop
        v_dep := public.hard_delete_release_dependents(v_table, array[v_ids[v_i]]);
        execute format('delete from public.%I where id = $1', v_table) using v_ids[v_i];
        v_counts[v_i] := jsonb_build_object(v_table, 1) || v_dep;
        v_total := public.hard_delete_merge_counts(v_total, v_dep);
      end loop;
    exception
      when foreign_key_violation then
        get stacked diagnostics v_detail = pg_exception_detail;
        v_blocking := coalesce(substring(v_detail from 'referenced from table "([^"]+)"'), 'another table');
        raise exception 'DELETE_BLOCKED: % is still referenced from % — remove or reassign those rows first', v_table, v_blocking using errcode = 'P0001';
      when others then
        raise exception 'Delete from % failed: % (first attempt: %)', v_table, sqlerrm, v_first_error using errcode = 'P0001';
    end;
  end if;

  -- 5. Audit, one row per record, with everything that went with it. The log's own guard requires the flag.
  for v_i in 1 .. cardinality(v_ids) loop
    insert into public.data_erasure_log
      (kind, org_id, org_name, project_id, project_name, project_number, requested_by, requested_by_email, reason, row_counts, table_name, record_id, record_label)
    select 'record', p.org_id, o.name, p.id, p.name, p.project_number, v_uid, v_email, nullif(btrim(coalesce(p_reason, '')), ''),
           v_counts[v_i], v_table, v_ids[v_i], v_labels[v_i]
      from public.projects p left join public.organizations o on o.id = p.org_id where p.id = v_projects[v_i];
  end loop;

  -- 6. Every trigger back on, flag restored.
  perform public.hard_delete_toggle_triggers(v_family, false, true, v_disabled_all || v_disabled);
  perform set_config('steelbuild.erasure_rpc', v_prev, true);
  return jsonb_build_object('table', v_table, 'deleted', cardinality(v_ids), 'labels', to_jsonb(v_labels), 'project_ids', to_jsonb(v_projects),
                            'dependents', v_total, 'fallback', v_fallback);
end $function$


CREATE OR REPLACE FUNCTION public.hard_delete_release_dependents(p_table text, p_ids uuid[], p_depth integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fk record; v_n int; v_counts jsonb := '{}'::jsonb; v_child_ids uuid[]; v_key text;
begin
  if coalesce(current_setting('steelbuild.erasure_rpc', true), '') <> 'on' then
    raise exception 'hard_delete_release_dependents is internal to hard_delete_records' using errcode = '42501';
  end if;
  if p_depth > 5 then
    raise exception 'DELETE_BLOCKED: % has a dependency chain deeper than 5 levels', p_table using errcode = 'P0001';
  end if;
  if cardinality(coalesce(p_ids, '{}'::uuid[])) = 0 then return v_counts; end if;
  for fk in
    select ch.relname::text as child, a.attname::text as col, a.attnotnull as required,
           exists (select 1 from pg_attribute i where i.attrelid = ch.oid and i.attname = 'id' and i.attnum > 0 and not i.attisdropped) as has_id
      from pg_constraint con
      join pg_class pr on pr.oid = con.confrelid and pr.relnamespace = 'public'::regnamespace and pr.relname = p_table
      join pg_class ch on ch.oid = con.conrelid and ch.relnamespace = 'public'::regnamespace
      join pg_attribute a on a.attrelid = ch.oid and a.attnum = con.conkey[1]
     where con.contype = 'f' and con.confdeltype in ('a', 'r') and cardinality(con.conkey) = 1
     order by 1, 2
  loop
    if not fk.required then
      execute format('update public.%I set %I = null where %I = any($1)', fk.child, fk.col, fk.col) using p_ids;
      get diagnostics v_n = row_count;
      v_key := 'detached:' || fk.child || '.' || fk.col;
    else
      if fk.has_id then
        execute format('select array(select id from public.%I where %I = any($1))', fk.child, fk.col) into v_child_ids using p_ids;
        if cardinality(v_child_ids) > 0 then
          v_counts := public.hard_delete_merge_counts(v_counts, public.hard_delete_release_dependents(fk.child, v_child_ids, p_depth + 1));
        end if;
      end if;
      execute format('delete from public.%I where %I = any($1)', fk.child, fk.col) using p_ids;
      get diagnostics v_n = row_count;
      v_key := 'deleted:' || fk.child;
    end if;
    if v_n > 0 then v_counts := public.hard_delete_merge_counts(v_counts, jsonb_build_object(v_key, v_n)); end if;
  end loop;
  return v_counts;
end $function$


CREATE OR REPLACE FUNCTION public.hard_delete_toggle_triggers(p_tables text[], p_disable boolean, p_before_only boolean DEFAULT true, p_list text[] DEFAULT '{}'::text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rec record; v_out text[] := '{}'; x text;
begin
  if coalesce(current_setting('steelbuild.erasure_rpc', true), '') <> 'on' then
    raise exception 'hard_delete_toggle_triggers is internal to hard_delete_records' using errcode = '42501';
  end if;
  -- ALTER TABLE refuses while deferred trigger events are pending in this transaction: flush them first.
  set constraints all immediate;
  if p_disable then
    for rec in
      select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relnamespace = 'public'::regnamespace and c.relname = any(p_tables) and not t.tgisinternal and t.tgenabled = 'O'
         and (not p_before_only or (t.tgtype & 2) <> 0)
       order by c.relname, t.tgname
    loop
      execute format('alter table public.%I disable trigger %I', rec.relname, rec.tgname);
      v_out := v_out || (rec.relname || '|' || rec.tgname);
    end loop;
    return v_out;
  end if;
  foreach x in array coalesce(p_list, '{}'::text[]) loop
    execute format('alter table public.%I enable trigger %I', split_part(x, '|', 1), split_part(x, '|', 2));
  end loop;
  return coalesce(p_list, '{}'::text[]);
end $function$


CREATE OR REPLACE FUNCTION public.import_model_elements(p_model_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare m public.model_registry; r jsonb; v_ins int := 0; v_upd int := 0; v_guid text; v_mark text; n int := 0;
begin
  select * into m from public.model_registry where id = p_model_id and not is_deleted;
  if not found then raise exception 'Model not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(m.project_id, 'pm') then raise exception 'Importing model elements needs a project manager' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'At most 5000 rows per call' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_guid := nullif(btrim(coalesce(r ->> 'element_guid', '')), '');
    v_mark := nullif(btrim(coalesce(r ->> 'piece_mark', r ->> 'assembly_mark', '')), '');
    if v_guid is null or v_mark is null then continue; end if;
    n := n + 1;
    update public.model_elements
       set piece_mark = v_mark, assembly_mark = coalesce(nullif(r ->> 'assembly_mark', ''), assembly_mark), profile = coalesce(nullif(r ->> 'profile', ''), profile), material_grade = coalesce(nullif(r ->> 'material_grade', ''), material_grade),
           quantity = coalesce((r ->> 'quantity')::numeric, quantity), weight_kg = coalesce((r ->> 'weight_kg')::numeric, weight_kg), sequence_number = coalesce(nullif(r ->> 'sequence_number', ''), sequence_number),
           erection_area = coalesce(nullif(r ->> 'erection_area', ''), erection_area), drawing_no = coalesce(nullif(r ->> 'drawing_no', ''), drawing_no), metadata = metadata || coalesce(r -> 'metadata', '{}'::jsonb), is_deleted = false, deleted_at = null
     where model_id = p_model_id and element_guid = v_guid;
    if found then v_upd := v_upd + 1; else
      insert into public.model_elements (project_id, model_id, element_guid, piece_mark, assembly_mark, profile, material_grade, quantity, weight_kg, sequence_number, erection_area, drawing_no, source, metadata, fab_status)
        values (m.project_id, p_model_id, v_guid, v_mark, nullif(r ->> 'assembly_mark', ''), nullif(r ->> 'profile', ''), nullif(r ->> 'material_grade', ''), coalesce((r ->> 'quantity')::numeric, 1), (r ->> 'weight_kg')::numeric, nullif(r ->> 'sequence_number', ''), nullif(r ->> 'erection_area', ''), nullif(r ->> 'drawing_no', ''), 'ifc', coalesce(r -> 'metadata', '{}'::jsonb), 'not_started');
      v_ins := v_ins + 1;
    end if;
  end loop;
  update public.model_registry set element_count = (select count(*) from public.model_elements e where e.model_id = p_model_id and not e.is_deleted) where id = p_model_id;
  return jsonb_build_object('model_id', p_model_id, 'received', n, 'inserted', v_ins, 'updated', v_upd);
end $function$


CREATE OR REPLACE FUNCTION public.link_piece_drawing_set(p_project_id uuid, p_piece_id uuid, p_drawing_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_inserted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to link piece drawing sets in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pieces
    WHERE id = p_piece_id
      AND project_id = p_project_id
      AND deleted_at IS NULL
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Active piece not found in this project';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pieces
    WHERE parent_piece_id = p_piece_id
      AND deleted_at IS NULL
      AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Container pieces cannot be linked; link active leaf lots instead';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.drawing_sets
    WHERE id = p_drawing_set_id
      AND project_id = p_project_id
      AND is_deleted = false
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active drawing set not found in this project';
  END IF;

  INSERT INTO public.piece_drawing_sets (
    project_id, piece_id, drawing_set_id, created_by
  ) VALUES (
    p_project_id, p_piece_id, p_drawing_set_id, v_actor
  )
  ON CONFLICT (piece_id, drawing_set_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_linked',
      '{}'::jsonb,
      jsonb_build_object('drawing_set_id', p_drawing_set_id),
      'Drawing set linked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_set_id', p_drawing_set_id,
    'linked', v_inserted = 1,
    'unchanged', v_inserted = 0
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.log_backcharge_event(p_backcharge_id uuid, p_event_type text, p_from text, p_to text, p_detail text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_project uuid;
begin
  select project_id into v_project from public.backcharges where id = p_backcharge_id;
  perform set_config('steelbuild.bc_rpc', 'on', true);
  insert into public.backcharge_events (backcharge_id, project_id, event_type, from_status, to_status, detail, actor)
  values (p_backcharge_id, v_project, p_event_type, p_from, p_to, nullif(p_detail, ''), auth.uid());
end $function$


CREATE OR REPLACE FUNCTION public.log_fab_release_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.is_override then
    insert into public.fab_release_overrides (project_id, overridden_by, overridden_by_name, package_kind, package_name, drawing_count, blocking_rfi_numbers, reason, fab_release_log_id, drawing_set_id, submittal_id, blockers)
    values (new.project_id, new.released_by, new.released_by_name, new.package_kind, new.package_name, new.drawing_count, new.blocking_rfi_numbers, new.override_reason, new.id, new.drawing_set_id, new.submittal_id, new.blockers);
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.log_pma_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_action text; v_old jsonb := null; v_new jsonb; v_prev text := coalesce(current_setting('steelbuild.pma_audit', true), '');
  v_old_status text; v_new_status text; v_email text := coalesce((select auth.jwt() ->> 'email'), 'system');
begin
  v_new_status := to_jsonb(new) ->> 'status';
  if tg_op = 'INSERT' then
    v_action := 'created';
  else
    v_old_status := to_jsonb(old) ->> 'status';
    if (to_jsonb(new) ->> 'is_deleted') = 'true' and coalesce(to_jsonb(old) ->> 'is_deleted', 'false') <> 'true' then v_action := 'archived';
    elsif v_new_status is distinct from v_old_status then v_action := 'status_changed';
    else v_action := 'updated'; end if;
    v_old := jsonb_build_object('status', v_old_status, 'title', to_jsonb(old) ->> 'title');
  end if;
  v_new := jsonb_build_object('status', v_new_status, 'title', to_jsonb(new) ->> 'title', 'number', coalesce(to_jsonb(new) ->> 'risk_number', to_jsonb(new) ->> 'mitigation_number', to_jsonb(new) ->> 'decision_number'));
  perform set_config('steelbuild.pma_audit', 'on', true);
  insert into public.pma_audit_logs (project_id, entity_type, entity_id, action, changed_by, old_values, new_values, metadata)
    values (new.project_id, tg_table_name, new.id, v_action, v_email, v_old, v_new,
            case when coalesce(current_setting('steelbuild.pma_note', true), '') = '' then '{}'::jsonb else jsonb_build_object('note', current_setting('steelbuild.pma_note', true)) end);
  perform set_config('steelbuild.pma_audit', v_prev, true);
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.log_submittal_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_actor uuid;
begin
  begin v_actor := (select auth.uid()); exception when others then v_actor := null; end;
  if tg_op = 'INSERT' then
    insert into public.submittal_activity (project_id, submittal_id, event_type, to_value, actor_id, metadata)
    values (new.project_id, new.id, 'created', new.status, v_actor, jsonb_build_object('submittal_number', new.submittal_number, 'title', new.title, 'derived_stage', new.derived_stage));
    return new;
  end if;
  if new.is_deleted is distinct from old.is_deleted then
    insert into public.submittal_activity (project_id, submittal_id, event_type, from_value, to_value, actor_id)
    values (new.project_id, new.id, case when new.is_deleted then 'deleted' else 'restored' end, old.is_deleted::text, new.is_deleted::text, v_actor);
  end if;
  if new.status is distinct from old.status then
    insert into public.submittal_activity (project_id, submittal_id, event_type, from_value, to_value, actor_id)
    values (new.project_id, new.id, 'status_changed', old.status, new.status, v_actor);
  end if;
  if new.ball_in_court is distinct from old.ball_in_court then
    insert into public.submittal_activity (project_id, submittal_id, event_type, from_value, to_value, actor_id)
    values (new.project_id, new.id, 'bic_changed', old.ball_in_court, new.ball_in_court, v_actor);
  end if;
  if new.derived_stage is distinct from old.derived_stage then
    insert into public.submittal_activity (project_id, submittal_id, event_type, from_value, to_value, actor_id)
    values (new.project_id, new.id, 'stage_changed', old.derived_stage, new.derived_stage, v_actor);
  end if;
  if new.gate_override_reason is distinct from old.gate_override_reason and coalesce(btrim(new.gate_override_reason), '') <> '' then
    insert into public.submittal_activity (project_id, submittal_id, event_type, from_value, to_value, actor_id, metadata)
    values (new.project_id, new.id, 'gate_override', old.derived_stage, new.derived_stage, v_actor, jsonb_build_object('reason', new.gate_override_reason));
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.log_submittal_event(p_project_id uuid, p_submittal_id uuid, p_event text, p_from text, p_to text, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.user_has_project_access(p_project_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  insert into public.submittal_activity (project_id, submittal_id, event_type, from_value, to_value, actor_id, metadata)
  values (p_project_id, p_submittal_id, p_event, p_from, p_to, (select auth.uid()), coalesce(p_meta, '{}'::jsonb));
end;
$function$


CREATE OR REPLACE FUNCTION public.log_transmittal_event(p_project_id uuid, p_transmittal_id uuid, p_event text, p_from text, p_to text, p_reason text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.drawing_transmittal_activity (project_id, transmittal_id, event_type, actor_id, actor_name, from_status, to_status, reason, metadata)
  values (p_project_id, p_transmittal_id, p_event, (select auth.uid()),
          (select coalesce(nullif(btrim(up.full_name), ''), up.email) from public.user_profiles up where up.id = (select auth.uid())),
          p_from, p_to, nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_metadata, '{}'::jsonb));
end;
$function$


CREATE OR REPLACE FUNCTION public.meeting_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_from is null or p_from = p_to then true
    when p_from = 'Scheduled' then p_to in ('Held', 'Cancelled')
    when p_from = 'Cancelled' then p_to = 'Scheduled'
    else false
  end $function$


CREATE OR REPLACE FUNCTION public.model_fab_rollup(p_model_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare m public.model_registry; v_by jsonb; v_total int; v_linked int; v_kg numeric;
begin
  select * into m from public.model_registry where id = p_model_id;
  if not found then raise exception 'Model not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_access(m.project_id) then raise exception 'Not authorized for this project' using errcode = '42501'; end if;
  select count(*), count(*) filter (where piece_id is not null), coalesce(sum(coalesce(weight_kg, 0) * coalesce(quantity, 1)), 0) into v_total, v_linked, v_kg
    from public.model_elements where model_id = p_model_id and not is_deleted;
  select coalesce(jsonb_object_agg(coalesce(fab_status, 'unknown'), n), '{}'::jsonb) into v_by
    from (select fab_status, count(*) n from public.model_elements where model_id = p_model_id and not is_deleted group by fab_status) x;
  return jsonb_build_object('model_id', p_model_id, 'total', v_total, 'linked', v_linked, 'weight_kg', round(v_kg, 1), 'by_status', v_by);
end $function$


CREATE OR REPLACE FUNCTION public.move_backcharge(p_id uuid, p_status text, p_notes text DEFAULT NULL::text, p_actor text DEFAULT NULL::text, p_date date DEFAULT CURRENT_DATE, p_collected_amount numeric DEFAULT NULL::numeric)
 RETURNS backcharges
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_bc public.backcharges%rowtype; v_from text; v_actor text := coalesce(nullif(btrim(p_actor), ''), auth.jwt() ->> 'email', auth.uid()::text);
begin
  select * into v_bc from public.backcharges where id = p_id and is_deleted = false for update;
  if v_bc.id is null then raise exception 'Backcharge not found' using errcode = 'P0002'; end if;
  v_from := v_bc.status;
  if not public.user_has_project_role_at_least(v_bc.project_id, 'pm') then raise exception 'Not authorized to move backcharges for this project' using errcode = '42501'; end if;
  if not public.backcharge_transition_allowed(v_bc.status, p_status) then raise exception 'Backcharge cannot move from % to %', v_bc.status, p_status using errcode = 'P0001'; end if;
  if p_status in ('rejected', 'void', 'disputed') and coalesce(btrim(p_notes), '') = '' then raise exception '% needs a written reason', p_status using errcode = '23514'; end if;
  if p_status = 'approved' and v_bc.amount <= 0 then raise exception 'A backcharge needs an amount (typed or from T&M tickets) before approval' using errcode = '22023'; end if;
  perform set_config('steelbuild.bc_rpc', 'on', true);
  update public.backcharges
     set status = p_status,
         notice_date = case when p_status = 'notice_sent' then coalesce(p_date, current_date) else notice_date end,
         approved_at = case when p_status = 'approved' then coalesce(p_date, current_date) else approved_at end,
         approved_by = case when p_status = 'approved' then v_actor else approved_by end,
         collected_at = case when p_status = 'collected' then coalesce(p_date, current_date) else collected_at end,
         collected_amount = case when p_status = 'collected' then coalesce(p_collected_amount, amount) else collected_amount end,
         void_reason = case when p_status = 'void' then btrim(p_notes) else void_reason end,
         decision_notes = case when p_status in ('rejected', 'disputed') then btrim(p_notes) else decision_notes end
   where id = v_bc.id returning * into v_bc;
  perform public.log_backcharge_event(v_bc.id, 'status_changed', v_from, p_status, coalesce(nullif(btrim(p_notes), ''), case when p_status = 'collected' then 'Collected ' || to_char(v_bc.collected_amount, 'FM999,999,990.00') else null end));
  perform set_config('steelbuild.bc_rpc', 'off', true);
  return v_bc;
end $function$


CREATE OR REPLACE FUNCTION public.move_change_order(p_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS change_orders
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_co public.change_orders%rowtype; v_line public.sov_items%rowtype;
begin
  select * into v_co from public.change_orders where id = p_id and is_deleted = false for update;
  if v_co.id is null then raise exception 'Change order not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_co.project_id, 'pm') then raise exception 'Not authorized to move change orders for this project' using errcode = '42501'; end if;
  if p_status = 'Approved' then raise exception 'Use approve_change_order() to approve' using errcode = '22023'; end if;
  if not public.change_order_transition_allowed(v_co.status, p_status) then raise exception 'Change order cannot move from % to %', v_co.status, p_status using errcode = 'P0001'; end if;
  if p_status in ('Rejected', 'Void') and coalesce(btrim(p_notes), '') = '' then raise exception '% needs a written reason', p_status using errcode = '23514'; end if;
  perform set_config('steelbuild.co_rpc', 'on', true);
  perform set_config('steelbuild.cost_rpc', 'on', true);
  if v_co.status = 'Approved' and p_status = 'Void' then
    -- Reverse the SOV effect of the approval.
    if v_co.sov_mode = 'new_line' and v_co.sov_line_item_id is not null then
      update public.sov_items set is_deleted = true where id = v_co.sov_line_item_id and change_order_id = v_co.id;
    elsif v_co.sov_mode = 'adjust_line' and v_co.sov_line_item_id is not null then
      select * into v_line from public.sov_items where id = v_co.sov_line_item_id and is_deleted = false for update;
      if v_line.id is not null then
        if coalesce(v_line.scheduled_value, 0) - v_co.co_amount < 0 then raise exception 'Reversing this change order would take SOV line % below zero', v_line.line_item_number using errcode = '23514'; end if;
        update public.sov_items set scheduled_value = coalesce(scheduled_value, 0) - v_co.co_amount where id = v_line.id;
      end if;
    end if;
  end if;
  update public.change_orders
     set status = p_status,
         submitted_date = case when p_status = 'Submitted' then coalesce(submitted_date, current_date) else submitted_date end,
         submitted_by = case when p_status = 'Submitted' then coalesce(submitted_by, auth.jwt() ->> 'email', auth.uid()::text) else submitted_by end,
         decision_notes = case when p_status = 'Rejected' then btrim(p_notes) when coalesce(btrim(p_notes), '') <> '' and p_status <> 'Void' then btrim(p_notes) else decision_notes end,
         void_reason = case when p_status = 'Void' then btrim(p_notes) else void_reason end
   where id = v_co.id returning * into v_co;
  if v_co.status = 'Void' then perform public.refresh_project_change_total(v_co.project_id); end if;
  perform set_config('steelbuild.co_rpc', 'off', true);
  perform set_config('steelbuild.cost_rpc', 'off', true);
  return v_co;
end $function$


CREATE OR REPLACE FUNCTION public.move_expense(p_id uuid, p_status text, p_notes text DEFAULT NULL::text, p_actor text DEFAULT NULL::text, p_date date DEFAULT CURRENT_DATE)
 RETURNS expenses
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_e public.expenses%rowtype; v_actor text := coalesce(nullif(btrim(p_actor), ''), auth.jwt() ->> 'email', auth.uid()::text);
begin
  select * into v_e from public.expenses where id = p_id and is_deleted = false for update;
  if v_e.id is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_e.project_id, 'field') then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_status in ('Approved', 'Paid', 'Rejected') and not public.user_has_project_role_at_least(v_e.project_id, 'pm') then raise exception 'Approving, paying or rejecting an expense needs pm+' using errcode = '42501'; end if;
  if not public.expense_transition_allowed(v_e.payment_status, p_status) then raise exception 'Expense cannot move from % to %', v_e.payment_status, p_status using errcode = 'P0001'; end if;
  if p_status in ('Rejected', 'Void') and coalesce(btrim(p_notes), '') = '' then raise exception '% needs a written reason', p_status using errcode = '23514'; end if;
  if p_status = 'Approved' and v_e.amount <= 0 then raise exception 'An expense needs an amount before approval' using errcode = '22023'; end if;
  perform set_config('steelbuild.expense_rpc', 'on', true);
  update public.expenses
     set payment_status = p_status,
         submitted_date = case when p_status = 'Submitted' then coalesce(p_date, current_date) when p_status = 'Pending' then null else submitted_date end,
         approved_by = case when p_status = 'Approved' then v_actor else approved_by end,
         approved_date = case when p_status = 'Approved' then coalesce(p_date, current_date) else approved_date end,
         paid_by = case when p_status = 'Paid' then v_actor else paid_by end,
         payment_date = case when p_status = 'Paid' then coalesce(p_date, current_date) else payment_date end,
         void_reason = case when p_status = 'Void' then btrim(p_notes) else void_reason end,
         decision_notes = case when p_status = 'Rejected' then btrim(p_notes) when coalesce(btrim(p_notes), '') <> '' and p_status <> 'Void' then btrim(p_notes) else decision_notes end
   where id = v_e.id returning * into v_e;
  if v_e.cost_code_id is not null then perform public.refresh_cost_code_actual(v_e.cost_code_id); end if;
  perform set_config('steelbuild.expense_rpc', 'off', true);
  return v_e;
end $function$


CREATE OR REPLACE FUNCTION public.move_pay_application(p_id uuid, p_status text, p_notes text DEFAULT NULL::text, p_actor text DEFAULT NULL::text, p_date date DEFAULT CURRENT_DATE)
 RETURNS pay_applications
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_app public.pay_applications%rowtype; v_actor text := coalesce(nullif(btrim(p_actor), ''), auth.jwt() ->> 'email', auth.uid()::text);
begin
  select * into v_app from public.pay_applications where id = p_id and is_deleted = false for update;
  if v_app.id is null then raise exception 'Pay application not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_app.project_id, 'pm') then raise exception 'Not authorized to bill this project' using errcode = '42501'; end if;
  if not public.pay_application_transition_allowed(v_app.status, p_status) then raise exception 'Pay application cannot move from % to %', v_app.status, p_status using errcode = 'P0001'; end if;
  if p_status = 'void' and coalesce(btrim(p_notes), '') = '' then raise exception 'Voiding needs a written reason' using errcode = '23514'; end if;
  if p_status = 'submitted' and not exists (select 1 from public.pay_application_lines where pay_application_id = v_app.id) then raise exception 'A pay application needs G703 lines before it is submitted' using errcode = '22023'; end if;
  perform set_config('steelbuild.payapp_rpc', 'on', true);
  perform set_config('steelbuild.cost_rpc', 'on', true);
  if p_status = 'approved' then
    -- Certify: the SOV's "previous" becomes this application's cumulative; lines go Certified.
    update public.sov_items s
       set previous_percent_complete = round(l.percent_complete, 3), current_percent_complete = greatest(coalesce(s.current_percent_complete, 0), round(l.percent_complete, 3)), status = case when s.status = 'Paid' then 'Paid' else 'Certified' end
      from public.pay_application_lines l where l.pay_application_id = v_app.id and l.sov_item_id = s.id;
  elsif p_status = 'paid' then
    update public.sov_items s set status = 'Paid', payment_received_date = p_date from public.pay_application_lines l where l.pay_application_id = v_app.id and l.sov_item_id = s.id;
  end if;
  update public.pay_applications
     set status = p_status,
         submitted_date = case when p_status = 'submitted' then coalesce(p_date, current_date) when p_status = 'draft' then null else submitted_date end,
         submitted_by = case when p_status = 'submitted' then v_actor when p_status = 'draft' then null else submitted_by end,
         certified_date = case when p_status = 'approved' then coalesce(p_date, current_date) else certified_date end,
         approved_by = case when p_status = 'approved' then v_actor else approved_by end,
         paid_date = case when p_status = 'paid' then coalesce(p_date, current_date) else paid_date end,
         void_reason = case when p_status = 'void' then btrim(p_notes) else void_reason end,
         notes = case when coalesce(btrim(p_notes), '') <> '' and p_status <> 'void' then concat_ws(E'\n', nullif(notes, ''), btrim(p_notes)) else notes end
   where id = v_app.id returning * into v_app;
  -- Later apps' "less previous certificates" depend on this one.
  perform public.refresh_pay_application_totals(a.id) from public.pay_applications a where a.project_id = v_app.project_id and a.is_deleted = false and a.application_number > v_app.application_number and a.status = 'draft';
  perform set_config('steelbuild.payapp_rpc', 'off', true);
  perform set_config('steelbuild.cost_rpc', 'off', true);
  return v_app;
end $function$


CREATE OR REPLACE FUNCTION public.move_risk(p_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS risks
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_row public.risks; v_prev text := coalesce(current_setting('steelbuild.risk_rpc', true), ''); v_note_prev text := coalesce(current_setting('steelbuild.pma_note', true), '');
begin
  select * into v_row from public.risks where id = p_id;
  if v_row.id is null then raise exception 'Risk % not found', p_id using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_row.project_id, 'field') then raise exception 'Field access or higher is required' using errcode = '42501'; end if;
  if (p_status = 'Closed' or v_row.status = 'Closed') and not public.user_has_project_role_at_least(v_row.project_id, 'pm') then
    raise exception 'Closing or reopening a risk needs a project manager' using errcode = '42501';
  end if;
  if not public.risk_transition_allowed(v_row.status, p_status) then raise exception 'Risk cannot move from % to %', v_row.status, p_status using errcode = 'P0001'; end if;
  perform set_config('steelbuild.risk_rpc', 'on', true);
  perform set_config('steelbuild.pma_note', coalesce(btrim(p_notes), ''), true);
  update public.risks
     set status = p_status,
         notes = case when coalesce(btrim(p_notes), '') = '' then notes else concat_ws(E'\n', nullif(notes, ''), to_char(now(), 'YYYY-MM-DD') || ' ' || p_status || ': ' || btrim(p_notes)) end
   where id = p_id returning * into v_row;
  perform set_config('steelbuild.risk_rpc', v_prev, true);
  perform set_config('steelbuild.pma_note', v_note_prev, true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.note_backcharge(p_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_bc public.backcharges%rowtype;
begin
  select * into v_bc from public.backcharges where id = p_id and is_deleted = false;
  if v_bc.id is null then raise exception 'Backcharge not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_bc.project_id, 'pm') then raise exception 'Not authorized' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'note is required' using errcode = '23514'; end if;
  perform public.log_backcharge_event(v_bc.id, 'note', v_bc.status, v_bc.status, btrim(p_note));
  perform set_config('steelbuild.bc_rpc', 'off', true);
end $function$


CREATE OR REPLACE FUNCTION public.ops_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  if not public.user_is_system_admin() then raise exception 'Only a system administrator can read the ops snapshot' using errcode = '42501'; end if;
  select jsonb_build_object(
    'generated_at', now(),
    'client', jsonb_build_object(
      'errors_24h', (select count(*) from public.client_events where kind <> 'info' and kind <> 'perf' and occurred_at > now() - interval '24 hours'),
      'errors_7d', (select count(*) from public.client_events where kind <> 'info' and kind <> 'perf' and occurred_at > now() - interval '7 days'),
      'users_affected_24h', (select count(distinct user_id) from public.client_events where kind <> 'info' and kind <> 'perf' and occurred_at > now() - interval '24 hours'),
      'top_24h', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'message', message, 'count', n, 'last_at', last_at) order by n desc, last_at desc)
                           from (select kind, left(message, 160) as message, count(*) n, max(occurred_at) last_at from public.client_events
                                  where kind not in ('info', 'perf') and occurred_at > now() - interval '24 hours' group by kind, left(message, 160) order by n desc limit 8) t), '[]'::jsonb),
      'latest', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'occurred_at', occurred_at, 'kind', kind, 'message', left(message, 200), 'route', route, 'source', source, 'app_version', app_version) order by occurred_at desc)
                          from (select * from public.client_events order by occurred_at desc limit 25) t), '[]'::jsonb)
    ),
    'llm', jsonb_build_object(
      'calls_24h', (select count(*) from public.llm_telemetry where occurred_at > now() - interval '24 hours'),
      'cost_24h', (select coalesce(round(sum(cost_usd), 4), 0) from public.llm_telemetry where occurred_at > now() - interval '24 hours'),
      'failures_24h', (select count(*) from public.llm_telemetry where success = false and occurred_at > now() - interval '24 hours'),
      'avg_latency_ms_24h', (select coalesce(round(avg(latency_ms)), 0) from public.llm_telemetry where occurred_at > now() - interval '24 hours'),
      'cost_30d', (select coalesce(round(sum(cost_usd), 2), 0) from public.llm_telemetry where occurred_at > now() - interval '30 days'),
      'last_call_at', (select max(occurred_at) from public.llm_telemetry),
      'by_use_case_7d', coalesce((select jsonb_agg(jsonb_build_object('use_case', use_case, 'calls', n, 'cost', c, 'failures', f) order by n desc)
                                  from (select coalesce(use_case, 'unknown') use_case, count(*) n, round(coalesce(sum(cost_usd), 0), 4) c, count(*) filter (where success = false) f
                                          from public.llm_telemetry where occurred_at > now() - interval '7 days' group by 1 order by n desc limit 10) t), '[]'::jsonb)
    ),
    'billing', jsonb_build_object(
      'events_24h', (select count(*) from public.billing_events where created_at > now() - interval '24 hours'),
      'last_event_at', (select max(created_at) from public.billing_events),
      'paid_orgs', (select count(*) from public.organizations where plan in ('pro', 'business')),
      'attention', (select count(*) from public.organizations where subscription_status in ('past_due', 'unpaid', 'incomplete'))
    ),
    'data', jsonb_build_object(
      'exports_30d', (select count(*) from public.activities where action = 'exported' and created_at > now() - interval '30 days'),
      'erasures_30d', (select count(*) from public.data_erasure_log where created_at > now() - interval '30 days'),
      'flags_off', (select count(*) from public.feature_flags where enabled = false),
      'alerts_open', (select count(*) from public.alerts where coalesce(is_dismissed, false) = false)
    ),
    'tenancy', jsonb_build_object(
      'organizations', (select count(*) from public.organizations),
      'projects_live', (select count(*) from public.projects where coalesce(is_deleted, false) = false),
      'members', (select count(*) from public.organization_members),
      'users', (select count(*) from auth.users)
    ),
    'sentry_configured', coalesce((select nullif(value ->> 'dsn', '') is not null from public.runtime_config where key = 'sentry'), false)
  ) into v;
  return v;
end $function$


CREATE OR REPLACE FUNCTION public.org_plan_usage(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org record; v_limits jsonb; v_members int; v_projects int; v_pending int;
begin
  if p_org_id is null or not public.user_is_org_member(p_org_id) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
  end if;
  select id, name, plan, subscription_status, current_period_end, stripe_customer_id is not null as has_billing_account,
         stripe_subscription_id is not null as has_subscription
    into v_org from public.organizations where id = p_org_id;
  v_limits := public.plan_limits(v_org.plan);
  select count(*) into v_members from public.organization_members where org_id = p_org_id;
  select count(*) into v_projects from public.projects where org_id = p_org_id and coalesce(is_deleted, false) = false;
  select count(*) into v_pending from public.organization_invitations where org_id = p_org_id and status = 'pending' and expires_at > now();
  return jsonb_build_object(
    'org_id', v_org.id,
    'plan', v_org.plan,
    'subscription_status', v_org.subscription_status,
    'current_period_end', v_org.current_period_end,
    'has_billing_account', v_org.has_billing_account,
    'has_subscription', v_org.has_subscription,
    'members_used', v_members,
    'members_limit', v_limits -> 'members',
    'pending_invitations', v_pending,
    'projects_used', v_projects,
    'projects_limit', v_limits -> 'projects'
  );
end $function$


CREATE OR REPLACE FUNCTION public.org_portfolio_snapshot(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_rows jsonb; v_today date := current_date;
begin
  if not public.user_org_role_at_least(p_org_id, 'member') then raise exception 'Not a member of this organization' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.project_number nulls last, x.name), '[]'::jsonb) into v_rows from (
    select p.id, p.project_number, p.name, p.phase, p.health_status, p.general_contractor, p.target_completion_date, p.forecast_completion_date, p.on_hold,
      p.original_contract_value, p.adjusted_contract_value, p.approved_change_total,
      (select count(*) from public.rfis r where r.project_id = p.id and coalesce(r.is_deleted, false) = false and r.status in ('Open', 'Under Review', 'Incomplete Response')) as open_rfis,
      (select count(*) from public.rfis r where r.project_id = p.id and coalesce(r.is_deleted, false) = false and r.status in ('Open', 'Under Review', 'Incomplete Response') and r.date_required is not null and r.date_required < v_today) as overdue_rfis,
      (select count(*) from public.submittals s where s.project_id = p.id and coalesce(s.is_deleted, false) = false and coalesce(s.status, '') not in ('Released for Fabrication', 'Void')) as open_submittals,
      (select count(*) from public.submittals s where s.project_id = p.id and coalesce(s.is_deleted, false) = false and s.status = 'Released for Fabrication') as released_submittals,
      (select count(*) from public.drawing_holds h where h.project_id = p.id and h.is_active) as active_holds,
      (select count(*) from public.work_packages w where w.project_id = p.id and coalesce(w.is_deleted, false) = false) as work_packages,
      (select round(avg(coalesce(w.percent_complete, 0))::numeric, 1) from public.work_packages w where w.project_id = p.id and coalesce(w.is_deleted, false) = false) as wp_avg_percent,
      (select coalesce(sum(coalesce(w.tonnage, 0)), 0) from public.work_packages w where w.project_id = p.id and coalesce(w.is_deleted, false) = false) as tonnage,
      (select count(*) from public.pieces pc where pc.project_id = p.id and pc.is_deleted = false and coalesce(pc.is_container, false) = false and not exists (select 1 from public.pieces c where c.parent_piece_id = pc.id and c.is_deleted = false)) as piece_lots,
      (select count(*) from public.pieces pc where pc.project_id = p.id and pc.is_deleted = false and coalesce(pc.is_container, false) = false and not exists (select 1 from public.pieces c where c.parent_piece_id = pc.id and c.is_deleted = false) and pc.lifecycle_status in ('fabricated', 'shipped', 'delivered', 'erected')) as piece_lots_fabricated,
      (select count(*) from public.punchlist_items pi where pi.project_id = p.id and coalesce(pi.is_deleted, false) = false and coalesce(pi.status, 'Open') <> 'Completed') as open_punch,
      (select count(*) from public.risks rk where rk.project_id = p.id and coalesce(rk.is_deleted, false) = false and coalesce(rk.status, 'Open') <> 'Closed' and rk.severity in ('High', 'Critical')) as high_risks,
      (select jsonb_build_object('number', pa.application_number, 'status', pa.status, 'due', pa.current_payment_due, 'period_to', pa.period_to) from public.pay_applications pa where pa.project_id = p.id and coalesce(pa.is_deleted, false) = false order by pa.application_number desc limit 1) as latest_pay_app,
      (select c.status from public.project_closeout c where c.project_id = p.id and not c.is_deleted order by c.created_at limit 1) as closeout_status,
      (select round(100.0 * count(*) filter (where h.status in ('Completed', 'Not Applicable')) / nullif(count(*), 0)) from public.project_handoff_items h where h.project_id = p.id and not h.is_deleted) as handoff_percent
    from public.projects p where p.org_id = p_org_id and coalesce(p.is_deleted, false) = false) x;
  return jsonb_build_object('org_id', p_org_id, 'generated_at', now(), 'projects', v_rows);
end $function$


CREATE OR REPLACE FUNCTION public.pay_application_lines_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.refresh_pay_application_totals(coalesce(new.pay_application_id, old.pay_application_id));
  return null;
end $function$


CREATE OR REPLACE FUNCTION public.pay_application_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_to = 'void' then p_from in ('draft', 'submitted', 'approved')
    when p_from = 'draft' then p_to = 'submitted'
    when p_from = 'submitted' then p_to in ('approved', 'draft')
    when p_from = 'approved' then p_to = 'paid'
    else false end;
$function$


CREATE OR REPLACE FUNCTION public.place_drawing_hold(p_drawing_id uuid, p_reason text)
 RETURNS drawing_holds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_sheet public.drawings%rowtype;
  v_hold public.drawing_holds%rowtype;
  v_name text;
begin
  if v_actor is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_sheet from public.drawings where id = p_drawing_id and coalesce(is_deleted, false) = false;
  if not found then raise exception 'Sheet not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_sheet.project_id, 'field') then
    raise exception 'Not authorized to place holds on this project' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A hold needs a reason' using errcode = '23514';
  end if;
  if exists (select 1 from public.drawing_holds h where h.drawing_id = p_drawing_id and h.is_active) then
    raise exception 'This sheet is already on hold' using errcode = '23505';
  end if;
  select coalesce(nullif(btrim(up.full_name), ''), up.email) into v_name from public.user_profiles up where up.id = v_actor;
  insert into public.drawing_holds (project_id, drawing_id, reason, prior_stage, placed_by_id, placed_by_name)
  values (v_sheet.project_id, p_drawing_id, btrim(p_reason), v_sheet.stage, v_actor, v_name)
  returning * into v_hold;
  insert into public.drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id, metadata)
  values (v_sheet.project_id, p_drawing_id, 'hold_placed', v_sheet.stage, 'On Hold', v_actor, jsonb_build_object('hold_id', v_hold.id, 'reason', v_hold.reason));
  return v_hold;
end;
$function$


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
$function$


CREATE OR REPLACE FUNCTION public.prepare_action_item_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.title is null or length(btrim(new.title)) = 0 then raise exception 'An action item needs a title' using errcode = '23514'; end if;
  new.title := btrim(new.title);
  if new.action_number is null or btrim(new.action_number) = '' then
    new.action_number := 'AI-' || lpad(public.get_next_sequence_number(new.project_id, 'action_item')::text, 3, '0');
  elsif auth.role() = 'authenticated' then
    raise exception 'action_number is minted by the database' using errcode = '42501';
  end if;
  new.status := coalesce(new.status, 'Open');
  new.priority := coalesce(new.priority, 'Medium');
  new.category := coalesce(nullif(btrim(new.category), ''), 'GENERAL');
  if new.meeting_id is not null then
    if not exists (select 1 from public.meetings m where m.id = new.meeting_id and m.project_id = new.project_id) then
      raise exception 'The meeting belongs to another project' using errcode = '23503';
    end if;
    new.source_entity_type := coalesce(new.source_entity_type, 'meeting');
    new.source_entity_id := coalesce(new.source_entity_id, new.meeting_id);
  end if;
  if new.work_package_id is not null and not exists (select 1 from public.work_packages w where w.id = new.work_package_id and w.project_id = new.project_id) then
    raise exception 'The work package belongs to another project' using errcode = '23503';
  end if;
  if new.status in ('Complete', 'Resolved', 'Closed') then new.completed_by := coalesce(new.completed_by, (select auth.uid())); else new.completed_by := null; end if;
  if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
  new.is_deleted := false; new.deleted_at := null;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.prepare_document_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.title := nullif(btrim(coalesce(new.title, '')), '');
  new.file_name := nullif(btrim(coalesce(new.file_name, '')), '');
  if new.title is null and new.file_name is null then raise exception 'A document needs a title or a file name' using errcode = '23514'; end if;
  new.display_name := coalesce(new.title, new.file_name);
  if new.document_number is null or btrim(new.document_number) = '' then
    new.document_number := 'DOC-' || lpad(public.get_next_sequence_number(new.project_id, 'document')::text, 3, '0');
  elsif auth.role() = 'authenticated' and coalesce(current_setting('steelbuild.doc_rpc', true), '') <> 'on' then
    raise exception 'document_number is minted by the database' using errcode = '42501';
  end if;
  new.status := coalesce(nullif(btrim(new.status), ''), 'Current');
  new.category := coalesce(nullif(btrim(new.category), ''), 'Other');
  new.discipline := coalesce(nullif(btrim(new.discipline), ''), 'General');
  new.revision_number := coalesce(nullif(btrim(new.revision_number), ''), '0');
  new.import_source := coalesce(new.import_source, 'upload');
  new.is_current := coalesce(new.is_current, true);
  new.uploaded_date := coalesce(new.uploaded_date, now());
  if new.status in ('Superseded') and coalesce(current_setting('steelbuild.doc_rpc', true), '') <> 'on' then
    raise exception 'Superseded is set only by supersede_document()' using errcode = '42501';
  end if;
  if new.folder_id is not null and not exists (select 1 from public.document_folders f where f.id = new.folder_id and f.project_id = new.project_id and f.is_deleted = false) then
    raise exception 'The folder must be a live folder of the same project' using errcode = '23503';
  end if;
  if new.rfi_id is not null and not exists (select 1 from public.rfis r where r.id = new.rfi_id and r.project_id = new.project_id) then
    raise exception 'The RFI belongs to another project' using errcode = '23503';
  end if;
  if new.work_package_id is not null and not exists (select 1 from public.work_packages w where w.id = new.work_package_id and w.project_id = new.project_id) then
    raise exception 'The work package belongs to another project' using errcode = '23503';
  end if;
  if auth.role() = 'authenticated' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.uploaded_by_id := coalesce(new.uploaded_by_id, (select auth.uid()));
    new.uploaded_by := coalesce(nullif(btrim(coalesce(new.uploaded_by, '')), ''), public.actor_display_name());
  end if;
  new.is_deleted := false; new.deleted_at := null;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.prepare_meeting_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.title is null or length(btrim(new.title)) = 0 then raise exception 'A meeting needs a title' using errcode = '23514'; end if;
  new.title := btrim(new.title);
  if new.meeting_number is null or btrim(new.meeting_number) = '' then
    new.meeting_number := 'MTG-' || lpad(public.get_next_sequence_number(new.project_id, 'meeting')::text, 3, '0');
  elsif auth.role() = 'authenticated' then
    raise exception 'meeting_number is minted by the database' using errcode = '42501';
  end if;
  new.status := coalesce(new.status, 'Scheduled');
  if new.status = 'Held' and new.meeting_date is null then raise exception 'A held meeting needs its date' using errcode = '23514'; end if;
  if new.status = 'Held' then new.held_at := coalesce(new.held_at, now()); new.held_by := coalesce(new.held_by, (select auth.uid())); end if;
  if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
  new.is_deleted := false; new.deleted_at := null;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.prepare_risk_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.risk_number is null then new.risk_number := 'RSK-' || lpad(public.get_next_sequence_number(new.project_id, 'risk')::text, 3, '0'); end if;
    new.status := coalesce(new.status, 'Open');
    new.identified_date := coalesce(new.identified_date, current_date);
    if auth.role() = 'authenticated' then new.created_by := coalesce(new.created_by, (select auth.uid())); end if;
  end if;
  new.severity := public.risk_severity(new.probability * new.impact);
  if new.status = 'Closed' then new.closed_date := coalesce(new.closed_date, current_date); elsif tg_op = 'UPDATE' and old.status = 'Closed' then new.closed_date := null; end if;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.prepare_scope_item_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.description is null or length(btrim(new.description)) = 0 then
    raise exception 'A scope item needs a description' using errcode = '23514';
  end if;
  new.description := btrim(new.description);
  if new.scope_number is null or btrim(new.scope_number) = '' then
    new.scope_number := 'SCP-' || lpad(public.get_next_sequence_number(new.project_id, 'scope_item')::text, 3, '0');
  elsif auth.role() = 'authenticated' then
    raise exception 'scope_number is minted by the database' using errcode = '42501';
  end if;
  new.item_type := coalesce(nullif(btrim(new.item_type), ''), 'Exclusion');
  new.category := coalesce(nullif(btrim(new.category), ''), 'Structural');
  if auth.role() = 'authenticated' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.added_by := coalesce(nullif(btrim(coalesce(new.added_by, '')), ''), public.actor_display_name());
  end if;
  perform public.scope_item_check_links(new);
  new := public.scope_item_apply_progress(new, null::public.scope_items);
  new.is_deleted := false; new.deleted_at := null;
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.prune_client_events(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_n int; v_prev text := coalesce(current_setting('steelbuild.ops_rpc', true), '');
begin
  if not public.user_is_system_admin() then raise exception 'Only a system administrator can prune client events' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 then raise exception 'Keep at least one day' using errcode = '22023'; end if;
  perform set_config('steelbuild.ops_rpc', 'on', true);
  delete from public.client_events where occurred_at < now() - make_interval(days => p_days);
  get diagnostics v_n = row_count;
  perform set_config('steelbuild.ops_rpc', v_prev, true);
  return v_n;
end $function$


CREATE OR REPLACE FUNCTION public.raise_meeting_action_items(p_meeting_id uuid, p_items jsonb)
 RETURNS SETOF action_items
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_meeting public.meetings;
  v_item jsonb;
  v_title text;
  v_row public.action_items;
begin
  select * into v_meeting from public.meetings m where m.id = p_meeting_id and m.is_deleted = false;
  if not found then raise exception 'Meeting not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_meeting.project_id, 'field') then
    raise exception 'Raising action items needs field access' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Provide at least one action item' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'At most 100 action items per call' using errcode = '22023'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_title := btrim(coalesce(v_item ->> 'title', ''));
    if v_title = '' then raise exception 'Every action item needs a title' using errcode = '23514'; end if;
    insert into public.action_items (
      project_id, project_name, title, description, assigned_to, assigned_user_id, due_date, priority, category,
      work_package_id, meeting_id, meeting_reference, source_entity_type, source_entity_id, action_date
    ) values (
      v_meeting.project_id, v_meeting.project_name, v_title, nullif(btrim(coalesce(v_item ->> 'description', '')), ''),
      nullif(btrim(coalesce(v_item ->> 'assigned_to', '')), ''), nullif(v_item ->> 'assigned_user_id', '')::uuid,
      nullif(v_item ->> 'due_date', '')::date, coalesce(nullif(v_item ->> 'priority', ''), 'Medium'),
      coalesce(nullif(v_item ->> 'category', ''), 'GENERAL'), nullif(v_item ->> 'work_package_id', '')::uuid,
      v_meeting.id, v_meeting.meeting_number || ' · ' || v_meeting.title, 'meeting', v_meeting.id, v_meeting.meeting_date
    ) returning * into v_row;
    return next v_row;
  end loop;
  return;
end $function$


CREATE OR REPLACE FUNCTION public.receive_delivery(p_delivery_id uuid, p_received_by text, p_actual_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text, p_advance_pieces boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_delivery public.deliveries%rowtype; v_mode text; v_advance uuid[] := '{}'::uuid[]; v_skipped jsonb := '[]'::jsonb; v_result jsonb; r record; v_reason text;
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id and is_deleted = false for update;
  if v_delivery.id is null then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_delivery.project_id, 'field') then raise exception 'Not authorized to receive deliveries for this project' using errcode = '42501'; end if;
  if v_delivery.status in ('Delivered', 'Received') then raise exception 'ALREADY_RECEIVED: this delivery was already received' using errcode = 'P0001'; end if;
  if v_delivery.status = 'Cancelled' then raise exception 'CANCELLED: a cancelled delivery cannot be received' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_received_by), '') = '' then raise exception 'received_by is required' using errcode = '23514'; end if;
  select piece_control_mode into v_mode from public.projects where id = v_delivery.project_id;
  for r in select di.piece_id, p.piece_mark, p.lot_code, p.lifecycle_status, p.on_hold from public.delivery_items di join public.pieces p on p.id = di.piece_id
            where di.delivery_id = p_delivery_id and di.piece_id is not null and p.is_deleted = false loop
    v_reason := case when not p_advance_pieces then 'not requested' when v_mode = 'off' then 'piece control off' when r.on_hold then 'on hold' when r.lifecycle_status <> 'shipped' then 'not shipped (' || r.lifecycle_status || ')' else null end;
    if v_reason is null then v_advance := array_append(v_advance, r.piece_id);
    else v_skipped := v_skipped || jsonb_build_object('piece_id', r.piece_id, 'mark', r.piece_mark || case when r.lot_code = 'ALL' then '' else ':' || r.lot_code end, 'reason', v_reason); end if;
  end loop;
  perform set_config('steelbuild.delivery_rpc', 'on', true);
  update public.deliveries set status = 'Delivered', actual_date = coalesce(p_actual_date, current_date), received_by = btrim(p_received_by), received_at = now(),
         received_notes = nullif(btrim(coalesce(p_notes, '')), ''), pieces_advanced_count = cardinality(v_advance) where id = p_delivery_id returning * into v_delivery;
  update public.delivery_items set received_qty = qty, received_at = now() where delivery_id = p_delivery_id;
  if cardinality(v_advance) > 0 then
    -- Canonical transition (SECURITY DEFINER wrapper: field+, refuses held lots, atomic). The wrapper swallows errors
    -- into {ok:false,…}; re-raise so the whole receipt rolls back with the lots.
    v_result := public.deliver_piece_lots(v_delivery.project_id, v_advance,
      jsonb_build_object('source', 'deliveries', 'delivery_id', p_delivery_id, 'delivery_number', v_delivery.delivery_number, 'received_by', btrim(p_received_by), 'reference_date', coalesce(p_actual_date, current_date)));
    if coalesce((v_result ->> 'ok')::boolean, true) = false then
      raise exception 'PIECES_NOT_ADVANCED: %', coalesce(v_result ->> 'error_message', 'canonical delivery transition refused') using errcode = 'P0001';
    end if;
  end if;
  return jsonb_build_object('delivery', to_jsonb(v_delivery), 'advanced', cardinality(v_advance), 'skipped', v_skipped, 'transition', v_result);
end $function$


CREATE OR REPLACE FUNCTION public.record_revision_comparison(p_comparison_id uuid, p_status text, p_summary text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_deltas jsonb DEFAULT '[]'::jsonb, p_raw jsonb DEFAULT NULL::jsonb, p_error text DEFAULT NULL::text, p_stats jsonb DEFAULT NULL::jsonb)
 RETURNS drawing_revision_comparisons
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare row public.drawing_revision_comparisons; d jsonb; n int := 0; v_type text; v_sev text; v_cat text; v_conf text; v_src text; v_sheet text;
        v_prev text := coalesce(current_setting('steelbuild.revcmp_rpc', true), '');
begin
  select * into row from public.drawing_revision_comparisons where id = p_comparison_id and not is_deleted;
  if not found then raise exception 'Comparison not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(row.project_id, 'pm') then raise exception 'Revision analysis needs a project manager' using errcode = '42501'; end if;
  if row.compare_status not in ('pending', 'processing') then raise exception 'Comparison is already %', row.compare_status using errcode = '22023'; end if;
  if p_status not in ('complete', 'error') then raise exception 'status must be complete or error' using errcode = '22023'; end if;
  perform set_config('steelbuild.revcmp_rpc', 'on', true);
  if p_status = 'complete' then
    v_sheet := coalesce(row.metadata ->> 'sheet_number', (select sheet_number from public.drawings where id = row.drawing_id));
    for d in select * from jsonb_array_elements(case when jsonb_typeof(p_deltas) = 'array' then p_deltas else '[]'::jsonb end) loop
      if nullif(btrim(coalesce(d ->> 'description', '')), '') is null then continue; end if;
      v_type := lower(coalesce(d ->> 'delta_type', 'other'));
      if v_type not in ('sheet_added', 'sheet_removed', 'grid_shift', 'connection_change', 'dimension_change', 'detail_revised', 'callout_added', 'callout_removed', 'material_change', 'elevation_change', 'other') then v_type := 'other'; end if;
      v_sev := lower(coalesce(d ->> 'severity', 'medium'));
      if v_sev not in ('critical', 'high', 'medium', 'low', 'info') then v_sev := 'medium'; end if;
      v_cat := upper(nullif(btrim(coalesce(d ->> 'change_category', '')), '')); if v_cat not in ('A', 'B', 'C') then v_cat := null; end if;
      v_conf := lower(nullif(btrim(coalesce(d ->> 'classification_confidence', '')), '')); if v_conf not in ('high', 'medium', 'low') then v_conf := null; end if;
      v_src := lower(coalesce(d ->> 'classification_source', 'ai')); if v_src not in ('deterministic', 'ai') then v_src := 'ai'; end if;
      insert into public.drawing_revision_deltas (comparison_id, project_id, drawing_id, sheet_number, delta_type, severity, description, recommended_action, change_category, likely_owner, impact_summary, classification_confidence, classification_source)
        values (row.id, row.project_id, row.drawing_id, coalesce(nullif(d ->> 'sheet_number', ''), v_sheet), v_type, v_sev, left(btrim(d ->> 'description'), 2000), left(nullif(btrim(coalesce(d ->> 'recommended_action', '')), ''), 1000), v_cat, left(nullif(btrim(coalesce(d ->> 'likely_owner', '')), ''), 120), left(nullif(btrim(coalesce(d ->> 'impact_summary', '')), ''), 1000), v_conf, v_src);
      n := n + 1;
      if n >= 50 then exit; end if;
    end loop;
    update public.drawing_revision_comparisons
       set compare_status = 'complete', ai_summary = left(coalesce(p_summary, ''), 4000), model = coalesce(p_model, model), delta_count = n, raw_ai_response = p_raw, deterministic_stats = p_stats, error_message = null, completed_at = now()
     where id = row.id returning * into row;
  else
    update public.drawing_revision_comparisons
       set compare_status = 'error', error_message = left(coalesce(p_error, 'Unknown error'), 2000), model = coalesce(p_model, model), completed_at = now()
     where id = row.id returning * into row;
  end if;
  perform set_config('steelbuild.revcmp_rpc', v_prev, true);
  return row;
end $function$


CREATE OR REPLACE FUNCTION public.record_submittal_response(p_round_id uuid, p_returned_date date, p_status text, p_ball_in_court text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_sheet_responses jsonb DEFAULT '[]'::jsonb)
 RETURNS submittals
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_round public.submittal_rounds%rowtype; v_sub public.submittals%rowtype; v_bic text; v_count integer := 0; r jsonb;
begin
  select * into v_round from public.submittal_rounds where id = p_round_id for update;
  if not found then raise exception 'Round not found' using errcode = 'P0002'; end if;
  select * into v_sub from public.submittals where id = v_round.submittal_id for update;
  if not public.user_has_project_role_at_least(v_sub.project_id, 'pm') then raise exception 'Recording a response requires PM or admin' using errcode = '42501'; end if;
  if p_status not in ('Approved','Approved as Noted','Revise and Resubmit','Rejected') then raise exception 'Response must be Approved, Approved as Noted, Revise and Resubmit or Rejected' using errcode = '23514'; end if;
  if p_returned_date is null then raise exception 'Record the return date' using errcode = '23514'; end if;
  v_bic := coalesce(nullif(btrim(p_ball_in_court), ''), 'Detailer');
  update public.submittal_rounds set returned_date = p_returned_date, status = p_status, response_notes = coalesce(nullif(p_notes, ''), response_notes) where id = p_round_id;
  for r in select * from jsonb_array_elements(coalesce(p_sheet_responses, '[]'::jsonb)) loop
    insert into public.submittal_sheet_responses (project_id, submittal_round_id, drawing_id, drawing_set_id, sheet_number, response_status, reviewer_comment)
    values (v_sub.project_id, p_round_id, nullif(r->>'drawing_id', '')::uuid,
            (select d.drawing_set_id from public.drawings d where d.id = nullif(r->>'drawing_id', '')::uuid),
            coalesce(nullif(r->>'sheet_number', ''), (select d.sheet_number from public.drawings d where d.id = nullif(r->>'drawing_id', '')::uuid)),
            r->>'response_status', nullif(r->>'reviewer_comment', ''));
    v_count := v_count + 1;
  end loop;
  update public.submittals
     set status = p_status, returned_date = p_returned_date, ball_in_court = v_bic,
         approved_date = case when p_status in ('Approved','Approved as Noted') then p_returned_date else approved_date end,
         notes = coalesce(notes, '') || case when nullif(p_notes, '') is not null then E'\n[' || p_returned_date || ' response] ' || p_notes else '' end
   where id = v_sub.id returning * into v_sub;
  perform public.log_submittal_event(v_sub.project_id, v_sub.id, 'round_returned', 'Round ' || v_round.round_number, p_status, jsonb_build_object('round_id', p_round_id, 'returned_date', p_returned_date, 'sheet_responses', v_count));
  return v_sub;
end;
$function$


CREATE OR REPLACE FUNCTION public.recount_drawing_set(p_set_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.drawing_sets ds set
    sheet_count        = (select count(*) from public.drawings where drawing_set_id = p_set_id and not is_deleted),
    processed_count    = (select count(*) filter (where ai_extraction_status = 'Processed') from public.drawings where drawing_set_id = p_set_id and not is_deleted),
    needs_review_count = (select count(*) filter (where ai_extraction_status = 'NeedsReview') from public.drawings where drawing_set_id = p_set_id and not is_deleted),
    failed_count       = (select count(*) filter (where ai_extraction_status = 'Failed' or upload_status = 'Failed') from public.drawings where drawing_set_id = p_set_id and not is_deleted),
    updated_at         = now()
  where ds.id = p_set_id;

  update public.drawing_sets
     set is_deleted = true, deleted_at = now()
   where id = p_set_id and is_deleted = false and sheet_count = 0;
end;
$function$


CREATE OR REPLACE FUNCTION public.refresh_project_change_total(p_project_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_total numeric;
begin
  if not public.user_has_project_access(p_project_id) then raise exception 'Not authorized for this project' using errcode = '42501'; end if;
  perform set_config('steelbuild.co_rpc', 'on', true);
  select coalesce(sum(co_amount), 0) into v_total from public.change_orders where project_id = p_project_id and status = 'Approved' and is_deleted = false;
  update public.projects set approved_change_total = v_total where id = p_project_id;
  return v_total;
end $function$


CREATE OR REPLACE FUNCTION public.regenerate_pay_application_lines(p_id uuid)
 RETURNS pay_applications
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_app public.pay_applications; v_proj public.projects%rowtype; v_sov_total numeric;
begin
  select * into v_app from public.pay_applications where id = p_id and is_deleted = false for update;
  if v_app.id is null then raise exception 'Pay application not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_app.project_id, 'pm') then raise exception 'Not authorized to bill this project' using errcode = '42501'; end if;
  if v_app.status <> 'draft' then raise exception 'Only a draft pay application can be regenerated' using errcode = '22023'; end if;
  select * into v_proj from public.projects where id = v_app.project_id;
  select coalesce(sum(scheduled_value), 0) into v_sov_total from public.sov_items where project_id = v_app.project_id and is_deleted = false;
  perform set_config('steelbuild.payapp_rpc', 'on', true);
  -- Keep stored amounts per SOV line, then rebuild.
  create temp table if not exists _pa_stored (sov_item_id uuid, materials_stored numeric) on commit drop;
  delete from _pa_stored;
  insert into _pa_stored select sov_item_id, materials_stored from public.pay_application_lines where pay_application_id = v_app.id and sov_item_id is not null;
  delete from public.pay_application_lines where pay_application_id = v_app.id;
  update public.pay_applications set original_contract_sum = coalesce(v_proj.original_contract_value, 0), net_change_orders = coalesce(v_proj.approved_change_total, 0), retainage_percent = coalesce(v_proj.retainage_percent, retainage_percent),
         sov_reconciles = abs(v_sov_total - (coalesce(v_proj.original_contract_value, 0) + coalesce(v_proj.approved_change_total, 0))) < 0.5, metadata = metadata || jsonb_build_object('sov_total_at_generation', v_sov_total, 'regenerated_at', now())
   where id = v_app.id returning * into v_app;
  perform public.build_pay_application_lines(v_app);
  update public.pay_application_lines l set materials_stored = s.materials_stored, work_completed_this_period = greatest(l.work_completed_this_period + l.materials_stored - s.materials_stored, 0)
    from _pa_stored s where l.pay_application_id = v_app.id and l.sov_item_id = s.sov_item_id and s.materials_stored <> l.materials_stored;
  perform public.refresh_pay_application_totals(v_app.id);
  perform set_config('steelbuild.payapp_rpc', 'off', true);
  select * into v_app from public.pay_applications where id = v_app.id;
  return v_app;
end $function$


CREATE OR REPLACE FUNCTION public.register_model(p_project_id uuid, p_payload jsonb, p_supersede_active boolean DEFAULT true)
 RETURNS model_registry
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare row public.model_registry; v_type text := upper(coalesce(p_payload ->> 'file_type', 'IFC')); v_prev text := coalesce(current_setting('steelbuild.model_rpc', true), '');
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Registering a model needs a project manager' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_payload ->> 'file_name', '')), '') is null then raise exception 'file_name is required' using errcode = '23514'; end if;
  perform set_config('steelbuild.model_rpc', 'on', true);
  insert into public.model_registry (project_id, file_name, file_url, file_type, version, revision_number, source, coordinate_system, metadata, status, notes)
    values (p_project_id, btrim(p_payload ->> 'file_name'), nullif(p_payload ->> 'file_url', ''), v_type, coalesce(nullif(p_payload ->> 'version', ''), '1.0'), nullif(p_payload ->> 'revision_number', '')::int,
            coalesce(nullif(p_payload ->> 'source', ''), 'local'), nullif(p_payload ->> 'coordinate_system', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb), 'active', nullif(p_payload ->> 'notes', ''))
    returning * into row;
  if p_supersede_active then
    update public.model_registry set status = 'superseded', superseded_by = row.id where project_id = p_project_id and id <> row.id and status = 'active' and not is_deleted and file_type = v_type;
  end if;
  perform set_config('steelbuild.model_rpc', v_prev, true);
  return row;
end $function$


CREATE OR REPLACE FUNCTION public.release_drawing_hold(p_hold_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS drawing_holds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_hold public.drawing_holds%rowtype;
  v_stage text;
  v_name text;
begin
  if v_actor is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_hold from public.drawing_holds where id = p_hold_id for update;
  if not found then raise exception 'Hold not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_hold.project_id, 'field') then
    raise exception 'Not authorized to release holds on this project' using errcode = '42501';
  end if;
  if not v_hold.is_active then raise exception 'This hold was already released' using errcode = '22023'; end if;
  select coalesce(nullif(btrim(up.full_name), ''), up.email) into v_name from public.user_profiles up where up.id = v_actor;
  update public.drawing_holds
     set is_active = false, released_at = now(), released_by_id = v_actor, released_by_name = v_name, release_notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_hold_id
  returning * into v_hold;
  -- The sheet's stored stage was never overwritten; it is what the sheet shows again now.
  select stage into v_stage from public.drawings where id = v_hold.drawing_id;
  insert into public.drawing_activity (project_id, drawing_id, event_type, from_value, to_value, actor_id, metadata)
  values (v_hold.project_id, v_hold.drawing_id, 'hold_released', 'On Hold', v_stage, v_actor, jsonb_build_object('hold_id', v_hold.id, 'prior_stage', v_hold.prior_stage, 'notes', v_hold.release_notes));
  return v_hold;
end;
$function$


CREATE OR REPLACE FUNCTION public.release_package_for_fabrication(p_project_id uuid, p_drawing_set_id uuid, p_override_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS fab_release_log
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_row public.fab_release_log%rowtype; v_sub public.submittals%rowtype;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Releasing for fabrication requires PM or admin' using errcode = '42501'; end if;
  insert into public.fab_release_log (project_id, package_kind, drawing_set_id, override_reason, notes)
  values (p_project_id, 'fab_release', p_drawing_set_id, nullif(btrim(coalesce(p_override_reason, '')), ''), nullif(p_notes, ''))
  returning * into v_row;
  -- A CLEAN release (governing submittal at IFC) also completes the workflow: submittal → Released for Fabrication and
  -- the sheets' informational stage → Released. An OVERRIDE releases the package on the log only — the submittal keeps
  -- its real workflow state (the state machine would refuse Draft → Released anyway) and the log carries the audit.
  if not v_row.is_override and v_row.submittal_id is not null and v_row.governing_stage = 'IFC' then
    select * into v_sub from public.submittals where id = v_row.submittal_id for update;
    if v_sub.status is distinct from 'Released for Fabrication' then
      update public.submittals set status = 'Released for Fabrication' where id = v_sub.id;
    end if;
  end if;
  if not v_row.is_override then
    update public.drawings d set stage = 'Released'
     where d.drawing_set_id = p_drawing_set_id and d.is_deleted = false and d.stage is distinct from 'Released'
       and not exists (select 1 from public.drawing_sets s where s.id = p_drawing_set_id and s.is_locked = true);
  end if;
  return v_row;
end;
$function$


CREATE OR REPLACE FUNCTION public.reopen_project_closeout(p_project_id uuid, p_reason text)
 RETURNS project_closeout
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_row public.project_closeout; v_prev text := coalesce(current_setting('steelbuild.closeout_rpc', true), '');
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required to reopen a closeout' using errcode = '23514'; end if;
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Closeout needs a project manager' using errcode = '42501'; end if;
  select * into v_row from public.project_closeout where project_id = p_project_id and not is_deleted order by created_at limit 1;
  if not found or v_row.status <> 'Complete' then raise exception 'Closeout is not complete' using errcode = '22023'; end if;
  perform set_config('steelbuild.closeout_rpc', 'on', true);
  update public.project_closeout
     set status = 'In Progress', completed_by = null, completed_at = null, override_reason = null, override_by = null, blockers_at_completion = null,
         reopen_reason = btrim(p_reason), notes = concat_ws(E'\n', nullif(notes, ''), to_char(current_date, 'YYYY-MM-DD') || ' — reopened: ' || btrim(p_reason))
   where id = v_row.id returning * into v_row;
  perform set_config('steelbuild.closeout_rpc', v_prev, true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.risk_severity(p_score integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case when p_score >= 15 then 'Critical' when p_score >= 10 then 'High' when p_score >= 5 then 'Medium' else 'Low' end;
$function$


CREATE OR REPLACE FUNCTION public.risk_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_from is not distinct from p_to then true
    when p_from = 'Open' then p_to in ('Mitigating', 'Accepted', 'Transferred', 'Closed')
    when p_from = 'Mitigating' then p_to in ('Mitigated', 'Open', 'Closed')
    when p_from = 'Mitigated' then p_to in ('Closed', 'Open', 'Mitigating')
    when p_from in ('Accepted', 'Transferred') then p_to in ('Open', 'Closed')
    when p_from = 'Closed' then p_to = 'Open'
    else false end;
$function$


CREATE OR REPLACE FUNCTION public.roll_tm_tickets_into_backcharge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_total numeric; v_bc public.backcharges%rowtype; v_kind text;
begin
  select * into v_bc from public.backcharges where id = new.backcharge_id;
  select coalesce(sum(amount), 0) into v_total from public.backcharge_tm_tickets where backcharge_id = new.backcharge_id and is_deleted = false;
  perform set_config('steelbuild.bc_rpc', 'on', true);
  update public.backcharges set ticket_total = round(v_total, 2), amount = case when v_total > 0 then round(v_total, 2) else amount end where id = new.backcharge_id;
  v_kind := case when tg_op = 'INSERT' then 'ticket_added' when new.is_deleted and not old.is_deleted then 'ticket_voided' else 'ticket_updated' end;
  perform public.log_backcharge_event(new.backcharge_id, v_kind, v_bc.status, v_bc.status, format('%s %s → backcharge total %s', new.ticket_number, to_char(new.amount, 'FM999,999,990.00'), to_char(round(v_total, 2), 'FM999,999,990.00')));
  return null;
end $function$


CREATE OR REPLACE FUNCTION public.save_titleblock_map(p_project_id uuid, p_register text, p_title_rect jsonb, p_number_rect jsonb, p_revision_rect jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_n integer := 0; v_m integer := 0;
begin
  if p_register not in ('shop','gc') then raise exception 'register must be shop or gc' using errcode = 'P0001'; end if;
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then
    raise exception 'Editing the title-block map requires PM or admin' using errcode = '42501';
  end if;
  if p_register = 'shop' then
    update public.drawing_sets
       set titleblock_title_rect = p_title_rect, titleblock_number_rect = p_number_rect, titleblock_revision_rect = p_revision_rect
     where project_id = p_project_id and register = 'shop' and not is_deleted;
    get diagnostics v_n = row_count;
  else
    update public.gc_drawing_sets
       set titleblock_title_rect = p_title_rect, titleblock_number_rect = p_number_rect, titleblock_revision_rect = p_revision_rect
     where project_id = p_project_id and not is_deleted;
    get diagnostics v_n = row_count;
    -- legacy: sets that were uploaded with register='gc' before M3.6 existed
    update public.drawing_sets
       set titleblock_title_rect = p_title_rect, titleblock_number_rect = p_number_rect, titleblock_revision_rect = p_revision_rect
     where project_id = p_project_id and register = 'gc' and not is_deleted;
    get diagnostics v_m = row_count;
  end if;
  return v_n + v_m;
end;
$function$


CREATE OR REPLACE FUNCTION public.scope_item_apply_progress(p_new scope_items, p_old scope_items)
 RETURNS scope_items
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_row public.scope_items := p_new; v_actor text := public.actor_display_name(); v_uid uuid := (select auth.uid());
begin
  if v_row.is_completed and v_row.in_progress then v_row.in_progress := false; end if;
  if v_row.is_completed and not coalesce(p_old.is_completed, false) then
    v_row.completed_at := coalesce(v_row.completed_at, now());
    v_row.completed_by := coalesce(nullif(btrim(coalesce(v_row.completed_by, '')), ''), v_actor);
    v_row.completed_by_id := coalesce(v_row.completed_by_id, v_uid);
    v_row.in_progress := false; v_row.in_progress_at := null; v_row.in_progress_by := null;
  elsif not v_row.is_completed and coalesce(p_old.is_completed, false) then
    v_row.completed_at := null; v_row.completed_by := null; v_row.completed_by_id := null;
  end if;
  if v_row.in_progress and not coalesce(p_old.in_progress, false) then
    v_row.in_progress_at := coalesce(v_row.in_progress_at, now());
    v_row.in_progress_by := coalesce(nullif(btrim(coalesce(v_row.in_progress_by, '')), ''), v_actor);
  elsif not v_row.in_progress and coalesce(p_old.in_progress, false) then
    v_row.in_progress_at := null; v_row.in_progress_by := null;
  end if;
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.scope_item_check_links(p_row scope_items)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if p_row.document_id is not null and not exists (
    select 1 from public.documents d where d.id = p_row.document_id and d.project_id = p_row.project_id and d.is_deleted = false
  ) then
    raise exception 'The scope letter must be a live document of the same project' using errcode = '23503';
  end if;
  if p_row.change_order_id is not null then
    if p_row.item_type <> 'Exclusion' then
      raise exception 'Only an Exclusion carries a change order' using errcode = '23514';
    end if;
    if not exists (select 1 from public.change_orders c where c.id = p_row.change_order_id and c.project_id = p_row.project_id) then
      raise exception 'The change order belongs to another project' using errcode = '23503';
    end if;
  end if;
end $function$


CREATE OR REPLACE FUNCTION public.seed_cost_codes_from_defaults(p_project_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'pm') then raise exception 'Not authorized to edit cost codes for this project' using errcode = '42501'; end if;
  insert into public.cost_codes (project_id, project_name, cost_code_number, description, category, phase, budget_amount, actual_cost, committed_cost, forecast_to_complete, sort_order, metadata)
  select p_project_id, (select name from public.projects where id = p_project_id), d.cost_code_number, d.description, d.category, d.category, coalesce(d.default_budget_amount, 0), 0, 0, 0, d.sort_order,
         jsonb_build_object('auto_seeded', true, 'source', 'default_cost_codes')
    from public.default_cost_codes d
   where d.is_active = true
     and not exists (select 1 from public.cost_codes c where c.project_id = p_project_id and c.is_deleted = false and c.cost_code_number = d.cost_code_number)
   order by d.sort_order;
  get diagnostics v_n = row_count;
  return v_n;
end $function$


CREATE OR REPLACE FUNCTION public.send_transmittal(p_transmittal_id uuid, p_sent_date date DEFAULT NULL::date)
 RETURNS drawing_transmittals
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_t public.drawing_transmittals%rowtype; v_n integer; v_name text;
begin
  select * into v_t from public.drawing_transmittals where id = p_transmittal_id for update;
  if not found then raise exception 'Transmittal not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_t.project_id, 'pm') then raise exception 'Sending transmittals requires PM or admin' using errcode = '42501'; end if;
  if v_t.status <> 'draft' then raise exception '% is already %', v_t.transmittal_number, v_t.status using errcode = '22023'; end if;
  if coalesce(btrim(v_t.sent_to), '') = '' then raise exception 'Record who the transmittal goes to before sending' using errcode = '23514'; end if;
  select count(*) into v_n from public.drawing_transmittal_items where transmittal_id = p_transmittal_id;
  if v_n = 0 then raise exception 'Add at least one drawing before sending' using errcode = '23514'; end if;
  perform set_config('steelbuild.transmittal_rpc', '1', true);
  -- Shop sheets: the current drawing_revisions row (fallback: the sheet's own fields). GC drawings: their revision field.
  update public.drawing_transmittal_items i
     set drawing_revision_id = r.id,
         revision_at_send = coalesce(nullif(btrim(r.revision_code), ''), nullif(btrim(d.revision_number), ''), '-'),
         number_at_send   = coalesce(nullif(btrim(r.sheet_number), ''), d.sheet_number, ''),
         title_at_send    = coalesce(nullif(btrim(r.sheet_title), ''), d.title, '')
    from public.drawings d left join public.drawing_revisions r on r.drawing_id = d.id and r.is_current = true
   where i.transmittal_id = p_transmittal_id and i.drawing_id = d.id;
  update public.drawing_transmittal_items i
     set revision_at_send = coalesce(nullif(btrim(g.revision), ''), '-'),
         number_at_send   = coalesce(g.drawing_number, ''),
         title_at_send    = coalesce(g.title, '')
    from public.gc_drawings g
   where i.transmittal_id = p_transmittal_id and i.gc_drawing_id = g.id;
  select coalesce(nullif(btrim(up.full_name), ''), up.email) into v_name from public.user_profiles up where up.id = (select auth.uid());
  update public.drawing_transmittals
     set status = 'sent', date_sent = coalesce(p_sent_date::timestamptz, now()), sent_by = (select auth.uid()), sent_by_name = v_name
   where id = p_transmittal_id returning * into v_t;
  if v_t.submittal_id is not null then
    update public.submittals set transmittal_number = v_t.transmittal_number where id = v_t.submittal_id;
  end if;
  perform set_config('steelbuild.transmittal_rpc', '', true);
  perform public.log_transmittal_event(v_t.project_id, p_transmittal_id, 'sent', 'draft', 'sent', null, jsonb_build_object('items', v_n, 'sent_to', v_t.sent_to, 'date_sent', v_t.date_sent));
  return v_t;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_delivery_items(p_delivery_id uuid, p_items jsonb)
 RETURNS SETOF delivery_items
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_delivery public.deliveries%rowtype; v_item jsonb; v_line integer := 0;
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id and is_deleted = false for update;
  if v_delivery.id is null then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_delivery.project_id, 'field') then raise exception 'Not authorized' using errcode = '42501'; end if;
  if v_delivery.status in ('Delivered', 'Received', 'Cancelled') then raise exception 'Items are frozen once the delivery is received or cancelled' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array' using errcode = '22023'; end if;
  delete from public.delivery_items where delivery_id = p_delivery_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_line := v_line + 1;
    insert into public.delivery_items (delivery_id, line_no, qty, assembly_mark, sequence, profile, length_inches, grade, weight_lbs, notes, piece_id)
    values (p_delivery_id, v_line, greatest(1, coalesce((v_item ->> 'qty')::int, 1)), nullif(v_item ->> 'assembly_mark', ''), nullif(v_item ->> 'sequence', ''), nullif(v_item ->> 'profile', ''),
            nullif(v_item ->> 'length_inches', '')::numeric, nullif(v_item ->> 'grade', ''), nullif(v_item ->> 'weight_lbs', '')::numeric, nullif(v_item ->> 'notes', ''), nullif(v_item ->> 'piece_id', '')::uuid);
  end loop;
  return query select * from public.delivery_items where delivery_id = p_delivery_id order by line_no;
end $function$


CREATE OR REPLACE FUNCTION public.set_feature_flag(p_flag_key text, p_enabled boolean, p_description text DEFAULT NULL::text)
 RETURNS feature_flags
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_row public.feature_flags; v_prev text := coalesce(current_setting('steelbuild.flag_rpc', true), '');
begin
  if not public.user_is_system_admin() then raise exception 'Only a system administrator can change feature flags' using errcode = '42501'; end if;
  if p_flag_key is null or p_flag_key !~ '^[a-z][a-z0-9_]{2,63}$' then raise exception 'Invalid flag key' using errcode = '22023'; end if;
  perform set_config('steelbuild.flag_rpc', 'on', true);
  insert into public.feature_flags (flag_key, enabled, description, user_overrides)
    values (p_flag_key, coalesce(p_enabled, false), p_description, '{}'::jsonb)
  on conflict (flag_key) do update set enabled = coalesce(excluded.enabled, public.feature_flags.enabled), description = coalesce(excluded.description, public.feature_flags.description)
  returning * into v_row;
  perform set_config('steelbuild.flag_rpc', v_prev, true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.set_feature_flag_override(p_flag_key text, p_email text, p_value boolean)
 RETURNS feature_flags
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_row public.feature_flags; v_email text := lower(btrim(coalesce(p_email, ''))); v_prev text := coalesce(current_setting('steelbuild.flag_rpc', true), '');
begin
  if not public.user_is_system_admin() then raise exception 'Only a system administrator can change feature flags' using errcode = '42501'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid override email' using errcode = '22023'; end if;
  perform set_config('steelbuild.flag_rpc', 'on', true);
  update public.feature_flags
     set user_overrides = case when p_value is null then coalesce(user_overrides, '{}'::jsonb) - v_email
                              else coalesce(user_overrides, '{}'::jsonb) || jsonb_build_object(v_email, p_value) end
   where flag_key = p_flag_key
  returning * into v_row;
  perform set_config('steelbuild.flag_rpc', v_prev, true);
  if v_row.id is null then raise exception 'Unknown flag %', p_flag_key using errcode = 'P0002'; end if;
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.set_runtime_config(p_key text, p_value jsonb, p_is_public boolean DEFAULT NULL::boolean, p_description text DEFAULT NULL::text)
 RETURNS runtime_config
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.runtime_config; v_prev text := coalesce(current_setting('steelbuild.ops_rpc', true), '');
begin
  if not public.user_is_system_admin() then raise exception 'Only a system administrator can change runtime configuration' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'Invalid config key' using errcode = '22023'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then raise exception 'Config value must be a JSON object' using errcode = '22023'; end if;
  perform set_config('steelbuild.ops_rpc', 'on', true);
  insert into public.runtime_config (key, value, is_public, description) values (p_key, p_value, coalesce(p_is_public, false), p_description)
  on conflict (key) do update set value = excluded.value, is_public = coalesce(p_is_public, public.runtime_config.is_public), description = coalesce(p_description, public.runtime_config.description)
  returning * into v_row;
  perform set_config('steelbuild.ops_rpc', v_prev, true);
  return v_row;
end $function$


CREATE OR REPLACE FUNCTION public.set_transmittal_items(p_transmittal_id uuid, p_refs jsonb)
 RETURNS SETOF drawing_transmittal_items
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_t public.drawing_transmittals%rowtype; v_ref text; v_i integer := 0; v_kind text; v_id uuid;
begin
  select * into v_t from public.drawing_transmittals where id = p_transmittal_id for update;
  if not found then raise exception 'Transmittal not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_t.project_id, 'pm') then raise exception 'Editing transmittals requires PM or admin' using errcode = '42501'; end if;
  if v_t.status <> 'draft' then raise exception 'Items are frozen once a transmittal is sent' using errcode = '42501'; end if;
  delete from public.drawing_transmittal_items where transmittal_id = p_transmittal_id;
  for v_ref in select jsonb_array_elements_text(coalesce(p_refs, '[]'::jsonb)) loop
    v_kind := split_part(v_ref, ':', 1); v_id := nullif(split_part(v_ref, ':', 2), '')::uuid;
    if v_kind not in ('shop','gc') or v_id is null then raise exception 'Bad drawing ref %', v_ref using errcode = '22023'; end if;
    v_i := v_i + 1;
    insert into public.drawing_transmittal_items (project_id, transmittal_id, drawing_id, gc_drawing_id, sort_order)
    values (v_t.project_id, p_transmittal_id, case when v_kind = 'shop' then v_id end, case when v_kind = 'gc' then v_id end, v_i)
    on conflict do nothing;
  end loop;
  perform public.log_transmittal_event(v_t.project_id, p_transmittal_id, 'items_changed', v_t.status, v_t.status, null, jsonb_build_object('items', v_i));
  return query select * from public.drawing_transmittal_items where transmittal_id = p_transmittal_id order by sort_order, created_at;
end;
$function$


CREATE OR REPLACE FUNCTION public.ship_piece_lots_impl(p_project_id uuid, p_piece_ids uuid[], p_reference_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT "public"."transition_piece_lots_canonical"(
    p_project_id, p_piece_ids, 'fabricated', 'shipped', 'shipped',
    coalesce(p_reference_data, '{}'::jsonb)
  );
$function$


CREATE OR REPLACE FUNCTION public.split_piece_lot_impl(p_project_id uuid, p_piece_id uuid, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_source "public"."pieces"%ROWTYPE;
  v_child "public"."pieces"%ROWTYPE;
  v_allocation jsonb;
  v_lot_code text;
  v_quantity numeric;
  v_total_quantity numeric := 0;
  v_child_ids jsonb := '[]'::jsonb;
  v_allocation_count integer;
BEGIN
  IF v_actor IS NULL
     OR NOT "public"."user_has_project_role_at_least"(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to split piece lots in this project'
      USING errcode = '42501';
  END IF;

  SELECT "piece_control_mode" INTO v_mode
  FROM "public"."projects"
  WHERE "id" = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN RAISE EXCEPTION 'Piece control is disabled for this project'; END IF;

  SELECT * INTO v_source
  FROM "public"."pieces"
  WHERE "id" = p_piece_id
    AND "project_id" = p_project_id
  FOR UPDATE;

  IF v_source.id IS NULL
     OR v_source.is_deleted = true
     OR v_source.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active source piece not found';
  END IF;
  IF v_source.is_container = true
     OR EXISTS (
       SELECT 1
       FROM "public"."pieces" AS child
       WHERE child."parent_piece_id" = v_source.id
         AND child."is_deleted" = false
         AND child."deleted_at" IS NULL
     ) THEN
    RAISE EXCEPTION 'Only an active actionable leaf lot can be split';
  END IF;
  IF v_source.lifecycle_status = ANY (ARRAY['shipped', 'delivered', 'erected']::text[]) THEN
    RAISE EXCEPTION 'A shipped, delivered, or erected lot cannot be split';
  END IF;
  IF jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Child allocations must be a JSON array';
  END IF;

  v_allocation_count := jsonb_array_length(p_allocations);
  IF v_allocation_count < 2 THEN
    RAISE EXCEPTION 'A split requires at least two child-lot allocations';
  END IF;

  FOR v_allocation IN
    SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_lot_code := upper(btrim(v_allocation->>'lot_code'));
    IF v_lot_code IS NULL OR v_lot_code = '' OR v_lot_code = 'ALL' THEN
      RAISE EXCEPTION 'Each child lot requires a non-ALL lot code';
    END IF;
    IF jsonb_typeof(v_allocation->'quantity') <> 'number' THEN
      RAISE EXCEPTION 'Each child lot quantity must be numeric';
    END IF;
    v_quantity := (v_allocation->>'quantity')::numeric;
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Each child lot quantity must be positive';
    END IF;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  IF v_total_quantity <> v_source.quantity THEN
    RAISE EXCEPTION 'Child quantities must sum exactly to the source quantity (%)', v_source.quantity;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT upper(btrim(value->>'lot_code')) AS lot_code, count(*) AS duplicate_count
      FROM jsonb_array_elements(p_allocations)
      GROUP BY upper(btrim(value->>'lot_code'))
    ) AS source_codes
    WHERE duplicate_count > 1
  ) THEN
    RAISE EXCEPTION 'Child lot codes must be unique within the split';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."pieces" AS existing_piece
    JOIN jsonb_array_elements(p_allocations) AS allocation(value)
      ON existing_piece."lot_code" = upper(btrim(allocation.value->>'lot_code'))
    WHERE existing_piece."project_id" = p_project_id
      AND existing_piece."normalized_piece_mark" = v_source.normalized_piece_mark
      AND existing_piece."is_deleted" = false
      AND existing_piece."deleted_at" IS NULL
      AND existing_piece."id" <> v_source.id
  ) THEN
    RAISE EXCEPTION 'A child lot code already exists for this piece mark';
  END IF;

  UPDATE "public"."pieces"
  SET "is_container" = true,
      "updated_at" = now()
  WHERE "id" = v_source.id;

  FOR v_allocation IN
    SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_lot_code := upper(btrim(v_allocation->>'lot_code'));
    v_quantity := (v_allocation->>'quantity')::numeric;

    INSERT INTO "public"."pieces" (
      "project_id", "piece_mark", "lot_code", "parent_piece_id", "quantity",
      "weight_each_lbs", "weight_total_lbs", "profile", "material_grade",
      "length_inches", "sequence_number", "erection_area", "work_package_id",
      "lifecycle_status", "current_station", "on_hold", "on_hold_reason",
      "on_hold_at", "on_hold_by", "source_system", "external_ref",
      "metadata", "is_deleted", "is_container"
    ) VALUES (
      v_source.project_id,
      v_source.piece_mark,
      v_lot_code,
      v_source.id,
      v_quantity,
      v_source.weight_each_lbs,
      CASE
        WHEN v_source.weight_each_lbs IS NOT NULL
          THEN v_source.weight_each_lbs * v_quantity
        WHEN v_source.weight_total_lbs IS NOT NULL
          THEN (v_source.weight_total_lbs / v_source.quantity) * v_quantity
        ELSE NULL
      END,
      v_source.profile,
      v_source.material_grade,
      v_source.length_inches,
      v_source.sequence_number,
      v_source.erection_area,
      v_source.work_package_id,
      v_source.lifecycle_status,
      v_source.current_station,
      v_source.on_hold,
      v_source.on_hold_reason,
      v_source.on_hold_at,
      v_source.on_hold_by,
      v_source.source_system,
      v_source.external_ref,
      coalesce(v_source.metadata, '{}'::jsonb) || jsonb_build_object(
        'split_from_piece_id', v_source.id,
        'split_at', now()
      ),
      false,
      false
    )
    RETURNING * INTO v_child;

    INSERT INTO "public"."piece_drawings" (
      "project_id", "piece_id", "drawing_id", "created_by"
    )
    SELECT "project_id", v_child.id, "drawing_id", v_actor
    FROM "public"."piece_drawings"
    WHERE "piece_id" = v_source.id
    ON CONFLICT ("piece_id", "drawing_id") DO NOTHING;

    INSERT INTO "public"."piece_material_requirements" (
      "project_id", "material_requirement_id", "piece_id", "created_by"
    )
    SELECT "project_id", "material_requirement_id", v_child.id, v_actor
    FROM "public"."piece_material_requirements"
    WHERE "piece_id" = v_source.id
    ON CONFLICT ("material_requirement_id", "piece_id") DO NOTHING;

    INSERT INTO "public"."piece_station_completions" (
      "project_id", "piece_id", "station_configuration_id", "station_key",
      "station_name", "sort_order", "earned_percent", "completed_at",
      "completed_by", "is_override", "override_reason",
      "inherited_from_completion_id", "metadata"
    )
    SELECT
      completion."project_id",
      v_child.id,
      completion."station_configuration_id",
      completion."station_key",
      completion."station_name",
      completion."sort_order",
      completion."earned_percent",
      completion."completed_at",
      completion."completed_by",
      completion."is_override",
      completion."override_reason",
      completion."id",
      completion."metadata" || jsonb_build_object('inherited_by_lot_split', true)
    FROM "public"."piece_station_completions" AS completion
    WHERE completion."piece_id" = v_source.id
    ORDER BY completion."sort_order";

    v_child_ids := v_child_ids || jsonb_build_array(
      jsonb_build_object(
        'piece_id', v_child.id,
        'lot_code', v_child.lot_code,
        'quantity', v_child.quantity
      )
    );
  END LOOP;

  INSERT INTO "public"."piece_events" (
    "project_id", "piece_id", "event_type", "previous_state", "next_state",
    "reason", "source_system", "created_by"
  ) VALUES (
    p_project_id,
    v_source.id,
    'lot_split',
    jsonb_build_object(
      'lot_code', v_source.lot_code,
      'quantity', v_source.quantity,
      'is_container', false
    ),
    jsonb_build_object(
      'is_container', true,
      'children', v_child_ids
    ),
    'Piece quantity split into actionable child lots',
    'piece_control',
    v_actor
  );

  RETURN jsonb_build_object(
    'source_piece_id', v_source.id,
    'source_is_container', true,
    'source_quantity', v_source.quantity,
    'allocated_quantity', v_total_quantity,
    'children', v_child_ids
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.submittal_bic_class(p_bic text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_bic is null or btrim(p_bic) = '' then 'detailer'
    when p_bic ~* '^closed$' then 'closed'
    when p_bic ~* '\m(eor|engineer|architect|aor|design|lge)\M' then 'approver'
    when p_bic ~* '\m(gc|general contractor|owner|construction manager|cm)\M' then 'downstream'
    else 'detailer' end;
$function$


CREATE OR REPLACE FUNCTION public.submittal_derived_stage(p_status text, p_bic text, p_approved_date date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_status
    when 'Draft' then 'IFA'
    when 'Submitted' then case when public.submittal_bic_class(p_bic) = 'detailer' then 'IFA' else 'OFA' end
    when 'Under Review' then case when public.submittal_bic_class(p_bic) = 'detailer' then 'IFA' else 'OFA' end
    when 'Approved' then case public.submittal_bic_class(p_bic) when 'downstream' then 'IFC' when 'closed' then 'IFC' when 'approver' then 'BFA' else 'OFS' end
    when 'Approved as Noted' then case public.submittal_bic_class(p_bic)
        when 'downstream' then 'IFC' when 'closed' then 'IFC' when 'approver' then 'BFA'
        else case when p_approved_date is null then 'BFA' else 'OFS' end end
    when 'Revise and Resubmit' then 'R&R'
    when 'Rejected' then 'R&R'
    when 'Released for Fabrication' then 'Released'
    else 'Not Started' end;
$function$


CREATE OR REPLACE FUNCTION public.submittal_ofs_checklist_complete(p_metadata jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce((p_metadata->'ofs_checklist'->>'markups_incorporated')::boolean, false)
     and coalesce((p_metadata->'ofs_checklist'->>'comments_addressed')::boolean, false)
     and coalesce((p_metadata->'ofs_checklist'->>'sheets_ready')::boolean, false)
     and coalesce((p_metadata->'ofs_checklist'->>'authorized_to_issue')::boolean, false);
$function$


CREATE OR REPLACE FUNCTION public.supersede_document(p_document_id uuid, p_payload jsonb)
 RETURNS documents
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_old public.documents;
  v_new public.documents;
  v_prev text;
  v_rev text;
  v_file_url text := nullif(btrim(coalesce(p_payload ->> 'file_url', '')), '');
begin
  select * into v_old from public.documents d where d.id = p_document_id and d.is_deleted = false;
  if not found then raise exception 'Document not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_old.project_id, 'field') then raise exception 'Revising a document needs field access' using errcode = '42501'; end if;
  if v_old.is_current = false or v_old.status = 'Superseded' then raise exception 'Only the current revision can be revised' using errcode = '22023'; end if;
  if v_file_url is null then raise exception 'The new revision needs a file' using errcode = '23514'; end if;
  if v_file_url = v_old.file_url then raise exception 'The new revision must be a different file' using errcode = '22023'; end if;
  v_prev := coalesce(current_setting('steelbuild.doc_rpc', true), '');
  perform set_config('steelbuild.doc_rpc', 'on', true);
  v_rev := case when coalesce(v_old.revision_number, '0') ~ '^\d+$' then (v_old.revision_number::int + 1)::text else coalesce(v_old.revision_number, '0') || '.1' end;
  insert into public.documents (
    project_id, project_name, title, document_type, category, file_url, file_name, file_size, file_size_kb, mime_type, file_type,
    version, status, description, tags, discipline, drawing_number, revision, sheet_number, revision_number, revision_date,
    linked_wp_id, review_lead_time, due_date, is_submittal, work_package_id, rfi_id, delivery_id, change_order_id, submittal_id,
    folder_id, import_source, supersedes_id, revision_note, notes, metadata
  ) values (
    v_old.project_id, v_old.project_name, coalesce(nullif(btrim(coalesce(p_payload ->> 'title', '')), ''), v_old.title), v_old.document_type, v_old.category,
    v_file_url, coalesce(nullif(btrim(coalesce(p_payload ->> 'file_name', '')), ''), v_old.file_name), null,
    coalesce((p_payload ->> 'file_size_kb')::int, v_old.file_size_kb), coalesce(nullif(p_payload ->> 'mime_type', ''), v_old.mime_type), coalesce(nullif(p_payload ->> 'file_type', ''), v_old.file_type),
    v_old.version, coalesce(nullif(p_payload ->> 'status', ''), case when v_old.status in ('Superseded', 'Void') then 'Current' else v_old.status end),
    v_old.description, v_old.tags, v_old.discipline, v_old.drawing_number, v_old.revision, v_old.sheet_number, v_rev, coalesce((p_payload ->> 'revision_date')::date, current_date),
    v_old.linked_wp_id, v_old.review_lead_time, v_old.due_date, v_old.is_submittal, v_old.work_package_id, v_old.rfi_id, v_old.delivery_id, v_old.change_order_id, v_old.submittal_id,
    v_old.folder_id, 'upload', v_old.id, nullif(btrim(coalesce(p_payload ->> 'revision_note', '')), ''), null, coalesce(v_old.metadata, '{}'::jsonb)
  ) returning * into v_new;
  update public.documents set status = 'Superseded', is_current = false, superseded_by_id = v_new.id where id = v_old.id;
  perform set_config('steelbuild.doc_rpc', v_prev, true);
  return v_new;
exception when others then
  perform set_config('steelbuild.doc_rpc', v_prev, true);
  raise;
end $function$


CREATE OR REPLACE FUNCTION public.sync_gc_drawing_set_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_set uuid;
begin
  for v_set in select distinct s from unnest(array[case when tg_op <> 'INSERT' then old.gc_drawing_set_id end, case when tg_op <> 'DELETE' then new.gc_drawing_set_id end]) as s where s is not null loop
    update public.gc_drawing_sets set sheet_count = (select count(*) from public.gc_drawings d where d.gc_drawing_set_id = v_set and not d.is_deleted) where id = v_set;
  end loop;
  return null;
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_model_fab_status(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_n int;
begin
  if not public.user_has_project_role_at_least(p_project_id, 'field') then raise exception 'Field access or higher is required' using errcode = '42501'; end if;
  update public.model_elements e set fab_status = p.lifecycle_status
    from public.pieces p
   where e.project_id = p_project_id and not e.is_deleted and p.id = e.piece_id and p.is_deleted = false
     and p.lifecycle_status in ('not_started', 'released', 'in_fabrication', 'fabricated', 'shipped', 'delivered', 'erected')
     and e.fab_status is distinct from p.lifecycle_status;
  get diagnostics v_n = row_count;
  return jsonb_build_object('project_id', p_project_id, 'updated', v_n, 'synced_at', now());
end $function$


CREATE OR REPLACE FUNCTION public.transmit_submittal_round(p_submittal_id uuid, p_submitted_date date, p_ball_in_court text, p_reviewer text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_drawing_set_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS submittal_rounds
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_sub public.submittals%rowtype; v_round public.submittal_rounds%rowtype; v_n integer;
begin
  select * into v_sub from public.submittals where id = p_submittal_id for update;
  if not found then raise exception 'Submittal not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_sub.project_id, 'pm') then raise exception 'Transmitting requires PM or admin' using errcode = '42501'; end if;
  if coalesce(btrim(p_ball_in_court), '') = '' then raise exception 'Record who receives the transmittal (ball-in-court)' using errcode = '23514'; end if;
  if p_submitted_date is null then raise exception 'Record the submission date' using errcode = '23514'; end if;
  select coalesce(max(round_number), 0) + 1 into v_n from public.submittal_rounds where submittal_id = p_submittal_id;
  insert into public.submittal_rounds (project_id, submittal_id, round_number, submitted_date, status, ball_in_court, submitted_by, reviewer, response_notes, drawing_set_ids)
  values (v_sub.project_id, p_submittal_id, v_n, p_submitted_date, 'Submitted', btrim(p_ball_in_court), (select coalesce(nullif(btrim(up.full_name), ''), up.email) from public.user_profiles up where up.id = (select auth.uid())), nullif(p_reviewer, ''), nullif(p_notes, ''), coalesce(p_drawing_set_ids, v_sub.drawing_set_ids))
  returning * into v_round;
  update public.submittals
     set status = 'Submitted', ball_in_court = btrim(p_ball_in_court), submitted_date = p_submitted_date, returned_date = null,
         round_number = v_n, total_rounds = v_n, current_round_id = v_round.id, reviewer = coalesce(nullif(p_reviewer, ''), reviewer),
         drawing_set_ids = coalesce(p_drawing_set_ids, drawing_set_ids)
   where id = p_submittal_id;
  perform public.log_submittal_event(v_sub.project_id, p_submittal_id, 'round_created', null, 'Round ' || v_n, jsonb_build_object('round_id', v_round.id, 'ball_in_court', btrim(p_ball_in_court), 'submitted_date', p_submitted_date));
  return v_round;
end;
$function$


CREATE OR REPLACE FUNCTION public.unlink_piece_drawing_set(p_project_id uuid, p_piece_id uuid, p_drawing_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
  v_deleted integer := 0;
BEGIN
  IF v_actor IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'field') THEN
    RAISE EXCEPTION 'Not authorized to unlink piece drawing sets in this project'
      USING errcode = '42501';
  END IF;

  SELECT piece_control_mode INTO v_mode
  FROM public.projects
  WHERE id = p_project_id;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_mode = 'off' THEN
    RAISE EXCEPTION 'Piece control is disabled for this project';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pieces
    WHERE id = p_piece_id AND project_id = p_project_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.drawing_sets
    WHERE id = p_drawing_set_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'Piece and drawing set must belong to the same project';
  END IF;

  DELETE FROM public.piece_drawing_sets
  WHERE project_id = p_project_id
    AND piece_id = p_piece_id
    AND drawing_set_id = p_drawing_set_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 1 THEN
    INSERT INTO public.piece_events (
      project_id, piece_id, event_type, previous_state, next_state,
      reason, source_system, created_by
    ) VALUES (
      p_project_id,
      p_piece_id,
      'drawing_set_unlinked',
      jsonb_build_object('drawing_set_id', p_drawing_set_id),
      '{}'::jsonb,
      'Drawing set unlinked through Piece Control',
      'piece_control',
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'piece_id', p_piece_id,
    'drawing_set_id', p_drawing_set_id,
    'unlinked', v_deleted = 1,
    'unchanged', v_deleted = 0
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.void_rfi(p_rfi_id uuid, p_reason text)
 RETURNS rfis
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_rfi public.rfis%rowtype;
begin
  select * into v_rfi from public.rfis where id = p_rfi_id for update;
  if not found then raise exception 'RFI not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_rfi.project_id, 'pm') then raise exception 'Voiding an RFI requires PM or admin' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A void reason is required' using errcode = '23514'; end if;
  update public.rfis set status = 'Void', void_reason = btrim(p_reason), ball_in_court = 'Closed' where id = p_rfi_id returning * into v_rfi;
  return v_rfi;
end;
$function$


CREATE OR REPLACE FUNCTION public.void_transmittal(p_transmittal_id uuid, p_reason text)
 RETURNS drawing_transmittals
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_t public.drawing_transmittals%rowtype; v_from text;
begin
  select * into v_t from public.drawing_transmittals where id = p_transmittal_id for update;
  if not found then raise exception 'Transmittal not found' using errcode = 'P0002'; end if;
  if not public.user_has_project_role_at_least(v_t.project_id, 'pm') then raise exception 'Voiding transmittals requires PM or admin' using errcode = '42501'; end if;
  if v_t.status = 'void' then raise exception '% is already void', v_t.transmittal_number using errcode = '22023'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A void reason is required' using errcode = '23514'; end if;
  v_from := v_t.status;
  perform set_config('steelbuild.transmittal_rpc', '1', true);
  update public.drawing_transmittals set status = 'void', void_reason = btrim(p_reason), voided_at = now(), voided_by = (select auth.uid())
   where id = p_transmittal_id returning * into v_t;
  if v_t.submittal_id is not null then
    update public.submittals set transmittal_number = null where id = v_t.submittal_id and transmittal_number = v_t.transmittal_number;
  end if;
  perform set_config('steelbuild.transmittal_rpc', '', true);
  perform public.log_transmittal_event(v_t.project_id, p_transmittal_id, 'voided', v_from, 'void', p_reason, '{}'::jsonb);
  return v_t;
end;
$function$


CREATE OR REPLACE FUNCTION public.work_package_drawing_set_reports(p_work_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_project_id uuid; v_set_id uuid; v_eval jsonb; v_reports jsonb := '[]'::jsonb;
begin
  select project_id into v_project_id from public.work_packages where id = p_work_package_id;
  if v_project_id is null then return v_reports; end if;
  for v_set_id in
    with scope as (
      select piece.id from public.pieces piece
       where piece.project_id = v_project_id and piece.work_package_id = p_work_package_id
         and piece.deleted_at is null and piece.is_deleted = false
         and piece.lifecycle_status not in ('shipped', 'delivered', 'erected')
         and not exists (select 1 from public.pieces child where child.parent_piece_id = piece.id and child.deleted_at is null and child.is_deleted = false)
    )
    select distinct s.set_id from (
      select d.drawing_set_id as set_id
        from public.piece_drawings pd join scope on scope.id = pd.piece_id
        join public.drawings d on d.id = pd.drawing_id and d.is_deleted = false and d.deleted_at is null
       where pd.project_id = v_project_id
      union
      select pds.drawing_set_id from public.piece_drawing_sets pds join scope on scope.id = pds.piece_id where pds.project_id = v_project_id
    ) s
    join public.drawing_sets ds on ds.id = s.set_id and ds.is_deleted = false
    order by 1
  loop
    v_eval := public.evaluate_fab_release_set(v_project_id, v_set_id);
    v_reports := v_reports || jsonb_build_object(
      'drawing_set_id', v_set_id, 'set_name', v_eval ->> 'set_name', 'ok', coalesce((v_eval ->> 'ok')::boolean, false),
      'governing_stage', v_eval ->> 'governing_stage', 'submittal_id', v_eval -> 'submittal_id', 'submittal_number', v_eval -> 'submittal_number',
      'blockers', coalesce(v_eval -> 'blockers', '[]'::jsonb), 'sheet_count', v_eval -> 'sheet_count');
  end loop;
  return v_reports;
end $function$


CREATE OR REPLACE FUNCTION public._tmp_timeout_probe()
 RETURNS text
 LANGUAGE plpgsql
 SET statement_timeout TO '1s'
 SET search_path TO ''
AS $function$ begin perform pg_sleep(3); return 'slept 3s WITHOUT being cancelled -> function-level SET does NOT re-arm'; end $function$
