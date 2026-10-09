import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const migration = '20261008201945_private_email_credentials_and_verified_mailboxes.sql';
export const readMigration = name => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
export const ids = {
  org: '10000000-0000-4000-8000-000000000001', otherOrg: '10000000-0000-4000-8000-000000000002',
  user: '20000000-0000-4000-8000-000000000001', outsider: '20000000-0000-4000-8000-000000000002',
  project: '30000000-0000-4000-8000-000000000001', foreign: '30000000-0000-4000-8000-000000000002',
  account: '40000000-0000-4000-8000-000000000001', otherAccount: '40000000-0000-4000-8000-000000000002',
};

function definition(source, name) {
  const start = source.search(new RegExp(`create or replace function "?public"?\\."?${name}"?\\(`, 'i'));
  assert.notEqual(start, -1, `Missing shipped function ${name}`);
  const tail = source.slice(start);
  const delimiter = tail.match(/\$[a-z_]*\$/i)[0];
  const end = tail.indexOf(delimiter, tail.indexOf(delimiter) + delimiter.length);
  return tail.slice(0, end + delimiter.length) + ';';
}

export async function fixture() {
  const db = new PGlite();
  const baseline = await readMigration('20260101000010_baseline_schema.sql');
  const roles = await readMigration('20260819001000_org_member_default_project_access.sql');
  const table = baseline.match(/CREATE TABLE IF NOT EXISTS "public"\."email_accounts" \([\s\S]*?\n\);/)[0];
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    grant usage on schema auth to authenticated, anon, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
    create table organizations(id uuid primary key, member_default_project_role text);
    create table organization_members(org_id uuid references organizations(id), user_id uuid, role text);
    create table projects(id uuid primary key, org_id uuid references organizations(id), is_deleted boolean default false);
    create table user_projects(project_id uuid references projects(id), user_id uuid, role text);
    insert into organizations values ('${ids.org}','viewer'),('${ids.otherOrg}','viewer');
    insert into organization_members values ('${ids.org}','${ids.user}','member'),('${ids.otherOrg}','${ids.outsider}','owner');
    insert into projects values ('${ids.project}','${ids.org}',false),('${ids.foreign}','${ids.otherOrg}',false);
    insert into user_projects values ('${ids.project}','${ids.user}','pm');
    ${table}
    alter table email_accounts add primary key(id);
    alter table email_accounts add foreign key(project_id) references projects(id) on delete cascade;
    alter table email_accounts enable row level security;
    grant all on email_accounts to authenticated, service_role;
    insert into email_accounts(id,project_id,email_address,access_token,refresh_token,token_expires_at)
      values ('${ids.account}','${ids.project}','project@example.invalid','synthetic-access','synthetic-refresh','2030-01-01'),
      ('${ids.otherAccount}','${ids.foreign}','foreign@example.invalid',null,null,null);
  `);
  await db.exec(definition(roles, 'user_has_project_access'));
  await db.exec(await readMigration('20261008032524_require_current_workspace_membership_for_project_roles.sql'));
  // Execute the account's canonical shipped policy and latest pre-candidate floors.
  const policy = await readMigration('20260630131332_email_tables_canonical_rls.sql');
  await db.exec(policy.slice(0, policy.indexOf('drop policy if exists "Users can view')));
  const floors = await readMigration('20260921080604_harden_workspace_membership_and_audit_boundaries.sql');
  await db.exec(floors.match(/DO \$policies\$[\s\S]*?END \$policies\$;/)[0].replace("ARRAY['drawing_analyses','drawing_findings','external_linked_folders','email_accounts','email_messages','email_attachments']", "ARRAY['email_accounts']"));
  const admin = () => db.exec('reset role');
  const as = async (role = 'authenticated', user = ids.user) => {
    assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, role })]);
  };
  return { db, admin, as };
}
