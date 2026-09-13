-- Run against a disposable database after all active Rev.2 migrations.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/drift_function_entrypoints.sql
-- This transaction rolls back every fixture, grant, index and catalog change.
BEGIN;

-- Exact optional production helper bodies, absent from the Rev.2 baseline.
CREATE OR REPLACE FUNCTION public._tmp_timeout_probe()
RETURNS text LANGUAGE plpgsql SET statement_timeout TO '1s'
AS $function$ begin perform pg_sleep(3); return 'slept 3s WITHOUT being cancelled -> function-level SET does NOT re-arm'; end $function$;
CREATE OR REPLACE FUNCTION public.sync_gc_drawing_set_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_set uuid;
begin
  for v_set in select distinct s from unnest(array[case when tg_op <> 'INSERT' then old.gc_drawing_set_id end, case when tg_op <> 'DELETE' then new.gc_drawing_set_id end]) as s where s is not null loop
    update public.gc_drawing_sets set sheet_count = (select count(*) from public.gc_drawings d where d.gc_drawing_set_id = v_set and not d.is_deleted) where id = v_set;
  end loop;
  return null;
end;
$function$;
GRANT EXECUTE ON FUNCTION public._tmp_timeout_probe(), public.sync_gc_drawing_set_counts() TO PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_work_package_canonical_impl(uuid,text) TO authenticated;
DROP INDEX IF EXISTS public.idx_drawing_transmittal_items_drawing_id;
DROP INDEX IF EXISTS public.idx_drawing_transmittal_items_gc_drawing_id;

CREATE TEMP TABLE drift_entrypoint_bodies AS
SELECT oid, prosrc, proowner, prosecdef FROM pg_proc
WHERE oid IN (
  'public._tmp_timeout_probe()'::regprocedure,
  'public.sync_gc_drawing_set_counts()'::regprocedure,
  'public.release_work_package_canonical(uuid,text)'::regprocedure,
  'public.release_work_package_canonical_impl(uuid,text)'::regprocedure
);

\ir ../migrations/20260913201900_harden_drifted_function_entrypoints.sql

DO $assertions$
DECLARE signature text;
BEGIN
  IF EXISTS (SELECT 1 FROM drift_entrypoint_bodies b JOIN pg_proc p ON p.oid=b.oid
    WHERE p.prosrc IS DISTINCT FROM b.prosrc OR p.proowner <> b.proowner
      OR p.prosecdef <> b.prosecdef) THEN
    RAISE EXCEPTION 'Repair changed a function body, owner or security mode';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public._tmp_timeout_probe()', 'public.sync_gc_drawing_set_counts()',
    'public.release_work_package_canonical_impl(uuid,text)'
  ] LOOP
    IF has_function_privilege('anon',signature,'execute')
      OR has_function_privilege('authenticated',signature,'execute')
      OR NOT has_function_privilege('service_role',signature,'execute') THEN
      RAISE EXCEPTION 'Wrong internal-function privileges: %', signature;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated','public.release_work_package_canonical(uuid,text)','execute') THEN
    RAISE EXCEPTION 'Public canonical wrapper lost execution privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public._tmp_timeout_probe()'::regprocedure
    AND proconfig @> ARRAY['search_path=""','statement_timeout=1s']) THEN
    RAISE EXCEPTION 'Probe search path or timeout incorrect';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='idx_drawing_transmittal_items_drawing_id'
    AND indexdef LIKE '%USING btree (drawing_id)')
    OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='idx_drawing_transmittal_items_gc_drawing_id'
    AND indexdef LIKE '%USING btree (gc_drawing_id)') THEN
    RAISE EXCEPTION 'Reverse transmittal lookup indexes missing';
  END IF;
END;
$assertions$;

SET LOCAL ROLE authenticated;
DO $deny_calls$
BEGIN
  BEGIN
    PERFORM public.release_work_package_canonical_impl(gen_random_uuid(),NULL);
    RAISE EXCEPTION 'Direct release implementation call unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public._tmp_timeout_probe();
    RAISE EXCEPTION 'Probe call unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$deny_calls$;
RESET ROLE;
ROLLBACK;
