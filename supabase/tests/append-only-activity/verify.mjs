// Verifies supabase/candidates/append-only-activity-audit.sql against the
// repo's real table definitions and policy history for drawing_activity,
// submittal_activity and pma_audit_logs. Run: npm ci --ignore-scripts && npm test
//
// Fidelity notes:
//   * CREATE TABLE statements, CREATE POLICY lines and audit_log_trigger() are
//     read from the committed migrations, not retyped.
//   * user_has_project_access / user_has_project_role_at_least are STUBS over a
//     user_projects table. Their real semantics are covered by the
//     membership-revocation harness; this suite tests the candidate's policy
//     and grant set, not the helpers.
//   * PGlite is single-session. No concurrency claim is made.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const mig = (name) => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
const candidatePath = new URL('../../candidates/append-only-activity-audit.sql', import.meta.url);

const ids = {
  project: '30000000-0000-4000-8000-000000000001',
  other: '30000000-0000-4000-8000-000000000002',
  field: '20000000-0000-4000-8000-000000000001',
  viewer: '20000000-0000-4000-8000-000000000002',
  outsider: '20000000-0000-4000-8000-000000000003',
  submittal: '40000000-0000-4000-8000-000000000001',
  drawing: '50000000-0000-4000-8000-000000000001',
};

function createTable(source, table) {
  const start = source.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${table}" (`);
  assert.notEqual(start, -1, `missing table ${table}`);
  const end = source.indexOf('\n);', start);
  return source.slice(start, end + 3);
}

function functionDefinition(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION "public"."${name}"()`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const tail = source.slice(start);
  const first = tail.indexOf('$$');
  const last = tail.indexOf('$$', first + 2);
  return tail.slice(0, last + 2) + ';';
}

function policyLines(source, table) {
  return source
    .split('\n')
    .filter((line) => line.startsWith('CREATE POLICY') && line.includes(`ON "public"."${table}"`))
    .join('\n');
}

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing block ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing block end ${endMarker}`);
  return source.slice(start, end);
}

