import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { SetupPlan, FoundationReceipt } from '../../../e2e/drawing-cutover-setup.ts';
import type { Database } from './fixture.ts';

// Dependency-free synthetic bindings. Root Vitest compares both with the actual
// shared constants and validates these exact fixtures against the real contracts.
export const ENTITLEMENT_STAGE_REF = 'ndyfjffsulfbwpmwdmic';
export const ENTITLEMENT_ACTORS = ['pm', 'viewer', 'field', 'admin', 'foreign', 'removed', 'mfa'] as const;
const fragmentUrl = new URL('./staging-setup-entitlements.sql', import.meta.url);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const childTables = ['public.billing_events', 'public.note_folder_audit_events', 'public.note_folder_migrations',
  'public.note_folder_mutation_receipts', 'public.note_folders', 'public.organization_invitations', 'public.projects', 'public.vendors',
  'private.billing_checkout_intents', 'private.stripe_billing_sync_state', 'steelbuild_drawing_revision.adopted_sources',
  'public.account_deletions', 'public.client_events', 'public.data_erasure_log'] as const;

/** Synthetic credential-free inputs; shared-validator conformance runs in root Vitest. */
export function entitlementInputs(now = Date.now()): { plan: SetupPlan; receipt: FoundationReceipt } {
  const plan: SetupPlan = {
    context: { version: 1, projectRef: ENTITLEMENT_STAGE_REF, candidateSha: '1'.repeat(40), runId: id(1), workflowRunId: '123',
      workflowRunAttempt: '1', phase: 'setup-bootstrap', checkpointSequence: 0, recipientSha256: '2'.repeat(64) },
    createdAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 600_000).toISOString(),
    roster: ENTITLEMENT_ACTORS.map(alias => ({ alias, email: `${alias}@example.invalid` })),
    organizations: [{ alias: 'A', name: 'Synthetic A', slug: 'synthetic-a' }, { alias: 'B', name: 'Synthetic B', slug: 'synthetic-b' }],
    projects: (['A1', 'A2', 'B1', 'B2'] as const).map(alias => ({ alias, organization: alias[0] as 'A' | 'B', name: `Synthetic ${alias}`, number: `TEST-${alias}` })),
    keyReview: { publicKeySha256: '3'.repeat(64), setupKeySha256: '4'.repeat(64), setupKeyIdentifier: 'synthetic-key', ownerAttestationSha256: '5'.repeat(64) },
    prerequisites: { scenarioSourceSha256: '6'.repeat(64), sourceJobsSha256: '6'.repeat(64), immutableBuildSha256: '6'.repeat(64),
      packageSha256: '6'.repeat(64), ownershipSha256: '6'.repeat(64), sideEffectsSha256: '', healthSha256: '6'.repeat(64),
      noEmailSha256: '6'.repeat(64), settingsAuthoritySha256: '6'.repeat(64) },
    prerequisiteDetails: { sideEffects: { version: 1, projectRef: ENTITLEMENT_STAGE_REF, candidateSha: '1'.repeat(40),
      reviewedAt: new Date(now - 120_000).toISOString(), expiresAt: new Date(now + 660_000).toISOString(), installedClosureSha256: '7'.repeat(64),
      activeCostCodeTemplates: [
        { id: id(90), cost_code_number: '01', description: 'Synthetic decimal', category: 'Labor',
          default_budget_amount: '9007199254740993.01', sort_order: -2147483648, is_active: true },
        { id: id(91), cost_code_number: '02', description: '', category: 'Material',
          default_budget_amount: null, sort_order: 2147483647, is_active: true },
      ], seedSemantics: 'stage-foundation-v1' } },
  };
  plan.prerequisites.sideEffectsSha256 = hash(JSON.stringify(plan.prerequisiteDetails!.sideEffects));
  const receipt: FoundationReceipt = { context: { ...plan.context, checkpointSequence: 32 }, planSha256: hash(JSON.stringify(plan)),
    status: 'AWAITING_ENTITLEMENT_REVIEW', actors: ENTITLEMENT_ACTORS.map((alias, n) => ({ alias, id: id(10 + n), emailSha256: hash(`${alias}@example.invalid`), authenticated: true })),
    organizations: [], projects: [], memberships: [], operations: [], census: { observedAt: new Date(now - 1000).toISOString(),
      sideEffectsSha256: plan.prerequisites.sideEffectsSha256, observationSha256: '8'.repeat(64), children: [] } };
  for (const [n, alias] of (['A', 'B'] as const).entries()) {
    const owner = receipt.actors.find(a => a.alias === (alias === 'A' ? 'admin' : 'foreign'))!;
    receipt.organizations.push({ alias, id: id(30 + n), createdBy: owner.id, ownerId: owner.id });
    receipt.memberships.push({ id: id(40 + n), actor: owner.alias, userId: owner.id, orgId: id(30 + n), role: 'owner' });
  }
  for (const actor of receipt.actors) for (const action of ['create-user', 'authenticate-user'] as const) {
    const sequence = receipt.operations.length + 1, operationId = id(100 + sequence);
    receipt.operations.push({ sequence, operationId, kind: 'intent', action, actor: actor.alias },
      { sequence: sequence + 1, operationId, kind: 'result', outcome: 'SUCCEEDED', observedId: actor.id });
  }
  for (const org of receipt.organizations) {
    const sequence = receipt.operations.length + 1, operationId = id(100 + sequence);
    receipt.operations.push({ sequence, operationId, kind: 'intent', action: 'create-organization', organization: org.alias, actor: org.alias === 'A' ? 'admin' : 'foreign' },
      { sequence: sequence + 1, operationId, kind: 'result', outcome: 'SUCCEEDED', observedId: org.id });
  }
  return { plan, receipt };
}

