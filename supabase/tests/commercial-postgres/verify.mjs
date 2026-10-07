import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { initializeCommercialFixture, ids } from '../commercial-create/fixture.mjs';
import { installLifecycleFixture } from '../commercial-lifecycle/fixture.mjs';

// This harness only creates synthetic objects in an explicitly named, empty,
// loopback database. It never accepts the application's Supabase configuration.
const connectionString = process.env.COMMERCIAL_POSTGRES_URL;
assert.equal(process.env.COMMERCIAL_POSTGRES_TEST, '1', 'Set COMMERCIAL_POSTGRES_TEST=1 for this isolated fixture');
assert.ok(connectionString, 'COMMERCIAL_POSTGRES_URL is required');
const target = new URL(connectionString);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Only a loopback test database is allowed');
assert.equal(target.pathname, '/steelbuild_commercial_test', 'Use the dedicated synthetic test database');
assert.equal(target.search, '', 'Connection URL overrides are not accepted');

// Keep microseconds in reviewed timestamps. JS Date truncation can manufacture
// an optimistic-concurrency conflict even when the row has not changed.
pg.types.setTypeParser(1184, value => value);
const pool = new pg.Pool({ connectionString, max: 12, connectionTimeoutMillis: 5000, statement_timeout: 12000 });
const admin = await pool.connect();
const db = { query: (...args) => admin.query(...args), exec: sql => admin.query(sql) };
let passed = 0;
const approval = { status: 'Approved', approved_by: 'Fixture GC representative', approved_date: '2026-10-07', sov_mode: 'none' };
const lockKey = (kind, operation) => `numbered-create:${ids.project}:${kind}:${operation}`;
const createQuery = (kind, operation, payload) => ({
  text: 'select public.create_numbered_record($1,$2,$3,$4::jsonb) as record',
  values: [ids.project, kind, operation, JSON.stringify(payload)],
});
const saveQuery = (row, patch) => ({
  text: 'select public.save_change_order_reviewed($1,$2,$3,$4,$5::jsonb) as record',
  values: [row.id, row.updated_at, row.status, row.co_amount, JSON.stringify(patch)],
});
const saveSovQuery = (row, patch) => ({
  text: 'select public.save_sov_item_reviewed($1,$2,$3::jsonb) as record',
  values: [row.id,row.updated_at,JSON.stringify(patch)],
});
async function check(name, callback) {
  await callback();
  passed++;
  console.log(`PASS ${name}`);
}
async function session(actor) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actor, role: 'authenticated', aal: 'aal2' })]);
    await client.query('set local role authenticated');
    const { rows } = await client.query('select pg_backend_pid() as pid');
    return { client, pid: rows[0].pid };
  } catch (error) { await client.query('rollback'); client.release(); throw error; }
}
async function finish(client, query) {
  try {
    const result = await client.query(query);
    await client.query('commit');
    return result.rows[0].record;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
async function execute(actor, query) {
  const { client } = await session(actor);
  return finish(client, query);
}
async function waitForLockWaiters(pids) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    await admin.query('select pg_stat_clear_snapshot()');
    const { rows } = await admin.query(`select pid from pg_stat_activity
      where pid=any($1::int[]) and state='active' and wait_event_type='Lock'`, [pids]);
    if (rows.length === pids.length) return;
    await delay(20);
  }
  throw new Error(`Expected all ${pids.length} independent sessions to wait on the held database lock`);
}
async function contend(lock, lockValues, requests, duringWait) {
  await admin.query('begin');
  const sessions = [];
  let pending;
  try {
    await admin.query(lock, lockValues);
    for (const request of requests) sessions.push(await session(request.actor));
    const pids = sessions.map(entry => entry.pid);
    assert.equal(new Set(pids).size, requests.length, 'Each contender must use its own PostgreSQL backend');
    pending = Promise.allSettled(sessions.map((entry, index) => finish(entry.client, requests[index].query)));
    await waitForLockWaiters(pids);
    if (duringWait) await duringWait();
    await admin.query('commit');
    return await pending;
  } catch (error) {
    await admin.query('rollback');
    if (pending) await pending;
    else for (const entry of sessions) { await entry.client.query('rollback'); entry.client.release(); }
    throw error;
  }
}
function values(results) {
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  return results.map(result => result.value);
}
async function totals() {
  const { rows } = await admin.query(`select p.approved_change_total,
    coalesce((select sum(c.co_amount) from change_orders c where c.project_id=p.id and c.status='Approved' and c.is_deleted=false),0) as actual
    from projects p where p.id=$1`, [ids.project]);
  assert.equal(Number(rows[0].approved_change_total), Number(rows[0].actual), 'Project aggregate must include every committed approved CO');
}
async function newCo(amount) {
  return execute(ids.pm, createQuery('change_orders', randomUUID(), { title: 'Concurrent steel change', status: 'Submitted', co_amount: amount }));
}
async function newSov(amount) {
  return execute(ids.pm, createQuery('sov_items', randomUUID(), { description: 'Concurrent steel SOV', scheduled_value: amount }));
}

