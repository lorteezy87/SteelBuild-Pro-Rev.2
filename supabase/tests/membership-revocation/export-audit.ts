import assert from 'node:assert/strict';
import { createFixture, ids, readMigration } from './fixture.mjs';

// In-memory SQL only. The actual shipped resolver is installed by createFixture;
// load the real activities table, INSERT/SELECT policies and actor trigger too.
// The table's UUID extension function is replaced by PostgreSQL gen_random_uuid.
const { db, admin, asUser } = await createFixture();
const baseline = await readMigration('20260101000010_baseline_schema.sql');
const attribution = await readMigration('20260702035058_audit_attribution_hardening.sql');
const table = baseline.match(/CREATE TABLE IF NOT EXISTS "public"\."activities" \([\s\S]*?\n\);/)?.[0];
assert.ok(table, 'Actual activities schema is required');
const policies = baseline.match(/CREATE POLICY "project_(?:insert|select)" ON "public"\."activities"[^;]+;/g);
assert.equal(policies?.length, 2, 'Actual activities policies are required');
const trigger = attribution.slice(attribution.indexOf('alter table public.activities'), attribution.indexOf('-- M1:'));
assert.ok(trigger.includes('new.performed_by_user_id := auth.uid()'));
await db.exec(`
  create schema extensions;
  create function extensions.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
  ${table}
  ${trigger}
  alter table activities enable row level security;
  ${policies?.join('\n')}
  grant select,insert,update,delete on activities to authenticated,service_role;
  alter role service_role bypassrls;
`);

let passed = 0;
async function check(name: string, run: () => Promise<void>): Promise<void> {
  await admin();
  await db.exec('begin');
  try {
    await run();
    passed += 1;
    console.log(`PASS export audit: ${name}`);
  } finally {
    await db.exec('rollback');
    await admin();
  }
}

type AuditRow = { id: string; performed_by_user_id: string | null };
async function insert(projectId: string = ids.project, suppliedActor: string = ids.member): Promise<AuditRow> {
  const result = await db.query<AuditRow>(`insert into activities
    (project_id,entity_id,entity_type,action,performed_by_user_id,metadata)
    values ($1,$1,'Project','exported',$2,'{"export_version":2,"total_rows":155,"table_count":96,"file_count":1}')
    returning id,performed_by_user_id`, [projectId, suppliedActor]);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}
const denied = (error: unknown) => error instanceof Error && 'code' in error && error.code === '42501';
async function withoutSubject(role: 'authenticated' | 'service_role'): Promise<void> {
  await asUser(ids.member, role);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role })]);
}

try {
  await check('reproduces NULL actor on the old service-role write', async () => {
    await withoutSubject('service_role');
    assert.equal((await insert()).performed_by_user_id, null);
  });
  await check('caller JWT persists the verified actor and generated ID', async () => {
    await asUser();
    const row = await insert();
    assert.equal(row.performed_by_user_id, ids.member);
    assert.match(row.id, /^[a-f0-9-]{36}$/);
  });
  await check('authenticated caller cannot forge another actor', async () => {
    await asUser();
    assert.equal((await insert(ids.project, ids.outsider)).performed_by_user_id, ids.member);
  });
  await check('foreign project audit cannot be inserted', async () => {
    await asUser();
    await assert.rejects(insert(ids.foreign), denied);
  });
  await check('revoked workspace member loses audit permission despite a retained explicit project role', async () => {
    await asUser();
    assert.equal((await db.query('select id from projects where id=$1', [ids.project])).rows.length, 1);
    await admin();
    await db.query('delete from organization_members where org_id=$1 and user_id=$2', [ids.org, ids.member]);
    await asUser();
    await assert.rejects(insert(), denied);
  });
  await check('archived project fails the final audit access check', async () => {
    await asUser();
    await assert.rejects(insert(ids.archived), denied);
  });
  await check('missing identity cannot produce an attributed authenticated audit', async () => {
    await withoutSubject('authenticated');
    await assert.rejects(insert(), denied);
  });
  await check('existing audit remains append-only for authenticated users', async () => {
    await asUser();
    const row = await insert();
    assert.equal((await db.query('update activities set performed_by_user_id=$1 where id=$2 returning id', [ids.outsider, row.id])).rows.length, 0);
    assert.equal((await db.query('delete from activities where id=$1 returning id', [row.id])).rows.length, 0);
    assert.deepEqual((await db.query('select id,performed_by_user_id from activities where id=$1', [row.id])).rows, [row]);
  });
  console.log(`${passed} export audit SQL checks passed; no hosted requests.`);
} finally {
  await db.close();
}