/** The same malformed bytes feed root shared-validator checks and independent SQL refusals. */
export function malformedTemplateInputs(inputs = entitlementInputs()) {
  const templateCorruptions: [string, (templates: unknown[]) => void][] = [];
  for (const field of ['cost_code_number', 'category', 'id', 'description'])
    for (const value of [123, null, true]) templateCorruptions.push([
      `${field} ${JSON.stringify(value)}`, templates => { Object.assign(templates[0] as object, { [field]: value }); },
    ]);
  for (const [field, values] of [
    ['is_active', [null, 123, 'true', false]],
    ['sort_order', [null, '1', true, 1.5, -2147483649, 2147483648]],
    ['default_budget_amount', [123, true, '', '01', '1e3', `-${'9'.repeat(30)}.${'9'.repeat(30)}`, '9'.repeat(31), `0.${'9'.repeat(31)}`]],
    ['id', ['invalid', id(90).replaceAll('-', '')]],
    ['cost_code_number', ['', 'x'.repeat(101)]],
    ['category', ['', 'x'.repeat(101)]],
    ['description', ['x'.repeat(501)]],
  ] as const) for (const value of values) templateCorruptions.push([
    `${field} invalid ${JSON.stringify(value)}`, templates => { Object.assign(templates[0] as object, { [field]: value }); },
  ]);
  for (const value of [null, 123, true, 'template', []]) templateCorruptions.push([
    `non-object ${JSON.stringify(value)}`, templates => { templates[0] = value; },
  ]);
  templateCorruptions.push(
    ['missing category', templates => { delete (templates[0] as Record<string, unknown>).category; }],
    ['unknown field', templates => { Object.assign(templates[0] as object, { extra: true }); }],
    ['duplicate ID', templates => { Object.assign(templates[1] as object, { id: id(90) }); }],
    ['duplicate number', templates => { Object.assign(templates[1] as object, { cost_code_number: '01' }); }],
  );
  return templateCorruptions.map(([name, change]) => {
    const { plan, receipt } = structuredClone(inputs), effects = plan.prerequisiteDetails!.sideEffects;
    change(effects.activeCostCodeTemplates);
    plan.prerequisites.sideEffectsSha256 = hash(JSON.stringify(effects));
    receipt.census!.sideEffectsSha256 = plan.prerequisites.sideEffectsSha256;
    receipt.planSha256 = hash(JSON.stringify(plan));
    return { name, plan, receipt };
  });
}

