import assert from 'node:assert/strict';
import { createFixture, ids, readMigration } from './fixture.mjs';

const {db,admin,asUser} = await createFixture();
if (!process.argv.includes('--before')) {
  await db.exec(await readMigration('20261009001532_protect_feature_flag_override_projection.sql'));
  await db.exec(await readMigration('20261009001555_restrict_sequence_allocation_to_writers.sql'));
}
let passed=0, failed=0;
async function check(name, fn) {
  await admin(); await db.exec('begin');
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  finally { await db.exec('rollback'); }
}
const denied = async operation => {
  await db.exec('savepoint expected_denial');
  try { await assert.rejects(operation,{code:'42501'}); }
  finally { await db.exec('rollback to expected_denial; release expected_denial'); }
};
const effective = async () => (await db.query('select * from list_effective_feature_flags()')).rows;
const reserve = (project=ids.project,type='RFI') => db.query('select get_next_sequence_number($1,$2) as n',[project,type]);
const create = (payload={title:'Beam framing changed'},project=ids.project) => db.query('select * from create_change_request($1,$2)',[project,JSON.stringify(payload)]);
const counter = async (type='change_request') => {
  await admin();
  return (await db.query('select next_value from number_sequences where project_id=$1 and record_type=$2',[ids.project,type])).rows[0]?.next_value ?? null;
};

for (const [name,user] of [['viewer',ids.viewer],['field',ids.field],['tenant owner',ids.owner]]) {
  await check(`${name} cannot enumerate raw override maps`, async () => {
    await asUser(user);
    assert.deepEqual((await db.query('select * from feature_flags')).rows,[]);
  });
  await check(`${name} cannot query arbitrary-email helper`,async () => {
    await asUser(user); await denied(() => db.query("select feature_flag_enabled_for('viewer_on','viewer@example.test')"));
  });
}
await check('projection exposes only key and effective boolean, never maps or description',async () => {
  await asUser(); const rows=await effective();
  assert.equal(rows.length,8);
  for (const row of rows) { assert.deepEqual(Object.keys(row).sort(),['enabled','flag_key']); assert.equal(typeof row.enabled,'boolean'); }
  assert.ok(!JSON.stringify(rows).includes('@'));
});
await check('current account override wins despite forged JWT email and metadata',async () => {
  await asUser(ids.viewer,'authenticated',{email:'field@example.test',user_metadata:{email:'admin@example.test'}});
  const flags=Object.fromEntries((await effective()).map(r=>[r.flag_key,r.enabled]));
  assert.deepEqual(flags,{canonical_wins:false,global_off:false,global_on:true,invalid_map:true,invalid_value:true,mixed_case:true,viewer_off:false,viewer_on:true});
});
await check('another account gets only its own defaults',async () => {
  await asUser(ids.field); const flags=Object.fromEntries((await effective()).map(r=>[r.flag_key,r.enabled]));
  assert.equal(flags.viewer_on,false); assert.equal(flags.viewer_off,true);
});
await check('account email changes are reflected without trusting stale claims',async () => {
  await db.query('update auth.users set email=$1 where id=$2',['new@example.test',ids.viewer]);
  await asUser(ids.viewer,'authenticated',{email:'viewer@example.test'});
  assert.equal((await effective()).find(r=>r.flag_key==='viewer_on').enabled,false);
});
await check('deleted account cannot read effective flags',async () => {
  await db.query('delete from auth.users where id=$1',[ids.viewer]); await asUser(); await denied(() => effective());
});
await check('anonymous role cannot read projection',async () => { await asUser(null,'anon'); await denied(() => effective()); });
await check('authenticated without identity cannot read projection',async () => { await asUser(null); await denied(() => effective()); });
await check('extra permissive SELECT policy cannot reopen maps',async () => {
  await db.exec('create policy hypothetical_extra_select on feature_flags for select to authenticated using(true)');
  await asUser(); assert.deepEqual((await db.query('select user_overrides from feature_flags')).rows,[]);
});
await check('platform administrator retains raw maps and existing guarded writes',async () => {
  await asUser(ids.platformAdmin);
  assert.equal((await db.query('select * from feature_flags')).rows.length,8);
  const rows=(await db.query("select * from set_feature_flag('test_flag',false,'internal description')")).rows;
  assert.equal(rows[0].flag_key,'test_flag');
  const changed=(await db.query("select * from set_feature_flag_override('test_flag','viewer@example.test',true)")).rows;
  assert.equal(changed[0].user_overrides['viewer@example.test'],true);
});
await check('tenant owner cannot use platform-admin write RPC',async () => { await asUser(ids.owner); await denied(() => db.query("select set_feature_flag('test_flag',true,null)")); });
await check('platform administrator removes all case variants of a legacy override',async () => {
  await asUser(ids.platformAdmin);
  const rows=(await db.query("select * from set_feature_flag_override('canonical_wins','VIEWER@example.test',null)")).rows;
  assert.deepEqual(rows[0].user_overrides,{});
  await asUser();
  assert.equal((await effective()).find(r=>r.flag_key==='canonical_wins').enabled,true);
});
await check('platform override update normalizes only the selected email and preserves peers',async () => {
  await db.query("update feature_flags set user_overrides=$1 where flag_key='canonical_wins'",[JSON.stringify({'Viewer@Example.test':true,'viewer@example.test':false,'peer@example.test':true})]);
  await asUser(ids.platformAdmin);
  const rows=(await db.query("select * from set_feature_flag_override('canonical_wins',' VIEWER@example.test ',true)")).rows;
  assert.deepEqual(rows[0].user_overrides,{'viewer@example.test':true,'peer@example.test':true});
});
await check('service retains authorized raw feature administration',async () => { await asUser(null,'service_role'); assert.equal((await db.query('select * from feature_flags')).rows.length,8); });

