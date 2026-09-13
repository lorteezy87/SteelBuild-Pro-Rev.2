/** Local PostgreSQL acceptance; requires the separately cloned disposable DB.
 * Never accepts a database URL, project ref, or production connection argument.
 * Run with Node 22.18+ native TypeScript: node scripts/test-readiness-pm-reconciliation.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const container = 'supabase_db_drift-replay';
const database = 'drift_july_guard_test';
const migration = readFileSync(new URL('../supabase/migrations/20260913201853_reconcile_verified_readiness_and_pm_floors.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../supabase/migrations_external/rollback_20260913201853_reconcile_verified_readiness_and_pm_floors.sql', import.meta.url), 'utf8');
const acceptance = readFileSync(new URL('../supabase/tests/reconcile_verified_readiness_and_pm_floors.sql', import.meta.url), 'utf8');

function sql(input: string, expectedError?: string): string {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  if (expectedError) {
    assert.notEqual(result.status, 0, `Expected SQL rejection: ${expectedError}`);
    assert.ok(output.includes(expectedError), output);
  } else {
    assert.equal(result.status, 0, output);
  }
  return output.trim();
}

function snapshot(): string {
  return sql(`SELECT jsonb_build_object(
    'body',md5(prosrc),'acl',proacl::text,'owner',proowner,'config',proconfig,
    'definer',prosecdef,'volatility',provolatile,
    'comment',col_description('public.daily_logs'::regclass,(SELECT attnum FROM pg_attribute WHERE attrelid='public.daily_logs'::regclass AND attname='materials_received')),
    'policies',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'permissive',permissive,'cmd',cmd,'using',qual,'check',with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN ('drawing_impacts','email_integration_settings')))
    FROM pg_proc WHERE oid='public.piece_control_pilot_readiness(uuid)'::regprocedure;`);
}

assert.equal(sql('SELECT current_database();'), database);
// The caller owns this transaction, exactly as the migration/ledger runner does.
sql(`BEGIN;\n${migration}\nCOMMIT;`);
const initial = snapshot();
const securityBefore = JSON.parse(initial);
sql(`BEGIN;\n${migration}\nCOMMIT;`);
assert.equal(snapshot(), initial, 'Desired-state reapplication must be a no-op');

const mutations = [
  ['function body', "CREATE OR REPLACE FUNCTION public.piece_control_pilot_readiness(p_project_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN '{}'::jsonb; END $$;"],
  ['function config', "ALTER FUNCTION public.piece_control_pilot_readiness(uuid) SET search_path=public;"],
  ['policy predicate', 'ALTER POLICY drawing_impacts_upd_role_floor ON public.drawing_impacts USING (true);'],
  ['policy role', 'ALTER POLICY email_integration_settings_ins_role_floor ON public.email_integration_settings TO anon;'],
  ['missing policy', 'DROP POLICY drawing_impacts_del_role_floor ON public.drawing_impacts;'],
  ['RLS disabled', 'ALTER TABLE public.drawing_impacts DISABLE ROW LEVEL SECURITY;'],
  ['column type', 'ALTER TABLE public.daily_logs ALTER COLUMN materials_received TYPE varchar;'],
  ['column comment', "COMMENT ON COLUMN public.daily_logs.materials_received IS 'Unreviewed replacement';"],
];
for (const [name, mutation] of mutations) {
  sql(`BEGIN;\n${mutation}\n${migration}\nCOMMIT;`, 'RECONCILE_PRECONDITION:');
  assert.equal(snapshot(), initial, `Rejected ${name} must roll back every change`);
}

sql(rollback);
const old = JSON.parse(snapshot());
assert.equal(old.body, '36452c1b163ba3065fe2741e95f676e0', 'Rollback must restore exact production CRLF body');
assert.equal(old.comment, null);
for (const key of ['acl', 'owner', 'config', 'definer', 'volatility']) {
  assert.deepEqual(old[key], securityBefore[key], `Rollback changed ${key}`);
}
sql(acceptance, 'Set-only actionable leaf incorrectly reported as missing drawing link');
sql(`BEGIN;\n${migration}\nCOMMIT;`);
assert.equal(snapshot(), initial, 'Forward/rollback/forward must preserve the reviewed desired state');
sql(acceptance);
console.log(JSON.stringify({ database, result: 'passed', negativePreconditions: mutations.map(([name]) => name), checks: ['desired-state idempotency', 'failed-precondition transaction rollback', 'exact production-body rollback', 'ACL/owner/security preservation', 'old-body failure reproduced', 'set-only versus missing drawing link', 'real RBAC nonmember denial', 'field INSERT/UPDATE/DELETE denial on both target tables', 'PM UPDATE acceptance on both target tables'] }, null, 2));
