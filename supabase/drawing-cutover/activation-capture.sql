-- OPERATOR REVIEW CAPTURE ONLY, after the disabled installation has committed.
-- No object creation/reinstallation. Use only these SAME installed object instances.
-- Output contains complete function definitions and catalog metadata: retain privately.
-- This does not approve, classify, set review bindings, or activate the package.
BEGIN;
DO $capture_guard$
DECLARE role_name text; signature text;
BEGIN
  IF EXISTS(SELECT 1 FROM steelbuild_drawing_revision.package_review) THEN RAISE EXCEPTION 'CUTOVER_ALREADY_REVIEWED'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH signature IN ARRAY ARRAY['public.create_drawing_set_from_review(uuid,jsonb)','public.apply_drawing_set_revision(uuid,jsonb)'] LOOP
      IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'CUTOVER_NOT_DISABLED'; END IF;
    END LOOP;
  END LOOP;
END $capture_guard$;
SELECT 'installed_disabled' AS state, steelbuild_drawing_revision.catalog_snapshot() AS catalog,
  steelbuild_drawing_revision.catalog_fingerprint() AS sha256;
GRANT EXECUTE ON FUNCTION public.create_drawing_set_from_review(uuid,jsonb),public.apply_drawing_set_revision(uuid,jsonb) TO authenticated;
SELECT 'prospective_enabled_same_instances' AS state, steelbuild_drawing_revision.catalog_snapshot() AS catalog,
  steelbuild_drawing_revision.catalog_fingerprint() AS sha256;
ROLLBACK;
