import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createCommercialFixture, ids } from '../commercial-create/fixture.mjs';
import { installLifecycleFixture, lifecycleFunctions as functions } from './fixture.mjs';

const { db, asUser, admin } = await createCommercialFixture(PGlite);
await installLifecycleFixture(db);

let counter = 0;
let passed = 0;
const checks = [];
async function check(name, test) {
  try { await test(); passed++; checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false }); console.error(`FAIL ${name}: ${error.message}`); throw error; }
}
const seed = async (overrides = {}) => {
  await admin();
  const number = ++counter;
  const patch = { project_id: ids.project, co_number: `CO-${number}`, title: 'Reviewed steel scope', status: 'Submitted', co_amount: 1200, margin_percent: 10, schedule_impact_days: 0, updated_at: '2026-10-07T10:00:00Z', ...overrides };
  await db.exec("begin; select set_config('steelbuild.co_rpc','on',true);");
  try {
    const result = await db.query(`insert into change_orders(project_id,co_number,title,status,co_amount,margin_percent,schedule_impact_days,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8) returning *`, Object.values(patch));
    await db.exec('commit');
    return result.rows[0];
  } catch (error) { await db.exec('rollback'); throw error; }
};
async function save(row, patch, expected = {}) {
  const review = { status: row.status, amount: row.co_amount, updated_at: row.updated_at, ...expected };
  const result = await db.query('select public.save_change_order_reviewed($1,$2,$3,$4,$5::jsonb) as record', [row.id, review.updated_at, review.status, review.amount, JSON.stringify(patch)]);
  return result.rows[0].record;
}
async function get(id) { await admin(); return (await db.query('select * from change_orders where id=$1', [id])).rows[0]; }
async function sov(value = 1000, projectId = ids.project) {
  await admin();
  await db.exec("begin; select set_config('steelbuild.cost_rpc','on',true);");
  try {
    const result = await db.query('insert into sov_items(project_id,line_item_number,description,scheduled_value) values($1,$2,$3,$4) returning *', [projectId, ++counter, 'Steel SOV', value]);
    await db.exec('commit'); return result.rows[0];
  } catch (error) { await db.exec('rollback'); throw error; }
}
const approval = { status: 'Approved', approved_by: '  GC representative  ', approved_date: '2026-10-07', sov_mode: 'none' };

