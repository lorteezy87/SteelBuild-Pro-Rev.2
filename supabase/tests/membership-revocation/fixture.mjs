import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const readMigration = name => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');

// Execute the shipped definitions rather than reproducing their authorization
// logic in a test double. Both quoted baseline and later unquoted SQL occur.
function functionDefinition(source, name) {
  const start = source.search(new RegExp(`create or replace function "?public"?\\."?${name}"?\\(`, 'i'));
  assert.notEqual(start, -1, `Missing shipped function ${name}`);
  const tail = source.slice(start);
  const delimiter = tail.match(/\$[a-z_]*\$/i)?.[0];
  assert.ok(delimiter, `Missing body delimiter for ${name}`);
  const first = tail.indexOf(delimiter);
  const last = tail.indexOf(delimiter, first + delimiter.length);
  assert.notEqual(last, -1, `Unterminated body for ${name}`);
  return tail.slice(0, last + delimiter.length) + ';';
}

export const ids = {
  org: '10000000-0000-4000-8000-000000000001',
  otherOrg: '10000000-0000-4000-8000-000000000002',
  owner: '20000000-0000-4000-8000-000000000001',
  member: '20000000-0000-4000-8000-000000000002',
  outsider: '20000000-0000-4000-8000-000000000003',
  project: '30000000-0000-4000-8000-000000000001',
  archived: '30000000-0000-4000-8000-000000000002',
  foreign: '30000000-0000-4000-8000-000000000003',
  missing: '30000000-0000-4000-8000-000000000004',
};

export async function createFixture() {
  const db = new PGlite();
  const [baseline, roles, guard, archive, census] = await Promise.all([
    readMigration('20260101000010_baseline_schema.sql'),
    readMigration('20260819001000_org_member_default_project_access.sql'),
    readMigration('20260914010000_close_viewer_write_and_definer_gaps.sql'),
    readMigration('20260914120000_adopt_production_soft_delete_project.sql'),
    readMigration('20260927150000_erasure_census_admits_project_admins.sql'),
  ]);
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    grant usage on schema auth to authenticated, anon, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    $$;
    create table public.organizations(id uuid primary key, member_default_project_role text);
    create table public.organization_members(org_id uuid references organizations(id), user_id uuid, role text, unique(org_id,user_id));
    create table public.projects(id uuid primary key, org_id uuid references organizations(id), is_deleted boolean default false,
      deleted_at timestamptz, original_contract_value numeric, retainage_percent numeric, contingency_amount numeric,
      contract_type text, project_number text);
    create table public.user_projects(project_id uuid references projects(id), user_id uuid, role text, unique(project_id,user_id));
    create table public.project_data(project_id uuid references projects(id), detail text);
    insert into organizations values ('${ids.org}','viewer'),('${ids.otherOrg}','viewer');
    insert into organization_members values ('${ids.org}','${ids.owner}','owner'),('${ids.org}','${ids.member}','member'),('${ids.otherOrg}','${ids.outsider}','owner');
    insert into projects(id,org_id,is_deleted) values ('${ids.project}','${ids.org}',false),('${ids.archived}','${ids.org}',true),('${ids.foreign}','${ids.otherOrg}',false);
    insert into user_projects values ('${ids.project}','${ids.member}','admin'),('${ids.archived}','${ids.member}','admin');
    insert into project_data values ('${ids.archived}','Retained project evidence');
    alter table projects enable row level security;
    alter table organization_members enable row level security;
    alter table user_projects enable row level security;
    grant select on projects, organization_members, user_projects to authenticated;
  `);
  for (const name of ['user_has_project_access', 'user_has_project_role_at_least', 'get_my_project_role']) {
    await db.exec(functionDefinition(roles, name));
  }
  for (const name of ['user_has_project_role', 'user_is_project_admin']) {
    await db.exec(functionDefinition(baseline, name));
  }
  await db.exec(functionDefinition(guard, 'enforce_project_update_guard'));
  await db.exec(archive);
  await db.exec(census);
  await db.exec(`
    create trigger enforce_project_update before update on projects for each row execute function enforce_project_update_guard();
    create policy project_select on projects for select to authenticated using (public.user_has_project_access(id));
    revoke all on function public.user_has_project_access(uuid), public.user_has_project_role_at_least(uuid,text),
      public.get_my_project_role(uuid), public.user_has_project_role(uuid,text), public.user_is_project_admin(uuid),
      public.soft_delete_project(uuid), public.project_row_counts(uuid) from public, anon, service_role;
    grant execute on function public.user_has_project_access(uuid), public.user_has_project_role_at_least(uuid,text),
      public.get_my_project_role(uuid), public.user_has_project_role(uuid,text), public.user_is_project_admin(uuid),
      public.soft_delete_project(uuid), public.project_row_counts(uuid) to authenticated;
  `);
  const admin = () => db.exec('reset role');
  const asUser = async (user = ids.member, role = 'authenticated') => {
    assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, role })]);
  };
  return { db, admin, asUser };
}
