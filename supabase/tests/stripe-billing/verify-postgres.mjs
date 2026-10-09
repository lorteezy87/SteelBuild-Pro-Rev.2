import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

// This accepts only an empty, disposable loopback database. It cannot run
// against Supabase or accept application environment credentials.
assert.equal(process.env.BILLING_POSTGRES_TEST, '1', 'Explicit fixture opt-in required');
const target = new URL(process.env.BILLING_POSTGRES_URL);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Loopback only');
assert.equal(target.pathname, '/steelbuild_billing_test');
assert.equal(target.search, '', 'No connection parameter overrides');
if (process.env.BILLING_POSTGRES_CREATE_DB === '1') {
  const controlTarget = new URL(target);
  controlTarget.pathname = '/postgres';
  const control = new pg.Client({ connectionString: controlTarget.href });
  await control.connect();
  try { await control.query('CREATE DATABASE steelbuild_billing_test'); }
  finally { await control.end(); }
}
const pool = new pg.Pool({ connectionString: target.href, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
const admin = await pool.connect();
const org = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const update = { plan: 'pro', subscription_status: 'active', stripe_subscription_id: 'sub_current', stripe_customer_id: 'cus_test', current_period_end: null };
let passed = 0;
let checkoutReady = false;
const checkoutActor = '10000000-0000-4000-8000-000000000010';
const scalar = async (sql, args = []) => (await admin.query(sql, args)).rows[0]?.result;
const snapshot = (id = org) => scalar('select public.get_stripe_billing_snapshot($1) result', [id]);
const apply = (overrides = {}) => {
  const args = { event: 'evt_test', type: 'customer.subscription.updated', org, revision: 0, expectedCustomer: 'cus_test', expectedSubscription: 'sub_current',
    subscription: 'sub_current', customer: 'cus_test', created: 200, previousCreated: null, update, ...overrides };
  return { text: 'select public.apply_stripe_billing_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result', values: Object.values(args) };
};
async function check(name, run) {
  await admin.query('truncate organizations, billing_events, private.stripe_billing_sync_state cascade');
  await admin.query("insert into organizations(id,plan,stripe_customer_id,stripe_subscription_id,subscription_status) values($1,'business','cus_test','sub_current','active'),($2,'business','cus_test','sub_current','active')", [org, other]);
  if (checkoutReady) {
    await admin.query("update organizations set plan='free',stripe_customer_id=null,stripe_subscription_id=null,subscription_status=null");
    await admin.query("insert into organization_members values($1,$2,'owner')", [org,checkoutActor]);
  }
  await run();
  passed++;
  console.log(`PASS ${name}`);
}
async function session() {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claim.role','service_role',true)");
    await client.query('set local role service_role');
    const { rows } = await client.query('select pg_backend_pid() pid');
    return { client, pid: rows[0].pid };
  } catch (error) { await client.query('rollback'); client.release(); throw error; }
}
async function finish(client, query) {
  try {
    const { rows } = await client.query(query);
    await client.query('commit');
    return rows[0]?.result;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
async function execute(query) { return finish((await session()).client, query); }
async function waitForLock(pids) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    await admin.query('select pg_stat_clear_snapshot()');
    const { rows } = await admin.query("select pid from pg_stat_activity where pid=any($1::int[]) and state='active' and wait_event_type='Lock'", [pids]);
    if (rows.length === pids.length) return;
    await delay(20);
  }
  throw new Error(`Expected ${pids.length} independent PostgreSQL sessions blocked on the held lock`);
}
async function contend(lock, values, queries) {
  await admin.query('begin');
  const sessions = [];
  let pending;
  try {
    await admin.query(lock, values);
    for (const _query of queries) sessions.push(await session());
    assert.equal(new Set(sessions.map(s => s.pid)).size, queries.length);
    pending = Promise.allSettled(sessions.map((s, i) => finish(s.client, queries[i])));
    await waitForLock(sessions.map(s => s.pid));
    await admin.query('commit');
    return await pending;
  } catch (error) {
    await admin.query('rollback');
    if (pending) await pending;
    else for (const s of sessions) { await s.client.query('rollback'); s.client.release(); }
    throw error;
  }
}
const orgLock = 'select id from organizations where id=$1 for update';
try {
  assert.equal(await scalar("select count(*)::int result from pg_tables where schemaname not in ('pg_catalog','information_schema')"), 0, 'Refusing populated database');
  await admin.query(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema auth;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema auth to service_role;
    create table organizations(id uuid primary key, plan text not null default 'free', stripe_customer_id text,
      stripe_subscription_id text, subscription_status text, current_period_end timestamptz);
    create table billing_events(id uuid default gen_random_uuid() primary key, stripe_event_id text unique not null,
      type text, org_id uuid references organizations(id) on delete set null, created_at timestamptz default now());
    alter table organizations enable row level security;
    alter table billing_events enable row level security;
  `);
  const baseline = await readFile(new URL('../../migrations/20260101000010_baseline_schema.sql', import.meta.url), 'utf8');
  const start = baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."org_protect_billing_columns"()');
  const end = baseline.indexOf('$$;', baseline.indexOf('AS $$', start));
  assert.ok(start >= 0 && end > start);
  await admin.query(baseline.slice(start, end + 3));
  await admin.query('create trigger billing_guard before update on organizations for each row execute function org_protect_billing_columns()');
  await admin.query(await readFile(new URL('../../migrations/20261008071019_atomic_stripe_billing_events.sql', import.meta.url), 'utf8'));

  await check('eight simultaneous deliveries apply one entitlement and one durable receipt', async () => {
    const results = await contend(orgLock, [org], Array.from({ length: 8 }, () => apply()));
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value === 'applied').length, 1);
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value === 'duplicate').length, 7);
    assert.equal((await snapshot()).revision, '1');
    assert.equal(await scalar('select count(*)::int result from billing_events'), 1);
  });
  await check('competing activation and cancellation reject the loser snapshot before a fresh retry', async () => {
    const results = await contend(orgLock, [org], [apply({ event: 'evt_activate' }), apply({ event: 'evt_cancel', update: { ...update, plan: 'free', subscription_status: 'canceled' } })]);
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value === 'applied').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === '40001').length, 1);
    const losingEvent = results[0].status === 'rejected' ? 'evt_activate' : 'evt_cancel';
    assert.equal(await execute(apply({ event: losingEvent, revision: (await snapshot()).revision, update: { ...update, plan: 'free', subscription_status: 'canceled' } })), 'applied');
    assert.equal(await scalar('select plan result from organizations where id=$1', [org]), 'free');
    assert.equal((await snapshot()).revision, '2');
    assert.equal(await scalar('select count(*)::int result from billing_events'), 2);
  });
  await check('failed receipt insert rolls back its plan and lets a waiting delivery commit', async () => {
    await admin.query(`create function reject_fixture_receipt() returns trigger language plpgsql as $$ begin
      if new.stripe_event_id='evt_rejected' then
        perform pg_advisory_xact_lock(726110);
        raise exception 'Synthetic receipt failure' using errcode='40001';
      end if;
      return new; end $$;
      create trigger fixture_receipt before insert on billing_events for each row execute function reject_fixture_receipt()`);
    const pending = [];
    try {
      await admin.query('begin');
      await admin.query('select pg_advisory_xact_lock(726110)');
      const rejected = await session();
      pending.push(Promise.allSettled([finish(rejected.client, apply({ event: 'evt_rejected' }))]));
      await waitForLock([rejected.pid]);
      const survivor = await session();
      pending.push(Promise.allSettled([finish(survivor.client, apply({ event: 'evt_surviving' }))]));
      await waitForLock([survivor.pid]);
      await admin.query('commit');
      const results = (await Promise.all(pending)).flat();
      assert.equal(results[0].status, 'rejected');
      assert.equal(results[0].reason.code, '40001');
      assert.equal(results[0].reason.message, 'Synthetic receipt failure');
      assert.deepEqual(results[1], { status: 'fulfilled', value: 'applied' });
      assert.equal((await snapshot()).revision, '1');
      assert.equal(await scalar("select count(*)::int result from billing_events where stripe_event_id='evt_rejected'"), 0);
    } finally {
      await admin.query('rollback');
      await Promise.all(pending);
      await admin.query('drop trigger fixture_receipt on billing_events; drop function reject_fixture_receipt()');
    }
  });
  await check('obsolete subscription receipt cannot commit using a pre-replacement binding', async () => {
    const first = await session();
    let waiter;
    let pending;
    try {
      await first.client.query(apply({ event: 'evt_checkout', type: 'checkout.session.completed', subscription: 'sub_new', created: 300, previousCreated: 200, update: { ...update, stripe_subscription_id: 'sub_new' } }));
      waiter = await session();
      pending = Promise.allSettled([finish(waiter.client, apply({ event: 'evt_obsolete', type: 'customer.subscription.deleted', update: null }))]);
      await waitForLock([waiter.pid]);
      await first.client.query('commit');
      const [result] = await pending;
      assert.equal(result.status, 'rejected');
      assert.equal(result.reason.code, '40001');
      assert.equal((await snapshot()).stripe_subscription_id, 'sub_new');
      assert.equal(await scalar('select count(*)::int result from billing_events'), 1);
    } finally { await first.client.query('rollback'); first.client.release(); if (pending) await pending; }
  });
  await check('cross-workspace receipt collision rolls back the losing workspace entitlement', async () => {
    await admin.query(`create function block_fixture_receipt() returns trigger language plpgsql as $$ begin
      perform pg_advisory_xact_lock(726109); return new; end $$;
      create trigger fixture_receipt before insert on billing_events for each row execute function block_fixture_receipt()`);
    try {
      const results = await contend('select pg_advisory_xact_lock(726109)', [], [apply(), apply({ org: other })]);
      assert.equal(results.filter(r => r.status === 'fulfilled' && r.value === 'applied').length, 1);
      assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === '23505').length, 1);
      assert.equal(await scalar("select count(*)::int result from organizations where plan='pro'"), 1);
      assert.equal(await scalar("select count(*)::int result from organizations where plan='business'"), 1);
      assert.equal(await scalar('select count(*)::int result from private.stripe_billing_sync_state'), 1);
      assert.equal(await scalar('select count(*)::int result from billing_events'), 1);
    } finally { await admin.query('drop trigger fixture_receipt on billing_events; drop function block_fixture_receipt()'); }
  });
  await check('workspace erasure waits for a billing writer and cascades private synchronization state', async () => {
    const first = await session();
    const eraser = await pool.connect();
    let pending;
    try {
      await first.client.query(apply());
      await eraser.query('begin');
      const { rows } = await eraser.query('select pg_backend_pid() pid');
      pending = Promise.allSettled([finish(eraser, { text: 'delete from organizations where id=$1', values: [org] })]);
      await waitForLock([rows[0].pid]);
      await first.client.query('commit');
      assert.equal((await pending)[0].status, 'fulfilled');
      assert.equal(await snapshot(), null);
      assert.equal(await scalar('select count(*)::int result from private.stripe_billing_sync_state'), 0);
      assert.equal(await scalar('select count(*)::int result from billing_events where org_id is null'), 1);
    } finally { await first.client.query('rollback'); first.client.release(); if (pending) await pending; else eraser.release(); }
  });
  await admin.query('create table organization_members(org_id uuid references organizations(id) on delete cascade,user_id uuid,role text,primary key(org_id,user_id))');
  await admin.query(await readFile(new URL('../../migrations/20261009125901_durable_workspace_checkout_intents.sql', import.meta.url), 'utf8'));
  checkoutReady = true;
  const reserve = (plan = 'pro') => ({ text:'select public.begin_billing_checkout($1,$2,$3,$4,false,$5) result', values:[org,checkoutActor,plan,`price_${plan}`,'https://www.steelbuild-pro.com'] });
  const bindCustomer = operation => ({ text:'select public.bind_billing_checkout_customer($1,$2,$3,$4) result', values:[org,checkoutActor,operation,'cus_checkout'] });
  await check('eight independent checkout requests reserve exactly one operation', async () => {
    const results = await contend(orgLock,[org],Array.from({length:8},()=>reserve()));
    assert.ok(results.every(r=>r.status==='fulfilled' && r.value.decision==='intent'));
    assert.equal(new Set(results.map(r=>r.value.intent.operation_id)).size,1);
    assert.equal(await scalar('select count(*)::int result from private.billing_checkout_intents'),1);
  });
  await check('different plans cannot allocate simultaneous checkout operations', async () => {
    const results = await contend(orgLock,[org],[reserve('pro'),reserve('business')]);
    assert.ok(results.every(r=>r.status==='fulfilled'));
    assert.equal(new Set(results.map(r=>r.value.intent.operation_id)).size,1);
    assert.equal(new Set(results.map(r=>r.value.intent.plan)).size,1);
  });
  await check('simultaneous same-key provider results confirm one customer binding', async () => {
    const operation = (await execute(reserve())).intent.operation_id;
    const results = await contend(orgLock,[org],Array.from({length:8},()=>bindCustomer(operation)));
    assert.ok(results.every(r=>r.status==='fulfilled'));
    assert.equal(await scalar('select stripe_customer_id result from organizations where id=$1',[org]),'cus_checkout');
    assert.equal(await scalar('select customer_id result from private.billing_checkout_intents'),'cus_checkout');
  });
  await check('a competing different provider session cannot replace the confirmed payable session', async () => {
    const operation = (await execute(reserve())).intent.operation_id;
    await execute(bindCustomer(operation));
    const queries = ['cs_one','cs_two'].map(id=>({ text:'select public.record_billing_checkout_session($1,$2,$3,$4,$5,$6,$7) result',
      values:[org,checkoutActor,operation,'cus_checkout',id,`https://checkout.stripe.com/c/pay/${id}`,new Date(Date.now()+3600000).toISOString()] }));
    const results = await contend(orgLock,[org],queries);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected' && r.reason.code==='22023').length,1);
    assert.equal(await scalar("select count(*)::int result from private.billing_checkout_intents where state='open'"),1);
  });
  await check('membership removal while checkout waits denies every provider-binding callback', async () => {
    const operation = (await execute(reserve())).intent.operation_id;
    await admin.query('begin');
    await admin.query(orgLock,[org]);
    const waiting = await session();
    const pending = Promise.allSettled([finish(waiting.client,bindCustomer(operation))]);
    try {
      await waitForLock([waiting.pid]);
      await admin.query('delete from organization_members where org_id=$1',[org]);
      await admin.query('commit');
      const [result] = await pending;
      assert.equal(result.status,'rejected'); assert.equal(result.reason.code,'42501');
      assert.equal(await scalar('select stripe_customer_id result from organizations where id=$1',[org]),null);
    } finally { await admin.query('rollback'); await pending; }
  });
  await check('erasure while checkout waits removes the intent and refuses resurrection', async () => {
    const operation = (await execute(reserve())).intent.operation_id;
    await admin.query('begin');
    await admin.query(orgLock,[org]);
    const waiting = await session();
    const pending = Promise.allSettled([finish(waiting.client,bindCustomer(operation))]);
    try {
      await waitForLock([waiting.pid]);
      await admin.query('delete from organizations where id=$1',[org]);
      await admin.query('commit');
      const [result] = await pending;
      assert.equal(result.status,'rejected'); assert.equal(result.reason.code,'P0002');
      assert.equal(await scalar('select count(*)::int result from private.billing_checkout_intents'),0);
    } finally { await admin.query('rollback'); await pending; }
  });
  await check('customer rebinding while expiry waits cannot renew the old reservation', async () => {
    const operation = (await execute(reserve())).intent.operation_id;
    await execute(bindCustomer(operation));
    const future = new Date(Date.now()+3600000).toISOString();
    await execute({ text:'select public.record_billing_checkout_session($1,$2,$3,$4,$5,$6,$7) result',
      values:[org,checkoutActor,operation,'cus_checkout','cs_expiry','https://checkout.stripe.com/c/pay/expiry',future] });
    const expired = new Date(Date.now()-10000).toISOString();
    await admin.query('update private.billing_checkout_intents set session_expires_at=$1',[expired]);
    await admin.query('begin');
    await admin.query(orgLock,[org]);
    const waiting = await session();
    const pending = Promise.allSettled([finish(waiting.client,{ text:'select public.expire_billing_checkout_intent($1,$2,$3,$4,$5) result',
      values:[org,checkoutActor,operation,'cs_expiry',expired] })]);
    try {
      await waitForLock([waiting.pid]);
      await admin.query("update organizations set stripe_customer_id='cus_changed' where id=$1",[org]);
      await admin.query('commit');
      const [result] = await pending;
      assert.equal(result.status,'rejected'); assert.equal(result.reason.code,'40001');
      assert.equal(await scalar('select state result from private.billing_checkout_intents'),'open');
    } finally { await admin.query('rollback'); await pending; }
  });
  console.log(`${passed} concurrent PostgreSQL billing and checkout checks passed.`);
} finally { admin.release(); await pool.end(); }
