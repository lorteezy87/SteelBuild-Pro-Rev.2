import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute the candidate SQL itself. PGlite proves transaction rollback and the
// stale-observation fence; real overlapping connections remain a staging check.
const db = new PGlite();
const org = '10000000-0000-4000-8000-000000000001';
const missing = '10000000-0000-4000-8000-000000000002';
let passed = 0;
let failed = 0;
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.result;
const snapshot = () => scalar('select public.get_stripe_billing_snapshot($1) result', [org]);
const markerCount = () => scalar('select count(*)::int result from billing_events');
const plan = () => scalar('select plan result from organizations where id=$1', [org]);
const update = { plan: 'pro', subscription_status: 'active', stripe_subscription_id: 'sub_current', stripe_customer_id: 'cus_test', current_period_end: null };
const apply = (overrides = {}) => {
  const args = { event: 'evt_test', type: 'checkout.session.completed', org, revision: 0, expectedCustomer: 'cus_test', expectedSubscription: 'sub_current',
    subscription: 'sub_current', customer: 'cus_test', created: 200, previousCreated: null, update, ...overrides };
  return scalar('select public.apply_stripe_billing_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result', Object.values(args));
};
async function rejected(run, code) {
  await db.exec('savepoint expected_failure');
  await assert.rejects(run(), error => error.code === code);
  await db.exec('rollback to savepoint expected_failure');
}
async function check(name, run) {
  await db.exec('reset role; begin');
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  finally { await db.exec('rollback; reset role'); }
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table organizations(id uuid primary key, plan text not null default 'free', stripe_customer_id text,
      stripe_subscription_id text, subscription_status text, current_period_end timestamptz);
    create table billing_events(id uuid default gen_random_uuid() primary key, stripe_event_id text unique not null,
      type text, org_id uuid references organizations(id) on delete set null, created_at timestamptz default now());
    insert into organizations values('${org}','business','cus_test','sub_current','active',null);
    alter table organizations enable row level security;
    alter table billing_events enable row level security;
    grant all on organizations, billing_events to service_role;
    select set_config('request.jwt.claim.role','service_role',false);
  `);
  const baseline = await readFile(new URL('../../migrations/20260101000010_baseline_schema.sql', import.meta.url), 'utf8');
  const triggerStart = baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."org_protect_billing_columns"()');
  const triggerEnd = baseline.indexOf('$$;', baseline.indexOf('AS $$', triggerStart));
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart);
  await db.exec(baseline.slice(triggerStart, triggerEnd + 3));
  await db.exec('create trigger billing_guard before update on organizations for each row execute function org_protect_billing_columns();');
  await db.exec(await readFile(new URL('../../migrations/20261008071019_atomic_stripe_billing_events.sql', import.meta.url), 'utf8'));

  await check('service role atomically applies an organization change and event marker', async () => {
    await db.exec('set role service_role');
    assert.equal((await snapshot()).revision, '0');
    assert.equal(await apply(), 'applied');
    assert.equal((await snapshot()).revision, '1');
    await db.exec('reset role');
    assert.equal(await plan(), 'pro');
    assert.equal(await markerCount(), 1);
  });
  await check('marker insertion failure rolls back the organization and revision', async () => {
    await db.exec(`create function reject_marker() returns trigger language plpgsql as $$ begin raise exception 'synthetic marker failure' using errcode='40001'; end $$;
      create trigger reject_marker before insert on billing_events for each row execute function reject_marker();`);
    await rejected(() => apply(), '40001');
    assert.equal(await plan(), 'business');
    assert.equal(await markerCount(), 0);
    assert.equal((await snapshot()).revision, '0');
  });
  await check('organization update error never leaves a processed marker', async () => {
    await db.exec("alter table organizations add constraint synthetic_failure check(plan <> 'pro');");
    await rejected(() => apply(), '23514');
    assert.equal(await markerCount(), 0);
    assert.equal((await snapshot()).revision, '0');
  });
  await check('a trigger suppressing the organization update is not acknowledged', async () => {
    await db.exec(`create function skip_update() returns trigger language plpgsql as $$ begin return null; end $$;
      create trigger skip_update before update on organizations for each row execute function skip_update();`);
    await rejected(() => apply(), '40001');
    assert.equal(await markerCount(), 0);
  });
  await check('duplicate delivery is durable without applying the update twice', async () => {
    assert.equal(await apply(), 'applied');
    assert.equal(await apply({ update: { ...update, plan: 'free', subscription_status: 'canceled' } }), 'duplicate');
    assert.equal(await plan(), 'pro');
    assert.equal((await snapshot()).revision, '1');
    assert.equal(await markerCount(), 1);
  });
  await check('legacy markers remain idempotent without a revision row', async () => {
    await db.query('insert into billing_events(stripe_event_id,type,org_id) values($1,$2,$3)', ['evt_test', 'checkout.session.completed', org]);
    assert.equal(await apply(), 'duplicate');
    assert.equal(await plan(), 'business');
    assert.equal((await snapshot()).revision, '0');
  });
  await check('a stale provider observation cannot overwrite a later cancellation', async () => {
    const observationA = await snapshot();
    const observationB = await snapshot();
    assert.equal(await apply({ event: 'evt_cancel', revision: observationB.revision, update: { ...update, plan: 'free', subscription_status: 'canceled' } }), 'applied');
    await rejected(() => apply({ revision: observationA.revision }), '40001');
    assert.equal(await plan(), 'free');
    assert.equal(await markerCount(), 1);
    assert.equal(await apply({ revision: (await snapshot()).revision, update: { ...update, plan: 'free', subscription_status: 'canceled' } }), 'applied');
    assert.equal(await plan(), 'free');
  });
  for (const column of ['stripe_customer_id', 'stripe_subscription_id']) {
    await check(`direct ${column} mutation also invalidates the old snapshot`, async () => {
      await db.exec(`update organizations set ${column}='changed_by_another_writer'`);
      await rejected(() => apply(), '40001');
      assert.equal(await markerCount(), 0);
    });
  }
  await check('missing org and missing revision cannot be treated as successful writes', async () => {
    await rejected(() => apply({ org: missing }), 'P0002');
    await rejected(() => apply({ revision: null }), '40001');
    assert.equal(await markerCount(), 0);
  });
  await check('customer mismatch cannot rebind an existing organization', async () => {
    await rejected(() => apply({ customer: 'cus_foreign', update: { ...update, stripe_customer_id: 'cus_foreign' } }), '22023');
    assert.equal(await markerCount(), 0);
  });
  await check('subscription events cannot replace the current subscription', async () => {
    await rejected(() => apply({ type: 'customer.subscription.updated', subscription: 'sub_old', update: { ...update, stripe_subscription_id: 'sub_old' } }), '22023');
    assert.equal(await markerCount(), 0);
  });
  await check('an obsolete event is marked only with a still-current binding decision', async () => {
    assert.equal(await apply({ type: 'customer.subscription.deleted', subscription: 'sub_old', update: null }), 'ignored');
    assert.equal(await plan(), 'business');
    assert.equal((await snapshot()).revision, '1');
    await rejected(() => apply({ event: 'evt_stale_ignore', subscription: 'sub_other', update: null }), '40001');
    assert.equal(await markerCount(), 1);
  });
  await check('strictly newer checkout may replace a current binding', async () => {
    assert.equal(await apply({ subscription: 'sub_newer', created: 300, previousCreated: 200, update: { ...update, stripe_subscription_id: 'sub_newer' } }), 'applied');
    assert.equal((await snapshot()).stripe_subscription_id, 'sub_newer');
  });
  for (const created of [100, 200, null]) {
    await check(`older, same-second or unproved checkout order (${created}) cannot replace a binding`, async () => {
      await rejected(() => apply({ subscription: 'sub_other', created, previousCreated: 200, update: { ...update, stripe_subscription_id: 'sub_other' } }), '22023');
      assert.equal(await markerCount(), 0);
    });
  }
  await check('unknown/terminal statuses and plans cannot grant paid access through the RPC', async () => {
    for (const status of ['canceled', 'unpaid', 'unexpected']) await rejected(() => apply({ update: { ...update, subscription_status: status } }), '22023');
    await rejected(() => apply({ update: { ...update, plan: 'enterprise-from-metadata' } }), '22023');
    assert.equal(await markerCount(), 0);
  });
  await check('unrelated events can be durably ignored without an organization mutation', async () => {
    assert.equal(await apply({ org: null, revision: null, expectedCustomer: null, expectedSubscription: null, subscription: null, customer: null, update: null }), 'ignored');
    assert.equal(await markerCount(), 1);
    assert.equal(await plan(), 'business');
    await rejected(() => apply({ event: 'evt_invalid', org: null }), '22023');
  });
  for (const role of ['anon', 'authenticated']) {
    await check(`${role} cannot call billing RPCs or read private revision state`, async () => {
      await db.exec(`set role ${role}`);
      await rejected(snapshot, '42501');
      await rejected(() => apply(), '42501');
      await rejected(() => db.query('select * from private.stripe_billing_sync_state'), '42501');
    });
  }
  await check('RPCs pin search_path and only service_role receives execute', async () => {
    const rows = (await db.query("select oid,proconfig from pg_proc where proname in ('get_stripe_billing_snapshot','apply_stripe_billing_event')")).rows;
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.ok(row.proconfig.includes('search_path=""'));
      for (const role of ['anon', 'authenticated']) assert.equal(await scalar('select has_function_privilege($1,$2::oid,\'execute\') result', [role, row.oid]), false);
      assert.equal(await scalar('select has_function_privilege(\'service_role\',$1::oid,\'execute\') result', [row.oid]), true);
    }
    assert.equal(await scalar("select relrowsecurity result from pg_class where oid='private.stripe_billing_sync_state'::regclass"), true);
  });
  console.log(`${passed} passed; ${failed} failed.`);
  if (failed) process.exitCode = 1;
} finally { await db.close(); }
