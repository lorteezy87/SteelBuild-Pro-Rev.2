-- LOCAL CANDIDATE: manual, reviewed application only; never db push/repair.
-- This shared project's Auth is the enrollment authority for BOTH apps.
-- Opt-in MFA: no verified factor -> onboarding remains available at AAL1;
-- verified factor -> AAL2 is required before protected Data API/Storage access.
-- Auth challenge/enroll endpoints, anon requests and service webhooks are unchanged.
-- Docs: https://supabase.com/docs/guides/auth/auth-mfa#enforce-rules-for-mfa-logins
--       https://supabase.com/docs/guides/api/securing-your-api#pre-request-checks
BEGIN;

-- Never silently replace another app's request guard or pre-config function.
-- Production read-only catalog check (2026-10-07): neither setting exists.
DO $guard$
DECLARE setting text;
BEGIN
  FOR setting IN
    SELECT unnest(s.setconfig)
    FROM pg_catalog.pg_db_role_setting s
    WHERE s.setrole IN (0, (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticator'))
      AND s.setdatabase IN (0, (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()))
  LOOP
    IF setting LIKE 'pgrst.db_pre_request=%'
       AND split_part(setting, '=', 2) NOT IN ('', 'steelbuild_security.check_request_mfa') THEN
      RAISE EXCEPTION 'Existing PostgREST pre-request hook requires a reviewed composition: %', setting;
    END IF;
    IF setting LIKE 'pgrst.db_pre_config=%' AND split_part(setting, '=', 2) <> '' THEN
      RAISE EXCEPTION 'Existing PostgREST pre-config requires review before MFA enforcement';
    END IF;
  END LOOP;
  IF coalesce(current_setting('pgrst.db_pre_request', true), '') NOT IN ('', 'steelbuild_security.check_request_mfa')
     OR coalesce(current_setting('pgrst.db_pre_config', true), '') <> '' THEN
    RAISE EXCEPTION 'Existing PostgREST request configuration requires review before MFA enforcement';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS steelbuild_security;
REVOKE ALL ON SCHEMA steelbuild_security FROM PUBLIC;
GRANT USAGE ON SCHEMA steelbuild_security TO anon, authenticated, service_role;

-- Definer access is limited to this caller's current enrollment status; it
-- exposes no factor IDs/secrets and accepts no caller-controlled user ID.
CREATE OR REPLACE FUNCTION steelbuild_security.satisfies_mfa()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND coalesce((SELECT auth.jwt()->>'aal'), 'aal1') IN ('aal1', 'aal2')
    AND (
      (SELECT auth.jwt()->>'aal') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors
        WHERE user_id = (SELECT auth.uid()) AND status = 'verified'
      )
    );
$function$;
REVOKE ALL ON FUNCTION steelbuild_security.satisfies_mfa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION steelbuild_security.satisfies_mfa() TO authenticated;

-- Invoker context is intentional: current_user is the role selected by
-- PostgREST from its verified JWT, never the function owner's elevated role.
-- This runs BEFORE table/view reads and SECURITY DEFINER RPC invocation.
CREATE OR REPLACE FUNCTION steelbuild_security.check_request_mfa()
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN; END IF;
  IF NOT coalesce(steelbuild_security.satisfies_mfa(), false) THEN
    RAISE insufficient_privilege USING
      MESSAGE = 'MFA_REQUIRED: Complete multi-factor authentication to continue';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION steelbuild_security.check_request_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION steelbuild_security.check_request_mfa() TO anon, authenticated, service_role;

-- Storage does not execute PostgREST hooks. Restrictive AND-composition retains
-- every existing bucket/tenant permission for SELECT, INSERT, UPDATE and DELETE.
DROP POLICY IF EXISTS require_enrolled_mfa ON storage.objects;
CREATE POLICY require_enrolled_mfa ON storage.objects
AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT steelbuild_security.satisfies_mfa()))
WITH CHECK ((SELECT steelbuild_security.satisfies_mfa()));

-- Realtime also bypasses the Data API hook. Cover precisely the currently
-- published tables; do not rewrite policies on unrelated sibling-app tables.
-- A future publication addition must install this same restrictive policy.
DO $realtime$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT p.schemaname, p.tablename, c.relrowsecurity
    FROM pg_catalog.pg_publication_tables p
    JOIN pg_catalog.pg_namespace n ON n.nspname = p.schemaname
    JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = p.tablename
    WHERE p.pubname = 'supabase_realtime'
  LOOP
    IF NOT target.relrowsecurity THEN
      RAISE EXCEPTION 'Published table %.% must have reviewed RLS before MFA enforcement', target.schemaname, target.tablename;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS require_enrolled_mfa ON %I.%I', target.schemaname, target.tablename);
    EXECUTE format(
      'CREATE POLICY require_enrolled_mfa ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT steelbuild_security.satisfies_mfa())) WITH CHECK ((SELECT steelbuild_security.satisfies_mfa()))',
      target.schemaname, target.tablename
    );
  END LOOP;
END
$realtime$;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'steelbuild_security.check_request_mfa';
NOTIFY pgrst, 'reload config';
COMMIT;
