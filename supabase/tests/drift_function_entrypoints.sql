-- Checks supabase/migrations/20260913201900_harden_drifted_function_entrypoints.sql
-- against every database shape it can meet: it must repair the drift, change
-- nothing else, and refuse functions it has not reviewed.
--
-- Run it as postgres with psql 13 or later, as a file: it includes the
-- migration and drift_function_entrypoints_guard_case.psql with \ir, so never
-- feed it through stdin or \i. Point it only at a disposable database with
-- Rev.2 migrations replayed through 20260913201900. From the repository root,
-- for local Supabase:
--   psql -X -v disposable=1 -f supabase/tests/drift_function_entrypoints.sql \
--     postgresql://postgres:postgres@127.0.0.1:54322/postgres
-- Without a host psql, copy both directories into the database container side
-- by side and run the same file there:
--   docker exec <container> mkdir -p /tmp/drift
--   docker cp supabase/tests <container>:/tmp/drift/tests
--   docker cp supabase/migrations <container>:/tmp/drift/migrations
--   docker exec <container> psql -U postgres -X -v disposable=1 -f /tmp/drift/tests/drift_function_entrypoints.sql
--
-- psql's exit status is the verdict. A passing run still prints one expected
-- ERROR line per guard case, plus one from a psql capability check. Everything
-- runs in one transaction ending in ROLLBACK, which holds ACCESS EXCLUSIVE on
-- drawing_transmittal_items until then.
\set ON_ERROR_STOP on
\set drift_disposable false
\if :{?disposable}
  \set drift_disposable :disposable
\endif
\if :drift_disposable
\else
  \warn 'Refusing to run: pass -v disposable=1 once you are sure the target database is disposable.'
  DO $refuse$ BEGIN RAISE EXCEPTION 'Refusing to run without -v disposable=1'; END $refuse$;
\endif
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SET LOCAL client_min_messages = warning;

DO $prerequisites$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run this test as postgres, not %', current_user;
  END IF;
  IF NOT (SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user)
    OR NOT has_schema_privilege('public', 'CREATE WITH GRANT OPTION') THEN
    RAISE EXCEPTION 'Test prerequisite missing: postgres needs CREATEROLE and CREATE WITH GRANT OPTION on schema public';
  END IF;
  -- The repair approves specific release functions. Anything else means the
  -- replay is wrong or newer than this test, not that the repair broke.
  IF EXISTS (
    SELECT FROM (VALUES
      ('public.release_work_package_canonical(uuid,text)',
        ARRAY['aa2b9b69ee23e033d72a1d315ccd3742', 'e826f9cfabca54bae9d985300f9dac99']),
      ('public.release_work_package_canonical_impl(uuid,text)',
        ARRAY['298bed7b45a7e20d8fce3a0f64955821', '812ce09bbc4562be555ac8a1e4def86f'])
    ) AS approved(signature, body_hashes)
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(approved.signature)
    WHERE p.oid IS NULL OR p.proowner <> 'postgres'::regrole OR NOT p.prosecdef
      OR NOT (md5(p.prosrc) = ANY (approved.body_hashes))
  ) THEN
    RAISE EXCEPTION 'The release functions are not the postgres-owned SECURITY DEFINER bodies this repair approved: replay migrations as postgres through 20260913201900, or retire this test';
  END IF;
END;
$prerequisites$;

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
-- In production the drawing-count helper backs a gc_drawings trigger.
CREATE TEMP TABLE drift_gc_drawings (gc_drawing_set_id uuid, is_deleted boolean);
CREATE TRIGGER drift_gc_drawing_set_counts AFTER INSERT OR UPDATE OR DELETE ON drift_gc_drawings
  FOR EACH ROW EXECUTE FUNCTION public.sync_gc_drawing_set_counts();
-- Observed production drift, granted directly to every client role so each
-- REVOKE target is exercised.
GRANT EXECUTE ON FUNCTION public._tmp_timeout_probe(), public.sync_gc_drawing_set_counts() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_work_package_canonical_impl(uuid,text) TO PUBLIC, anon, authenticated;
DROP INDEX IF EXISTS public.idx_drawing_transmittal_items_drawing_id;
DROP INDEX IF EXISTS public.idx_drawing_transmittal_items_gc_drawing_id;

