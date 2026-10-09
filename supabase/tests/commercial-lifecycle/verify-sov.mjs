import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createCommercialFixture,ids } from '../commercial-create/fixture.mjs';
import { installLifecycleFixture } from './fixture.mjs';

const {db,asUser,admin}=await createCommercialFixture(PGlite);
let passed=0;
const check=async(name,verify)=>{await verify();passed++;console.log(`PASS ${name}`);};
async function seed(payload={}) {
  await asUser();
  return (await db.query('select to_jsonb(r) as row from create_sov_item($1,$2::jsonb) r',[ids.project,JSON.stringify({description:'Reviewed steel SOV',scheduled_value:1000,...payload})])).rows[0].row;
}
async function save(row,patch,version=row.updated_at) {
  return (await db.query('select public.save_sov_item_reviewed($1,$2,$3::jsonb) as row',[row.id,version,JSON.stringify(patch)])).rows[0].row;
}
async function get(id) {await admin();return (await db.query('select to_jsonb(r) as row from sov_items r where id=$1',[id])).rows[0].row;}
async function approveAdjustment(line,amount=400) {
  await asUser();
  const co=(await db.query('select to_jsonb(r) as row from create_change_order($1,$2::jsonb) r',[ids.project,JSON.stringify({title:'Field connection change',status:'Submitted',co_amount:amount})])).rows[0].row;
  await db.query('select save_change_order_reviewed($1,$2,$3,$4,$5::jsonb)',[co.id,co.updated_at,co.status,co.co_amount,JSON.stringify({status:'Approved',approved_by:'Fixture GC',sov_mode:'adjust_line',sov_line_item_id:line.id})]);
}
try {
  await installLifecycleFixture(db);
  await check('live ordinary update reproduces stale-form overwrite before the reviewed boundary',async()=>{
    const row=await seed(); await approveAdjustment(row);
    assert.equal(Number((await get(row.id)).scheduled_value),1400);
    await asUser(); await db.query('update sov_items set scheduled_value=$1 where id=$2',[row.scheduled_value,row.id]);
    assert.equal(Number((await get(row.id)).scheduled_value),1000);
  });
  await check('approved CO adjustment advances the real SOV timestamp and rejects stale metadata and value together',async()=>{
    const row=await seed(); await approveAdjustment(row);
    const adjusted=await get(row.id);assert.notEqual(adjusted.updated_at,row.updated_at);
    await asUser(); await assert.rejects(save(row,{description:'Must not save',scheduled_value:1000}),error=>error.code==='40001');
    assert.deepEqual(await get(row.id),adjusted);
  });
  await check('fresh reviewed billing edit preserves CO provenance and actual audit/timestamp triggers',async()=>{
    const row=await seed(); await approveAdjustment(row); const adjusted=await get(row.id); await asUser();
    const saved=await save(adjusted,{description:'Reviewed description',current_percent_complete:50,application_number:2,status:'Certified'});
    assert.equal(saved.scheduled_value,1400);assert.equal(saved.change_order_id,adjusted.change_order_id);assert.deepEqual(saved.metadata,adjusted.metadata);
    assert.equal(saved.current_percent_complete,50);assert.equal(saved.status,'Certified');assert.notEqual(saved.updated_at,adjusted.updated_at);
    await admin();const audit=(await db.query("select new_values from pma_audit_logs where entity_id=$1 and action='UPDATE' order by new_values->>'updated_at' desc limit 1",[row.id])).rows[0];
    assert.equal(audit.new_values.description,'Reviewed description');
  });
  await check('second editor of the same revision cannot overwrite the first',async()=>{
    const row=await seed();await save(row,{description:'First editor'});await asUser(ids.colleague);
    await assert.rejects(save(row,{description:'Second editor'}),error=>error.code==='40001');assert.equal((await get(row.id)).description,'First editor');
  });
  for(const actor of ['field','viewer','outsider']) await check(`${actor} cannot use reviewed SOV writes`,async()=>{
    const row=await seed();await asUser(ids[actor]);await assert.rejects(save(row,{description:'Denied'}),error=>['42501','P0002'].includes(error.code));assert.equal((await get(row.id)).description,row.description);
  });
  await check('revoked membership and archived project are rejected despite explicit project PM role',async()=>{
    const row=await seed();await admin();await db.query('delete from organization_members where org_id=$1 and user_id=$2',[ids.org,ids.colleague]);await asUser(ids.colleague);
    await assert.rejects(save(row,{description:'Denied'}),error=>['42501','P0002'].includes(error.code));
    await admin();await db.query('update projects set is_deleted=true where id=$1',[ids.project]);await asUser();await assert.rejects(save(row,{description:'Archived'}),error=>['42501','P0002'].includes(error.code));
    await admin();await db.query('update projects set is_deleted=false where id=$1',[ids.project]);
  });
  await check('MFA rejects enrolled AAL1 and permits unenrolled AAL1 under the actual policy',async()=>{
    const row=await seed();await asUser(ids.pm,'aal1');await assert.rejects(save(row,{description:'Denied'}),/MFA/);
    await admin();await db.query('delete from auth.mfa_factors where user_id=$1',[ids.pm]);await asUser(ids.pm,'aal1');assert.equal((await save(row,{description:'Unenrolled PM'})).description,'Unenrolled PM');
    await admin();await db.query("insert into auth.mfa_factors values($1,'verified')",[ids.pm]);
  });
  for(const patch of [{line_item_number:999},{project_id:ids.otherProject},{updated_at:'2026-10-07'},{is_deleted:true},{change_order_id:ids.project},{metadata:{source:'overwritten'}}]) await check(`immutable SOV ${Object.keys(patch)[0]} is rejected`,async()=>{
    const row=await seed();await assert.rejects(save(row,patch),/immutable/);assert.deepEqual(await get(row.id),row);
  });
  for(const patch of [{scheduled_value:'Infinity'},{current_percent_complete:'NaN'},{retainage_percent:101},{scheduled_value:-1},{previous_percent_complete:60,current_percent_complete:50},{application_number:0},{application_number:1.5},{period_from:'2026-10-08',period_to:'2026-10-07'},{period_from:'2026-02-30'},{description:{secret:'not text'}},{status:'Approved'}]) await check(`invalid SOV ${JSON.stringify(patch)} rolls back all fields`,async()=>{
    const row=await seed();await assert.rejects(save(row,{...patch,cost_code_name:'Must roll back'}));assert.deepEqual(await get(row.id),row);
  });
  await check('changed foreign reference rejects but unchanged archived history permits metadata edits',async()=>{
    const row=await seed();await admin();
    const foreign=(await db.query("insert into work_packages(project_id,name) values($1,'Foreign steel') returning id",[ids.otherProject])).rows[0].id;
    await asUser();await assert.rejects(save(row,{work_package_id:foreign}),/must belong/);
    await admin();const local=(await db.query("insert into work_packages(project_id,name) values($1,'Historical steel') returning id",[ids.project])).rows[0].id;
    await asUser();const linked=await save(row,{work_package_id:local});await admin();await db.query('update work_packages set is_deleted=true where id=$1',[local]);await asUser();
    assert.equal((await save(linked,{description:'Preserve historical link'})).work_package_id,local);
  });
  await check('nullable legacy versions match exactly and anonymous execution is denied',async()=>{
    const row=await seed();await admin();await db.exec('alter table sov_items disable trigger trg_sov_items_updated_at; alter table sov_items disable trigger trg_updated_at');
    await db.query('update sov_items set updated_at=null where id=$1',[row.id]);await db.exec('alter table sov_items enable trigger trg_sov_items_updated_at; alter table sov_items enable trigger trg_updated_at');
    await asUser();const saved=await save(row,{description:'Legacy reviewed'},null);assert.ok(saved.updated_at);
    await assert.rejects(save(row,{description:'Missing review'},null),error=>error.code==='40001');
    await admin();await db.exec('set role anon');await assert.rejects(save(row,{description:'Anonymous'}),/permission denied/);
  });
  await check('ordinary SOV save never sets a cost bypass flag or exposes invalid input in cast errors',async()=>{
    const row=await seed();await db.exec('begin');try {
      await db.query("select set_config('steelbuild.cost_rpc','off',true)");await save(row,{description:'Ordinary update'});
      assert.equal((await db.query("select current_setting('steelbuild.cost_rpc',true) as flag")).rows[0].flag,'off');await db.exec('rollback');
    } catch(error){await db.exec('rollback');throw error;}
    await assert.rejects(save(row,{scheduled_value:'private-contract-reference'}),error=>error.code==='22023'&&!error.message.includes('private-contract'));
  });
  console.log(`Reviewed SOV verification: ${passed} cases passed. No hosted data was written.`);
} catch(error){console.error(`FAIL reviewed SOV: ${error.message}`);process.exitCode=1;}
finally{await db.close();}