try {
  const { rows: existing } = await admin.query("select count(*)::int as count from pg_tables where schemaname not in ('pg_catalog','information_schema')");
  assert.equal(existing[0].count, 0, 'Refusing to run against a populated database');
  await initializeCommercialFixture(db);
  await installLifecycleFixture(db);
  await db.exec(await readFile(new URL('../../migrations/20261007112918_transactional_numbered_record_creates.sql', import.meta.url), 'utf8'));

  const payloads = {
    change_orders: { title: 'Concurrent steel CO', status: 'Submitted', co_amount: 600, attachments: 'drawing-reference' },
    change_requests: { title: 'Concurrent steel CR', description: 'Steel scope clarification' },
    deliveries: { delivery_title: 'Concurrent steel load', status: 'Scheduled', actual_date: '2026-10-07' },
    sov_items: { description: 'Concurrent steel SOV', scheduled_value: 800, application_number: 2 },
    backcharges: { title: 'Concurrent steel rework', amount: 75, notice_date: '2026-10-07', attachments: [{ name: 'notice.pdf' }] },
  };
  for (const [kind, payload] of Object.entries(payloads)) {
    await check(`${kind}: eight simultaneous cross-user retries allocate one complete record and one number`, async () => {
      const operation = randomUUID();
      const records = values(await contend('select pg_advisory_xact_lock(hashtextextended($1,0))', [lockKey(kind, operation)],
        Array.from({ length: 8 }, (_, index) => ({ actor: index % 2 ? ids.colleague : ids.pm, query: createQuery(kind, operation, payload) }))));
      assert.equal(new Set(records.map(record => record.id)).size, 1);
      const { rows } = await admin.query(`select (select count(*) from public.${kind} where project_id=$1)::int as records,
        (select count(*) from numbered_create_receipts where project_id=$1 and kind=$2 and client_op_id=$3)::int as receipts`, [ids.project, kind, operation]);
      assert.deepEqual(rows[0], { records: 1, receipts: 1 });
      const { rows: sequence } = await admin.query('select next_value from number_sequences where project_id=$1 and record_type=$2', [ids.project, ({ change_orders: 'CO', change_requests: 'change_request', deliveries: 'delivery', sov_items: 'SOV', backcharges: 'backcharge' })[kind]]);
      assert.equal(sequence.length, 1);
      assert.equal(sequence[0].next_value, 2, 'Only one official number is allocated');
      if (kind === 'change_orders') assert.equal(records[0].attachments, payload.attachments);
      if (kind === 'deliveries') assert.equal(records[0].actual_date, payload.actual_date);
      if (kind === 'sov_items') assert.equal(records[0].application_number, 2);
      if (kind === 'backcharges') {
        assert.equal(records[0].notice_date, payload.notice_date);
        assert.deepEqual(records[0].attachments, payload.attachments);
        const { rows: events } = await admin.query('select event_type,count(*)::int as count from backcharge_events where backcharge_id=$1 group by event_type order by event_type', [records[0].id]);
        assert.deepEqual(events, [{ event_type: 'created', count: 1 }, { event_type: 'notice_sent', count: 1 }]);
      }
    });
  }

  await check('simultaneous same-key different payloads commit one winner and reject the other', async () => {
    const operation = randomUUID();
    const results = await contend('select pg_advisory_xact_lock(hashtextextended($1,0))', [lockKey('change_orders', operation)], [100, 200].map((amount, index) => ({ actor: index ? ids.colleague : ids.pm, query: createQuery('change_orders', operation, { title: 'Competing payload', co_amount: amount }) })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = results.find(result => result.status === 'rejected');
    assert.match(rejected.reason.message, /NUMBERED_CREATE_PAYLOAD_MISMATCH/);
    const { rows } = await admin.query('select count(*)::int as count from numbered_create_receipts where project_id=$1 and kind=$2 and client_op_id=$3', [ids.project, 'change_orders', operation]);
    assert.equal(rows[0].count, 1);
  });

  await check('membership revoked while waiting denies the pending create after the lock clears', async () => {
    const operation = randomUUID();
    const results = await contend('select pg_advisory_xact_lock(hashtextextended($1,0))', [lockKey('change_requests', operation)], [
      { actor: ids.field, query: createQuery('change_requests', operation, { title: 'Revoked while waiting' }) },
    ], async () => { await admin.query('delete from organization_members where org_id=$1 and user_id=$2', [ids.org, ids.field]); });
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[0].reason.code, '42501');
    const { rows } = await admin.query('select count(*)::int as count from numbered_create_receipts where client_op_id=$1', [operation]);
    assert.equal(rows[0].count, 0);
    await admin.query('insert into organization_members values($1,$2,$3)', [ids.org, ids.field, 'member']);
  });

  await check('two independent approvals preserve the project aggregate after both waited on its row', async () => {
    const rows = [await newCo(300), await newCo(450)];
    values(await contend('select id from projects where id=$1 for update', [ids.project], rows.map((row, index) => ({ actor: index ? ids.colleague : ids.pm, query: saveQuery(row, approval) }))));
    await totals();
  });

  await check('simultaneous credit and deduct safely update one shared SOV line and the project total', async () => {
    const line = await newSov(1000);
    const rows = [await newCo(400), await newCo(-300)];
    values(await contend('select id from sov_items where id=$1 for update', [line.id], rows.map((row, index) => ({ actor: index ? ids.colleague : ids.pm, query: saveQuery(row, { ...approval, sov_mode: 'adjust_line', sov_line_item_id: line.id }) }))));
    assert.equal(Number((await admin.query('select scheduled_value from sov_items where id=$1', [line.id])).rows[0].scheduled_value), 1100);
    await totals();
  });

  await check('competing deducts cannot overspend a shared SOV line or retain failed metadata', async () => {
    const line = await newSov(1000);
    const rows = [await newCo(-700), await newCo(-700)];
    const results = await contend('select id from sov_items where id=$1 for update', [line.id], rows.map((row, index) => ({ actor: index ? ids.colleague : ids.pm, query: saveQuery(row, { ...approval, title: 'Approved deduct', sov_mode: 'adjust_line', sov_line_item_id: line.id }) })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failedIndex = results.findIndex(result => result.status === 'rejected');
    assert.match(results[failedIndex].reason.message, /below zero/i);
    const unchanged = (await admin.query('select title,status from change_orders where id=$1', [rows[failedIndex].id])).rows[0];
    assert.deepEqual(unchanged, { title: 'Concurrent steel change', status: 'Submitted' });
    assert.equal(Number((await admin.query('select scheduled_value from sov_items where id=$1', [line.id])).rows[0].scheduled_value), 300);
    await totals();
  });

  await check('two reviewers of one revision cannot approve it twice', async () => {
    const row = await newCo(250);
    const results = await contend('select id from change_orders where id=$1 for update', [row.id], [ids.pm, ids.colleague].map(actor => ({ actor, query: saveQuery(row, approval) })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, '40001');
    await totals();
  });
  await check('SOV save waiting on an approved CO adjustment rejects its stale version without overwriting value or metadata',async()=>{
    const line=await newSov(1000);const co=await newCo(400);
    const results=await contend('select id from sov_items where id=$1 for update',[line.id],[
      {actor:ids.colleague,query:saveSovQuery(line,{description:'Must not overwrite',scheduled_value:1000})},
    ],async()=>{
      await admin.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:ids.pm,role:'authenticated',aal:'aal2'})]);
      await admin.query('set local role authenticated');
      await admin.query(saveQuery(co,{...approval,sov_mode:'adjust_line',sov_line_item_id:line.id}));
    });
    assert.equal(results[0].status,'rejected');assert.equal(results[0].reason.code,'40001');
    const saved=(await admin.query('select scheduled_value,description from sov_items where id=$1',[line.id])).rows[0];
    assert.equal(Number(saved.scheduled_value),1400);assert.equal(saved.description,line.description);await totals();
  });
  await check('two SOV reviewers sharing a revision commit one edit and reject the other',async()=>{
    const line=await newSov(900);
    const results=await contend('select id from sov_items where id=$1 for update',[line.id],[ids.pm,ids.colleague].map((actor,index)=>({actor,query:saveSovQuery(line,{description:`SOV editor ${index}`})})));
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.find(result=>result.status==='rejected').reason.code,'40001');
    assert.equal(Number((await admin.query('select scheduled_value from sov_items where id=$1',[line.id])).rows[0].scheduled_value),900);
  });
  console.log(`Real PostgreSQL concurrency verification: ${passed} cases passed across independent sessions. No hosted data was written.`);
} finally {
  await admin.query('rollback');
  admin.release();
  await pool.end();
}
