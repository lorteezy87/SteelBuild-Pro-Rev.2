import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { cases, fixture, org, owner, member, other } from './cases.ts';

assert.equal(process.env.PROJECT_LIMIT_POSTGRES_TEST,'1','Disposable fixture opt-in required');
const target = new URL(process.env.PROJECT_LIMIT_POSTGRES_URL ?? '');
assert.ok(['postgres:','postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname),'Loopback only');
assert.equal(target.pathname,'/steelbuild_project_limits_test');
assert.equal(target.search,'','No connection overrides');
if(process.env.PROJECT_LIMIT_POSTGRES_CREATE_DB==='1') {
  const controlTarget = new URL(target); controlTarget.pathname='/postgres';
  const control = new pg.Client({connectionString:controlTarget.href}); await control.connect();
  try { await control.query('create database steelbuild_project_limits_test'); } finally { await control.end(); }
}
const pool = new pg.Pool({connectionString:target.href,max:8,statement_timeout:10000,connectionTimeoutMillis:5000});
const admin = await pool.connect();
let passed=0;
type Command = {text:string;values:unknown[]};
const create = (name:string):Command => ({text:'select public.create_project($1::jsonb) result',values:[JSON.stringify({name,org_id:org})]});
const insert = (name:string,workspace=org):Command => ({text:'insert into projects(org_id,name) values($1,$2) returning id',values:[workspace,name]});
const restore = (name:string):Command => ({text:'update projects set is_deleted=false where name=$1 returning id',values:[name]});
async function session(user=owner,privileged=false) {
  const client=await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[user]);
    if(!privileged) await client.query('set local role authenticated');
    return {client,pid:(await client.query('select pg_backend_pid() pid')).rows[0].pid};
  } catch(error) { await client.query('rollback'); client.release(); throw error; }
}
async function finish(client:pg.PoolClient,command:Command) {
  try { const result=await client.query(command); await client.query('commit'); return result.rows; }
  catch(error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
async function execute(command:Command,privileged=false,user=owner) { return finish((await session(user,privileged)).client,command); }
async function waitForLock(pids:number[]) {
  const deadline=Date.now()+4000;
  while(Date.now()<deadline) {
    await admin.query('select pg_stat_clear_snapshot()');
    const {rows}=await admin.query("select pid from pg_stat_activity where pid=any($1::int[]) and state='active' and wait_event_type='Lock'",[pids]);
    if(rows.length===pids.length) return;
    await delay(20);
  }
  throw new Error('Expected independent PostgreSQL sessions to wait on the parent organization');
}
async function check(name:string,run:()=>Promise<void>,plan='free') {
  await fixture((sql,values)=>admin.query(sql,values),plan); await run(); passed++; console.log(`PASS concurrent ${name}`);
}
async function contend(commands:Command[],changeBeforeCommit?:()=>Promise<unknown>,user=owner) {
  await admin.query('begin');
  await admin.query('select id from organizations where id=$1 for update',[org]);
  const sessions=await Promise.all(commands.map(()=>session(user)));
  assert.equal(new Set(sessions.map(s=>s.pid)).size,commands.length);
  const pending=Promise.allSettled(sessions.map((s,i)=>finish(s.client,commands[i])));
  try {
    await waitForLock(sessions.map(s=>s.pid));
    if(changeBeforeCommit) await changeBeforeCommit();
    await admin.query('commit'); return await pending;
  } catch(error) { await admin.query('rollback'); await pending; throw error; }
}
function oneWinner(results:PromiseSettledResult<unknown>[]) {
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const failure=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
  assert.match(String(failure.reason),/PROJECT_PLAN_LIMIT|limited to 1|PROJECT_PLAN_BUSY/);
}
try {
  assert.equal(Number((await admin.query("select count(*) count from pg_tables where schemaname not in ('pg_catalog','information_schema')")).rows[0].count),0,'Refusing populated database');
  for(const path of ['./fixture.sql','./live-functions.sql','../../migrations/20261009140000_enforce_project_plan_limits.sql']) {
    await admin.query(await readFile(new URL(path,import.meta.url),'utf8'));
  }
  await cases((sql,values)=>admin.query(sql,values));
  for(const [name,commands] of [
    ['two RPC creates have one winner',[create('One'),create('Two')]],
    ['two direct inserts have one winner',[insert('One'),insert('Two')]],
    ['RPC and direct insert share one capacity boundary',[create('One'),insert('Two')]],
  ] as [string,Command[]][]) await check(name,async()=> {
    oneWinner(await contend(commands));
    assert.equal(Number((await admin.query('select count(*) count from projects')).rows[0].count),1);
    assert.ok(Number((await admin.query('select count(*) count from user_projects')).rows[0].count)<=1,'No losing RPC memberships survive');
  });
  for(const mode of ['RPC','direct']) await check(`${mode} rereads downgraded plan after its parent wait`,async()=> {
    await admin.query("insert into projects(org_id,name) values($1,'Existing')",[org]);
    const results=await contend([mode==='RPC'?create('New'):insert('New')],()=>admin.query("update organizations set plan='free' where id=$1",[org]));
    assert.equal(results[0].status,'rejected'); assert.match(String((results[0] as PromiseRejectedResult).reason),/PROJECT_PLAN_LIMIT|limited to 1/);
  },'pro');
  for(const mode of ['RPC','direct']) await check(`${mode} rejects membership revoked during its parent wait`,async()=> {
    const results=await contend([mode==='RPC'?create('New'):insert('New')],()=>admin.query('delete from organization_members where org_id=$1 and user_id=$2',[org,member]),member);
    assert.equal(results[0].status,'rejected'); assert.match(String((results[0] as PromiseRejectedResult).reason),/PROJECT_PLAN_NOT_AUTHORIZED/);
    assert.equal(Number((await admin.query('select count(*) count from projects')).rows[0].count),0);
  });
  await check('restoration refuses a parent lock inversion immediately and can retry',async()=> {
    await admin.query("insert into projects(org_id,name,is_deleted) values($1,'Archive',true)",[org]);
    await admin.query('begin'); await admin.query('select id from organizations where id=$1 for update',[org]);
    try { await assert.rejects(execute(restore('Archive'),true),{code:'55P03'}); }
    finally { await admin.query('commit'); }
    await execute(restore('Archive'),true);
  });
  await check('two restores admit exactly one project',async()=> {
    await admin.query("insert into projects(org_id,name,is_deleted) values($1,'One',true),($1,'Two',true)",[org]);
    const results=await Promise.allSettled([execute(restore('One'),true),execute(restore('Two'),true)]); oneWinner(results);
    assert.equal(Number((await admin.query('select count(*) count from projects where not is_deleted')).rows[0].count),1);
    const archived=(await admin.query('select name from projects where is_deleted')).rows[0].name;
    await assert.rejects(execute(restore(archived),true),/PROJECT_PLAN_LIMIT/);
  });
  await check('restore/create contention cannot consume two last slots',async()=> {
    await admin.query("insert into projects(org_id,name,is_deleted) values($1,'Archive',true)",[org]);
    await admin.query('begin'); await admin.query('select id from organizations where id=$1 for update',[org]);
    const s=await session(); const pending=finish(s.client,create('New'));
    try { await waitForLock([s.pid]); await assert.rejects(execute(restore('Archive'),true),{code:'55P03'}); }
    finally { await admin.query('commit'); }
    await pending; await assert.rejects(execute(restore('Archive'),true),/PROJECT_PLAN_LIMIT/);
  });
  await check('create waits for an uncommitted restoration then observes capacity',async()=> {
    await admin.query("insert into projects(org_id,name,is_deleted) values($1,'Archive',true)",[org]);
    const restoring=await session(owner,true); await restoring.client.query(restore('Archive'));
    const creating=await session(); const pending=Promise.allSettled([finish(creating.client,create('New'))]);
    try { await waitForLock([creating.pid]); } finally { await restoring.client.query('commit'); restoring.client.release(); }
    const results=await pending; assert.equal(results[0].status,'rejected'); assert.match(String((results[0] as PromiseRejectedResult).reason),/limited to 1/);
  });
  await check('an unrelated workspace remains writable during parent contention',async()=> {
    await admin.query("insert into organization_members(org_id,user_id,role) values($1,$2,'owner')",[other,owner]);
    await admin.query('begin'); await admin.query('select id from organizations where id=$1 for update',[org]);
    try { await execute(insert('Independent',other)); } finally { await admin.query('commit'); }
  });
  console.log(`${passed} independent-session project capacity checks passed`);
} finally { admin.release(); await pool.end(); }