await check('viewer cannot reserve arbitrary numbers',async () => { await asUser(); await denied(() => reserve()); });
await check('viewer cannot reserve CR numbers independently',async () => { await asUser(); await denied(() => reserve(ids.project,'change_request')); });
await check('viewer denial does not advance existing counter',async () => {
  await asUser(ids.field); assert.equal((await reserve()).rows[0].n,1);
  await asUser(); await denied(() => reserve()); assert.equal(await counter('RFI'),2);
});
await check('field writer preserves atomic sequential reservation',async () => {
  await asUser(ids.field); assert.equal((await reserve()).rows[0].n,1); assert.equal((await reserve()).rows[0].n,2);
});
await check('tenant owner retains writer reservation',async () => { await asUser(ids.owner); assert.equal((await reserve()).rows[0].n,1); });
await check('foreign project reservation is denied',async () => { await asUser(ids.field); await denied(() => reserve(ids.foreign)); });
await check('archived project reservation is denied despite owner role',async () => { await asUser(ids.owner); await denied(() => reserve(ids.archived)); });
await check('revoked member with stale explicit field role cannot reserve',async () => {
  await db.query('delete from organization_members where user_id=$1',[ids.field]); await asUser(ids.field); await denied(() => reserve());
});
await check('anonymous reservation is denied',async () => { await asUser(null,'anon'); await denied(() => reserve()); });
await check('viewer creates numbered CR through existing invoker RPC',async () => {
  await asUser(); const row=(await create({title:' Beam framing changed ',description:'Drawing S2',estimated_cost_impact:120,priority:'High',requested_by:'Steel crew'})).rows[0];
  assert.equal(row.cr_number,'CR-001'); assert.equal(row.title,'Beam framing changed'); assert.equal(row.created_by,ids.viewer);
  assert.equal(row.description,'Drawing S2'); assert.equal(row.status,'Submitted'); assert.equal(row.requested_by,'Steel crew');
  assert.equal((await create()).rows[0].cr_number,'CR-002'); assert.equal(await counter(),3);
});
await check('CR counter preserves every digit after 999',async () => {
  await db.query("insert into number_sequences(project_id,record_type,next_value) values($1,'change_request',999)",[ids.project]);
  await asUser();
  assert.equal((await create()).rows[0].cr_number,'CR-999');
  assert.equal((await create()).rows[0].cr_number,'CR-1000');
  assert.equal((await create()).rows[0].cr_number,'CR-1001');
  assert.equal(await counter(),1002);
});
await check('failed CR constraint rolls back number and entire record',async () => {
  await asUser(); await db.exec('savepoint bad_cr');
  await assert.rejects(create({title:'Beam',priority:'INVALID'}),{code:'23514'});
  await db.exec('rollback to bad_cr');
  assert.equal(await counter(),null);
  await asUser(); assert.equal((await create()).rows[0].cr_number,'CR-001');
});
await check('invalid title consumes no CR number',async () => {
  await asUser(); await db.exec('savepoint bad_title'); await assert.rejects(create({title:' '}),{code:'23514'}); await db.exec('rollback to bad_title');
  assert.equal(await counter(),null);
});
await check('viewer direct CR insert still requires official RPC',async () => {
  await asUser(); await denied(() => db.query('insert into change_requests(project_id,title) values($1,$2)',[ids.project,'Direct']));
});
await check('viewer cannot invoke private trigger allocator directly',async () => {
  await asUser(); await denied(() => db.query('select private.allocate_change_request_number()'));
});
await check('viewer cannot create CR in foreign project',async () => { await asUser(); await denied(() => create(undefined,ids.foreign)); });
await check('archived project CR is denied',async () => { await asUser(ids.owner); await denied(() => create(undefined,ids.archived)); });
await check('viewer cannot alter created CR or its number',async () => {
  await asUser(); const row=(await create()).rows[0];
  assert.deepEqual((await db.query("update change_requests set cr_number='CR-999' where id=$1 returning id",[row.id])).rows,[]);
});
await check('CR RPC stays invoker; other allocator remains definer; paths pinned',async () => {
  await admin(); const rows=(await db.query("select proname,prosecdef,proconfig from pg_proc where oid in ('public.create_change_request(uuid,jsonb)'::regprocedure,'public.get_next_sequence_number(uuid,text)'::regprocedure,'public.list_effective_feature_flags()'::regprocedure)")).rows;
  assert.equal(rows.find(r=>r.proname==='create_change_request').prosecdef,false);
  for (const row of rows) assert.ok(row.proconfig.includes('search_path=""'));
});
console.log(`${passed} passed; ${failed} failed (${process.argv.includes('--before')?'before candidates':'candidate SQL'})`);
await db.close();
if (failed) process.exitCode=1;
