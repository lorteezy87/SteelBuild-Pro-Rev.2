-- Forward-only repair of observed production ACL and index drift. Preserve
-- the stronger shared-production release body and all customer rows.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE
  candidate record;
  observed record;
BEGIN
  FOR candidate IN SELECT * FROM (VALUES
    ('public.release_work_package_canonical(uuid,text)', true, true,
      ARRAY['aa2b9b69ee23e033d72a1d315ccd3742','e826f9cfabca54bae9d985300f9dac99']),
    ('public.release_work_package_canonical_impl(uuid,text)', true, true,
      ARRAY['298bed7b45a7e20d8fce3a0f64955821','812ce09bbc4562be555ac8a1e4def86f']),
    ('public.sync_gc_drawing_set_counts()', false, true,
      ARRAY['20a1d7316fd15d55d715636cf514f8b2']),
    ('public._tmp_timeout_probe()', false, false,
      ARRAY['0a8f994eda47b5701a610613f104833e'])
  ) AS approved(signature, required, definer, body_hashes)
  LOOP
    SELECT p.*, r.rolname AS owner_name INTO observed
    FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
    WHERE p.oid = to_regprocedure(candidate.signature);
    IF NOT FOUND THEN
      IF candidate.required THEN
        RAISE EXCEPTION 'Drift repair prerequisite missing: %', candidate.signature;
      END IF;
      -- These optional shared-production helpers are absent in Rev.2-only replay.
      CONTINUE;
    END IF;
    IF observed.owner_name <> 'postgres'
      OR observed.prosecdef IS DISTINCT FROM candidate.definer
      OR NOT (md5(observed.prosrc) = ANY(candidate.body_hashes)) THEN
      RAISE EXCEPTION 'Unreviewed function drift: %', candidate.signature;
    END IF;
  END LOOP;
END;
$guard$;

-- The public SECURITY DEFINER wrapper remains callable and records failures.
-- Its postgres owner retains access to the implementation and newer admin gate.
REVOKE EXECUTE ON FUNCTION public.release_work_package_canonical_impl(uuid,text)
  FROM PUBLIC, anon, authenticated;

DO $optional_helpers$
BEGIN
  IF to_regprocedure('public.sync_gc_drawing_set_counts()') IS NOT NULL THEN
    -- Trigger execution does not require the caller's direct EXECUTE privilege.
    REVOKE EXECUTE ON FUNCTION public.sync_gc_drawing_set_counts()
      FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public._tmp_timeout_probe()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public._tmp_timeout_probe()
      FROM PUBLIC, anon, authenticated;
    ALTER FUNCTION public._tmp_timeout_probe() SET search_path = '';
  END IF;
END;
$optional_helpers$;

-- Production only had transmittal-first composite indexes. These reverse
-- lookup indexes are already canonical in 20260913090000; no backfill or
-- constraint replacement from that older migration is replayed here.
CREATE INDEX IF NOT EXISTS idx_drawing_transmittal_items_drawing_id
  ON public.drawing_transmittal_items (drawing_id);
CREATE INDEX IF NOT EXISTS idx_drawing_transmittal_items_gc_drawing_id
  ON public.drawing_transmittal_items (gc_drawing_id);

NOTIFY pgrst, 'reload schema';
