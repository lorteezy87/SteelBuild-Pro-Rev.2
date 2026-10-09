-- CANDIDATE ONLY: reviewed manual application and exact ledger stamp required.
-- Public counter reservation is a writer action. The owner-approved viewer CR
-- workflow allocates within its INSERT so a failed row cannot consume a number.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.get_next_sequence_number(p_project_id uuid, p_record_type text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_next integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT coalesce(public.user_has_project_access(p_project_id), false)
    OR NOT coalesce(public.user_has_project_role_at_least(p_project_id, 'field'), false) THEN
    RAISE EXCEPTION 'Project writer access required to reserve a number' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.number_sequences (project_id, record_type, next_value)
  VALUES (p_project_id, p_record_type, 2)
  ON CONFLICT (project_id, record_type)
  DO UPDATE SET next_value = number_sequences.next_value + 1, updated_at = now()
  RETURNING next_value - 1 INTO v_next;
  RETURN v_next;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_next_sequence_number(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_sequence_number(uuid,text) TO authenticated;

CREATE SCHEMA IF NOT EXISTS private;
CREATE FUNCTION private.allocate_change_request_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_next integer;
BEGIN
  IF NEW.cr_number IS NOT NULL THEN RETURN NEW; END IF;
  IF (SELECT auth.uid()) IS NULL OR NOT coalesce(public.user_has_project_access(NEW.project_id), false) THEN
    RAISE EXCEPTION 'Project access required to create a change request' USING ERRCODE = '42501';
  END IF;
  -- Only this fixed record type, bound to the row being created. Existing CR
  -- guard, RLS, constraints and audit triggers still govern that same INSERT.
  INSERT INTO public.number_sequences (project_id, record_type, next_value)
  VALUES (NEW.project_id, 'change_request', 2)
  ON CONFLICT (project_id, record_type)
  DO UPDATE SET next_value = number_sequences.next_value + 1, updated_at = now()
  RETURNING next_value - 1 INTO v_next;
  NEW.cr_number := 'CR-' || lpad(v_next::text, greatest(3, length(v_next::text)), '0');
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.allocate_change_request_number() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zz_allocate_change_request_number
BEFORE INSERT ON public.change_requests
FOR EACH ROW EXECUTE FUNCTION private.allocate_change_request_number();

CREATE OR REPLACE FUNCTION public.create_change_request(p_project_id uuid, p_payload jsonb)
RETURNS public.change_requests LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE v_row public.change_requests;
  v_previous text := coalesce(current_setting('steelbuild.co_rpc', true), '');
BEGIN
  IF NOT coalesce(public.user_has_project_access(p_project_id),false) THEN
    RAISE EXCEPTION 'Not authorized to raise change requests for this project' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_payload ->> 'title'), '') = '' THEN
    RAISE EXCEPTION 'title is required' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('steelbuild.co_rpc', 'on', true);
  INSERT INTO public.change_requests (project_id, project_name, cr_number, title, description, requested_by, request_date, reason, affected_areas, estimated_cost_impact, estimated_schedule_impact_days, priority, status, scope_impact, metadata)
  VALUES (p_project_id, (SELECT name FROM public.projects WHERE id = p_project_id), NULL, btrim(p_payload ->> 'title'), nullif(p_payload ->> 'description', ''),
    coalesce(nullif(p_payload ->> 'requested_by', ''), auth.jwt() ->> 'email'), coalesce(nullif(p_payload ->> 'request_date', '')::date, current_date), nullif(p_payload ->> 'reason', ''),
    nullif(p_payload ->> 'affected_areas', ''), nullif(p_payload ->> 'estimated_cost_impact', '')::numeric, nullif(p_payload ->> 'estimated_schedule_impact_days', '')::int,
    coalesce(nullif(p_payload ->> 'priority', ''), 'Medium'), coalesce(nullif(p_payload ->> 'status', ''), 'Submitted'), nullif(p_payload ->> 'scope_impact', ''), coalesce(p_payload -> 'metadata', '{}'::jsonb))
  RETURNING * INTO v_row;
  PERFORM set_config('steelbuild.co_rpc', v_previous, true);
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_change_request(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_change_request(uuid,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
