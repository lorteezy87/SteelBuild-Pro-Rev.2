import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../', import.meta.url);
export const readMigration = (name) => readFile(new URL(`migrations/${name}`, root), 'utf8');
export function functionDefinition(source, name) {
  const start = source.search(new RegExp(`create or replace function (?:"public"|public)\\.(?:"${name}"|${name})\\(`, 'i'));
  assert.notEqual(start, -1, `Missing SQL function ${name}`);
  const tail = source.slice(start);
  const delimiter = tail.match(/\$[a-z_]*\$/i)?.[0];
  assert.ok(delimiter, `Missing body delimiter for ${name}`);
  const first = tail.indexOf(delimiter);
  const last = tail.indexOf(delimiter, first + delimiter.length);
  assert.notEqual(last, -1);
  return tail.slice(0, last + delimiter.length) + ';';
}
function tableDefinition(source, name) {
  const start = source.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`);
  assert.notEqual(start, -1, `Missing table ${name}`);
  return source.slice(start, source.indexOf('\n);', start) + 3);
}
export const ids = {
  org: '10000000-0000-4000-8000-000000000001',
  otherOrg: '10000000-0000-4000-8000-000000000002',
  emptyOrg: '10000000-0000-4000-8000-000000000003',
  owner: '20000000-0000-4000-8000-000000000001',
  member: '20000000-0000-4000-8000-000000000002',
  outsider: '20000000-0000-4000-8000-000000000003',
  project: '30000000-0000-4000-8000-000000000001',
  archived: '30000000-0000-4000-8000-000000000002',
  foreign: '30000000-0000-4000-8000-000000000003',
  submittal: '40000000-0000-4000-8000-000000000001',
  foreignSubmittal: '40000000-0000-4000-8000-000000000002',
  drawing: '50000000-0000-4000-8000-000000000001',
  revision: '60000000-0000-4000-8000-000000000001',
};

export async function createFixture() {
  const db = new PGlite();
  const baseline = await readMigration('20260101000010_baseline_schema.sql');
  const roles = await readMigration('20260819001000_org_member_default_project_access.sql');
  const capture = await readFile(new URL('_capture/production-public-functions-2026-09-15.sql', root), 'utf8');
  await db.exec(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create function extensions.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
    grant usage on schema auth, extensions to authenticated, anon, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    $$;
  `);
  for (const table of ['organizations', 'organization_members', 'projects', 'user_projects', 'user_profiles',
    'submittals', 'submittal_rounds', 'submittal_sheet_responses', 'submittal_activity', 'drawings', 'drawing_revisions']) {
    await db.exec(tableDefinition(baseline, table));
    await db.exec(`alter table public.${table} add primary key(id)`);
  }
  await db.exec(`
    alter table organizations add column member_default_project_role text default 'viewer';
    alter table user_projects add unique(user_id,project_id);
    alter table organization_members add unique(org_id,user_id);
    alter table projects add foreign key(org_id) references organizations(id);
    alter table submittals add foreign key(project_id) references projects(id);
    alter table submittal_activity add foreign key(project_id) references projects(id);
    alter table submittal_activity add foreign key(submittal_id) references submittals(id);
    grant all on all tables in schema public to service_role;
    grant select, insert, update on projects, organizations, organization_members, user_projects to authenticated;
    grant select on submittal_activity to authenticated;
    grant select, insert, update on submittals, submittal_rounds, submittal_sheet_responses to authenticated;
    grant select on drawings, drawing_revisions, user_profiles to authenticated;
    alter table organizations enable row level security;
    alter table projects enable row level security;
    alter table organization_members enable row level security;
    alter table user_projects enable row level security;
    alter table submittal_activity enable row level security;
  `);
  for (const name of ['user_is_org_member', 'user_org_role_at_least', 'plan_project_limit', 'create_organization', 'create_project', 'org_protect_billing_columns']) {
    await db.exec(functionDefinition(baseline, name));
  }
  await db.exec(functionDefinition(roles, 'user_has_project_access'));
  await db.exec(await readMigration('20261008032524_require_current_workspace_membership_for_project_roles.sql'));
  await db.exec(functionDefinition(await readMigration('20260914010000_close_viewer_write_and_definer_gaps.sql'), 'enforce_project_update_guard'));
  for (const name of ['log_submittal_event', 'transmit_submittal_round', 'record_submittal_response', 'attach_revision_to_submittal_round']) {
    await db.exec(functionDefinition(capture, name));
  }
  await db.exec(`
    create trigger trg_org_protect_billing before update on organizations for each row execute function org_protect_billing_columns();
    create trigger enforce_project_update before update on projects for each row execute function enforce_project_update_guard();
    create policy organizations_insert on organizations for insert with check ((select auth.uid()) is not null and created_by=(select auth.uid()));
    create policy organizations_select on organizations for select using (public.user_is_org_member(id));
    create policy organizations_update on organizations for update using (public.user_org_role_at_least(id,'admin')) with check (public.user_org_role_at_least(id,'admin'));
    create policy project_insert on projects for insert to authenticated with check (public.user_is_org_member(org_id));
    create policy project_select on projects for select to authenticated using (public.user_has_project_access(id));
    create policy project_update on projects for update to authenticated using (public.user_has_project_role_at_least(id,'pm')) with check (public.user_has_project_role_at_least(id,'pm'));
    create policy submittal_activity_select on submittal_activity for select to authenticated using (public.user_has_project_access(project_id));
    revoke all on function create_project(jsonb), create_organization(text,text), log_submittal_event(uuid,uuid,text,text,text,jsonb) from public,anon,service_role;
    grant execute on function create_project(jsonb), create_organization(text,text), log_submittal_event(uuid,uuid,text,text,text,jsonb) to authenticated;
    insert into organizations(id,name,plan,created_by) values
      ('${ids.org}','Current','free','${ids.owner}'), ('${ids.otherOrg}','Other','free','${ids.outsider}'), ('${ids.emptyOrg}','Empty','free','${ids.owner}');
    insert into organization_members(org_id,user_id,role) values
      ('${ids.org}','${ids.owner}','owner'), ('${ids.org}','${ids.member}','member'),
      ('${ids.otherOrg}','${ids.outsider}','owner'), ('${ids.emptyOrg}','${ids.owner}','owner');
    insert into projects(id,org_id,name,is_deleted) values
      ('${ids.project}','${ids.org}','Current',false), ('${ids.archived}','${ids.org}','Archived',true), ('${ids.foreign}','${ids.otherOrg}','Other',false);
    insert into user_projects(user_id,project_id,role) values ('${ids.member}','${ids.project}','pm'), ('${ids.owner}','${ids.archived}','admin');
    insert into user_profiles(id,email,full_name) values ('${ids.member}','member@example.test','PM Example');
    insert into submittals(id,project_id,submittal_number,title) values
      ('${ids.submittal}','${ids.project}','SUB-001','Current'), ('${ids.foreignSubmittal}','${ids.foreign}','SUB-002','Other');
    insert into drawings(id,project_id,sheet_number) values ('${ids.drawing}','${ids.project}','S1');
    insert into drawing_revisions(id,project_id,drawing_id,revision_code,sheet_number,sheet_title) values ('${ids.revision}','${ids.project}','${ids.drawing}','A','S1','Framing');
  `);
  const admin = async () => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', '{}', false)");
  };
  const asUser = async (user = ids.member, role = 'authenticated') => {
    assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, role })]);
  };
  return { db, admin, asUser };
}