try {
  await check('ordinary metadata save advances row timestamp without a status side effect', async () => {
    const row = await seed(); await asUser();
    const saved = await save(row, { title: 'Changed steel scope', submitted_date: '2026-10-05' });
    assert.equal(saved.title, 'Changed steel scope'); assert.equal(saved.status, 'Submitted'); assert.equal(saved.submitted_date, '2026-10-05'); assert.notEqual(saved.updated_at, row.updated_at);
  });
  await check('edits and approval are committed together with an explicit no-SOV decision', async () => {
    const row = await seed(); await asUser();
    const saved = await save(row, { ...approval, title: 'Approved brace scope', co_amount: 1400 });
    assert.equal(saved.status, 'Approved'); assert.equal(Number(saved.co_amount), 1400); assert.equal(saved.approved_by, 'GC representative'); assert.equal(saved.sov_mode, 'none');
    await admin(); assert.equal(Number((await db.query('select approved_change_total from projects where id=$1', [ids.project])).rows[0].approved_change_total), 1400);
  });
  for (const [field, value] of [['amount', 1199], ['status', 'Draft'], ['updated_at', '2026-10-07T09:00:00Z'], ['updated_at', null]]) {
    await check(`${value === null ? 'missing' : 'stale'} reviewed ${field} rejects every write`, async () => {
      const row = await seed(); await asUser();
      await assert.rejects(() => save(row, { ...approval, title: 'Must not persist' }, { [field]: value }), /changed|review|conflict/i);
      const unchanged = await get(row.id); assert.equal(unchanged.title, row.title); assert.equal(unchanged.status, row.status);
    });
  }
  await check('a second editor cannot overwrite the first committed metadata save', async () => {
    const row = await seed(); await asUser(); await save(row, { title: 'First editor' });
    await asUser(ids.colleague); await assert.rejects(() => save(row, { title: 'Stale second editor' }), /changed|review|conflict/i);
    assert.equal((await get(row.id)).title, 'First editor');
  });
  await check('failed deduct approval rolls back both edits and the SOV value', async () => {
    const row = await seed(); const line = await sov(100); await asUser();
    await assert.rejects(() => save(row, { ...approval, sov_mode: 'adjust_line', sov_line_item_id: line.id, title: 'Must roll back', co_amount: -500 }), /below zero/i);
    const unchanged = await get(row.id); assert.equal(unchanged.title, row.title); assert.equal(Number(unchanged.co_amount), 1200); assert.equal(unchanged.status, 'Submitted');
    assert.equal(Number((await db.query('select scheduled_value from sov_items where id=$1', [line.id])).rows[0].scheduled_value), 100);
  });
  await check('approved amount and SOV relationship remain frozen', async () => {
    const row = await seed(); await asUser(); const approved = await save(row, approval);
    await assert.rejects(() => save(approved, { co_amount: 5000 }), /frozen|approved/i);
    assert.equal(Number((await get(row.id)).co_amount), 1200);
  });
  await check('project PM can approve but cannot void through this reviewed command', async () => {
    const row = await seed(); await asUser();
    await assert.rejects(() => save(row, { status: 'Void', void_reason: 'Duplicate' }), /authoriz|permission/i);
    assert.equal((await get(row.id)).status, 'Submitted');
  });
  await check('enrolled AAL1 caller cannot write', async () => {
    const row = await seed(); await asUser(ids.pm, 'aal1');
    await assert.rejects(() => save(row, { title: 'Denied' }), /MFA/i); assert.equal((await get(row.id)).title, row.title);
  });
  for (const role of ['field', 'viewer', 'outsider']) await check(`${role} cannot change this commercial record`, async () => {
    const row = await seed(); await asUser(ids[role]);
    await assert.rejects(() => save(row, { title: 'Denied' }), /authoriz|permission|not found/i); assert.equal((await get(row.id)).title, row.title);
  });
  await check('foreign-project links are rejected without metadata writes', async () => {
    const row = await seed(); const line = await sov(1000, ids.otherProject); await asUser();
    await assert.rejects(() => save(row, { ...approval, sov_mode: 'adjust_line', sov_line_item_id: line.id, title: 'Denied' }), /project|SOV/i);
    assert.equal((await get(row.id)).title, row.title);
  });
  for (const [name, patch] of [
    ['missing SOV choice', { ...approval, sov_mode: null }],
    ['missing approver', { ...approval, approved_by: '' }],
    ['impossible approval date', { ...approval, approved_date: '2026-02-30' }],
    ['missing rejection reason', { status: 'Rejected', decision_notes: ' ' }],
    ['unknown field', { metadata: { unchecked: true } }],
    ['immutable number', { co_number: 'FORGED' }],
    ['nonfinite amount', { co_amount: 'Infinity' }],
    ['negative duration', { schedule_impact_days: -1 }],
    ['fractional duration', { schedule_impact_days: 1.5 }],
  ]) await check(`${name} is rejected before saving`, async () => {
    const row = await seed(); await asUser(); await assert.rejects(() => save(row, { title: 'Denied', ...patch })); assert.equal((await get(row.id)).title, row.title);
  });
  await check('RPC execution is granted only to authenticated users', async () => {
    await admin();
    const acl = (await db.query("select has_function_privilege('authenticated','public.save_change_order_reviewed(uuid,timestamptz,text,numeric,jsonb)','EXECUTE') as auth, has_function_privilege('anon','public.save_change_order_reviewed(uuid,timestamptz,text,numeric,jsonb)','EXECUTE') as anon")).rows[0];
    assert.equal(acl.auth, true); assert.equal(acl.anon, false);
  });
  await check('unenrolled AAL1 PM can save under the staged MFA policy', async () => {
    const row = await seed(); await asUser(ids.colleague, 'aal1');
    assert.equal((await save(row, { title: 'Allowed without an enrolled factor' })).title, 'Allowed without an enrolled factor');
  });
  await check('a legacy null version is accepted only when the reviewed null matches', async () => {
    const row = await seed({ updated_at: null }); await asUser();
    assert.equal((await save(row, { title: 'Legacy version reviewed' })).title, 'Legacy version reviewed');
    await assert.rejects(() => save(row, { title: 'Stale null review' }), /changed|review|conflict/i);
  });
  await check('unknown amount cannot be approved until a finite amount is explicitly supplied', async () => {
    const row = await seed({ co_amount: null }); await asUser();
    await assert.rejects(() => save(row, approval), /known finite/i);
    assert.equal(Number((await save(row, { ...approval, co_amount: 0 })).co_amount), 0);
  });
  for (const [field, table] of [['cost_code_id', 'cost_codes'], ['source_rfi_id', 'rfis']]) {
    await check(`foreign-project ${field} cannot accompany a metadata save`, async () => {
      const row = await seed();
      const target = (await db.query(`insert into ${table}(project_id) values($1) returning id`, [ids.otherProject])).rows[0];
      await asUser(); await assert.rejects(() => save(row, { title: 'Denied', [field]: target.id }), /project/i);
      assert.equal((await get(row.id)).title, row.title);
    });
  }
  await check('an orphaned project PM membership cannot cross the organization boundary', async () => {
    const row = await seed();
    await db.query("insert into user_projects(project_id,user_id,role) values($1,$2,'pm')", [ids.project, ids.outsider]);
    await asUser(ids.outsider); await assert.rejects(() => save(row, { title: 'Denied' }), /authoriz|not found/i);
    assert.equal((await get(row.id)).title, row.title);
    await db.query('delete from user_projects where project_id=$1 and user_id=$2', [ids.project, ids.outsider]);
  });
  await check('same-project links are validated once and retain historical notes after archival', async () => {
    const row = await seed();
    const code = (await db.query('insert into cost_codes(project_id) values($1) returning id', [ids.project])).rows[0];
    const rfi = (await db.query('insert into rfis(project_id) values($1) returning id', [ids.project])).rows[0];
    await asUser(); const linked = await save(row, { cost_code_id: code.id, source_rfi_id: rfi.id });
    await admin(); await db.query('update cost_codes set is_deleted=true where id=$1', [code.id]);
    await db.query('update rfis set is_deleted=true where id=$1', [rfi.id]);
    await asUser(); const saved = await save(linked, { notes: 'Historic references kept', cost_code_id: code.id, source_rfi_id: rfi.id });
    assert.equal(saved.notes, 'Historic references kept'); assert.equal(saved.cost_code_id, code.id); assert.equal(saved.source_rfi_id, rfi.id);
  });
  await check('approved SOV relationship cannot be replaced by ordinary metadata edits', async () => {
    const row = await seed(); const line = await sov(); await asUser(); const approved = await save(row, approval);
    await assert.rejects(() => save(approved, { sov_line_item_id: line.id }), /frozen|approved/i);
    assert.equal((await get(row.id)).sov_line_item_id, null);
  });
  await check('approval adjustment and admin void reverse the exact SOV amount', async () => {
    const row = await seed({ co_amount: -500 }); const line = await sov(1000); await asUser();
    const approved = await save(row, { ...approval, sov_mode: 'adjust_line', sov_line_item_id: line.id });
    await admin(); assert.equal(Number((await db.query('select scheduled_value from sov_items where id=$1', [line.id])).rows[0].scheduled_value), 500);
    await db.query("update user_projects set role='admin' where project_id=$1 and user_id=$2", [ids.project, ids.colleague]);
    await asUser(ids.colleague); const voided = await save(approved, { status: 'Void', void_reason: 'Scope removed by owner' });
    assert.equal(voided.status, 'Void'); assert.equal(voided.void_reason, 'Scope removed by owner');
    await admin(); assert.equal(Number((await db.query('select scheduled_value from sov_items where id=$1', [line.id])).rows[0].scheduled_value), 1000);
    await db.query("update user_projects set role='pm' where project_id=$1 and user_id=$2", [ids.project, ids.colleague]);
  });
  await check('voided new-line history remains editable after its generated SOV line is archived', async () => {
    const row = await seed(); await asUser(); const approved = await save(row, { ...approval, sov_mode: 'new_line' });
    assert.ok(approved.sov_line_item_id); await admin();
    await db.query("update user_projects set role='admin' where project_id=$1 and user_id=$2", [ids.project, ids.colleague]);
    await asUser(ids.colleague); const voided = await save(approved, { status: 'Void', void_reason: 'Superseded scope' });
    const saved = await save(voided, { notes: 'Historical scope note', sov_line_item_id: voided.sov_line_item_id });
    assert.equal(saved.notes, 'Historical scope note'); assert.equal(saved.sov_line_item_id, approved.sov_line_item_id);
    await admin(); assert.equal((await db.query('select is_deleted from sov_items where id=$1', [approved.sov_line_item_id])).rows[0].is_deleted, true);
    await db.query("update user_projects set role='pm' where project_id=$1 and user_id=$2", [ids.project, ids.colleague]);
  });
  await check('post-transition refresh corrects a stale first aggregate and restores guard flags', async () => {
    const row = await seed(); await admin();
    const refresh = functions.find(fn => fn.proname === 'refresh_project_change_total').definition;
    await db.exec(refresh.replace('public.refresh_project_change_total(', 'public.lifecycle_fixture_refresh_original('));
    await db.exec(`create table public.lifecycle_fixture_refresh_count(calls integer); insert into public.lifecycle_fixture_refresh_count values(0);
      grant select,update on public.lifecycle_fixture_refresh_count to authenticated;
      create or replace function public.refresh_project_change_total(p_project_id uuid) returns numeric language plpgsql as $$
      declare result numeric; n integer;
      begin
        result:=public.lifecycle_fixture_refresh_original(p_project_id);
        update public.lifecycle_fixture_refresh_count set calls=calls+1 returning calls into n;
        if n=1 then update public.projects set approved_change_total=0 where id=p_project_id; return 0; end if;
        return result;
      end$$;`);
    await asUser(); await db.exec("begin; select set_config('steelbuild.co_rpc','off',true); select set_config('steelbuild.cost_rpc','off',true);");
    try {
      await save(row, approval);
      const flags = (await db.query("select current_setting('steelbuild.co_rpc',true) as co,current_setting('steelbuild.cost_rpc',true) as cost")).rows[0];
      assert.deepEqual(flags, { co: 'off', cost: 'off' });
      const aggregate = (await db.query('select approved_change_total as stored,(select sum(co_amount) from change_orders where project_id=$1 and status=\'Approved\' and is_deleted=false) as expected from projects where id=$1', [ids.project])).rows[0];
      assert.equal(aggregate.stored, aggregate.expected);
      assert.equal((await db.query('select calls from lifecycle_fixture_refresh_count')).rows[0].calls, 2);
      await db.exec('commit');
    } catch (error) { await db.exec('rollback'); throw error; }
    await admin(); await db.exec(refresh);
  });
  console.log(JSON.stringify({ passed, checks }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed, failure: error.message, code: error.code, checks }, null, 2));
  process.exitCode = 1;
} finally { await db.close(); }