async function fixture() {
  const [baseline, viewerFloor, split] = await Promise.all([
    mig('20260101000010_baseline_schema.sql'),
    mig('20260620231716_i2_viewer_write_role_floor.sql'),
    mig('20260721030200_harden_trigger_and_split_write_policies.sql'),
  ]);
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema extensions;
    grant usage on schema auth, extensions to authenticated, anon;
    create function extensions.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
    create table public.projects(id uuid primary key);
    create table public.user_projects(project_id uuid references public.projects(id), user_id uuid, role text, unique(project_id, user_id));
    -- STUBS (see header).
    create function public.user_has_project_access(p uuid) returns boolean language sql stable security definer set search_path = public as $$
      select exists(select 1 from public.user_projects where project_id = p and user_id = auth.uid()) $$;
    create function public.user_has_project_role_at_least(p uuid, min_role text) returns boolean language sql stable security definer set search_path = public as $$
      select exists(select 1 from public.user_projects up where up.project_id = p and up.user_id = auth.uid()
        and (case up.role when 'viewer' then 0 when 'field' then 1 when 'pm' then 2 else 3 end)
          >= (case min_role when 'viewer' then 0 when 'field' then 1 when 'pm' then 2 else 3 end)) $$;
    create table public.submittals(id uuid primary key, project_id uuid not null references public.projects(id), status text);
    alter table public.submittals enable row level security;
    create policy s_sel on public.submittals for select to authenticated using (public.user_has_project_access(project_id));
    create policy s_upd on public.submittals for update to authenticated using (public.user_has_project_role_at_least(project_id,'field')) with check (true);
    create policy s_del on public.submittals for delete to authenticated using (public.user_has_project_role_at_least(project_id,'field'));
    grant select, insert, update, delete on public.submittals to authenticated;
  `);
  await db.exec(createTable(baseline, 'drawing_activity'));
  await db.exec(createTable(baseline, 'submittal_activity'));
  await db.exec(createTable(baseline, 'pma_audit_logs'));
  await db.exec(`
    alter table public.drawing_activity add primary key (id);
    alter table public.submittal_activity add primary key (id);
    alter table public.submittal_activity add constraint submittal_activity_submittal_id_fkey
      foreign key (submittal_id) references public.submittals(id) on delete cascade;
    alter table public.drawing_activity enable row level security;
    alter table public.submittal_activity enable row level security;
    alter table public.pma_audit_logs enable row level security;
    grant all on public.drawing_activity, public.submittal_activity, public.pma_audit_logs to authenticated;
  `);
  // Policy history, as committed.
  await db.exec(policyLines(baseline, 'drawing_activity'));
  await db.exec(policyLines(baseline, 'pma_audit_logs'));
  await db.exec(policyLines(baseline, 'submittal_activity'));
  await db.exec(block(viewerFloor, 'drop policy if exists project_member_access on public.submittal_activity;', '-- task_dependencies'));
  await db.exec(block(split, 'drop policy if exists submittal_activity_write on public.submittal_activity;', 'drop policy if exists task_dependencies_write'));
  // 20260702034009 restrictive floors, generated by its loop for drawing_activity.
  await db.exec(`
    create policy drawing_activity_ins_role_floor on public.drawing_activity as restrictive for insert to authenticated
      with check (public.user_has_project_role_at_least(project_id, 'field'));
    create policy drawing_activity_upd_role_floor on public.drawing_activity as restrictive for update to authenticated
      using (public.user_has_project_role_at_least(project_id, 'field')) with check (public.user_has_project_role_at_least(project_id, 'field'));
    create policy drawing_activity_del_role_floor on public.drawing_activity as restrictive for delete to authenticated
      using (public.user_has_project_role_at_least(project_id, 'field'));
  `);
  await db.exec(functionDefinition(baseline, 'audit_log_trigger'));
  await db.exec(`create trigger trg_audit_log after insert or update or delete on public.submittals for each row execute function public.audit_log_trigger();`);
  await db.exec(`
    insert into public.projects values ('${ids.project}'), ('${ids.other}');
    insert into public.user_projects values ('${ids.project}','${ids.field}','field'), ('${ids.project}','${ids.viewer}','viewer'), ('${ids.other}','${ids.outsider}','pm');
    insert into public.submittals values ('${ids.submittal}','${ids.project}','Under Review');
    insert into public.drawing_activity(project_id, drawing_id, event_type) values ('${ids.project}','${ids.drawing}','created');
    insert into public.submittal_activity(project_id, submittal_id, event_type) values ('${ids.project}','${ids.submittal}','created');
  `);
  return db;
}

const as = async (db, user) => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, role: 'authenticated' })]);
  await db.exec('set role authenticated');
};
const admin = async (db) => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', '', false)`);
};
const denied = async (db, sql, params = []) => {
  try {
    const r = await db.query(sql, params);
    return r.affectedRows === 0 ? 'no-rows' : 'allowed';
  } catch (e) {
    return /permission denied|row-level security/i.test(e.message) ? 'denied' : `error: ${e.message}`;
  }
};

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${e.message}`);
  }
}

const candidate = await readFile(candidatePath, 'utf8');

// ── Before: prove each hole exists in the current lineage ────────────────
{
  const db = await fixture();
  await check('before: field member can rewrite drawing_activity', async () => {
    await as(db, ids.field);
    assert.equal(await denied(db, `update public.drawing_activity set to_value = 'edited'`), 'allowed');
  });
  await check('before: field member can delete submittal_activity', async () => {
    await as(db, ids.field);
    assert.equal(await denied(db, `delete from public.submittal_activity`), 'allowed');
  });
  await check('before: any member can forge a pma_audit_logs row', async () => {
    await as(db, ids.viewer);
    assert.equal(await denied(db, `insert into public.pma_audit_logs(project_id, entity_type, action) values ($1, 'submittals', 'UPDATE')`, [ids.project]), 'allowed');
  });
}

// ── After: apply the candidate ───────────────────────────────────────────
{
  const db = await fixture();
  await admin(db);
  await db.exec(candidate);

  await check('after: project members still read all three tables; outsiders read none', async () => {
    await as(db, ids.viewer);
    for (const t of ['drawing_activity', 'submittal_activity']) {
      assert.equal((await db.query(`select count(*)::int n from public.${t}`)).rows[0].n, 1, t);
    }
    await as(db, ids.outsider);
    for (const t of ['drawing_activity', 'submittal_activity', 'pma_audit_logs']) {
      assert.equal((await db.query(`select count(*)::int n from public.${t}`)).rows[0].n, 0, t);
    }
  });

  await check('after: UPDATE and DELETE are refused on both activity logs', async () => {
    await as(db, ids.field);
    assert.equal(await denied(db, `update public.drawing_activity set to_value = 'edited'`), 'denied');
    assert.equal(await denied(db, `delete from public.drawing_activity`), 'denied');
    assert.equal(await denied(db, `update public.submittal_activity set to_value = 'edited'`), 'denied');
    assert.equal(await denied(db, `delete from public.submittal_activity`), 'denied');
  });

  await check('after: no client INSERT/UPDATE/DELETE/TRUNCATE on pma_audit_logs', async () => {
    await as(db, ids.field);
    assert.equal(await denied(db, `insert into public.pma_audit_logs(project_id, entity_type, action) values ($1, 'submittals', 'UPDATE')`, [ids.project]), 'denied');
    assert.equal(await denied(db, `update public.pma_audit_logs set action = 'X'`), 'denied');
    assert.equal(await denied(db, `delete from public.pma_audit_logs`), 'denied');
    assert.equal(await denied(db, `truncate public.pma_audit_logs`), 'denied');
    assert.equal(await denied(db, `truncate public.drawing_activity`), 'denied');
  });

  await check('after: the SECURITY DEFINER audit trigger still records a submittal change', async () => {
    await admin(db);
    const before = (await db.query(`select count(*)::int n from public.pma_audit_logs`)).rows[0].n;
    await as(db, ids.field);
    await db.query(`update public.submittals set status = 'Revise and Resubmit' where id = $1`, [ids.submittal]);
    const rows = (await db.query(`select action, old_values->>'status' f, new_values->>'status' t, changed_by from public.pma_audit_logs order by created_at desc`)).rows;
    assert.equal(rows.length, before + 1);
    assert.deepEqual([rows[0].action, rows[0].f, rows[0].t, rows[0].changed_by], ['UPDATE', 'Under Review', 'Revise and Resubmit', ids.field]);
  });

  await check('after: field members can still append activity rows; viewers cannot', async () => {
    await as(db, ids.field);
    await db.query(`insert into public.drawing_activity(project_id, drawing_id, event_type) values ($1, $2, 'stage_changed')`, [ids.project, ids.drawing]);
    await db.query(`insert into public.submittal_activity(project_id, submittal_id, event_type) values ($1, $2, 'status_changed')`, [ids.project, ids.submittal]);
    await as(db, ids.viewer);
    assert.equal(await denied(db, `insert into public.drawing_activity(project_id, drawing_id, event_type) values ($1, $2, 'created')`, [ids.project, ids.drawing]), 'denied');
  });

  await check('after: deleting a submittal still cascades its activity rows', async () => {
    await as(db, ids.field);
    await db.query(`delete from public.submittals where id = $1`, [ids.submittal]);
    await admin(db);
    assert.equal((await db.query(`select count(*)::int n from public.submittal_activity where submittal_id = $1`, [ids.submittal])).rows[0].n, 0);
  });

  await check('after: re-applying the candidate is a no-op', async () => {
    await admin(db);
    await db.exec(candidate);
    const p = (await db.query(`select tablename, policyname, cmd, permissive from pg_policies where tablename in ('drawing_activity','submittal_activity','pma_audit_logs') order by 1,2`)).rows;
    assert.ok(p.every((r) => r.permissive === 'RESTRICTIVE' || ['SELECT', 'INSERT'].includes(r.cmd)), JSON.stringify(p));
    assert.ok(!p.some((r) => r.tablename === 'pma_audit_logs' && r.cmd === 'INSERT'));
  });
}

// ── Fail-closed guard ────────────────────────────────────────────────────
{
  const db = await fixture();
  await check('candidate refuses to run when a read policy is missing', async () => {
    await admin(db);
    await db.exec(`drop policy submittal_activity_read on public.submittal_activity`);
    await assert.rejects(db.exec(candidate), /no read policy/);
    await db.exec('rollback').catch(() => {});
    // Nothing from the candidate stuck.
    const p = (await db.query(`select count(*)::int n from pg_policies where tablename = 'drawing_activity' and policyname in ('project_update','project_delete')`)).rows[0].n;
    assert.equal(p, 2);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