-- Catalog state across every user schema, keyed by stable identity, to prove
-- the repair changes nothing beyond what drift_expected_change allows.
CREATE TEMP VIEW drift_catalog AS
WITH user_schema AS (
  SELECT oid FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
)
SELECT 'function' AS kind, (pg_identify_object('pg_proc'::regclass, p.oid, 0)).identity AS name,
  concat_ws(' ', p.oid, pg_get_userbyid(p.proowner), p.prolang, p.prokind, p.prosecdef,
    p.provolatile, p.proisstrict, p.proleakproof, p.proparallel, p.procost, p.prorows,
    p.prosupport, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
    md5(p.prosrc)) AS definition,
  p.proconfig::text AS config, p.proacl::text AS acl
FROM pg_proc p WHERE p.pronamespace IN (SELECT oid FROM user_schema)
UNION ALL
SELECT 'relation', (pg_identify_object('pg_class'::regclass, c.oid, 0)).identity,
  concat_ws(' ', c.oid, c.relkind, pg_get_userbyid(c.relowner), c.relpersistence,
    c.relreplident, c.relrowsecurity, c.relforcerowsecurity,
    CASE WHEN c.relkind IN ('i', 'I') THEN pg_get_indexdef(c.oid) END),
  c.reloptions::text, c.relacl::text
FROM pg_class c WHERE c.relnamespace IN (SELECT oid FROM user_schema)
UNION ALL
SELECT 'column', (pg_identify_object('pg_class'::regclass, a.attrelid, a.attnum)).identity,
  concat_ws(' ', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attidentity,
    a.attgenerated, a.attcollation, a.attstattarget, a.attoptions, pg_get_expr(d.adbin, d.adrelid)),
  NULL, a.attacl::text
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE c.relnamespace IN (SELECT oid FROM user_schema)
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'c') AND a.attnum > 0 AND NOT a.attisdropped
UNION ALL
SELECT 'type', (pg_identify_object('pg_type'::regclass, t.oid, 0)).identity,
  concat_ws(' ', t.typtype, pg_get_userbyid(t.typowner), format_type(t.typbasetype, t.typtypmod),
    t.typnotnull, t.typdefault,
    ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid = t.oid ORDER BY e.enumsortorder)),
  NULL, t.typacl::text
FROM pg_type t
WHERE t.typnamespace IN (SELECT oid FROM user_schema) AND t.typcategory <> 'A'
  AND (t.typrelid = 0 OR (SELECT c.relkind FROM pg_class c WHERE c.oid = t.typrelid) = 'c')
UNION ALL
SELECT 'constraint', (pg_identify_object('pg_constraint'::regclass, oid, 0)).identity,
  concat_ws(' ', pg_get_constraintdef(oid), convalidated, condeferrable, condeferred), NULL, NULL
FROM pg_constraint WHERE connamespace IN (SELECT oid FROM user_schema)
UNION ALL
SELECT 'policy', (pg_identify_object('pg_policy'::regclass, oid, 0)).identity,
  format('cmd=%s permissive=%s roles=%s using=%s check=%s', polcmd, polpermissive,
    polroles::regrole[], coalesce(pg_get_expr(polqual, polrelid), '<none>'),
    coalesce(pg_get_expr(polwithcheck, polrelid), '<none>')), NULL, NULL
FROM pg_policy
UNION ALL
SELECT 'rule', (pg_identify_object('pg_rewrite'::regclass, r.oid, 0)).identity,
  concat_ws(' ', r.ev_enabled, pg_get_ruledef(r.oid)), NULL, NULL
FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
WHERE c.relnamespace IN (SELECT oid FROM user_schema)
UNION ALL
SELECT 'trigger', (pg_identify_object('pg_trigger'::regclass, oid, 0)).identity,
  concat_ws(' ', tgfoid, tgenabled, pg_get_triggerdef(oid)), NULL, NULL
FROM pg_trigger WHERE NOT tgisinternal
UNION ALL
SELECT 'event trigger', evtname, concat_ws(' ', evtevent, evtfoid, evtenabled, evttags), NULL, NULL
FROM pg_event_trigger
UNION ALL
SELECT 'schema', nspname, pg_get_userbyid(nspowner), NULL, nspacl::text
FROM pg_namespace WHERE nspname !~ '^pg_(toast_)?temp_'
UNION ALL
SELECT 'database', datname,
  concat_ws(' ', pg_get_userbyid(datdba), datconnlimit, datallowconn, datistemplate), NULL, datacl::text
