-- Owner decision 2026-09-21: every project member may raise a change request.
-- Keep the org-aware membership boundary, invoker security, atomic numbering,
-- validation, audit triggers, and PM-only update policy.
SET LOCAL lock_timeout = '5s';

ALTER POLICY change_requests_insert ON public.change_requests
  WITH CHECK (public.user_has_project_access(project_id));

CREATE OR REPLACE FUNCTION public.create_change_request(p_project_id uuid, p_payload jsonb)
 RETURNS change_requests
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_seq integer; v_row public.change_requests;
begin
  if not public.user_has_project_access(p_project_id) then raise exception 'Not authorized to raise change requests for this project' using errcode = '42501'; end if;
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
end $function$;

NOTIFY pgrst, 'reload schema';
