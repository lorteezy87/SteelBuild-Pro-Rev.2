import assert from 'node:assert/strict';

export const org = 'ca090000-0000-4000-8000-000000000001';
export const owner = 'ca090000-0000-4000-8000-000000000002';
export const member = 'ca090000-0000-4000-8000-000000000003';
export const other = 'ca090000-0000-4000-8000-000000000004';
export type Query = (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export async function fixture(query: Query, plan = 'free') {
  await query('reset role');
  await query("select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','',false)");
  await query('truncate public.organizations cascade');
  await query("insert into organizations(id,plan) values($1,$2),($3,'free')", [org,plan,other]);
  await query("insert into organization_members(org_id,user_id,role) values($1,$2,'owner'),($1,$3,'member')", [org,owner,member]);
}
export async function claims(query: Query, user = owner, role = 'authenticated', privileged = false) {
  await query('reset role');
  await query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false)", [user,role]);
  if (!privileged) await query(role === 'service_role' ? 'set role service_role' : 'set role authenticated');
}
export async function cases(query: Query) {
  let passed = 0;
  const check = async (name: string, run: () => Promise<void>, plan = 'free') => {
    await fixture(query,plan); await run(); passed++; console.log(`PASS ${name}`);
  };
  const count = async () => Number((await query('select count(*) count from projects')).rows[0].count);
  const rpc = (name = 'Project', extra: Record<string,unknown> = {}) => query('select create_project($1::jsonb) result', [JSON.stringify({name,org_id:org,...extra})]);
  await check('authenticated direct insert cannot bypass the Free project limit', async () => {
    await claims(query); await rpc();
    await assert.rejects(query("insert into projects(org_id,name) values($1,'Bypass')",[org]),/PROJECT_PLAN_LIMIT/);
    assert.equal(await count(),1);
  });
  await check('RPC keeps live payload fields and creator/admin membership', async () => {
    await query("insert into organization_members(org_id,user_id,role) values($1,$2,'admin')",[org,other]);
    await claims(query,member);
    const result = (await rpc('  Trim me  ',{job_type:'structural',joist_manufacturer:'Test joists',deck_manufacturer:'Test deck',metadata:{reviewed:true},retainage_percent:5})).rows[0].result as Record<string,unknown>;
    assert.equal(result.name,'Trim me'); assert.equal(result.job_type,'structural');
    assert.equal(result.joist_manufacturer,'Test joists'); assert.equal(result.deck_manufacturer,'Test deck');
    assert.equal(Number(result.retainage_percent),5); assert.deepEqual(result.metadata,{reviewed:true});
    const roles = (await query('select user_id,role from user_projects order by user_id')).rows;
    assert.deepEqual(roles,[{user_id:owner,role:'owner'},{user_id:member,role:'owner'},{user_id:other,role:'admin'}]);
  });
  await check('Pro permits ten active projects and denies the eleventh', async () => {
    await claims(query); for(let i=0;i<10;i++) await rpc(`Project ${i}`);
    await assert.rejects(rpc('Eleventh'),/limited to 10/); assert.equal(await count(),10);
  },'pro');
  for(const plan of ['business','enterprise']) await check(`${plan} preserves unlimited projects`, async () => {
    await claims(query); for(let i=0;i<12;i++) await rpc(`Project ${i}`); assert.equal(await count(),12);
  },plan);
  await check('unknown plans retain the existing fail-closed Free limit', async () => {
    await claims(query); await rpc(); await assert.rejects(rpc('Extra'),/limited to 1/);
  },'unknown');
  await check('archived projects consume no slot and privileged restoration consumes one', async () => {
    const archived=(await query("insert into projects(org_id,name,is_deleted) values($1,'Archive',true) returning id",[org])).rows[0].id;
    await claims(query,owner,'authenticated',true);
    await query('update projects set is_deleted=false where id=$1',[archived]);
    await assert.rejects(query("insert into projects(org_id,name) values($1,'Extra')",[org]),/PROJECT_PLAN_LIMIT/);
  });
  await check('restoring at capacity fails without changing the archived row', async () => {
    await query("insert into projects(org_id,name,is_deleted) values($1,'Active',false),($1,'Archive',true)",[org]);
    await assert.rejects(query("update projects set is_deleted=false where name='Archive'"),/PROJECT_PLAN_LIMIT/);
    assert.equal((await query("select is_deleted from projects where name='Archive'")).rows[0].is_deleted,true);
  });
  await check('privileged execution cannot restore for an authenticated non-admin', async () => {
    await query("insert into projects(org_id,name,is_deleted) values($1,'Archive',true)",[org]);
    await claims(query,member,'authenticated',true);
    await assert.rejects(query('update projects set is_deleted=false'),/Restoring a project requires an admin/);
  });
  await check('privileged execution still checks the authenticated workspace', async () => {
    await claims(query,owner,'authenticated',true);
    await assert.rejects(query("insert into projects(org_id,name) values($1,'Other workspace')",[other]),/PROJECT_PLAN_NOT_AUTHORIZED/);
  });
  for(const role of ['service_role','maintenance']) await check(`${role} writes obey project capacity`, async () => {
    if(role==='service_role') await claims(query,owner,'service_role');
    await query("insert into projects(org_id,name) values($1,'Allowed')",[org]);
    await query("select set_config('app.project_limit_bypass','on',false),set_config('steelbuild.project_limit_bypass','on',false)");
    await assert.rejects(query("insert into projects(org_id,name) values($1,'Bypass')",[org]),/PROJECT_PLAN_LIMIT/);
  });
  await check('multirow insert cannot exceed capacity and rolls back all rows', async () => {
    await claims(query);
    await assert.rejects(query("insert into projects(org_id,name) values($1,'One'),($1,'Two')",[org]),/PROJECT_PLAN_LIMIT/);
    assert.equal(await count(),0);
  });
  await check('multirow restore cannot exceed capacity and rolls back all rows', async () => {
    await query("insert into projects(org_id,name,is_deleted) values($1,'One',true),($1,'Two',true)",[org]);
    await assert.rejects(query('update projects set is_deleted=false'),/PROJECT_PLAN_LIMIT/);
    assert.equal(Number((await query('select count(*) count from projects where is_deleted')).rows[0].count),2);
  });
  await check('existing projects remain editable and archivable after a downgrade', async () => {
    await query("insert into projects(org_id,name) values($1,'One'),($1,'Two')",[org]);
    await query("update organizations set plan='free' where id=$1",[org]);
    await query("update projects set name=name||' edited'");
    await query("update projects set is_deleted=true where name='One edited'");
    await assert.rejects(query("insert into projects(org_id,name) values($1,'Extra')",[org]),/PROJECT_PLAN_LIMIT/);
  },'business');
  await check('NULL deletion state counts as active exactly as before', async () => {
    await query("insert into projects(org_id,name,is_deleted) values($1,'Legacy',null)",[org]);
    await assert.rejects(query("insert into projects(org_id,name) values($1,'Extra')",[org]),/PROJECT_PLAN_LIMIT/);
  });
  await check('privileged transfer must fit the destination capacity', async () => {
    await query("insert into projects(org_id,name) values($1,'Source'),($2,'Destination')",[org,other]);
    await assert.rejects(query('update projects set org_id=$1 where org_id=$2',[other,org]),/PROJECT_PLAN_LIMIT/);
  });
  await check('table trigger cannot be called as an authenticated public RPC', async () => {
    await claims(query);
    await assert.rejects(query('select public.enforce_project_plan_limit()'),/permission denied/);
  });
  await check('snapshot isolation cannot bypass an admission count',async()=> {
    await query('begin isolation level repeatable read');
    try {
      await assert.rejects(query("insert into projects(org_id,name) values($1,'Stale snapshot')",[org]),/PROJECT_PLAN_ISOLATION/);
    } finally { await query('rollback'); }
    assert.equal(await count(),0);
  });
  console.log(`${passed} project capacity behavioral checks passed`);
}