FROM pg_database WHERE datname = current_database()
UNION ALL
SELECT 'role', rolname, concat_ws(' ', rolsuper, rolinherit, rolcreaterole, rolcreatedb,
    rolcanlogin, rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil,
    ARRAY(SELECT format('%s admin=%s inherit=%s set=%s grantor=%s', m.roleid::regrole,
        m.admin_option, m.inherit_option, m.set_option, m.grantor::regrole)
      FROM pg_auth_members m WHERE m.member = r.oid ORDER BY 1)),
  NULL, NULL
FROM pg_roles r
UNION ALL
SELECT 'setting', concat_ws(' / ', coalesce(d.datname, 'all databases'), coalesce(r.rolname, 'all roles')),
  NULL, s.setconfig::text, NULL
FROM pg_db_role_setting s
LEFT JOIN pg_database d ON d.oid = s.setdatabase
LEFT JOIN pg_roles r ON r.oid = s.setrole
UNION ALL
SELECT 'parameter acl', parname, NULL, NULL, paracl::text
FROM pg_parameter_acl
UNION ALL
SELECT 'default acl', (pg_identify_object('pg_default_acl'::regclass, oid, 0)).identity,
  NULL, NULL, defaclacl::text
FROM pg_default_acl
UNION ALL
SELECT 'extension', extname,
  concat_ws(' ', extversion, extnamespace::regnamespace, pg_get_userbyid(extowner)), NULL, NULL
FROM pg_extension
UNION ALL
SELECT 'extension member', (pg_identify_object(d.classid, d.objid, d.objsubid)).identity,
  concat_ws(' ', d.deptype, e.extname), NULL, NULL
FROM pg_depend d JOIN pg_extension e ON e.oid = d.refobjid
WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype IN ('e', 'x')
UNION ALL
SELECT 'publication', pubname,
  concat_ws(' ', puballtables, pubinsert, pubupdate, pubdelete, pubtruncate, pubviaroot), NULL, NULL
FROM pg_publication
UNION ALL
SELECT 'publication member', (pg_identify_object('pg_publication_rel'::regclass, oid, 0)).identity,
  concat_ws(' ', prattrs, pg_get_expr(prqual, prrelid)), NULL, NULL
FROM pg_publication_rel
UNION ALL
SELECT 'publication schema', (pg_identify_object('pg_publication_namespace'::regclass, oid, 0)).identity,
  NULL, NULL, NULL
FROM pg_publication_namespace;

CREATE TEMP TABLE drift_expected_change (
  kind text, name text, acl_may_change boolean, config_may_change boolean, is_new boolean,
  PRIMARY KEY (kind, name));
INSERT INTO drift_expected_change VALUES
  ('function', 'public.release_work_package_canonical_impl(pg_catalog.uuid,pg_catalog.text)', true, false, false),
  ('function', 'public.sync_gc_drawing_set_counts()', true, false, false),
  ('function', 'public._tmp_timeout_probe()', true, true, false),
  ('relation', 'public.idx_drawing_transmittal_items_drawing_id', false, false, true),
  ('relation', 'public.idx_drawing_transmittal_items_gc_drawing_id', false, false, true);
CREATE TEMP TABLE drift_catalog_before AS SELECT * FROM drift_catalog;

-- Checks every repaired shape must pass. Since drift_catalog_before was taken,
-- nothing changed beyond drift_expected_change, each internal function lost
-- exactly PUBLIC, anon and authenticated, and the timeouts, effective
-- privileges, probe settings and indexes are right.
CREATE PROCEDURE pg_temp.drift_assert_repaired(state text) LANGUAGE plpgsql AS $repaired$
DECLARE
  unexpected text;
  signature text;
  wrapper_owner oid := (SELECT proowner FROM pg_proc
    WHERE oid = 'public.release_work_package_canonical(uuid,text)'::regprocedure);
