-- MANUAL REVIEW ONLY. No runner executes this file. SELECT-only preconditions
-- under ROLLBACK, with operator-supplied bindings; this does not install/activate.
-- Exact stage transport must be independently confirmed before opening a session.
-- A custom project_ref setting is an assertion, not cryptographic origin proof.
BEGIN;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '2s';
DO $preconditions$
BEGIN
  IF current_setting('drawing_cutover.project_ref', true) IS DISTINCT FROM 'ndyfjffsulfbwpmwdmic'
    OR coalesce(current_setting('drawing_cutover.reviewed_source_commit', true), '') !~ '^[a-f0-9]{40}$'
    OR coalesce(current_setting('drawing_cutover.reviewed_classification_sha256', true), '') !~ '^[a-f0-9]{64}$'
    OR coalesce(current_setting('drawing_cutover.reviewed_fixture_sha256', true), '') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'STAGING_REVIEW_BINDINGS_REQUIRED';
  END IF;
  IF to_regprocedure('steelbuild_drawing_revision.catalog_fingerprint()') IS NULL THEN
    RAISE EXCEPTION 'STAGING_COMPLETE_PACKAGE_REQUIRED';
  END IF;
END $preconditions$;
-- No function bodies, user rows, sessions, Storage objects or source PDF data.
SELECT current_setting('server_version') AS server_version,
  current_setting('drawing_cutover.reviewed_source_commit') AS reviewed_source_commit,
  steelbuild_drawing_revision.catalog_fingerprint() AS observed_catalog_sha256;
SELECT version, cardinality(statements) AS payload_count,
  encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') AS payload_sha256
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261016061756', '20261016061808', '20261016061825', '20261016061838')
ORDER BY version;
SELECT signature, role_name, has_function_privilege(role_name, signature, 'EXECUTE') AS can_execute
FROM unnest(ARRAY['public.create_drawing_set_from_review(uuid,jsonb)', 'public.apply_drawing_set_revision(uuid,jsonb)']) signature
CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role']) role_name;
ROLLBACK;

-- Still required, not supplied by this catalog-only fragment:
-- reviewed exact fixture rollback rehearsal with NORMAL policies/triggers;
-- one-transaction four-payload disabled install/stamp from install-manual.sql;
-- SAME-instance activation-capture.sql, external full classification, then
-- literal-bound activate-manual.sql; no copying rehearsal fingerprints;
-- separately reviewed safe stop/unstop and disposable erasure after real writes.
-- Do not append guessed GRANTs, package_review approvals or synthetic bypasses.
