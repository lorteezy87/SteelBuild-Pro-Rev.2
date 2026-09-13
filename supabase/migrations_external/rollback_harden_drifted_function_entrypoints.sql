-- MANUAL rollback evidence only; never include in active migration globs.
-- Restores the audited 2026-09-13 production ACLs and absent indexes.
-- This reopens the direct-call permissions repaired by the forward migration.
-- Use only to roll back that exact repair, after inspecting current source.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.release_work_package_canonical_impl(uuid,text)'))
       IS DISTINCT FROM '298bed7b45a7e20d8fce3a0f64955821'
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.sync_gc_drawing_set_counts()'))
       IS DISTINCT FROM '20a1d7316fd15d55d715636cf514f8b2'
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public._tmp_timeout_probe()'))
       IS DISTINCT FROM '0a8f994eda47b5701a610613f104833e' THEN
    RAISE EXCEPTION 'Rollback refused: functions differ from audited production';
  END IF;
END;
$guard$;
GRANT EXECUTE ON FUNCTION public.release_work_package_canonical_impl(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_gc_drawing_set_counts(),public._tmp_timeout_probe() TO PUBLIC,authenticated;
ALTER FUNCTION public._tmp_timeout_probe() RESET search_path;
DROP INDEX IF EXISTS public.idx_drawing_transmittal_items_drawing_id;
DROP INDEX IF EXISTS public.idx_drawing_transmittal_items_gc_drawing_id;
NOTIFY pgrst,'reload schema';
COMMIT;
