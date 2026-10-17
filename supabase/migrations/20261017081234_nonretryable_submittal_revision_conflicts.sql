-- Deterministic review conflicts are HTTP 409, not serialization failures.
-- PostgREST 14 retries SQLSTATE 40001, so an already-stale reviewed command
-- loops instead of returning the rejection needed by the recovery UI.
-- Preserve installed bodies (including newer guards), identities and grants.
-- Fail the entire statement if any exact reviewed guard is missing/duplicated.
-- Apply and stamp this exact committed file manually; production remains held.
DO $migration$
DECLARE
  patch record;
  target regprocedure;
  definition text;
BEGIN
  FOR patch IN SELECT * FROM (VALUES
    ('steelbuild_workflow.apply_round(uuid,uuid,timestamp with time zone,text,uuid,uuid[],jsonb,boolean,text)',
     $guard$RAISE EXCEPTION 'ROUND_STALE: Reload the submittal before applying a workflow command' USING ERRCODE='40001';$guard$),
    ('steelbuild_workflow.apply_round(uuid,uuid,timestamp with time zone,text,uuid,uuid[],jsonb,boolean,text)',
     $guard$RAISE EXCEPTION 'ROUND_STALE_ROSTER: The complete current revision roster changed; review it again' USING ERRCODE='40001';$guard$),
    ('public.publish_drawing_revision(uuid,text)',
     $guard$RAISE EXCEPTION 'ROUND_STALE_ROSTER: The revision parent changed; reload' USING ERRCODE='40001';$guard$)
  ) AS reviewed(signature, old_guard)
  LOOP
    target := pg_catalog.to_regprocedure(patch.signature);
    IF target IS NULL THEN
      RAISE EXCEPTION 'CONFLICT_PATCH_DRIFT: Missing reviewed function %', patch.signature;
    END IF;
    definition := pg_catalog.pg_get_functiondef(target);
    IF (length(definition)-length(replace(definition,patch.old_guard,''))) / length(patch.old_guard) <> 1 THEN
      RAISE EXCEPTION 'CONFLICT_PATCH_DRIFT: Expected exactly one reviewed guard in %', patch.signature;
    END IF;
    EXECUTE replace(definition,patch.old_guard,replace(patch.old_guard,$code$ERRCODE='40001'$code$,$code$ERRCODE='PT409'$code$));
  END LOOP;
END $migration$;

NOTIFY pgrst, 'reload schema';