BEGIN
  WITH masked_before AS (
    SELECT b.kind, b.name, b.definition,
      CASE WHEN e.config_may_change THEN NULL ELSE b.config END AS config,
      CASE WHEN e.acl_may_change THEN NULL ELSE b.acl END AS acl
    FROM drift_catalog_before b LEFT JOIN drift_expected_change e USING (kind, name)
  ), masked_after AS (
    SELECT a.kind, a.name, a.definition,
      CASE WHEN e.config_may_change THEN NULL ELSE a.config END AS config,
      CASE WHEN e.acl_may_change THEN NULL ELSE a.acl END AS acl
    FROM drift_catalog a LEFT JOIN drift_expected_change e USING (kind, name)
    WHERE e.is_new IS NOT TRUE
  ), changed AS (
    SELECT kind, name FROM (SELECT * FROM masked_before EXCEPT ALL SELECT * FROM masked_after) removed
    UNION
    SELECT kind, name FROM (SELECT * FROM masked_after EXCEPT ALL SELECT * FROM masked_before) added
  )
  SELECT string_agg(kind || ' ' || name, ', ' ORDER BY kind, name) INTO unexpected FROM changed;
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'With %, the repair changed objects outside its scope: %', state, unexpected;
  END IF;

  SELECT string_agg(b.name, ', ' ORDER BY b.name) INTO unexpected
  FROM drift_catalog_before b
  JOIN drift_expected_change e USING (kind, name)
  LEFT JOIN drift_catalog a USING (kind, name)
  WHERE e.acl_may_change
    AND ARRAY(SELECT x::text FROM aclexplode(b.acl::aclitem[]) x
      WHERE x.grantee NOT IN (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid) ORDER BY 1)
    IS DISTINCT FROM ARRAY(SELECT x::text FROM aclexplode(a.acl::aclitem[]) x ORDER BY 1);
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'With %, the repair did not remove exactly PUBLIC, anon and authenticated from: %', state, unexpected;
  END IF;

  IF current_setting('lock_timeout') <> '5s' OR current_setting('statement_timeout') <> '30s' THEN
    RAISE EXCEPTION 'With %, the repair no longer bounds its lock wait and statement time', state;
  END IF;

  FOREACH signature IN ARRAY ARRAY[
    'public.release_work_package_canonical_impl(uuid,text)',
    'public.sync_gc_drawing_set_counts()', 'public._tmp_timeout_probe()'
  ] LOOP
    CONTINUE WHEN to_regprocedure(signature) IS NULL;
    IF has_function_privilege('anon', signature, 'execute')
      OR has_function_privilege('authenticated', signature, 'execute')
      OR NOT has_function_privilege('service_role', signature, 'execute') THEN
      RAISE EXCEPTION 'With %, wrong privileges on %', state, signature;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated', 'public.release_work_package_canonical(uuid,text)', 'execute') THEN
    RAISE EXCEPTION 'With %, authenticated lost the public release wrapper', state;
  END IF;
  IF NOT has_function_privilege(wrapper_owner, 'public.release_work_package_canonical_impl(uuid,text)', 'execute') THEN
    RAISE EXCEPTION 'With %, the wrapper''s owner can no longer run the implementation', state;
  END IF;
  IF to_regprocedure('public._tmp_timeout_probe()') IS NOT NULL
    AND ARRAY(SELECT setting FROM pg_proc, unnest(proconfig) AS setting
      WHERE oid = 'public._tmp_timeout_probe()'::regprocedure ORDER BY 1)
      <> ARRAY['search_path=""', 'statement_timeout=1s'] THEN
    RAISE EXCEPTION 'With %, the probe settings are wrong', state;
  END IF;
  IF pg_get_indexdef(to_regclass('public.idx_drawing_transmittal_items_drawing_id')) IS DISTINCT FROM
      'CREATE INDEX idx_drawing_transmittal_items_drawing_id ON public.drawing_transmittal_items USING btree (drawing_id)'
    OR pg_get_indexdef(to_regclass('public.idx_drawing_transmittal_items_gc_drawing_id')) IS DISTINCT FROM
      'CREATE INDEX idx_drawing_transmittal_items_gc_drawing_id ON public.drawing_transmittal_items USING btree (gc_drawing_id)' THEN
    RAISE EXCEPTION 'With %, the reverse transmittal lookup indexes are missing or different', state;
  END IF;
END;
$repaired$;

-- Recreates the drift the repair removes and snapshots the result into
-- drift_catalog_before. The drift is either the audited production ACLs (what
-- supabase/migrations_external/rollback_harden_drifted_function_entrypoints.sql
-- restores) or grants to every client role. Either optional helper can be
-- dropped, and the probe can get an overload beside it.
CREATE PROCEDURE pg_temp.drift_reset(keep_probe boolean, keep_sync boolean,
  audited boolean DEFAULT false, probe_overload boolean DEFAULT false)
