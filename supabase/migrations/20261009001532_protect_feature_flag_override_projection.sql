-- CANDIDATE ONLY: reviewed manual application and exact ledger stamp required.
-- The application loads only its effective values; raw override email maps
-- remain available exclusively to existing platform administrators/service.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER POLICY feature_flags_select ON public.feature_flags
  USING ((SELECT public.user_is_system_admin()));
CREATE POLICY feature_flags_platform_admin_read_guard ON public.feature_flags
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.user_is_system_admin()));

CREATE FUNCTION public.list_effective_feature_flags()
RETURNS TABLE(flag_key text, enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_email text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  -- Resolve the current account on the server, never an email supplied by the
  -- browser or a stale/user-editable claim. A deleted account gets no flags.
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current account required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT f.flag_key, coalesce(o.value::text::boolean, f.enabled, false)
  FROM public.feature_flags f
  LEFT JOIN LATERAL (
    SELECT e.value FROM jsonb_each(
      CASE WHEN jsonb_typeof(f.user_overrides) = 'object'
        THEN f.user_overrides ELSE '{}'::jsonb END
    ) e
    WHERE lower(e.key) = v_email AND jsonb_typeof(e.value) = 'boolean'
    -- Canonical lowercase wins; legacy mixed-case boolean keys still work.
    ORDER BY (e.key = v_email) DESC, e.key
    LIMIT 1
  ) o ON true
  ORDER BY f.flag_key;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_effective_feature_flags() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_effective_feature_flags() TO authenticated;
-- This server helper accepts an arbitrary email and must remain internal.
REVOKE ALL ON FUNCTION public.feature_flag_enabled_for(text,text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.list_effective_feature_flags() IS
  'Current authenticated account effective feature values only; never returns emails, descriptions, metadata or raw override maps.';

-- Admin edits target an email case-insensitively, matching the projection.
-- Remove legacy case variants of that email without overwriting peer entries.
CREATE OR REPLACE FUNCTION public.set_feature_flag_override(p_flag_key text, p_email text, p_value boolean)
RETURNS public.feature_flags
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_row public.feature_flags;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_previous text := coalesce(current_setting('steelbuild.flag_rpc', true), '');
BEGIN
  IF NOT coalesce(public.user_is_system_admin(), false) THEN
    RAISE EXCEPTION 'Only a system administrator can change feature flags' USING ERRCODE = '42501';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid override email' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('steelbuild.flag_rpc', 'on', true);
  UPDATE public.feature_flags f
  SET user_overrides = (
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    FROM jsonb_each(CASE WHEN jsonb_typeof(f.user_overrides) = 'object'
      THEN f.user_overrides ELSE '{}'::jsonb END) e
    WHERE lower(e.key) <> v_email
  ) || CASE WHEN p_value IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object(v_email, p_value) END
  WHERE f.flag_key = p_flag_key
  RETURNING * INTO v_row;
  PERFORM set_config('steelbuild.flag_rpc', v_previous, true);
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Unknown flag %', p_flag_key USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_feature_flag_override(text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_feature_flag_override(text,text,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