async function snapshot(db: Database) {
  const result: Record<string, unknown> = {};
  for (const table of ['public.organizations', 'public.organization_members', ...childTables, 'public.action_items', 'public.pma_audit_logs'])
    result[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') rows from ${table} t`)).rows[0].rows;
  return result;
}
async function roleSnapshot(db: Database) {
  return { roles: (await db.query('select * from pg_roles order by oid')).rows,
    memberships: (await db.query('select * from pg_auth_members order by roleid,member,grantor')).rows };
}

export async function runSetupEntitlementCases(db: Database): Promise<number> {
  const fragment = await readFile(fragmentUrl, 'utf8');
  const initialRoles = await roleSnapshot(db);
  assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_%' and c.relkind in ('r','p')")).rows[0].n, 0, 'Entitlement cases require an empty disposable database');
  let count = 0;
  await db.exec('begin isolation level read committed');
  try {
    await db.exec(`create schema private; create schema steelbuild_drawing_revision;
      do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin nosuperuser nobypassrls; end if; end $$;
      create table public.organizations(id uuid primary key,name text not null,slug text,plan text not null default 'free',created_by uuid,
        created_at timestamptz not null,updated_at timestamptz not null,metadata jsonb not null default '{}',stripe_customer_id text,
        stripe_subscription_id text,subscription_status text,current_period_end timestamptz,member_default_project_role text default 'viewer');
      create table public.organization_members(id uuid primary key,org_id uuid not null references public.organizations(id),user_id uuid not null,role text not null,created_at timestamptz not null default now());
      create function public.org_protect_billing_columns() returns trigger language plpgsql as $$ begin
        if current_setting('request.jwt.claim.role',true)='authenticated' and new.plan is distinct from old.plan then raise exception 'billing denied'; end if; return new; end $$;
      create function public.organizations_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      create trigger trg_org_protect_billing before update on public.organizations for each row execute function public.org_protect_billing_columns();
      create trigger trg_organizations_updated_at before update on public.organizations for each row execute function public.organizations_touch_updated_at();`);
    for (const table of childTables) await db.exec(`create table ${table}(id uuid primary key,org_id uuid ${['public.account_deletions', 'public.client_events', 'public.data_erasure_log'].includes(table) ? '' : 'references public.organizations(id)'},payload text)`);
    await db.exec('create table public.action_items(id uuid primary key,project_id uuid references public.projects(id)); create table public.pma_audit_logs(id uuid primary key,project_id uuid references public.projects(id))');
    // Disposable transaction-only SELECT grants let the refusal case compare
    // snapshots as the ordinary role; no role attributes or memberships change.
    await db.exec('grant usage on schema public,private,steelbuild_drawing_revision to authenticated; grant select on all tables in schema public,private,steelbuild_drawing_revision to authenticated');
    const inputs = entitlementInputs();
    for (const [n, org] of inputs.receipt.organizations.entries()) {
      const description = inputs.plan.organizations[n];
      await db.query("insert into public.organizations(id,name,slug,created_by,created_at,updated_at) values($1,$2,$3,$4,$5,$5)",
        [org.id, description.name, description.slug, org.createdBy, inputs.plan.createdAt]);
      const member = inputs.receipt.memberships[n];
      await db.query('insert into public.organization_members(id,org_id,user_id,role) values($1,$2,$3,$4)', [member.id, member.orgId, member.userId, member.role]);
    }
    await db.query("insert into public.organizations(id,name,slug,plan,created_by,created_at,updated_at,stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end) values($1,'Sentinel','sentinel','business',$2,now(),now(),'cus_synthetic','sub_synthetic','active',now())", [id(99), id(98)]);
    for (const table of childTables) await db.query(`insert into ${table}(id,org_id,payload) values($1,$2,'sentinel')`, [id(99), id(99)]);
    const fixtureBefore = await snapshot(db);
    async function bind(value = inputs) {
      const match = fragment.match(/-- CATALOG QUERY START\r?\n([\s\S]*?)-- CATALOG QUERY END/);
      const catalog = match ? String((await db.query(match[1])).rows[0].digest) : '9'.repeat(64);
      for (const [key, val] of Object.entries({ plan: JSON.stringify(value.plan), receipt: JSON.stringify(value.receipt),
        plan_sha256: hash(JSON.stringify(value.plan)), receipt_sha256: hash(JSON.stringify(value.receipt)), candidate_sha: value.plan.context.candidateSha,
        catalog_sha256: catalog, installed_closure_sha256: value.plan.prerequisiteDetails!.sideEffects.installedClosureSha256,
        side_effects: JSON.stringify(value.plan.prerequisiteDetails!.sideEffects), observation_sha256: value.receipt.census?.observationSha256 ?? '8'.repeat(64) }))
        await db.query('select set_config($1,$2,true)', [`drawing_setup.${key}`, val]);
    }
    async function rejection(name: string, change: () => Promise<void>, pattern: RegExp = /DRAWING_SETUP_/) {
      await db.exec('savepoint scenario');
      try {
        await bind(); await change(); const before = await snapshot(db);
        await db.exec('savepoint attempt');
        await assert.rejects(() => db.exec(fragment), (error: Error & { position?: string }) => { assert.match(error.message, pattern, `${name}: ${error.message} (SQL position ${error.position ?? 'unavailable'})`); return true; }, name);
        await db.exec('rollback to savepoint attempt');
        assert.deepEqual(await snapshot(db), before, `${name}: full fixture snapshot changed after refusal`);
        count++; console.log(`PASS entitlement ${name}; full snapshot unchanged`);
      } finally { await db.exec('rollback to savepoint scenario; release savepoint scenario'); }
    }
    // Removing creator, cardinality or billing predicates must break these refusals.
    await rejection('entitlementsRejectWrongCreatorExistingChildrenOrBilling wrong creator', async () => { await db.query('update public.organizations set created_by=$1 where id=$2', [id(98), id(30)]); });
    for (const column of ['stripe_customer_id', 'stripe_subscription_id', 'subscription_status', 'current_period_end'])
      await rejection(`non-null ${column}`, async () => { await db.exec(`update public.organizations set ${column}=${column === 'current_period_end' ? 'now()' : "'synthetic'"} where id='${id(31)}'`); });
    await rejection('non-free plan', async () => { await db.exec(`update public.organizations set plan='pro' where id='${id(30)}'`); });
    await rejection('extra member', async () => { await db.query("insert into public.organization_members(id,org_id,user_id,role) values($1,$2,$3,'member')", [id(50), id(30), id(12)]); });
    for (const table of childTables) await rejection(`existing child ${table}`, async () => { await db.query(`insert into ${table}(id,org_id) values($1,$2)`, [id(50), id(31)]); });
    await rejection('entitlementsRejectChangedSchemaOrMissingBinding extra column', async () => { await db.exec('alter table public.organizations add column unexpected text'); });
    await rejection('unknown billing column even with fresh catalog', async () => { await db.exec("alter table public.organizations add column customer_reference text default 'synthetic'"); await bind(); }, /DRAWING_SETUP_UNSUPPORTED_ORG_SCHEMA/);
    await rejection('unknown organization relationship', async () => { await db.exec('create table public.unreviewed_child(id uuid primary key,org_id uuid references public.organizations(id))'); await bind(); });
    await rejection('unconstrained project descendant', async () => { await db.exec('create table public.unreviewed_child(id uuid primary key,project_id uuid)'); await bind(); });
    await rejection('disabled timestamp trigger', async () => { await db.exec('alter table public.organizations disable trigger trg_organizations_updated_at'); await bind(); });
    await rejection('changed dependency body with stale catalog', async () => { await db.exec("create or replace function public.organizations_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$"); }, /DRAWING_SETUP_CATALOG_CHANGED/);
    await rejection('unvalidated project foreign key', async () => { await db.exec('alter table public.action_items drop constraint action_items_project_id_fkey; alter table public.action_items add constraint action_items_project_id_fkey foreign key(project_id) references public.projects(id) not valid'); await bind(); }, /DRAWING_SETUP_UNSUPPORTED_PROJECT_GRAPH/);
    await rejection('unknown nonpublic tenant column', async () => { await db.exec('create table private.unreviewed_child(org_id uuid)'); await bind(); }, /DRAWING_SETUP_UNSUPPORTED_ORG_GRAPH/);
    await rejection('missing org FK replaced by duplicate on another table', async () => { await db.exec('alter table public.vendors drop constraint vendors_org_id_fkey; alter table public.billing_events add constraint extra_org_fk foreign key(org_id) references public.organizations(id)'); await bind(); }, /DRAWING_SETUP_UNSUPPORTED_ORG_GRAPH/);
    for (const setting of ['plan_sha256', 'receipt_sha256', 'candidate_sha', 'catalog_sha256', 'installed_closure_sha256', 'observation_sha256'])
      await rejection(`missing ${setting}`, async () => { await db.query('select set_config($1,$2,true)', [`drawing_setup.${setting}`, '']); });
    await rejection('ordinary app role', async () => { await db.exec('set local role authenticated'); });
    await rejection('JWT on operator connection', async () => { await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id(10), role: 'authenticated' })]); });
    await rejection('replica mode cannot suppress reviewed triggers', async () => { await db.exec('set local session_replication_role=replica'); }, /DRAWING_SETUP_OPERATOR_REQUIRED/);
    const corruptions: [string, (value: ReturnType<typeof entitlementInputs>) => void][] = [
      ['duplicate organizations', v => { v.receipt.organizations[1].id = v.receipt.organizations[0].id; }],
      ['missing actual census', v => { delete v.receipt.census; }],
      ['nonempty child census', v => { v.receipt.census!.children.push({ table: 'action_items', id: id(50), projectId: id(60), rowSha256: 'a'.repeat(64) }); }],
      ['stopped receipt', v => { v.receipt.status = 'STOPPED'; }],
      ['unknown result', v => { const result = v.receipt.operations[1]; if (result.kind === 'result') result.outcome = 'UNKNOWN'; }],
      ['missing successful operation', v => { v.receipt.operations.splice(0, 2); }],
      ['wrong owner binding', v => { v.receipt.organizations[0].ownerId = id(98); }],
      ['stale source', v => { v.receipt.context.candidateSha = '2'.repeat(40); }],
      ['expired plan', v => { v.plan.expiresAt = new Date(Date.now() - 1000).toISOString(); }],
      ['missing side effect evidence', v => { delete v.plan.prerequisiteDetails; }],
      ['null bootstrap phase', v => { Object.assign(v.plan.context, { phase: null }); Object.assign(v.receipt.context, { phase: null }); }],
      ['null side effects expiry', v => { Object.assign(v.plan.prerequisiteDetails!.sideEffects, { expiresAt: null }); v.plan.prerequisites.sideEffectsSha256 = hash(JSON.stringify(v.plan.prerequisiteDetails!.sideEffects)); v.receipt.census!.sideEffectsSha256 = v.plan.prerequisites.sideEffectsSha256; }],
      ['numeric identity ID', v => { Object.assign(v.receipt.actors[0], { id: 1 }); }],
      ['invalid setup identifier', v => { v.plan.keyReview.setupKeyIdentifier = ''; }],
    ];
    for (const [name, change] of corruptions) await rejection(name, async () => {
      const v = structuredClone(inputs); change(v);
      v.receipt.planSha256 = hash(JSON.stringify(v.plan));
      // Bind raw changed bytes independently; structural/semantic refusal cannot rely on stale hashes alone.
      if (v.plan.prerequisiteDetails) await bind(v);
      else await db.query("select set_config('drawing_setup.plan',$1,true),set_config('drawing_setup.plan_sha256',$2,true),set_config('drawing_setup.receipt',$3,true),set_config('drawing_setup.receipt_sha256',$4,true)", [JSON.stringify(v.plan), hash(JSON.stringify(v.plan)), JSON.stringify(v.receipt), hash(JSON.stringify(v.receipt))]);
    });
    // Root Vitest proves shared-validator rejection for these same fixtures.
    // SQL independently refuses every raw mutation with refreshed byte bindings.
    for (const { name, plan, receipt } of malformedTemplateInputs(inputs)) await rejection(`strict template ${name}`, async () => {
      await bind({ plan, receipt });
    }, /DRAWING_SETUP_(TEMPLATE_SHAPE|DUPLICATE_TEMPLATE)/);
    await db.exec('savepoint late_test');
    try {
      await db.exec(`create or replace function public.organizations_touch_updated_at() returns trigger language plpgsql as $$ begin
        new.updated_at=now(); if new.id='${id(30)}' and new.plan='pro' then update public.organizations set metadata='{"synthetic_partial":true}' where id='${id(99)}'; end if;
        if new.id='${id(31)}' and new.plan='pro' then
          if not exists(select 1 from public.organizations where id='${id(30)}' and plan='pro') then raise exception 'FIRST_ORG_NOT_UPDATED'; end if;
          if not exists(select 1 from public.organizations where id='${id(99)}' and metadata='{"synthetic_partial":true}') then raise exception 'SENTINEL_NOT_TOUCHED'; end if;
          raise exception 'DRAWING_SETUP_LATE_TEST_SECOND_ORG'; end if; return new; end $$;`);
      await rejection('entitlementsRollBackBothOnLateFailure second update', async () => {}, /DRAWING_SETUP_LATE_TEST_SECOND_ORG/);
    } finally { await db.exec('rollback to savepoint late_test; release savepoint late_test'); }
    for (const [name, body, pattern] of [
      ['skipped second RETURNING row', `if new.id='${id(31)}' then return null; end if;`, /DRAWING_SETUP_RETURNING_CARDINALITY/],
      ['unexpected billing effect', "new.stripe_customer_id='cus_unexpected_synthetic';", /DRAWING_SETUP_UNEXPECTED_EFFECT/],
      ['unexpected scoped audit effect', 'insert into public.note_folder_audit_events(id,org_id) values(gen_random_uuid(),new.id);', /DRAWING_SETUP_CHILD_EFFECT/],
    ] as const) {
      await db.exec('savepoint trigger_effect');
      try {
        await db.exec(`create or replace function public.organizations_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); ${body} return new; end $$;`);
        await rejection(name, async () => {}, pattern);
      } finally { await db.exec('rollback to savepoint trigger_effect; release savepoint trigger_effect'); }
    }
    await db.exec('savepoint expiry_test');
    try {
      await db.exec(`create or replace function public.organizations_touch_updated_at() returns trigger language plpgsql as $$ begin
        new.updated_at=now(); if new.id='${id(30)}' then perform pg_sleep(2); end if; return new; end $$;`);
      await rejection('receipt expiry during first update', async () => {
        const v = structuredClone(inputs); v.plan.expiresAt = new Date(Date.now() + 1500).toISOString();
        v.receipt.planSha256 = hash(JSON.stringify(v.plan)); await bind(v);
      }, /DRAWING_SETUP_EXPIRED_DURING_UPDATE/);
    } finally { await db.exec('rollback to savepoint expiry_test; release savepoint expiry_test'); }
    await bind(); await db.exec(fragment);
    const after = await snapshot(db), beforeOrgs = fixtureBefore['public.organizations'] as Record<string, unknown>[], afterOrgs = after['public.organizations'] as Record<string, unknown>[];
    for (const before of beforeOrgs) {
      const actual = afterOrgs.find(o => o.id === before.id)!;
      if (before.id === id(99)) assert.deepEqual(actual, before, 'Unrelated sentinel changed');
      else { assert.equal(actual.plan, 'pro'); assert.notEqual(actual.updated_at, before.updated_at); assert.deepEqual({ ...actual, plan: before.plan, updated_at: before.updated_at }, before); }
    }
    assert.deepEqual({ ...after, 'public.organizations': [] }, { ...fixtureBefore, 'public.organizations': [] }, 'No billing, audit or child writes expected');
    count++; console.log('PASS entitlement entitlementsChangeOnlyTwoReviewedPlans; valid nonempty templates with exact decimal/null and int32 boundaries; exactly two plans/timestamps, sentinel/billing/audit unchanged');
  } finally { await db.exec('rollback'); }
  assert.deepEqual(await roleSnapshot(db), initialRoles, 'Outer ROLLBACK must preserve all shared role attributes and memberships');
  assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_%' and c.relkind in ('r','p')")).rows[0].n, 0);
  console.log('PASS entitlement outer ROLLBACK restores empty database and every shared role/membership');
  return count;
}
