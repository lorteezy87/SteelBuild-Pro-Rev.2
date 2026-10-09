import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { args, candidate, ids, initialize, projectScope, protectedSnapshot, reserveSql, reset } from './fixture.ts';
import { cases } from './cases.ts';

assert.equal(process.env.APP_FILE_POSTGRES_TEST,'1','Disposable database opt-in required');
const target=new URL(process.env.APP_FILE_POSTGRES_URL ?? '');
assert.ok(['postgres:','postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname),'Loopback fixture only');
assert.equal(target.pathname,'/steelbuild_app_file_reservations_test');
assert.equal(target.search,'','Connection overrides forbidden');
if(process.env.APP_FILE_POSTGRES_CREATE_DB==='1') {
  const controlTarget=new URL(target); controlTarget.pathname='/postgres';
  const control=new pg.Client({connectionString:controlTarget.href}); await control.connect();
  try { await control.query('CREATE DATABASE steelbuild_app_file_reservations_test'); } finally { await control.end(); }
}
const pool=new pg.Pool({connectionString:target.href,max:8,statement_timeout:10000,connectionTimeoutMillis:5000});
const admin=await pool.connect();
const db={exec:(sql:string)=>admin.query(sql),query:(sql:string,values?:unknown[])=>admin.query(sql,values)};
type Receipt={request_id:string;bucket:string;path:string};
async function session(user=ids.pm,aal='aal2',isolation='READ COMMITTED') {
  const client=await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation==='REPEATABLE READ'?'REPEATABLE READ':'READ COMMITTED'}`);
    await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,role:'authenticated',aal})]);
    await client.query('SET LOCAL ROLE authenticated');
    return {client,pid:Number((await client.query('SELECT pg_backend_pid() pid')).rows[0].pid)};
  } catch(error) { await client.query('ROLLBACK');client.release();throw error; }
}
async function finish(client:pg.PoolClient,parameters:unknown[]=args()):Promise<Receipt> {
  try { const result=await client.query(reserveSql,parameters); await client.query('COMMIT'); return result.rows[0].result; }
  catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function waitForLocks(pids:number[]) {
  const deadline=Date.now()+4000;
  while(Date.now()<deadline) {
    await admin.query('SELECT pg_stat_clear_snapshot()');
    const result=await admin.query("SELECT pid FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND state='active' AND wait_event_type='Lock'",[pids]);
    if(result.rows.length===pids.length) return;
    await delay(20);
  }
  throw new Error('Expected independent waiting PostgreSQL sessions');
}
const count=async()=>Number((await admin.query('SELECT count(*) n FROM steelbuild_storage.object_bindings')).rows[0].n);
async function contention(lockSql:string,parameters:unknown[][],change?:()=>Promise<unknown>,user=ids.pm,aal='aal2') {
  await admin.query('BEGIN'); await admin.query(lockSql);
  const sessions=await Promise.all(parameters.map(()=>session(user,aal)));
  assert.equal(new Set(sessions.map(s=>s.pid)).size,sessions.length);
  const pending=Promise.allSettled(sessions.map((s,i)=>finish(s.client,parameters[i])));
  try { await waitForLocks(sessions.map(s=>s.pid)); if(change) await change(); await admin.query('COMMIT'); return await pending; }
  catch(error) { await admin.query('ROLLBACK'); await pending; throw error; }
}
function rejected(results:PromiseSettledResult<Receipt>[],message:RegExp) {
  assert.ok(results.every(result=>result.status==='rejected' && message.test(String(result.reason))),JSON.stringify(results));
}
let passed=0;
async function check(name:string,run:()=>Promise<void>) { await reset(db);await run();passed++;console.log(`PASS concurrent ${name}`); }
try {
  assert.equal(Number((await admin.query("SELECT count(*) n FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")).rows[0].n),0,'Refusing populated database');
  await initialize(db); await reset(db);
  const before=await protectedSnapshot(db);
  await admin.query(await readFile(candidate,'utf8'));
  assert.deepEqual(await protectedSnapshot(db),before,'Candidate must preserve existing Storage policies and objects');
  await cases(db);
  const orgLock=`SELECT id FROM organizations WHERE id='${ids.org}' FOR UPDATE`;
  const projectLock=`SELECT id FROM projects WHERE id='${ids.project}' FOR UPDATE`;
  await check('four identical concurrent requests return one exact durable receipt',async()=> {
    const result=await contention(orgLock,[args(),args(),args(),args()]);
    assert.ok(result.every(r=>r.status==='fulfilled'));
    const receipts=result.map(r=>(r as PromiseFulfilledResult<Receipt>).value);
    assert.equal(new Set(receipts.map(r=>r.path)).size,1);assert.equal(await count(),1);
  });
  await check('concurrent conflicting payload has one winner and cannot replace its receipt',async()=> {
    const result=await contention(orgLock,[args(),args(ids.request,projectScope,'documents','pdf')]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    const failure=result.find(r=>r.status==='rejected') as PromiseRejectedResult;
    assert.match(String(failure.reason),/FILE_RESERVATION_CONFLICT/);assert.equal(await count(),1);
  });
  for(const [label,lock,change,aal] of [
    ['workspace membership revocation',orgLock,`DELETE FROM organization_members WHERE user_id='${ids.pm}'`,'aal2'],
    ['project grant revocation',projectLock,`DELETE FROM user_projects WHERE user_id='${ids.pm}'`,'aal2'],
    ['PM downgrade',projectLock,`UPDATE user_projects SET role='field' WHERE user_id='${ids.pm}'`,'aal2'],
    ['project archive',projectLock,`UPDATE projects SET is_deleted=true WHERE id='${ids.project}'`,'aal2'],
    ['verified MFA enrollment',orgLock,`INSERT INTO auth.mfa_factors(user_id,status) VALUES('${ids.pm}','verified')`,'aal1'],
    ['Auth identity deletion',orgLock,`DELETE FROM auth.users WHERE id='${ids.pm}'`,'aal2'],
  ]) await check(`${label} during a parent wait rejects the reservation`,async()=> {
    rejected(await contention(lock,[args()],()=>admin.query(change),ids.pm,aal),/FILE_RESERVATION_(NOT_AUTHORIZED|MFA_REQUIRED)/);
    assert.equal(await count(),0);
  });
  await check('default project role is refreshed after the organization lock',async()=> {
    await admin.query(`DELETE FROM user_projects WHERE user_id='${ids.field}';UPDATE organizations SET member_default_project_role='field' WHERE id='${ids.org}'`);
    rejected(await contention(orgLock,[args(ids.request,projectScope,'documents','pdf')],()=>admin.query(`UPDATE organizations SET member_default_project_role='viewer' WHERE id='${ids.org}'`),ids.field),/FILE_RESERVATION_NOT_AUTHORIZED/);
    assert.equal(await count(),0);
  });
  for(const [label,change,aal] of [
    ['workspace membership',`DELETE FROM organization_members WHERE user_id='${ids.pm}'`,'aal2'],
    ['project role',`UPDATE user_projects SET role='viewer' WHERE user_id='${ids.pm}'`,'aal2'],
    ['MFA enrollment',`INSERT INTO auth.mfa_factors(user_id,status) VALUES('${ids.pm}','verified')`,'aal1'],
  ]) await check(`exact receipt retry rechecks ${label} after its row wait`,async()=> {
    await finish((await session(ids.pm,aal)).client);
    rejected(await contention('SELECT * FROM steelbuild_storage.object_bindings FOR UPDATE',[args()],()=>admin.query(change),ids.pm,aal),/FILE_RESERVATION_(NOT_AUTHORIZED|MFA_REQUIRED)/);
    assert.equal(await count(),1);
  });
  await check('receipt retry observes a floor raised while waiting',async()=> {
    const parameters=args(ids.request,projectScope,'documents','pdf');
    await finish((await session(ids.field)).client,parameters);
    rejected(await contention('SELECT * FROM steelbuild_storage.object_bindings FOR UPDATE',[parameters],()=>admin.query("UPDATE steelbuild_storage.object_bindings SET write_role_floor='pm'"),ids.field),/FILE_RESERVATION_NOT_AUTHORIZED/);
    assert.equal(await count(),1);
  });
  await check('foreign-org conflicting retry never changes the original receipt',async()=> {
    await admin.query(`INSERT INTO organization_members VALUES('${ids.otherOrg}','${ids.pm}','owner')`);
    const requests=[args(),args(ids.request,{kind:'project',orgId:ids.otherOrg,projectId:ids.otherProject})];
    const sessions=await Promise.all(requests.map(()=>session()));
    const result=await Promise.allSettled(sessions.map((s,i)=>finish(s.client,requests[i])));
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.match(String((result.find(r=>r.status==='rejected') as PromiseRejectedResult).reason),/FILE_RESERVATION_CONFLICT/);
    assert.equal(await count(),1);
  });
  await check('pinned snapshot is rejected before returning an old receipt',async()=> {
    await finish((await session()).client);
    const s=await session(ids.pm,'aal2','REPEATABLE READ'); await s.client.query('SELECT count(*) FROM projects');
    await assert.rejects(finish(s.client),{code:'40001'});assert.equal(await count(),1);
  });
  console.log(`${passed} independent-session file reservation checks passed`);
} finally { admin.release();await pool.end(); }
