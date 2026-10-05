import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const readMigration = (name) => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
const roles = await readMigration('20260819001000_org_member_default_project_access.sql');
const census = await readMigration('20260927150000_erasure_census_admits_project_admins.sql');
const erasure = await readMigration('20260927160000_account_deletion_releases_authorship.sql');
const db = new PGlite();
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const admin = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const org = '0a000000-0000-4000-8000-000000000001';
const project = '0b000000-0000-4000-8000-000000000001';

// Load the shipped authorization helpers, including the legacy explicit-role
// branch that accepts user_projects after workspace membership is removed.
function roleFunction(name) {
  const start = roles.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `missing shipped helper ${name}`);
  return roles.slice(start, roles.indexOf('$$;', start) + 3);
}

async function asUser(id) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: 'authenticated' })]);
}

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
  `);
  await db.exec(`
    create table public.organizations (id uuid primary key, created_by uuid references auth.users(id), member_default_project_role text);
    create table public.organization_members (org_id uuid references organizations(id) on delete cascade, user_id uuid references auth.users(id), role text);
    create table public.projects (id uuid primary key, org_id uuid references organizations(id), is_deleted boolean);
    create table public.user_projects (project_id uuid references projects(id), user_id uuid references auth.users(id), role text);
    create table public.project_data (project_id uuid references projects(id), detail text);
    insert into auth.users values ('${owner}'), ('${admin}');
    insert into organizations values ('${org}', '${owner}', 'viewer');
    insert into organization_members values ('${org}', '${owner}', 'owner'), ('${org}', '${admin}', 'member');
    insert into projects values ('${project}', '${org}', true);
    insert into user_projects values ('${project}', '${admin}', 'admin');
    insert into project_data values ('${project}', 'confidential project row');
  `);
  await db.exec(roleFunction('user_has_project_access'));
  await db.exec(roleFunction('user_has_project_role_at_least'));
  await db.exec(census);
  await asUser(admin);
  assert.equal((await db.query('select project_row_counts($1) counts', [project])).rows[0].counts.project_data, 1,
    'a current project admin can census an archived project');
  await db.query('delete from organization_members where user_id=$1', [admin]);
  assert.equal((await db.query("select user_has_project_role_at_least($1, 'admin') allowed", [project])).rows[0].allowed, true,
    'fixture must reproduce the stale explicit-role helper result');
  for (const archived of [true, false]) {
    await db.query('update projects set is_deleted=$1 where id=$2', [archived, project]);
    await assert.rejects(db.query('select project_row_counts($1)', [project]), /Not authorized/,
      `removed workspace member must not census an ${archived ? 'archived' : 'active'} project`);
  }
  await asUser(owner);
  await db.query('update projects set is_deleted=true where id=$1', [project]);
  assert.equal((await db.query('select project_row_counts($1) counts', [project])).rows[0].counts.project_data, 1,
    'workspace owners retain erasure census access');
  await db.query('insert into organization_members values ($1, $2, $3)', [org, admin, 'member']);
  await db.query("update user_projects set role='viewer' where user_id=$1", [admin]);
  await asUser(admin);
  await assert.rejects(db.query('select project_row_counts($1)', [project]), /Not authorized/,
    'workspace membership alone does not admit an archived-project viewer');
  await db.query('update projects set is_deleted=false where id=$1', [project]);
  assert.equal((await db.query('select project_row_counts($1) counts', [project])).rows[0].counts.project_data, 1,
    'active-project visibility remains available to an authorized viewer');
  await db.query('delete from organization_members where user_id=$1', [admin]);
  await db.exec(erasure);
  const { rows } = await db.query("select proconfig from pg_proc where oid='public.erase_my_sole_member_workspaces(text)'::regprocedure");
  assert.ok(rows[0].proconfig.includes('statement_timeout=60s'),
    'PostgREST must receive the extended timeout in the RPC catalog before it starts the main query');
  assert.deepEqual((await db.query("select public.erase_my_sole_member_workspaces('Account deletion regression test') result")).rows[0].result,
    { org_ids: [], project_ids: [] }, 'a removed member cannot erase the workspace');
  assert.equal((await db.query('select count(*)::int n from organizations')).rows[0].n, 1);
  console.log('PASS: archived admin/owner census, removed admin denied, viewer archive boundary, removed member cannot erase, and RPC timeout catalog contract.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
