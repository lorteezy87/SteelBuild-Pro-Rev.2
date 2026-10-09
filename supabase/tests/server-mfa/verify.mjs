import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../migrations/20261007073051_enforce_enrolled_mfa_at_server_boundaries.sql', import.meta.url), 'utf8');
const readiness = await readFile(new URL('./readiness.sql', import.meta.url), 'utf8');
const db = new PGlite();
const enrolled = '11000000-5eed-4000-8000-000000000001';
const onboarding = '11000000-5eed-4000-8000-000000000002';
const outsider = '11000000-5eed-4000-8000-000000000003';

async function request({ role = 'authenticated', sub = enrolled, aal, hook = true } = {}, command) {
  await db.exec('BEGIN');
  try {
    await db.exec(`SET LOCAL ROLE ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role, sub, aal })]);
    if (hook) await db.query('select steelbuild_security.check_request_mfa()');
    return await db.query(command);
  } finally {
    await db.exec('ROLLBACK');
  }
}
const count = async (options, table) => (await request(options, `select count(*)::int as n from ${table}`)).rows[0].n;

try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE authenticator NOLOGIN;
    CREATE SCHEMA auth;
    CREATE SCHEMA storage;
    GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY, user_id uuid, status text);
    INSERT INTO auth.mfa_factors VALUES
      ('a1000000-0000-4000-8000-000000000001', '${enrolled}', 'verified'),
      ('a1000000-0000-4000-8000-000000000002', '${onboarding}', 'unverified');
    CREATE TABLE public.mfa_fixture_records(id int PRIMARY KEY, owner uuid, content text);
    INSERT INTO public.mfa_fixture_records VALUES (1, '${enrolled}', 'private'), (2, '${onboarding}', 'onboarding');
    ALTER TABLE public.mfa_fixture_records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY owner_only ON public.mfa_fixture_records TO authenticated USING (owner=auth.uid()) WITH CHECK (owner=auth.uid());
    CREATE TABLE storage.objects(id int PRIMARY KEY, owner uuid, content text);
    INSERT INTO storage.objects SELECT * FROM public.mfa_fixture_records;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY owner_only ON storage.objects TO authenticated USING (owner=auth.uid()) WITH CHECK (owner=auth.uid());
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects, public.mfa_fixture_records TO authenticated, service_role;
    CREATE PUBLICATION supabase_realtime FOR TABLE public.mfa_fixture_records;
    CREATE TABLE public.mfa_fixture_public(message text);
    INSERT INTO public.mfa_fixture_public VALUES ('public');
    GRANT SELECT ON public.mfa_fixture_public TO anon, authenticated, service_role;
    CREATE FUNCTION public.mfa_fixture_definer_rpc() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT count(*)::int FROM public.mfa_fixture_records $$;
  `);

  await db.exec(migration);
  await db.exec(migration); // Rerun cannot accumulate or relax policies.
  assert.deepEqual((await db.query("select setconfig from pg_db_role_setting where setrole='authenticator'::regrole")).rows[0].setconfig,
    ['pgrst.db_pre_request=steelbuild_security.check_request_mfa']);
  const policies = (await db.query("select schemaname,tablename,permissive,cmd from pg_policies where policyname='require_enrolled_mfa' order by schemaname")).rows;
  assert.equal(policies.length, 2);
  assert(policies.every((policy) => policy.permissive === 'RESTRICTIVE' && policy.cmd === 'ALL'));
  assert.deepEqual((await db.query(readiness)).rows, [], 'readiness must recognize the actual migrated policies');

  await assert.rejects(request({ aal: 'aal1' }, 'select public.mfa_fixture_definer_rpc()'), /MFA_REQUIRED/);
  await assert.rejects(request({ aal: undefined }, 'select public.mfa_fixture_definer_rpc()'), /MFA_REQUIRED/);
  await assert.rejects(request({ sub: null, aal: 'aal2' }, 'select public.mfa_fixture_definer_rpc()'), /MFA_REQUIRED/);
  assert.equal((await request({ aal: 'aal2' }, 'select public.mfa_fixture_definer_rpc() as n')).rows[0].n, 2);
  assert.equal((await request({ sub: onboarding }, 'select public.mfa_fixture_definer_rpc() as n')).rows[0].n, 2);
  assert.equal(await count({ role: 'anon', sub: null }, 'public.mfa_fixture_public'), 1);
  assert.equal(await count({ role: 'service_role', sub: null }, 'public.mfa_fixture_records'), 2);

  for (const table of ['storage.objects', 'public.mfa_fixture_records']) {
    // No hook here: direct Storage/Realtime RLS must independently deny AAL1.
    assert.equal(await count({ hook: false }, table), 0);
    assert.equal(await count({ hook: false, aal: 'aal2' }, table), 1);
    assert.equal(await count({ hook: false, sub: onboarding }, table), 1);
    assert.equal(await count({ hook: false, aal: 'aal2', sub: outsider }, table), 0, 'AAL2 must not widen tenant access');
    await assert.rejects(request({ hook: false }, `insert into ${table} values(3,'${enrolled}','blocked')`), /row-level security/);
    assert.equal((await request({ hook: false }, `update ${table} set content='blocked' returning id`)).rows.length, 0);
    assert.equal((await request({ hook: false }, `delete from ${table} returning id`)).rows.length, 0);
    assert.equal((await request({ hook: false, aal: 'aal2' }, `insert into ${table} values(3,'${enrolled}','allowed') returning id`)).rows.length, 1);
    assert.equal((await request({ hook: false, aal: 'aal2' }, `update ${table} set content='allowed' returning id`)).rows.length, 1);
    assert.equal((await request({ hook: false, aal: 'aal2' }, `delete from ${table} returning id`)).rows.length, 1);
    assert.equal(await count({ hook: false, role: 'service_role', sub: null }, table), 2);
  }

  // Factors are checked live, so an old AAL1 token stops working on enrollment.
  await db.exec(`update auth.mfa_factors set status='verified' where user_id='${onboarding}'`);
  await assert.rejects(request({ sub: onboarding }, 'select public.mfa_fixture_definer_rpc()'), /MFA_REQUIRED/);
  await db.exec(`delete from auth.mfa_factors where user_id='${onboarding}'`);
  assert.equal(await count({ sub: onboarding }, 'public.mfa_fixture_records'), 1);
  await db.exec('alter table auth.mfa_factors rename to unavailable_factors');
  await assert.rejects(request({}, 'select public.mfa_fixture_definer_rpc()'), /mfa_factors/);
  await db.exec('alter table auth.unavailable_factors rename to mfa_factors');

  // The release check detects new publication tables and weakened policy bodies.
  await db.exec('create table public.mfa_new_publication(id int); alter publication supabase_realtime add table public.mfa_new_publication');
  assert.equal((await db.query(readiness)).rows.length, 1);
  await assert.rejects(db.exec(migration), /reviewed RLS/);
  await db.exec('ROLLBACK');
  await db.exec('alter table public.mfa_new_publication enable row level security');
  await db.exec(migration);
  assert.deepEqual((await db.query(readiness)).rows, []);
  await db.exec('alter policy require_enrolled_mfa on storage.objects using (steelbuild_security.satisfies_mfa() OR true)');
  assert.equal((await db.query(readiness)).rows.length, 1, 'helper name alone cannot certify a weakened policy');
  await db.exec(migration);
  assert.deepEqual((await db.query(readiness)).rows, []);

  // A sibling request hook is an explicit blocker, never silently overwritten.
  await db.exec("alter role authenticator set pgrst.db_pre_request='sibling.check_request'");
  await assert.rejects(db.exec(migration), /reviewed composition/);
  await db.exec('ROLLBACK');
  assert.deepEqual((await db.query("select setconfig from pg_db_role_setting where setrole='authenticator'::regrole")).rows[0].setconfig,
    ['pgrst.db_pre_request=sibling.check_request']);
  assert.equal((await db.query(readiness)).rows.length, 1);
  console.log('PASS: enrolled AAL1/missing AAL denied; AAL2 and onboarding allowed; definer RPC pre-request; independent Storage/Realtime CRUD restrictions; tenant boundaries; public/service access; live enrollment; lookup failure; idempotency; existing-hook preservation; new publication/RLS and weakened-policy readiness checks.');
} finally {
  await db.close();
}
