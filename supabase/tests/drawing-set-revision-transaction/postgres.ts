import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { initialize, candidateUrl, sourceCandidateUrl, boundaryCandidateUrl, ids, actor, request, execute, createRequest, createSet, receipt, path, zoneA, zoneB, type Database } from './fixture.ts';
import { runCases, snapshot, tables } from './cases.ts';
import { runCommandCases } from './commandCases.ts';
import { runSourceCases } from './sourceCases.ts';
import { runBoundaryCases } from './boundaryCases.ts';
import { command, parent, submit, checklist, execute as roundExecute } from '../submittal-revision-evidence/cases.ts';

assert.equal(process.env.DRAWING_UPLOAD_POSTGRES_TEST,'1','Explicit disposable fixture opt-in required');
const connectionString=process.env.DRAWING_UPLOAD_POSTGRES_URL;
assert.ok(connectionString,'DRAWING_UPLOAD_POSTGRES_URL required');
const target=new URL(connectionString);
assert.ok(['postgres:','postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname),'Loopback fixture only');
assert.equal(target.pathname,'/steelbuild_drawing_upload_test');assert.equal(target.search,'');
pg.types.setTypeParser(1184,(value:string)=>value);
const pool=new pg.Pool({connectionString,max:8,connectionTimeoutMillis:5000,statement_timeout:15000});
const leased=new Set<pg.PoolClient>(),pids=new WeakMap<pg.PoolClient,number>();
pool.on('acquire',(client:pg.PoolClient)=>leased.add(client));
pool.on('release',(_error:unknown,client:pg.PoolClient)=>leased.delete(client));
async function connect(){const client=await pool.connect();pids.set(client,(await client.query('select pg_backend_pid() pid')).rows[0].pid);return client;}
const admin=await connect();
function database(client:pg.PoolClient):Database{return {exec:sql=>client.query(sql),query:async<T extends Record<string,unknown>>(sql:string,parameters?:unknown[])=>({rows:(await client.query(sql,parameters)).rows as T[]})};}
const db=database(admin),candidate=await readFile(candidateUrl,'utf8'),sourceCandidate=await readFile(sourceCandidateUrl,'utf8'),boundaryCandidate=await readFile(boundaryCandidateUrl,'utf8');
async function reset(){
  await admin.query('drop schema if exists public,auth,storage,steelbuild_security,extensions,steelbuild_workflow,steelbuild_drawing_revision cascade;create schema public');
  await initialize(db);await db.exec(candidate);await db.exec(sourceCandidate);await db.exec(boundaryCandidate);
}
async function session(){const c=await connect();await actor(database(c));await c.query('begin;set local role authenticated');return c;}
async function finish(c:pg.PoolClient,p:Awaited<ReturnType<typeof request>>,key=randomUUID(),create=false){
  try{const result=await (create?createSet:execute)(database(c),p,key);await c.query('commit');return result;}
  catch(error){await c.query('rollback');throw error;}finally{c.release();}
}
async function finishDaily(c:pg.PoolClient,sql:string,args:unknown[]){
  try{const result=await c.query(sql,args);await c.query('commit');return result;}
  catch(error){await c.query('rollback');throw error;}finally{c.release();}
}
async function waiting(c:pg.PoolClient){
  const deadline=Date.now()+1500;
  while(Date.now()<deadline){
    if((await admin.query('select wait_event_type from pg_stat_activity where pid=$1',[pids.get(c)])).rows[0]?.wait_event_type==='Lock')return;
    await delay(10);
  }
  throw new Error('Expected independent-session lock wait was not observed');
}
let count=0;
async function check(name:string,run:()=>Promise<void>){await reset();await run();count++;console.log(`PASS concurrent ${name}`);}
try{
  assert.equal((await admin.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_%' and c.relkind='r'")).rows[0].n,0,'Disposable fixture database must start empty');
  await initialize(db);await db.exec(candidate);await db.exec(sourceCandidate);await db.exec(boundaryCandidate);console.log(`${await runCases(db)} actual PostgreSQL behavioral checks passed`);
  console.log(`${await runBoundaryCases(db)} actual PostgreSQL write boundary checks passed`);
  console.log(`${await runCommandCases(db)} actual PostgreSQL atomic command checks passed`);
  console.log(`${await runSourceCases(db)} actual PostgreSQL source protection checks passed`);
  for(const field of ['is_member','is_pm','mfa_satisfied'])await check(`governing approval final receipt wait rechecks ${field}`,async()=>{
    await roundExecute(db,command(await parent(db),submit));
    const approval=command(await parent(db),{status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}});
    await admin.query(`create function public.round_receipt_wait() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(777000115);return new;end $$;
      create trigger late_round_receipt before insert on steelbuild_workflow.round_requests for each row execute function public.round_receipt_wait()`);
    const before=await snapshot(db),blocker=await connect();await blocker.query('begin;select pg_advisory_xact_lock(777000115)');
    const caller=await session(),outcome=finishDaily(caller,approval.sql,approval.args).then(()=>null,e=>e);await waiting(caller);
    await admin.query(`update auth.test_access set ${field}=false where user_id=$1`,[ids.pm]);await blocker.query('commit');blocker.release();
    assert.match((await outcome).message,/NOT_AUTHORIZED/);assert.deepEqual(await snapshot(db),before);
  });
  await check('governing approval holds complete source roster against replacement',async()=>{
    await roundExecute(db,command(await parent(db),submit));const p=await request(db);
    const approval=command(await parent(db),{status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}}),caller=await session();
    await roundExecute(database(caller),approval);
    await assert.rejects(finish(await session(),p),/BUSY/);await caller.query('commit');caller.release();
    assert.equal((await admin.query('select set_approval_status from public.drawing_sets where id=$1',[ids.set])).rows[0].set_approval_status,'approved');
    await finishDaily(await session(),'select public.publish_drawing_revision($1,$2)',[ids.revision,'released_for_shop']);
    await finish(await session(),await request(db));
    assert.equal((await admin.query('select set_approval_status from public.drawing_sets where id=$1',[ids.set])).rows[0].set_approval_status,'pending_review');
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.command_context')).rows[0].n,0);
  });
  await check('governing approval project SHARE lock orders archival after commit',async()=>{
    await roundExecute(db,command(await parent(db),submit));
    const caller=await session();await roundExecute(database(caller),command(await parent(db),{status:'Approved',ball_in_court:'GC',metadata:{ofs_checklist:checklist}}));
    const archiver=await session(),archival=finishDaily(archiver,'select public.soft_delete_project($1)',[ids.project]).then(r=>r,e=>e);await waiting(archiver);
    assert.equal((await admin.query('select is_deleted from public.projects where id=$1',[ids.project])).rows[0].is_deleted,false);
    await caller.query('commit');caller.release();const archived=await archival;
    assert.equal(archived instanceof Error,false);assert.equal((await admin.query('select is_deleted from public.projects where id=$1',[ids.project])).rows[0].is_deleted,true);
    await assert.rejects(finishDaily(await session(),'select public.publish_drawing_revision($1,$2)',[ids.revision,'released_for_shop']),/NOT_AUTHORIZED/);
  });
  await check('revision winner prevents stale publication before and after commit',async()=>{
    const p=await request(db),before=await snapshot(db),consumer=await session();await execute(database(consumer),p,randomUUID());
    await assert.rejects(finishDaily(await session(),'select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/BUSY/);
    assert.deepEqual(await snapshot(db),before);await consumer.query('commit');consumer.release();
    const committed=await snapshot(db);await assert.rejects(finishDaily(await session(),'select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/SOURCE_MISMATCH/);
    assert.deepEqual(await snapshot(db),committed);
  });
  await check('concurrent holds bind only one revision and stale release cannot promote replacement',async()=>{
    const p=await request(db),holder=await session();
    const held=(await holder.query('select * from public.place_drawing_hold($1,$2)',[ids.drawing,'First hold'])).rows[0];
    await assert.rejects(finishDaily(await session(),'select public.place_drawing_hold($1,$2)',[ids.drawing,'Second hold']),/BUSY/);
    await assert.rejects(finish(await session(),p),/BUSY/);await holder.query('commit');holder.release();
    await assert.rejects(finishDaily(await session(),'select public.place_drawing_hold($1,$2)',[ids.drawing,'Second hold']),/HOLD/);
    await finish(await session(),await request(db));
    await finishDaily(await session(),'select public.release_drawing_hold($1,$2)',[held.id,'Old source only']);
    assert.equal((await admin.query('select release_status from public.drawing_revisions where drawing_id=$1 and is_current',[ids.drawing])).rows[0].release_status,'received');
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.command_context')).rows[0].n,0);
  });
  for(const operation of ['lock','archive'])await check(`${operation} serializes publication and intake`,async()=>{
    const p=await request(db),owner=await session();
    if(operation==='lock')await owner.query('select public.set_drawing_set_lock($1,true,$2,$3)',[ids.set,'Review lock',p.expected_set_updated_at]);
    else await owner.query('select public.delete_drawing_set($1)',[ids.set]);
    await assert.rejects(finish(await session(),p),/BUSY/);
    await assert.rejects(finishDaily(await session(),'select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/BUSY/);
    await owner.query('commit');owner.release();const committed=await snapshot(db);
    await assert.rejects(finish(await session(),p),/SET_UNAVAILABLE/);
    await assert.rejects(finishDaily(await session(),'select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/SET_UNAVAILABLE/);
    assert.deepEqual(await snapshot(db),committed);
  });
  for(const field of ['is_member','is_pm','mfa_satisfied'])await check(`daily late audit wait rechecks ${field}`,async()=>{
    await admin.query(`create function public.daily_audit_wait() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(777000114);return new;end $$;
      create trigger late_daily_audit before insert on public.pma_audit_logs for each row execute function public.daily_audit_wait()`);
    const before=await snapshot(db),blocker=await connect();await blocker.query('begin;select pg_advisory_xact_lock(777000114)');
    const caller=await session(),outcome=finishDaily(caller,'select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']).then(()=>null,e=>e);await waiting(caller);
    await admin.query(`update auth.test_access set ${field}=false where user_id=$1`,[ids.pm]);await blocker.query('commit');blocker.release();
    assert.match((await outcome).message,/NOT_AUTHORIZED/);assert.deepEqual(await snapshot(db),before);
  });
  for(const [name,sql,args] of [
    ['project','select id from public.projects where id=$1 for update',[ids.project]],
    ['set','select id from public.drawing_sets where id=$1 for update',[ids.set]],
    ['revision','select id from public.drawing_revisions where id=$1 for update',[ids.revision]],
  ] as const)await check(`daily ${name} contention is NOWAIT and atomic`,async()=>{
    const before=await snapshot(db),blocker=await connect();await blocker.query('begin');await blocker.query(sql,[...args]);
    const started=Date.now();await assert.rejects(finishDaily(await session(),'select public.publish_drawing_revision($1,$2)',[ids.revision,'reviewed']),/BUSY/);assert.ok(Date.now()-started<1500);
    await blocker.query('rollback');blocker.release();assert.deepEqual(await snapshot(db),before);
  });
  for(const create of [true,false])for(const first of ['apply','replace'])await check(`concurrentReplaceAndApplyHasOneSafeWinner ${create?'create':'revision'} ${first} first`,async()=>{
    const p=await (create?createRequest:request)(db),before=await snapshot(db);
    if(first==='apply'){
      const consumer=await session();await (create?createSet:execute)(database(consumer),p,randomUUID());
      const writer=await session(),started=Date.now();
      await assert.rejects(writer.query("update storage.objects set version='racing-replacement' where name=$1",[path]),/DRAWING_SOURCE_BUSY/);
      assert.ok(Date.now()-started<1500,'Source policy must use NOWAIT, not the statement snapshot after waiting');
      await writer.query('rollback');writer.release();assert.deepEqual(await snapshot(db),before);
      await consumer.query('commit');consumer.release();
      const committed=await snapshot(db),retry=await session();
      assert.equal((await retry.query("update storage.objects set version='racing-replacement' where name=$1 returning id",[path])).rows.length,0);
      await retry.query('commit');retry.release();assert.deepEqual(await snapshot(db),committed);
      assert.deepEqual((await admin.query('select public.get_drawing_revision_sources($1,$2) sources',[ids.project,[path]])).rows[0].sources,p.source_objects);
    }else{
      const writer=await session();await writer.query("update storage.objects set version='racing-replacement' where name=$1",[path]);
      const started=Date.now();await assert.rejects(finish(await session(),p,randomUUID(),create),/DRAWING_REVISION_BUSY/);
      assert.ok(Date.now()-started<1500);assert.deepEqual(await snapshot(db),before);
      await writer.query('commit');writer.release();
      const changed=await snapshot(db);await assert.rejects(finish(await session(),p,randomUUID(),create),/SOURCE_CHANGED/);
      assert.deepEqual(await snapshot(db),changed);
      assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.adopted_sources')).rows[0].n,0);
      await finish(await session(),await (create?createRequest:request)(db),randomUUID(),create);
    }
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.adopted_sources')).rows[0].n,1);
  });
  await check('policy helper sees committed adoption after its statement snapshot began',async()=>{
    await admin.query(`create function public.source_policy_barrier() returns boolean language plpgsql volatile as $$ begin perform pg_advisory_xact_lock(777000113);return true;end $$`);
    const blocker=await connect();await blocker.query('begin;select pg_advisory_xact_lock(777000113)');
    const reader=await session();
    const result=reader.query(`select public.drawing_source_mutation_allowed('app-files',$1,$1) allowed from (select public.source_policy_barrier() as waited offset 0) gate where gate.waited`,[path]);
    await waiting(reader);await finish(await session(),await createRequest(db),randomUUID(),true);
    await blocker.query('commit');blocker.release();assert.equal((await result).rows[0].allowed,false);
    await reader.query('commit');reader.release();
  });
  await check('direct policy helper gives foreign actors no project row locks',async()=>{
    const caller=await session();await actor(database(caller),ids.foreign);
    assert.equal((await caller.query("select public.drawing_source_mutation_allowed('app-files',$1,$1) allowed",[path])).rows[0].allowed,false);
    await admin.query('begin');await admin.query('select id from storage.objects where name=$1 for update nowait',[path]);await admin.query('rollback');
    await caller.query('rollback');caller.release();
  });
  await check('project erasure versus adoption serializes on the project row',async()=>{
    const p=await createRequest(db),consumer=await session();await createSet(database(consumer),p,randomUUID());
    const eraser=await session(),erasure=eraser.query('select public.soft_delete_project($1)',[ids.project]);await waiting(eraser);
    await consumer.query('commit');consumer.release();await erasure;
    await eraser.query('select public.hard_delete_project($1,$2)',[ids.project,'Synthetic concurrent source erasure']);
    await eraser.query('commit');eraser.release();
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.adopted_sources')).rows[0].n,0);
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,0);
  });
  await check('project erasure winner makes concurrent intake busy then unauthorized',async()=>{
    const p=await createRequest(db),eraser=await session();await eraser.query('select public.soft_delete_project($1)',[ids.project]);
    await eraser.query('select public.hard_delete_project($1,$2)',[ids.project,'Synthetic concurrent source erasure']);
    await assert.rejects(finish(await session(),p,randomUUID(),true),/BUSY/);
    await eraser.query('commit');eraser.release();await assert.rejects(finish(await session(),p,randomUUID(),true),/NOT_AUTHORIZED/);
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.adopted_sources')).rows[0].n,0);
  });
  for(const create of [false,true])await check(`same ${create?'create':'revision'} request is immediately busy then returns committed receipt once`,async()=>{
    const p=await (create?createRequest:request)(db),key=randomUUID(),a=await session();
    const first=await (create?createSet:execute)(database(a),p,key),started=Date.now();
    await assert.rejects(finish(await session(),p,key,create),/DRAWING_REVISION_BUSY/);
    assert.ok(Date.now()-started<1500,'Shared request lock must never wait');
    const reader=await session();assert.deepEqual(await receipt(database(reader),p,create?'create_set':'revise_set',key),{state:'pending'});await reader.query('commit');reader.release();
    await a.query('commit');a.release();
    assert.deepEqual(await finish(await session(),p,key,create),first);
    const committedReader=await session();assert.deepEqual(await receipt(database(committedReader),p,create?'create_set':'revise_set',key),{state:'committed',result:first});await committedReader.query('commit');committedReader.release();
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
    assert.equal((await admin.query('select count(*)::int n from public.drawing_revisions r join public.drawings d on d.id=r.drawing_id where d.drawing_set_id=$1',[first.set_id])).rows[0].n,create?1:2);
  });
  await check('different requests cannot split the same set and stale loser fails after commit',async()=>{
    const p=await request(db),a=await session();await execute(database(a),p,randomUUID());
    await assert.rejects(finish(await session(),p),/DRAWING_REVISION_BUSY/);await a.query('commit');a.release();
    await assert.rejects(finish(await session(),p),/DRAWING_REVISION_STALE/);
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
  });
  for(const field of ['is_member','is_pm','mfa_satisfied'])for(const replay of [false,true])
    await check(`${field} revoked after busy request denies ${replay?'receipt replay':'new write'}`,async()=>{
      const p=await request(db),key=randomUUID();if(replay)await finish(await session(),p,key);
      const before=await snapshot(db),lock=await connect();await lock.query('begin');
      await lock.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`drawing-command:${ids.pm}:${key}`]);
      const started=Date.now();await assert.rejects(finish(await session(),p,key),/BUSY/);assert.ok(Date.now()-started<1500);
      await admin.query(`update auth.test_access set ${field}=false where user_id=$1`,[ids.pm]);await lock.query('commit');lock.release();
      await assert.rejects(finish(await session(),p,key),/NOT_AUTHORIZED/);
      const reader=await session();await assert.rejects(receipt(database(reader),p,'revise_set',key),/NOT_AUTHORIZED/);await reader.query('rollback');reader.release();
      assert.deepEqual(await snapshot(db),before);
    });
  await check('different operations share the occupied actor request key',async()=>{
    const p=await createRequest(db),revise=await request(db),key=randomUUID(),a=await session();
    await createSet(database(a),p,key);
    await assert.rejects(finish(await session(),revise,key),/BUSY/);
    const reader=await session();assert.deepEqual(await receipt(database(reader),revise,'revise_set',key),{state:'pending'});await reader.query('commit');reader.release();
    await a.query('commit');a.release();await assert.rejects(finish(await session(),revise,key),/REQUEST_CONFLICT/);
  });
  await check('rolled back create becomes not_committed and same key can safely retry',async()=>{
    const p=await createRequest(db),key=randomUUID(),before=await snapshot(db),a=await session();await createSet(database(a),p,key);
    const reader=await session();assert.deepEqual(await receipt(database(reader),p,'create_set',key),{state:'pending'});await reader.query('commit');reader.release();
    await a.query('rollback');a.release();assert.deepEqual(await snapshot(db),before);
    const freeReader=await session();assert.deepEqual(await receipt(database(freeReader),p,'create_set',key),{state:'not_committed'});await freeReader.query('commit');freeReader.release();
    await finish(await session(),p,key,true);assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
  });
  await check('normalized set names serialize across distinct keys without adoption',async()=>{
    const p=await createRequest(db),a=await session();await createSet(database(a),p,randomUUID());
    const competing={...p,set_name:' REVIEWED NEW SET '};await assert.rejects(finish(await session(),competing,randomUUID(),true),/BUSY/);
    await a.query('commit');a.release();await assert.rejects(finish(await session(),competing,randomUUID(),true),/DUPLICATE/);
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
  });
  await check('legacy uniqueness race aborts new set without adopting the competing row',async()=>{
    const p=await createRequest(db),writer=await connect();await writer.query('begin');
    await writer.query('insert into public.drawing_sets(project_id,set_name) values($1,$2)',[ids.project,p.set_name]);
    const consumer=await session(),outcome=finish(consumer,p,randomUUID(),true).then(()=>null,e=>e);await waiting(consumer);
    await writer.query('commit');writer.release();assert.equal((await outcome).code,'23505');
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,0);
    assert.equal((await admin.query('select count(*)::int n from public.drawings d join public.drawing_sets s on s.id=d.drawing_set_id where s.set_name=$1',[p.set_name])).rows[0].n,0);
  });
  for(const [name,sql,args] of [
    ['organization','select id from public.organizations where id=$1 for update',[ids.org]],
    ['project','select id from public.projects where id=$1 for update',[ids.project]],
    ['Auth identity','select id from auth.users where id=$1 for update',[ids.pm]],
    ['drawing set','select id from public.drawing_sets where id=$1 for update',[ids.set]],
    ['sheet','select id from public.drawings where id=$1 for update',[ids.drawing]],
    ['revision','select id from public.drawing_revisions where id=$1 for update',[ids.revision]],
    ['source object','select id from storage.objects where name=$1 for update',[path]],
    ['zone','select id from public.drawing_zones where id=$1 for update',[zoneA]],
    ['link','select id from public.drawing_links for update',[]],
    ['dependency','select id from public.drawing_zone_dependencies for update',[]],
  ] as const)await check(`${name} contention retries without any partial writes`,async()=>{
    const p=await request(db),before=await snapshot(db),lock=await connect();await lock.query('begin');await lock.query(sql,[...args]);
    const started=Date.now();await assert.rejects(finish(await session(),p),/DRAWING_REVISION_BUSY/);assert.ok(Date.now()-started<1500,'Explicit row conflict must use NOWAIT');
    // The losing command released its earlier locks, so reverse parent acquisition is safe.
    await lock.query('select id from public.organizations where id=$1 for update nowait',[ids.org]);await lock.query('rollback');lock.release();
    assert.deepEqual(await snapshot(db),before);
  });
  await check('committed object replacement requires a fresh reviewed snapshot',async()=>{
    const p=await request(db);await admin.query("update storage.objects set version='replaced' where name=$1",[path]);
    await assert.rejects(finish(await session(),p),/SOURCE_CHANGED/);
    const result=await finish(await session(),await request(db));assert.equal(result.applied,true);
  });
  for(const [name,sql,args] of [
    ['new sheet',"insert into public.drawings(project_id,drawing_set_id,sheet_number,title) values($1,$2,'LATE','Late sheet')",[ids.project,ids.set]],
    ['new zone on prior revision',"insert into public.drawing_zones(project_id,drawing_id,drawing_revision_id,zone_key,label,x_min,y_min,x_max,y_max) values($1,$2,$3,'LATE','Late zone',0,0,1,1)",[ids.project,ids.drawing,ids.revision]],
    ['new dependency on prior zone',"insert into public.drawing_zone_dependencies(project_id,source_zone_id,target_zone_id,relationship) values($1,$2,$3,'relates_to')",[ids.project,zoneA,zoneB]],
    ['same-path object overwrite',"update storage.objects set version='post-commit' where name=$1",[path]],
  ] as const)await check(`${name} cannot interleave before command commit`,async()=>{
    const p=await request(db),consumer=await session();await execute(database(consumer),p,randomUUID());
    const writer=await connect();await writer.query('begin');const write=writer.query(sql,[...args]);await waiting(writer);
    await consumer.query('commit');consumer.release();await write;await writer.query('rollback');writer.release();
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
  });
  for(const target of ['requests','source_observations'])for(const revoke of [false,true])await check(`implicit late ${target} trigger wait ${revoke?'rechecks permission':'times out and rolls back all prior writes'}`,async()=>{
    await admin.query(`create function public.late_fixture_wait() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(777000111);return new;end $$;
      create trigger late_fixture_wait before insert on steelbuild_drawing_revision.${target} for each row execute function public.late_fixture_wait()`);
    const p=await request(db),before=await snapshot(db),lock=await connect();await lock.query('begin;select pg_advisory_xact_lock(777000111)');
    const consumer=await session(),result=finish(consumer,p).then(()=>null,e=>e);await waiting(consumer);
    if(revoke){await admin.query('update auth.test_access set is_pm=false where user_id=$1',[ids.pm]);await lock.query('commit');}
    const error=await result;assert.match(error.message,revoke?/NOT_AUTHORIZED/:/DRAWING_REVISION_BUSY/);
    if(!revoke)await lock.query('rollback');lock.release();assert.deepEqual(await snapshot(db),before);
  });
  for(const target of ['drawing_sets','drawings','drawing_revisions','requests'])for(const field of ['is_member','is_pm','mfa_satisfied'])
    await check(`create ${target} implicit wait rechecks revoked ${field}`,async()=>{
      const schema=target==='requests'?'steelbuild_drawing_revision':'public';
      await admin.query(`create function public.late_create_wait() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(777000112);return new;end $$;
        create trigger late_create_wait before insert on ${schema}.${target} for each row execute function public.late_create_wait()`);
      const p=await createRequest(db),before=await snapshot(db),lock=await connect();await lock.query('begin;select pg_advisory_xact_lock(777000112)');
      const consumer=await session(),outcome=finish(consumer,p,randomUUID(),true).then(()=>null,e=>e);await waiting(consumer);
      await admin.query(`update auth.test_access set ${field}=false where user_id=$1`,[ids.pm]);await lock.query('commit');lock.release();
      assert.match((await outcome).message,/NOT_AUTHORIZED/);assert.deepEqual(await snapshot(db),before);
    });
  await check('input and coordination boundary workload stays within runtime budget',async()=>{
    await admin.query('begin');
    await admin.query(`insert into public.drawings(id,project_id,drawing_set_id,sheet_number,title,revision_number,file_url,pdf_page)
      select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,'B-'||n,'Bounded sheet '||n,'A',$3,1 from generate_series(1,249)n`,[ids.project,ids.set,path]);
    await admin.query(`insert into public.drawing_revisions(id,project_id,drawing_id,revision_code,sheet_number,sheet_title,is_current,version_number,file_url,pdf_page)
      select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'A','B-'||n,'Bounded sheet '||n,true,1,$2,1 from generate_series(1,249)n`,[ids.project,path]);
    await admin.query(`insert into public.drawings(project_id,drawing_set_id,sheet_number,title,is_deleted,deleted_at)
      select $1,$2,'ARCHIVED-'||n,'Archived sheet '||n,true,now() from generate_series(1,750)n`,[ids.project,ids.set]);
    await admin.query('delete from public.drawing_watchers');
    await admin.query(`insert into public.drawing_revisions(project_id,drawing_id,revision_code,sheet_number,sheet_title,version_number,is_current,archived_at)
      select $1,$2,'H-'||n,'S1','Retained history',n+1,false,now() from generate_series(1,9750)n`,[ids.project,ids.drawing]);
    await admin.query(`insert into public.drawing_holds(id,project_id,drawing_id,is_active,released_at) select gen_random_uuid(),$1,$2,false,now() from generate_series(1,1000)`,[ids.project,ids.drawing]);
    const prefix=`${ids.org}/uploads/${ids.project}/bound-`;
    await admin.query("insert into storage.objects(bucket_id,name) select 'app-files',$1||n||'.pdf' from generate_series(1,249)n",[prefix]);
    await admin.query(`insert into public.drawing_zones(project_id,drawing_id,drawing_revision_id,zone_key,label,x_min,y_min,x_max,y_max)
      select $1,$2,$3,'BOUND-'||n,'Bounded zone '||n,0,0,1,1 from generate_series(1,998)n`,[ids.project,ids.drawing,ids.revision]);
    await admin.query(`insert into public.drawing_links(project_id,drawing_id,drawing_revision_id,drawing_zone_id,linked_record_type,linked_record_id,link_role)
      select $1,$2,$3,z.id,'drawing',$4,r.role from public.drawing_zones z cross join (values('related'),('affects'))r(role)
      where z.drawing_revision_id=$3 and not(z.id=$5 and r.role='related')`,[ids.project,ids.drawing,ids.revision,ids.drawing2,zoneA]);
    await admin.query(`insert into public.drawing_zone_dependencies(project_id,source_zone_id,target_zone_id,relationship)
      select $1,z.id,$2,r.relationship from public.drawing_zones z cross join(values('blocks'),('relates_to'))r(relationship)
      where z.drawing_revision_id=$3 and z.id<>$2 and not(z.id=$4 and r.relationship='blocks')`,[ids.project,zoneB,ids.revision,zoneA]);
    await admin.query(`insert into public.drawing_zone_dependencies(project_id,source_zone_id,target_zone_id,relationship) values($1,$2,$3,'depends_on'),($1,$3,$2,'depends_on')`,[ids.project,zoneA,zoneB]);
    // Exercise the full private retention bound together with every other row bound.
    // All updates share this transaction timestamp, so serialized timestamp lengths stay fixed.
    await admin.query("update public.drawings d set extracted_text=repeat('x',15000) where drawing_set_id=$1 and not is_deleted",[ids.set]);
    const observationSize=async()=>Number((await admin.query(`select octet_length(jsonb_agg(steelbuild_drawing_revision.observe_source(d,r) order by d.id)::text) n
      from public.drawings d join public.drawing_revisions r on r.drawing_id=d.id and r.is_current where d.drawing_set_id=$1 and not d.is_deleted`,[ids.set])).rows[0].n);
    let remaining=4194304-await observationSize();assert.ok(remaining>0);
    const filling=(await admin.query('select id from public.drawings where drawing_set_id=$1 and not is_deleted order by id',[ids.set])).rows;
    for(const row of filling){if(remaining===0)break;const addition=Math.min(remaining,65536-15000);
      await admin.query("update public.drawings set extracted_text=extracted_text||repeat('x',$1) where id=$2",[addition,row.id]);remaining-=addition;}
    assert.equal(await observationSize(),4194304,'Exact maximum serialized observation array required');
    await admin.query('commit');
    const p=await request(db);const existing=p.sheets as Record<string,unknown>[];
    const others=(await admin.query('select d.id,d.updated_at,d.sheet_number,r.id revision_id from public.drawings d join public.drawing_revisions r on r.drawing_id=d.id and r.is_current where d.drawing_set_id=$1 and d.id<>$2 order by d.id',[ids.set,ids.drawing])).rows;
    for(const [index,row] of others.entries())existing.push({action:'revised',drawing_id:row.id,expected_updated_at:row.updated_at,expected_revision_id:row.revision_id,
      sheet_number:row.sheet_number,sheet_title:'Reviewed boundary sheet',revision_code:'B',file_path:`${prefix}${index+1}.pdf`,pdf_page:1,reviewed:true,
      extraction:{text:{state:'unavailable'},callouts:{state:'unavailable'}}});
    p.source_objects=(await admin.query('select public.get_drawing_revision_sources($1,$2) sources',[ids.project,existing.map(e=>e.file_path)])).rows[0].sources;
    const fingerprints=async()=>{
      const digests:string[]=[];
      for(const table of tables)digests.push((await admin.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text) digest from ${table} t`)).rows[0].digest);
      return digests;
    };
    const before=await fingerprints();
    // An over-bound prior observation refuses before writes, even when each field fits.
    // Disable only the synthetic timestamp trigger so this fixture changes exactly one byte.
    const fillTarget=filling[filling.length-1].id;
    await admin.query('alter table public.drawings disable trigger user');
    await admin.query("update public.drawings set extracted_text=extracted_text||'x' where id=$1",[fillTarget]);
    await admin.query('alter table public.drawings enable trigger user');
    assert.equal(await observationSize(),4194305);
    const overBefore=await fingerprints();await assert.rejects(finish(await session(),p),/OBSERVATION_LIMIT/);assert.deepEqual(await fingerprints(),overBefore);
    await admin.query('alter table public.drawings disable trigger user');
    await admin.query('update public.drawings set extracted_text=left(extracted_text,length(extracted_text)-1) where id=$1',[fillTarget]);
    await admin.query('alter table public.drawings enable trigger user');
    assert.deepEqual(await fingerprints(),before);
    await admin.query(`create function public.fail_max_observation() returns trigger language plpgsql as $$ begin raise exception 'MAX_OBSERVATION_FAILURE';end $$;
      create trigger fail_max_observation before insert on steelbuild_drawing_revision.source_observations for each row execute function public.fail_max_observation()`);
    const rollbackStarted=Date.now();await assert.rejects(finish(await session(),p),/MAX_OBSERVATION_FAILURE/);
    const rollbackElapsed=Date.now()-rollbackStarted;assert.deepEqual(await fingerprints(),before);
    await admin.query('drop trigger fail_max_observation on steelbuild_drawing_revision.source_observations;drop function public.fail_max_observation()');
    const started=Date.now(),result=await finish(await session(),p);const elapsed=Date.now()-started;
    assert.deepEqual([result.sheet_count,result.zones_cloned,result.links_cloned,result.dependencies_cloned],[250,1000,2000,2000]);
    assert.ok(elapsed<10000,`Boundary request exceeded 10s fixture budget: ${elapsed}ms`);
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.source_observations')).rows[0].n,250);
    console.log(`MEASURE 250 revised sheets/sources, 1000 parent rows, 10000 history rows, 1000 holds/zones, 2000 links/edges, 4194304 observation bytes: commit ${elapsed}ms; late rollback ${rollbackElapsed}ms; payload ${Buffer.byteLength(JSON.stringify(p))} bytes`);
  });
  console.log(`${count} independent-session PostgreSQL checks passed`);
}catch(error){console.error(error instanceof Error?error.stack:error);process.exitCode=1;}
finally{for(const client of [...leased])client.release(true);await pool.end();}