LANGUAGE plpgsql AS $reset$
DECLARE
  impl_grantees text := CASE WHEN audited THEN 'authenticated' ELSE 'PUBLIC, anon, authenticated' END;
  helper_grantees text := CASE WHEN audited THEN 'PUBLIC, authenticated' ELSE 'PUBLIC, anon, authenticated' END;
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.release_work_package_canonical_impl(uuid,text) TO %s', impl_grantees);
  IF keep_probe THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION public._tmp_timeout_probe() TO %s', helper_grantees);
    ALTER FUNCTION public._tmp_timeout_probe() RESET search_path;
  ELSE
    DROP FUNCTION public._tmp_timeout_probe();
  END IF;
  IF keep_sync THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.sync_gc_drawing_set_counts() TO %s', helper_grantees);
  ELSE
    DROP FUNCTION public.sync_gc_drawing_set_counts() CASCADE;
  END IF;
  IF probe_overload THEN
    CREATE FUNCTION public._tmp_timeout_probe(integer) RETURNS text LANGUAGE sql AS $overload$ select 'overload' $overload$;
  END IF;
  DROP INDEX public.idx_drawing_transmittal_items_drawing_id,
    public.idx_drawing_transmittal_items_gc_drawing_id;
  DELETE FROM drift_catalog_before;
  INSERT INTO drift_catalog_before SELECT * FROM drift_catalog;
END;
$reset$;

\ir ../migrations/20260913201900_harden_drifted_function_entrypoints.sql
CALL pg_temp.drift_assert_repaired('drift granted to every client role');

SET LOCAL ROLE authenticated;
DO $deny_calls$
BEGIN
  -- ACL denials name the function in every server language; the impl's own
  -- "Not authorized" errors do not, so they cannot pass for a denial.
  BEGIN
    PERFORM public.release_work_package_canonical_impl(gen_random_uuid(),NULL);
    RAISE EXCEPTION 'Direct release implementation call unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%release_work_package_canonical_impl%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public._tmp_timeout_probe();
    RAISE EXCEPTION 'Probe call unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%_tmp_timeout_probe%' THEN RAISE; END IF;
  END;
END;
$deny_calls$;
RESET ROLE;

-- A second run, with both indexes and all hardening already in place, must
-- change nothing.
CREATE TEMP TABLE drift_catalog_after AS SELECT * FROM drift_catalog;
\ir ../migrations/20260913201900_harden_drifted_function_entrypoints.sql
DO $idempotent$
BEGIN
  IF EXISTS (SELECT * FROM drift_catalog EXCEPT ALL SELECT * FROM drift_catalog_after)
    OR EXISTS (SELECT * FROM drift_catalog_after EXCEPT ALL SELECT * FROM drift_catalog) THEN
    RAISE EXCEPTION 'A second run of the repair changed the catalog';
  END IF;
END;
$idempotent$;

-- The repair must apply to every shape the database can be in: the audited
-- production ACLs, Rev.2-only replays without one or both optional helpers,
-- and a probe with an overload beside it.
SAVEPOINT helper_state;
CALL pg_temp.drift_reset(keep_probe => true, keep_sync => true, audited => true);
\ir ../migrations/20260913201900_harden_drifted_function_entrypoints.sql
CALL pg_temp.drift_assert_repaired('the audited production drift');
ROLLBACK TO SAVEPOINT helper_state;

SAVEPOINT helper_state;
CALL pg_temp.drift_reset(keep_probe => false, keep_sync => false);
\ir ../migrations/20260913201900_harden_drifted_function_entrypoints.sql
CALL pg_temp.drift_assert_repaired('no optional helpers');
ROLLBACK TO SAVEPOINT helper_state;

SAVEPOINT helper_state;
CALL pg_temp.drift_reset(keep_probe => true, keep_sync => false);
\ir ../migrations/20260913201900_harden_drifted_function_entrypoints.sql
CALL pg_temp.drift_assert_repaired('only the timeout probe');
ROLLBACK TO SAVEPOINT helper_state;

SAVEPOINT helper_state;
CALL pg_temp.drift_reset(keep_probe => false, keep_sync => true);
\ir ../migrations/20260913201900_harden_drifted_function_entrypoints.sql
CALL pg_temp.drift_assert_repaired('only the drawing-count trigger');
ROLLBACK TO SAVEPOINT helper_state;

