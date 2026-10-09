import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const org = '30000000-0000-4000-8000-000000000001';
const actor = '30000000-0000-4000-8000-000000000002';
const stranger = '30000000-0000-4000-8000-000000000003';
let passed = 0;
let failed = 0;
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.result;
const begin = (overrides = {}) => {
  const args = { org, actor, plan: 'pro', price: 'price_pro', live: false, base: 'https://www.steelbuild-pro.com', ...overrides };
  return scalar('select public.begin_billing_checkout($1,$2,$3,$4,$5,$6) result', Object.values(args));
};
const bind = (operation, customer = 'cus_fixture') => scalar('select public.bind_billing_checkout_customer($1,$2,$3,$4) result', [org, actor, operation, customer]);
const session = (operation, overrides = {}) => {
  const args = { org, actor, operation, customer: 'cus_fixture', session: 'cs_fixture', url: 'https://checkout.stripe.com/c/pay/fixture', expires: new Date(Date.now() + 3600000).toISOString(), ...overrides };
  return scalar('select public.record_billing_checkout_session($1,$2,$3,$4,$5,$6,$7) result', Object.values(args));
};
const expire = (operation, expires) => scalar('select public.expire_billing_checkout_intent($1,$2,$3,$4,$5) result', [org, actor, operation, 'cs_fixture', expires]);
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
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table organizations(id uuid primary key,plan text not null default 'free',stripe_customer_id text,stripe_subscription_id text,subscription_status text,current_period_end timestamptz);
    create table organization_members(org_id uuid references organizations(id) on delete cascade,user_id uuid,role text,primary key(org_id,user_id));
    insert into organizations(id) values('${org}');
    insert into organization_members values('${org}','${actor}','owner');
    alter table organizations enable row level security;
    alter table organization_members enable row level security;
    select set_config('request.jwt.claim.role','service_role',false);`);
  const baseline = await readFile(new URL('../../migrations/20260101000010_baseline_schema.sql', import.meta.url), 'utf8');
  const start = baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."org_protect_billing_columns"()');
  const end = baseline.indexOf('$$;', baseline.indexOf('AS $$', start));
  assert.ok(start >= 0 && end > start);
  await db.exec(baseline.slice(start, end + 3));
  await db.exec('create trigger billing_guard before update on organizations for each row execute function org_protect_billing_columns()');
  await db.exec(await readFile(new URL('../../migrations/20261009125901_durable_workspace_checkout_intents.sql', import.meta.url), 'utf8'));
  await check('current service-verified owner receives one durable operation with frozen parameters', async () => {
    await db.exec('set role service_role');
    const first = await begin(); const second = await begin({ price: 'price_changed', base: 'https://steelbuild-pro.com' });
    assert.equal(first.decision, 'intent'); assert.equal(second.intent.operation_id, first.intent.operation_id);
    assert.equal(second.intent.price_id, 'price_pro'); assert.equal(second.intent.return_base, 'https://www.steelbuild-pro.com');
  });
  for (const plan of ['pro','business','enterprise']) await check(`${plan} workspace is sent to billing management`, async () => {
    await db.query("update organizations set plan=$1,stripe_customer_id='cus_existing'", [plan]);
    assert.equal((await begin()).decision, 'portal');
  });
  for (const status of ['active','trialing','past_due','incomplete','unpaid','paused','unknown',null]) await check(`bound ${status} subscription cannot create another checkout`, async () => {
    await db.query("update organizations set stripe_customer_id='cus_existing',stripe_subscription_id='sub_existing',subscription_status=$1", [status]);
    assert.equal((await begin()).decision, 'portal');
  });
  await check('subscription without a customer requires reconciliation', async () => {
    await db.exec("update organizations set stripe_subscription_id='sub_unknown',subscription_status='canceled'");
    assert.equal((await begin()).decision, 'reconcile');
  });
  await check('unknown status without a subscription requires reconciliation', async () => {
    await db.exec("update organizations set subscription_status='active'"); assert.equal((await begin()).decision, 'reconcile');
  });
  await check('foreign or revoked membership cannot reserve or mutate checkout', async () => {
    await rejected(() => begin({ actor: stranger }), '42501');
    const operation = (await begin()).intent.operation_id;
    await db.exec('delete from organization_members');
    await rejected(() => begin(), '42501'); await rejected(() => bind(operation), '42501');
  });
  await check('member and field roles have no billing authority', async () => {
    await db.exec("update organization_members set role='member'"); await rejected(() => begin(), '42501');
  });
  await check('confirmed binding is atomic and cannot replace a different customer', async () => {
    const operation = (await begin()).intent.operation_id;
    await bind(operation); await bind(operation);
    assert.equal((await begin()).intent.customer_id, 'cus_fixture');
    assert.equal(await scalar('select stripe_customer_id result from organizations where id=$1',[org]), 'cus_fixture');
    await rejected(() => bind(operation,'cus_foreign'), '22023');
  });
  await check('suppressed binding update leaves no confirmed customer in the intent', async () => {
    const operation = (await begin()).intent.operation_id;
    await db.exec(`create function suppress_fixture() returns trigger language plpgsql as $$ begin return null; end $$;
      create trigger aa_suppress before update on organizations for each row execute function suppress_fixture();`);
    await rejected(() => bind(operation), '40001');
    assert.equal((await begin()).intent.customer_id, null);
  });
  await check('old operation and foreign customer cannot record a session', async () => {
    const operation = (await begin()).intent.operation_id; await bind(operation);
    await rejected(() => session(stranger), '40001');
    await rejected(() => session(operation,{ customer:'cus_foreign' }), '22023');
    await rejected(() => session(operation,{ url:'https://attacker.invalid/pay' }), '22023');
    assert.equal((await begin()).intent.session_id,null);
  });
  await check('session persistence is repeatable only for the exact same provider session', async () => {
    const operation = (await begin()).intent.operation_id; await bind(operation);
    const expires = new Date(Date.now()+3600000).toISOString();
    await session(operation,{ expires }); await session(operation,{ expires });
    await bind(operation); // slower same-key customer response after session confirmation
    await rejected(() => session(operation,{ expires, session:'cs_other' }), '22023');
    await rejected(() => expire(operation,expires), '40001');
    assert.equal((await begin()).intent.session_id,'cs_fixture');
  });
  await check('unknown provider outcome is never auto-renewed after 23 hours', async () => {
    const operation = (await begin()).intent.operation_id;
    await db.exec("update private.billing_checkout_intents set created_at=clock_timestamp()-interval '24 hours'");
    assert.equal((await begin()).decision,'reconcile');
    await rejected(() => bind(operation), '40001');
    assert.equal(await scalar('select operation_id result from private.billing_checkout_intents'),operation);
  });
  await check('only exact verified expiry permits a new operation while retaining customer binding', async () => {
    const operation = (await begin()).intent.operation_id; await bind(operation); await session(operation);
    const expires = new Date(Date.now()-10000).toISOString();
    await db.query('update private.billing_checkout_intents set session_expires_at=$1',[expires]);
    await expire(operation,expires);
    const next = await begin({ plan:'business',price:'price_business' });
    assert.notEqual(next.intent.operation_id,operation); assert.equal(next.intent.customer_id,'cus_fixture');
    assert.equal(next.intent.plan,'business'); assert.equal(next.intent.session_id,null);
    await rejected(() => session(operation), '40001');
  });
  await check('provider billing mode cannot silently change an unresolved operation', async () => {
    await begin(); assert.equal((await begin({live:true})).decision,'reconcile');
  });
  await check('workspace erasure cascades reservation and old callbacks cannot recreate it', async () => {
    const operation = (await begin()).intent.operation_id;
    await db.exec('delete from organizations');
    assert.equal(await scalar('select count(*)::int result from private.billing_checkout_intents'),0);
    await rejected(() => bind(operation),'P0002'); await rejected(() => begin(),'P0002');
  });
  for (const role of ['anon','authenticated']) await check(`${role} cannot execute checkout RPCs or access private intents`, async () => {
    await db.exec(`set role ${role}`);
    await rejected(() => begin(),'42501'); await rejected(() => bind(stranger),'42501');
    await rejected(() => session(stranger),'42501'); await rejected(() => expire(stranger,new Date().toISOString()),'42501');
    await rejected(() => scalar('select count(*) result from private.billing_checkout_intents'),'42501');
  });
  await check('service role receives only RPC execution, not private table access', async () => {
    await db.exec('set role service_role'); await begin();
    await rejected(() => scalar('select count(*) result from private.billing_checkout_intents'),'42501');
  });
  console.log(`${passed} checkout SQL checks passed; ${failed} failed.`);
  if (failed) process.exitCode=1;
} finally { await db.close(); }
