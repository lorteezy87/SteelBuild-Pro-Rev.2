import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { initialize, candidateUrl, ids, actor, request, execute, path, zoneA, zoneB, type Database } from './fixture.ts';
import { runCases, snapshot, tables } from './cases.ts';

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
const db=database(admin),candidate=await readFile(candidateUrl,'utf8');
async function reset(){
  await admin.query('drop schema if exists public,auth,storage,steelbuild_security,extensions,steelbuild_workflow,steelbuild_drawing_revision cascade;create schema public');
  await initialize(db);await db.exec(candidate);
}
async function session(){const c=await connect();await actor(database(c));await c.query('begin;set local role authenticated');return c;}
async function finish(c:pg.PoolClient,p:Awaited<ReturnType<typeof request>>,key=randomUUID()){
  try{const result=await execute(database(c),p,key);await c.query('commit');return result;}
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
  await initialize(db);await db.exec(candidate);console.log(`${await runCases(db)} actual PostgreSQL behavioral checks passed`);
  await check('same request waits then returns exact committed receipt once',async()=>{
    const p=await request(db),key=randomUUID(),a=await session(),b=await session();
    const first=await execute(database(a),p,key),second=finish(b,p,key);await waiting(b);await a.query('commit');a.release();
    assert.deepEqual(await second,first);assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
    assert.equal((await admin.query('select count(*)::int n from public.drawing_revisions where drawing_id=$1',[ids.drawing])).rows[0].n,2);
  });
  await check('different requests cannot split the same set and stale loser fails after commit',async()=>{
    const p=await request(db),a=await session();await execute(database(a),p,randomUUID());
    await assert.rejects(finish(await session(),p),/DRAWING_REVISION_BUSY/);await a.query('commit');a.release();
    await assert.rejects(finish(await session(),p),/DRAWING_REVISION_STALE/);
    assert.equal((await admin.query('select count(*)::int n from steelbuild_drawing_revision.requests')).rows[0].n,1);
  });
  for(const field of ['is_member','is_pm','mfa_satisfied'])for(const replay of [false,true])
    await check(`${field} revoked during advisory wait denies ${replay?'receipt replay':'new write'}`,async()=>{
      const p=await request(db),key=randomUUID();if(replay)await finish(await session(),p,key);
      const before=await snapshot(db),lock=await connect();await lock.query('begin');
      await lock.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`drawing-set-revision:${ids.pm}:${key}`]);
      const c=await session(),outcome=finish(c,p,key).then(()=>null,e=>e);await waiting(c);
      await admin.query(`update auth.test_access set ${field}=false where user_id=$1`,[ids.pm]);await lock.query('commit');lock.release();
      assert.match((await outcome).message,/NOT_AUTHORIZED/);assert.deepEqual(await snapshot(db),before);
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
    await admin.query(`insert into public.drawing_holds select gen_random_uuid(),$1,$2,false from generate_series(1,1000)`,[ids.project,ids.drawing]);
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
    const fingerprints=async()=>Promise.all(tables.map(async table=>(await admin.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text) digest from ${table} t`)).rows[0].digest));
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