SAVEPOINT helper_state;
CALL pg_temp.drift_reset(keep_probe => true, keep_sync => true, probe_overload => true);
\ir ../migrations/20260913201900_harden_drifted_function_entrypoints.sql
CALL pg_temp.drift_assert_repaired('a probe overload');
ROLLBACK TO SAVEPOINT helper_state;

-- The guard must reject each kind of unreviewed drift, on required and
-- optional functions alike. Every case starts from the audited production
-- drift, the state the guard judged in production, then tampers with it.
-- Each case is one include of drift_function_entrypoints_guard_case.psql.
CREATE TEMP TABLE drift_guard_cases (
  id int PRIMARY KEY, label text NOT NULL, tamper text[] NOT NULL, expected text NOT NULL, observed text);
INSERT INTO drift_guard_cases (id, label, tamper, expected) VALUES
  (1, 'a replaced wrapper body', ARRAY[
    $sql$CREATE OR REPLACE FUNCTION public.release_work_package_canonical(p_work_package_id uuid, p_exception_reason text DEFAULT NULL)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $body$ begin return null; end $body$ $sql$],
    'Unreviewed function drift: public.release_work_package_canonical(uuid,text)'),
  (2, 'a replaced implementation body', ARRAY[
    $sql$CREATE OR REPLACE FUNCTION public.release_work_package_canonical_impl(p_work_package_id uuid, p_exception_reason text DEFAULT NULL)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $body$ begin return null; end $body$ $sql$],
    'Unreviewed function drift: public.release_work_package_canonical_impl(uuid,text)'),
  (3, 'a replaced drawing-count trigger body', ARRAY[
    $sql$CREATE OR REPLACE FUNCTION public.sync_gc_drawing_set_counts()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $body$ begin return null; end $body$ $sql$],
    'Unreviewed function drift: public.sync_gc_drawing_set_counts()'),
  (4, 'a replaced probe body after an absent helper and beside an overload', ARRAY[
    $sql$DROP FUNCTION public.sync_gc_drawing_set_counts() CASCADE$sql$,
    $sql$CREATE FUNCTION public._tmp_timeout_probe(integer) RETURNS text LANGUAGE sql AS $body$ select 'overload' $body$ $sql$,
    $sql$CREATE OR REPLACE FUNCTION public._tmp_timeout_probe()
      RETURNS text LANGUAGE plpgsql AS $body$ begin return 'tampered'; end $body$ $sql$],
    'Unreviewed function drift: public._tmp_timeout_probe()'),
  (5, 'a foreign-owned implementation', ARRAY[
    $sql$CALL pg_temp.drift_give_away(ARRAY['public.release_work_package_canonical_impl(uuid,text)'])$sql$],
    'Unreviewed function drift: public.release_work_package_canonical_impl(uuid,text)'),
  (6, 'a foreign-owned drawing-count trigger', ARRAY[
    $sql$CALL pg_temp.drift_give_away(ARRAY['public.sync_gc_drawing_set_counts()'])$sql$],
    'Unreviewed function drift: public.sync_gc_drawing_set_counts()'),
  (7, 'a foreign-owned probe', ARRAY[
    $sql$CALL pg_temp.drift_give_away(ARRAY['public._tmp_timeout_probe()'])$sql$],
    'Unreviewed function drift: public._tmp_timeout_probe()'),
  (8, 'a release set re-owned together', ARRAY[
    $sql$CALL pg_temp.drift_give_away(ARRAY['public.release_work_package_canonical(uuid,text)',
      'public.release_work_package_canonical_impl(uuid,text)', 'public.sync_gc_drawing_set_counts()',
      'public._tmp_timeout_probe()'])$sql$],
    'Unreviewed function drift: public.release_work_package_canonical(uuid,text)'),
  (9, 'a wrapper switched to SECURITY INVOKER', ARRAY[
    $sql$ALTER FUNCTION public.release_work_package_canonical(uuid,text) SECURITY INVOKER$sql$],
    'Unreviewed function drift: public.release_work_package_canonical(uuid,text)'),
  (10, 'an implementation switched to SECURITY INVOKER', ARRAY[
    $sql$ALTER FUNCTION public.release_work_package_canonical_impl(uuid,text) SECURITY INVOKER$sql$],
    'Unreviewed function drift: public.release_work_package_canonical_impl(uuid,text)'),
  (11, 'a drawing-count trigger switched to SECURITY INVOKER', ARRAY[
    $sql$ALTER FUNCTION public.sync_gc_drawing_set_counts() SECURITY INVOKER$sql$],
    'Unreviewed function drift: public.sync_gc_drawing_set_counts()'),
  (12, 'a probe switched to SECURITY DEFINER', ARRAY[
    $sql$ALTER FUNCTION public._tmp_timeout_probe() SECURITY DEFINER$sql$],
    'Unreviewed function drift: public._tmp_timeout_probe()'),
  (13, 'a missing release wrapper without either helper', ARRAY[
    $sql$DROP FUNCTION public._tmp_timeout_probe()$sql$,
    $sql$DROP FUNCTION public.sync_gc_drawing_set_counts() CASCADE$sql$,
    $sql$ALTER FUNCTION public.release_work_package_canonical(uuid,text) RENAME TO release_work_package_canonical_moved$sql$],
    'Drift repair prerequisite missing: public.release_work_package_canonical(uuid,text)');

