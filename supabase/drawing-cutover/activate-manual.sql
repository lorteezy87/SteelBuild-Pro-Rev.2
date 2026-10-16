-- MANUAL ACTIVATION ONLY, after independent full catalog and caller/owner review.
-- Every setting below must be an externally reviewed literal. No capture defaults.
-- Never reuse physical hashes after reinstall, from a rehearsal or another database.
BEGIN;
DO $activation_preconditions$
BEGIN
  IF coalesce(current_setting('drawing_cutover.project_ref',true),'') !~ '^[a-z]{20}$'
    OR coalesce(current_setting('drawing_cutover.reviewed_source_commit',true),'') !~ '^[a-f0-9]{40}$'
    OR coalesce(current_setting('drawing_cutover.reviewed_classification_sha256',true),'') !~ '^[a-f0-9]{64}$'
    OR coalesce(current_setting('drawing_cutover.expected_disabled_sha256',true),'') !~ '^[a-f0-9]{64}$'
    OR coalesce(current_setting('drawing_cutover.expected_enabled_sha256',true),'') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'CUTOVER_REVIEW_BINDINGS_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM steelbuild_drawing_revision.package_review)
    OR has_function_privilege('authenticated','public.create_drawing_set_from_review(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.apply_drawing_set_revision(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'CUTOVER_NOT_DISABLED'; END IF;
  IF steelbuild_drawing_revision.catalog_fingerprint() IS DISTINCT FROM current_setting('drawing_cutover.expected_disabled_sha256') THEN
    RAISE EXCEPTION 'CUTOVER_DISABLED_CATALOG_MISMATCH'; END IF;
END $activation_preconditions$;
GRANT EXECUTE ON FUNCTION public.create_drawing_set_from_review(uuid,jsonb),public.apply_drawing_set_revision(uuid,jsonb) TO authenticated;
DO $activation_review$
BEGIN
  IF steelbuild_drawing_revision.catalog_fingerprint() IS DISTINCT FROM current_setting('drawing_cutover.expected_enabled_sha256') THEN
    RAISE EXCEPTION 'CUTOVER_ENABLED_CATALOG_MISMATCH'; END IF;
  IF has_function_privilege('anon','public.create_drawing_set_from_review(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.apply_drawing_set_revision(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','public.create_drawing_set_from_review(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','public.apply_drawing_set_revision(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'CUTOVER_EFFECTIVE_EXECUTE_EXPOSURE'; END IF;
  INSERT INTO steelbuild_drawing_revision.package_review(singleton,contract_version,source_commit,catalog_sha256,classification_sha256,approved)
  VALUES(true,1,current_setting('drawing_cutover.reviewed_source_commit'),current_setting('drawing_cutover.expected_enabled_sha256'),
    current_setting('drawing_cutover.reviewed_classification_sha256'),true);
END $activation_review$;
COMMIT;
