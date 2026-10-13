-- Stop recreating broad function EXECUTE grants and close five internal-only
-- helpers whose original REVOKE statements named PUBLIC/anon but missed the
-- direct authenticated and service_role grants supplied by Supabase defaults.
--
-- The three erasure helpers are callable only from postgres-owned SECURITY
-- DEFINER erase RPCs and self-gate on the erase transaction context. The two
-- *_impl functions are callable only from their postgres-owned journal wrappers.
-- Repository application and Edge Function source contain no direct caller for
-- any of the five. Existing user-facing wrappers keep their explicit grants.
--
-- The global PUBLIC default and the public-schema API-role defaults are both
-- removed because PostgreSQL combines them. Future public RPCs must grant their
-- intended roles explicitly; an omitted grant will now fail closed.
--
-- This is source only. Apply and stamp through the reviewed-backend runbook;
-- never use db push, migration repair, or MCP apply_migration on the shared DB.

BEGIN;

DO $$
DECLARE
  v_identity text;
  v_oid regprocedure;
BEGIN
  FOREACH v_identity IN ARRAY ARRAY[
    'public.erasure_toggle_user_triggers(text[],boolean,text[])',
    'public.hard_delete_toggle_triggers(text[],boolean,boolean,text[])',
    'public.hard_delete_release_dependents(text,uuid[],integer)',
    'public.bulk_update_piece_attributes_impl(uuid,uuid[],jsonb)',
    'public.set_piece_hold_impl(uuid,uuid[],boolean,text)'
  ]
  LOOP
    v_oid := to_regprocedure(v_identity);

    IF v_oid IS NULL THEN
      RAISE NOTICE 'skip (absent, repo/live drift): revoke execute on %', v_identity;
      CONTINUE;
    END IF;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION 'refusing to alter %, expected SECURITY DEFINER', v_identity;
    END IF;

    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      v_identity
    );
  END LOOP;
END
$$;

-- PostgreSQL's built-in PUBLIC function default is global, while Supabase's
-- direct anon/authenticated/service_role defaults are scoped to public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
