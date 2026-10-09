import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { cases, org, owner } from './cases.ts';

const db = new PGlite();
try {
  await db.exec(await readFile(new URL('./fixture.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('./live-functions.sql', import.meta.url), 'utf8'));
  if (process.env.PROJECT_LIMIT_REPRO !== '1') {
    await db.exec(await readFile(new URL('../../migrations/20261009140000_enforce_project_plan_limits.sql', import.meta.url), 'utf8'));
  }
  await db.query("insert into organizations(id,plan) values($1,'free')", [org]);
  await db.query("insert into organization_members(org_id,user_id,role) values($1,$2,'owner')", [org,owner]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");
  await db.query("select create_project($1::jsonb)", [JSON.stringify({name:'One allowed project',org_id:org})]);
  await assert.rejects(db.query("insert into projects(org_id,name) values($1,'Quota bypass')", [org]), /PROJECT_PLAN_LIMIT/);
  console.log('PASS authenticated direct insert cannot bypass the Free project limit');
  await cases((sql, values) => db.query(sql,values));
} finally { await db.close(); }
