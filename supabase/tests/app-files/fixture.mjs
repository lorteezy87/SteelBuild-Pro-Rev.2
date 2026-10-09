import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
export const readMigration = name => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
function definition(source, name) {
  const start = source.search(new RegExp(`create or replace function "?public"?\\."?${name}"?\\(`, 'i'));
  assert.notEqual(start,-1,`Missing function ${name}`);
  const tail=source.slice(start), delimiter=tail.match(/\$[a-z_]*\$/i)?.[0];
  assert.ok(delimiter); const first=tail.indexOf(delimiter), last=tail.indexOf(delimiter,first+delimiter.length);
  assert.notEqual(last,-1); return tail.slice(0,last+delimiter.length)+';';
}
export const ids = {
  org:'10000000-0000-4000-8000-000000000001', otherOrg:'10000000-0000-4000-8000-000000000002',
  owner:'20000000-0000-4000-8000-000000000001', member:'20000000-0000-4000-8000-000000000002', outsider:'20000000-0000-4000-8000-000000000003',
  project:'30000000-0000-4000-8000-000000000001', archived:'30000000-0000-4000-8000-000000000002',
  foreign:'30000000-0000-4000-8000-000000000003', missing:'30000000-0000-4000-8000-000000000004',
};
export async function createFixture() {
  const db=new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to authenticated,anon,service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table organizations(id uuid primary key,member_default_project_role text);
    create table organization_members(org_id uuid references organizations(id),user_id uuid,role text,unique(org_id,user_id));
    create table projects(id uuid primary key,org_id uuid references organizations(id),is_deleted boolean default false);
    create table user_projects(project_id uuid references projects(id),user_id uuid,role text,unique(project_id,user_id));
    insert into organizations values('${ids.org}',null),('${ids.otherOrg}',null);
    insert into organization_members values('${ids.org}','${ids.owner}','owner'),('${ids.org}','${ids.member}','member'),('${ids.otherOrg}','${ids.outsider}','owner');
    insert into projects values('${ids.project}','${ids.org}',false),('${ids.archived}','${ids.org}',true),('${ids.foreign}','${ids.otherOrg}',false);
    insert into user_projects values('${ids.project}','${ids.member}','field'),('${ids.archived}','${ids.member}','field');
    alter table projects enable row level security; alter table organization_members enable row level security; alter table user_projects enable row level security;
    grant select on projects,organization_members,user_projects to authenticated;
  `);
  const baseline=await readMigration('20260101000010_baseline_schema.sql');
  const roles=await readMigration('20260819001000_org_member_default_project_access.sql');
  await db.exec(definition(baseline,'user_is_org_member'));
  await db.exec(definition(roles,'user_has_project_access'));
  const admin=()=>db.exec('reset role');
  const asUser=async(user=ids.member,role='authenticated')=>{
    assert.ok(['authenticated','anon','service_role'].includes(role));
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  };
  return {db,admin,asUser};
}
