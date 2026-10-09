-- LOCAL CANDIDATE. Review/apply/stamp manually; never db push or migration repair.
-- SBSEC-07: the parent supplies event tenancy; PM authorization matches all
-- existing transmit/response/revision-attachment workflow callers. This remains
-- a PM-authored event API, not a claim that arbitrary event text proves a real
-- lifecycle transition. Existing internal calls and the RPC signature remain.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.log_submittal_event(
  p_project_id uuid, p_submittal_id uuid, p_event text, p_from text, p_to text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project_id uuid;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  -- Lock the parent while binding the event so a concurrent project change or
  -- deletion cannot detach authorization from the inserted activity row.
  SELECT s.project_id INTO v_project_id FROM public.submittals s
    WHERE s.id = p_submittal_id AND NOT coalesce(s.is_deleted, false)
    FOR SHARE;
  IF NOT FOUND OR p_project_id IS DISTINCT FROM v_project_id
     OR NOT public.user_has_project_access(v_project_id)
     OR NOT public.user_has_project_role_at_least(v_project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.submittal_activity
    (project_id, submittal_id, event_type, from_value, to_value, actor_id, metadata)
  VALUES
    (v_project_id, p_submittal_id, p_event, p_from, p_to, v_actor_id, coalesce(p_meta, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.log_submittal_event(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_submittal_event(uuid, uuid, text, text, text, jsonb) TO authenticated;
-- Direct activity writes bypass parent/actor provenance and are not used by
-- the application; internal callers append through the function above.
REVOKE INSERT, UPDATE, DELETE ON public.submittal_activity FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
