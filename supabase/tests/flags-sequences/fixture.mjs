import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../', import.meta.url);
export const readMigration = name => readFile(new URL(`migrations/${name}`, root), 'utf8');
export function functionDefinition(source, name) {
  const start = source.search(new RegExp(`create or replace function (?:"public"|public)\\.(?:"${name}"|${name})\\(`, 'i'));
  assert.notEqual(start, -1, `Missing SQL function ${name}`);
  const tail = source.slice(start);
  const delimiter = tail.match(/\$[a-z_]*\$/i)?.[0];
  assert.ok(delimiter);
  const end = tail.indexOf(delimiter, tail.indexOf(delimiter) + delimiter.length);
  assert.notEqual(end, -1);
  return tail.slice(0, end + delimiter.length) + ';';
}
export function tableDefinition(source, name) {
  const start = source.search(new RegExp(`CREATE TABLE IF NOT EXISTS (?:"public"|public)\\.(?:"${name}"|${name}) \\(`,'i'));
  assert.notEqual(start, -1, `Missing table ${name}`);
  return source.slice(start, source.indexOf('\n);', start) + 3);
}
export const ids = {
  org: '10000000-0000-4000-8000-000000000001', otherOrg: '10000000-0000-4000-8000-000000000002',
  viewer: '20000000-0000-4000-8000-000000000001', field: '20000000-0000-4000-8000-000000000002',
  owner: '20000000-0000-4000-8000-000000000003', platformAdmin: '20000000-0000-4000-8000-000000000004',
  outsider: '20000000-0000-4000-8000-000000000005',
  project: '30000000-0000-4000-8000-000000000001', archived: '30000000-0000-4000-8000-000000000002',
  foreign: '30000000-0000-4000-8000-000000000003',
};
export async function createFixture() {
  const db = new PGlite();
  const baseline = await readMigration('20260101000010_baseline_schema.sql');
  const capture = await readFile(new URL('_capture/production-public-functions-2026-09-15.sql', root), 'utf8');
  await db.exec(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key,email text);
    create function extensions.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
    grant usage on schema auth,extensions to authenticated,anon,service_role;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
  `);
  for (const table of ['organizations','organization_members','projects','user_projects','user_profiles','feature_flags','number_sequences','change_requests']) {
    await db.exec(tableDefinition(baseline, table));
    await db.exec(`alter table public.${table} add primary key(id); alter table public.${table} enable row level security; grant all on public.${table} to authenticated,service_role;`);
  }
  await db.exec(`
    alter table organizations add column member_default_project_role text default 'viewer';
    alter table organization_members add unique(org_id,user_id);
    alter table user_projects add unique(user_id,project_id);
    alter table feature_flags add unique(flag_key), add column updated_by uuid;
    alter table number_sequences add unique(project_id,record_type);
    create unique index on number_sequences(project_id,upper(record_type));
    alter table change_requests add column cr_number text, add column created_by uuid,
      add column is_deleted boolean not null default false, add column deleted_at timestamptz;
    alter table change_requests add foreign key(project_id) references projects(id);
  `);
  for (const name of ['user_is_org_member','user_org_role_at_least','user_is_system_admin','get_next_sequence_number']) await db.exec(functionDefinition(baseline, name));
  await db.exec(functionDefinition(await readMigration('20260819001000_org_member_default_project_access.sql'), 'user_has_project_access'));
  await db.exec(await readMigration('20261008032524_require_current_workspace_membership_for_project_roles.sql'));
  for (const name of ['feature_flag_enabled_for','enforce_feature_flag_guards','set_feature_flag','set_feature_flag_override','enforce_change_request_guards']) await db.exec(functionDefinition(capture,name));
  await db.exec(`
    create policy project_select on projects for select to authenticated using(user_has_project_access(id));
    create policy feature_flags_select on feature_flags for select to authenticated using(true);
    create policy feature_flags_admin_insert on feature_flags for insert to authenticated with check(user_is_system_admin());
    create policy feature_flags_admin_update on feature_flags for update to authenticated using(user_is_system_admin()) with check(user_is_system_admin());
    create policy feature_flags_admin_delete on feature_flags for delete to authenticated using(user_is_system_admin());
    create policy change_requests_select on change_requests for select to authenticated using(user_has_project_access(project_id));
    create policy change_requests_insert on change_requests for insert to authenticated with check(user_has_project_role_at_least(project_id,'field'));
    create policy change_requests_update on change_requests for update to authenticated using(user_has_project_role_at_least(project_id,'pm')) with check(user_has_project_role_at_least(project_id,'pm'));
    create policy sequence_select on number_sequences for select to authenticated using(user_has_project_access(project_id));
    create policy sequence_insert on number_sequences for insert to authenticated with check(user_has_project_access(project_id) and user_has_project_role_at_least(project_id,'field'));
    create policy sequence_update on number_sequences for update to authenticated using(user_has_project_access(project_id) and user_has_project_role_at_least(project_id,'field')) with check(user_has_project_access(project_id) and user_has_project_role_at_least(project_id,'field'));
    create trigger enforce_feature_flags before insert or update or delete on feature_flags for each row execute function enforce_feature_flag_guards();
    create trigger enforce_change_requests before insert or update or delete on change_requests for each row execute function enforce_change_request_guards();
    revoke execute on function get_next_sequence_number(uuid,text), feature_flag_enabled_for(text,text), set_feature_flag(text,boolean,text), set_feature_flag_override(text,text,boolean) from public,anon;
    revoke execute on function feature_flag_enabled_for(text,text) from authenticated;
    grant execute on function get_next_sequence_number(uuid,text), set_feature_flag(text,boolean,text), set_feature_flag_override(text,text,boolean) to authenticated;
    insert into organizations(id,name,created_by) values('${ids.org}','Current','${ids.owner}'),('${ids.otherOrg}','Other','${ids.outsider}');
    insert into organization_members(org_id,user_id,role) values('${ids.org}','${ids.viewer}','member'),('${ids.org}','${ids.field}','member'),('${ids.org}','${ids.owner}','owner'),('${ids.otherOrg}','${ids.outsider}','owner');
    insert into projects(id,org_id,name,is_deleted) values('${ids.project}','${ids.org}','Current',false),('${ids.archived}','${ids.org}','Archived',true),('${ids.foreign}','${ids.otherOrg}','Other',false);
    insert into user_projects(user_id,project_id,role) values('${ids.field}','${ids.project}','field'),('${ids.viewer}','${ids.project}','viewer');
    insert into auth.users(id,email) values('${ids.viewer}','viewer@example.test'),('${ids.field}','field@example.test'),('${ids.owner}','owner@example.test'),('${ids.platformAdmin}','admin@example.test'),('${ids.outsider}','outsider@example.test');
    insert into user_profiles(id,email,role) select id,email,case when id='${ids.platformAdmin}' then 'admin' else 'user' end from auth.users;
    insert into feature_flags(flag_key,enabled,description,user_overrides) values
      ('global_on',true,'not public','{}'),('global_off',false,'not public','{}'),
      ('viewer_on',false,'secret','{"viewer@example.test":true,"foreign@example.test":false}'),
      ('viewer_off',true,'secret','{"viewer@example.test":false}'),
      ('mixed_case',false,'secret','{"Viewer@Example.test":true}'),
      ('canonical_wins',true,'secret','{"Viewer@Example.test":true,"viewer@example.test":false}'),
      ('invalid_value',true,'secret','{"viewer@example.test":"no"}'),
      ('invalid_map',true,'secret','[]');
  `);
  await db.exec(await readMigration('20260921054458_allow_project_members_to_raise_change_requests.sql'));
  await db.exec('revoke execute on function create_change_request(uuid,jsonb) from public,anon; grant execute on function create_change_request(uuid,jsonb) to authenticated;');
  const admin = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims','{}',false)"); };
  const asUser = async (user=ids.viewer, role='authenticated', claims={}) => {
    assert.ok(['authenticated','anon','service_role'].includes(role));
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role,email:'forged@example.test',...claims})]);
  };
  return {db,admin,asUser};
}
