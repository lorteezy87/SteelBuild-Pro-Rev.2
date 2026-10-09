import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { initialize, ids, actor, migrationUrl, sourcePath, type Database } from './fixture.ts';
import { runCases, parent, command, execute, submit, coverage } from './cases.ts';

const connectionString=process.env.ROUND_EVIDENCE_POSTGRES_URL;
assert.equal(process.env.ROUND_EVIDENCE_POSTGRES_TEST,'1','Explicit isolated fixture opt-in required');
assert.ok(connectionString,'ROUND_EVIDENCE_POSTGRES_URL is required');
const target=new URL(connectionString);
assert.ok(['postgres:','postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname),'Loopback fixture only');
assert.equal(target.pathname,'/steelbuild_round_evidence_test');assert.equal(target.search,'');
pg.types.setTypeParser(1184,(value:string)=>value);
const pool=new pg.Pool({connectionString,max:10,connectionTimeoutMillis:5000,statement_timeout:15000});
const admin=await pool.connect();
function database(client:pg.PoolClient):Database {
  return {exec:sql=>client.query(sql),query:async<T extends Record<string,unknown>>(sql:string,parameters?:unknown[])=>({rows:(await client.query(sql,parameters)).rows as T[]})};
}
const db=database(admin);
async function session(){const client=await pool.connect();await actor(database(client));await client.query('begin;set local role authenticated');return client;}
async function finish(client:pg.PoolClient,c:ReturnType<typeof command>){try{const result=await execute(database(client),c);await client.query('commit');return result;}catch(error){await client.query('rollback');throw error;}finally{client.release();}}
async function waiting(client:pg.PoolClient){
  const until=Date.now()+5000;
  while(Date.now()<until){
    const {rows}=await admin.query("select wait_event_type from pg_stat_activity where pid=$1",[client.processID]);
    if(rows[0]?.wait_event_type==='Lock')return;
    await delay(20);
  }
  throw new Error('Concurrent query did not reach a database lock wait');
}
async function draft():Promise<string>{
  const id=randomUUID();await admin.query("insert into public.submittals(id,project_id,submittal_number,title,submittal_type,drawing_set_ids) values($1,$2,$3,'Concurrent shop fixture','Shop Drawing',$4)",[id,ids.project,`SUB-${id}`,[ids.set,ids.set2]]);return id;
}
let checks=0;
async function check(name:string,run:()=>Promise<void>){await run();checks++;console.log(`PASS concurrent ${name}`);}
try{
  assert.equal((await admin.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows[0].n,0,'Fixture database must be empty');
  await initialize(db);await db.exec(await readFile(migrationUrl,'utf8'));
  console.log(`${await runCases(db)} PostgreSQL behavioral checks passed`);await admin.query('reset role');

  await check('identical retries serialize and return one round and identical receipt',async()=>{
    const id=await draft();const request=randomUUID();const c=command(await parent(db,id),submit,request);
    const lock=await pool.connect();await lock.query('begin');await lock.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`round-workflow:${ids.project}:${request}`]);
    const a=await session(),b=await session();const ar=finish(a,c),br=finish(b,c);await waiting(a);await waiting(b);await lock.query('commit');lock.release();
    assert.deepEqual(await ar,await br);assert.equal((await admin.query('select count(*)::int n from public.submittal_rounds where submittal_id=$1',[id])).rows[0].n,1);
  });
  await check('different requests on the same stale parent produce one winner',async()=>{
    const id=await draft();const s=await parent(db,id);
    const lock=await pool.connect();await lock.query('begin');await lock.query('select id from public.submittals where id=$1 for update',[id]);
    const a=await session(),b=await session();const jobs=[finish(a,command(s,submit)),finish(b,command(s,submit))];const settled=Promise.allSettled(jobs);
    await waiting(a);await waiting(b);await lock.query('commit');lock.release();
    const results=await settled;assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.match(rejected.reason.message,/ROUND_STALE/);
  });
  await check('a sheet inserted before locked snapshot causes stale-roster denial',async()=>{
    const id=await draft();const c=command(await parent(db,id),submit);const writer=await pool.connect();await writer.query('begin');
    const added=randomUUID();await writer.query("insert into public.drawings(id,project_id,drawing_set_id,sheet_number,title,file_url,pdf_page) values($1,$2,$3,'S-NEW','Added steel',$4,3)",[added,ids.project,ids.set,sourcePath]);
    const consumer=await session();const result=finish(consumer,c).then(()=>null,e=>e);await waiting(consumer);await writer.query('commit');writer.release();
    assert.match((await result).message,/ROUND_SOURCE_INCOMPLETE/);
    assert.equal((await admin.query('select count(*)::int n from public.submittal_rounds where submittal_id=$1',[id])).rows[0].n,0);
    await admin.query('delete from public.drawings where id=$1',[added]);
  });
  await check('a concurrent revision swap is re-read after the drawing lock wait',async()=>{
    const id=await draft();const c=command(await parent(db,id),submit);const writer=await pool.connect();await writer.query('begin');
    const newer=randomUUID();await writer.query('update public.drawing_revisions set is_current=false where id=$1',[ids.revision2]);
    await writer.query("insert into public.drawing_revisions(id,project_id,drawing_id,revision_code,sheet_number,sheet_title,version_number,is_current,file_url,pdf_page) values($1,$2,$3,'CONCURRENT','S2','Stairs',2,true,$4,2)",[newer,ids.project,ids.drawing2,sourcePath]);
    const consumer=await session();const result=finish(consumer,c).then(()=>null,e=>e);await waiting(consumer);await writer.query('commit');writer.release();
    assert.match((await result).message,/ROUND_STALE_ROSTER/);
    await admin.query('delete from public.drawing_revisions where id=$1',[newer]);await admin.query('update public.drawing_revisions set is_current=true where id=$1',[ids.revision2]);
  });
  await check('new sheet cannot enter captured roster until the workflow transaction commits',async()=>{
    const id=await draft();const consumer=await session();const result=await execute(database(consumer),command(await parent(db,id),submit));
    const writer=await pool.connect();await writer.query('begin');const added=randomUUID();
    const insert=writer.query("insert into public.drawings(id,project_id,drawing_set_id,sheet_number,title,file_url,pdf_page) values($1,$2,$3,'S-LATE','Late steel',$4,3)",[added,ids.project,ids.set,sourcePath]);
    await waiting(writer);assert.equal(result.evidence.length,2);await consumer.query('commit');consumer.release();await insert;await writer.query('commit');writer.release();
    assert.equal((await coverage(db,id)).ok,false);await admin.query('delete from public.drawings where id=$1',[added]);
  });
  await check('sheet removal racing snapshot causes fail-closed refresh',async()=>{
    const id=await draft();const c=command(await parent(db,id),submit);const writer=await pool.connect();await writer.query('begin');
    await writer.query('update public.drawings set is_deleted=true where id=$1',[ids.drawing2]);
    const consumer=await session();const result=finish(consumer,c).then(()=>null,e=>e);await waiting(consumer);await writer.query('commit');writer.release();
    assert.match((await result).message,/ROUND_SOURCE_INCOMPLETE/);await admin.query('update public.drawings set is_deleted=false where id=$1',[ids.drawing2]);
  });
  await check('failed commands leave no private context and only completed receipts',async()=>{
    assert.equal((await admin.query('select count(*)::int n from steelbuild_workflow.round_context')).rows[0].n,0);
    const dangling=await admin.query("select r.request_id from steelbuild_workflow.round_requests r where not exists(select 1 from public.submittals s where s.id=(r.result->'submittal'->>'id')::uuid)");assert.equal(dangling.rows.length,0);
  });
  for(const field of ['is_member','is_pm','mfa_satisfied']) {
    await check(`${field} revoked during request-key wait denies mutation`,async()=>{
      const id=await draft();const request=randomUUID();const c=command(await parent(db,id),submit,request);
      const lock=await pool.connect();await lock.query('begin');await lock.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`round-workflow:${ids.project}:${request}`]);
      const consumer=await session();const result=finish(consumer,c).then(()=>null,e=>e);await waiting(consumer);
      await admin.query(`update auth.test_access set ${field}=false where user_id=$1`,[ids.pm]);await lock.query('commit');lock.release();
      assert.match((await result).message,/ROUND_NOT_AUTHORIZED/);await admin.query(`update auth.test_access set ${field}=true where user_id=$1`,[ids.pm]);
      assert.equal((await admin.query('select count(*)::int n from public.submittal_rounds where submittal_id=$1',[id])).rows[0].n,0);
    });
  }
  await check('PM downgrade while waiting on linked set is rechecked after row locks',async()=>{
    const id=await draft();const c=command(await parent(db,id),submit);const lock=await pool.connect();await lock.query('begin');await lock.query('select id from public.drawing_sets where id=$1 for update',[ids.set]);
    const consumer=await session();const result=finish(consumer,c).then(()=>null,e=>e);await waiting(consumer);
    await admin.query('update auth.test_access set is_pm=false where user_id=$1',[ids.pm]);await lock.query('commit');lock.release();
    assert.match((await result).message,/ROUND_NOT_AUTHORIZED/);await admin.query('update auth.test_access set is_pm=true where user_id=$1',[ids.pm]);
  });
  await check('publish rechecks workspace membership after revision lock waits',async()=>{
    const lock=await pool.connect();await lock.query('begin');await lock.query('select id from public.drawing_sets where id=$1 for update',[ids.set]);
    const consumer=await session();const result=consumer.query("select public.publish_drawing_revision($1,'released_for_shop')",[ids.revision]).then(()=>null,e=>e);await waiting(consumer);
    await admin.query('update auth.test_access set is_member=false where user_id=$1',[ids.pm]);await lock.query('commit');lock.release();
    assert.match((await result).message,/Not authorized/);await consumer.query('rollback');consumer.release();await admin.query('update auth.test_access set is_member=true where user_id=$1',[ids.pm]);
  });
  console.log(`${checks} independent-session concurrency checks passed`);
}catch(error){console.error(error instanceof Error?error.stack:error);process.exitCode=1;}
finally{admin.release();await pool.end();}