-- Resets to the audited production drift, then runs one case's tamper
-- statements. A failure here is the test's setup, not the migration.
CREATE PROCEDURE pg_temp.drift_tamper(case_id int) LANGUAGE plpgsql AS $tamper$
DECLARE statement text;
BEGIN
  CALL pg_temp.drift_reset(keep_probe => true, keep_sync => true, audited => true);
  FOREACH statement IN ARRAY (SELECT tamper FROM drift_guard_cases WHERE id = case_id) LOOP
    EXECUTE statement;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Test setup failed for guard case % (%): %', case_id,
    (SELECT label FROM drift_guard_cases WHERE id = case_id), SQLERRM;
END;
$tamper$;

-- Hands functions to a throwaway owner that postgres can still act for.
CREATE PROCEDURE pg_temp.drift_give_away(signatures text[]) LANGUAGE plpgsql AS $give_away$
DECLARE signature text;
BEGIN
  CREATE ROLE drift_guard_owner NOLOGIN;
  GRANT drift_guard_owner TO CURRENT_USER;
  GRANT CREATE ON SCHEMA public TO drift_guard_owner;
  FOREACH signature IN ARRAY signatures LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO drift_guard_owner', signature::regprocedure);
  END LOOP;
END;
$give_away$;

\warn 'Guard rejection cases: the ERROR lines below are expected; the test passed if psql exits 0.'
\set ON_ERROR_ROLLBACK on
\set VERBOSITY terse

-- psql records the last error in LAST_ERROR_MESSAGE; prove this client does
-- before relying on it.
\set LAST_ERROR_MESSAGE ''
\set ON_ERROR_STOP off
DO $sentinel$ BEGIN RAISE EXCEPTION 'drift test sentinel'; END $sentinel$;
\set ON_ERROR_STOP on
SELECT :'LAST_ERROR_MESSAGE' = 'drift test sentinel' AS psql_records_errors \gset
\if :psql_records_errors
\else
  DO $old_psql$ BEGIN RAISE EXCEPTION 'This psql does not record LAST_ERROR_MESSAGE; use psql 13 or later'; END $old_psql$;
\endif

\set guard_case 1
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 2
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 3
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 4
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 5
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 6
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 7
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 8
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 9
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 10
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 11
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 12
\ir drift_function_entrypoints_guard_case.psql
\set guard_case 13
\ir drift_function_entrypoints_guard_case.psql

\set VERBOSITY default
\set ON_ERROR_ROLLBACK off

DO $guard_assertions$
DECLARE guard_case record;
BEGIN
  FOR guard_case IN SELECT * FROM drift_guard_cases ORDER BY id LOOP
    IF guard_case.observed IS NULL THEN
      RAISE EXCEPTION 'Guard case "%" never ran', guard_case.label;
    ELSIF guard_case.observed = '' THEN
      RAISE EXCEPTION 'Guard accepted %', guard_case.label;
    ELSIF guard_case.observed <> guard_case.expected THEN
      RAISE EXCEPTION 'Guard case "%" failed with an unexpected error: %', guard_case.label, guard_case.observed;
    END IF;
  END LOOP;
END;
$guard_assertions$;
ROLLBACK;
