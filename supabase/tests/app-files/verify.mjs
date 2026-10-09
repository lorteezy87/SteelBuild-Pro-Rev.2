import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFixture, ids, readMigration } from './fixture.mjs';

// The fixture loads the actual shipped project access/role definitions.
const { db, admin, asUser } = await createFixture();
const beforeFix = process.argv.includes('--before-fix');
const registry = '20261008234107_app_files_project_authorization.sql';
const enforcement = '20261008234249_enforce_app_files_project_authorization.sql';
const projectPath = (project = ids.project, org = ids.org) => `${org}/projects/${project}/uploads/file.pdf`;
const legacy = `${ids.org}/uploads/old.pdf`;
const obj = '40000000-0000-4000-8000-000000000001';
const member2 = '20000000-0000-4000-8000-000000000004';
let passed = 0, failed = 0;
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
const count = async () => scalar("select count(*)::int result from storage.objects where bucket_id='app-files'");
async function denied(sql, params = []) {
  await db.exec('savepoint refusal');
  await assert.rejects(db.query(sql, params), error => error.code === '42501');
  await db.exec('rollback to savepoint refusal');
}
const insert = (path = projectPath(), owner = ids.member) => db.query(
  "insert into storage.objects(bucket_id,name,owner) values ('app-files',$1,$2) returning id", [path, owner]);
async function check(name, run) {
  await admin(); await db.exec('begin');
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  finally { await db.exec('rollback'); await admin(); }
}
await db.exec(`
  create schema storage; grant usage on schema storage to authenticated, anon, service_role;
  create table auth.users(id uuid primary key);
  insert into auth.users values ('${ids.member}'),('${ids.owner}'),('${ids.outsider}'),('${member2}');
  create table public.user_profiles(id uuid primary key, avatar_url text);
  create table storage.buckets(id text primary key, public boolean);
  insert into storage.buckets values ('app-files',false),('blueline-files',false),('email-attachments',false);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, unique(bucket_id,name));
  alter table storage.objects enable row level security;
  grant select,insert,update,delete on storage.objects to authenticated;
  create policy sibling_read on storage.objects for select to authenticated using (bucket_id='blueline-files' and owner=(select auth.uid()));
  create policy auth_read on storage.objects for select to authenticated using (bucket_id='app-files' and split_part(name,'/',1)='${ids.org}' and exists(select 1 from public.organization_members where org_id='${ids.org}' and user_id=(select auth.uid())));
  create policy auth_upload on storage.objects for insert to authenticated with check (bucket_id='app-files' and split_part(name,'/',1)='${ids.org}');
  create policy auth_update on storage.objects for update to authenticated using (bucket_id='app-files' and owner=(select auth.uid())) with check (bucket_id='app-files' and owner=(select auth.uid()));
  create policy auth_delete on storage.objects for delete to authenticated using (bucket_id='app-files' and owner=(select auth.uid()));
  -- The old read predicate's equivalent member lookup needs an invoker policy.
  create policy member_self on organization_members for select to authenticated using(user_id=(select auth.uid()));
  update organizations set member_default_project_role=null;
  update user_projects set role='field' where user_id='${ids.member}';
  insert into organization_members values ('${ids.org}','${member2}','member');
  insert into storage.objects(id,bucket_id,name,owner) values ('${obj}','app-files','${legacy}','${ids.member}');
`);
await db.exec(await readMigration('20261008032524_require_current_workspace_membership_for_project_roles.sql'));
// Apply the exact shipped read/upload predicates, not an authorization double.
await db.exec(`create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$`);
const oldPolicySource = await readMigration('20260721031606_close_app_files_legacy_path_final.sql');
for (const policy of ['auth_read','auth_upload']) {
  const sql=oldPolicySource.match(new RegExp(`alter policy ${policy} on storage\\.objects[\\s\\S]*?;`,'i'))?.[0];
  assert.ok(sql); await db.exec(sql);
}
if (!beforeFix) {
  await db.exec(await readMigration(registry));
  // A real object without reviewed scope MUST block policy activation.
  await assert.rejects(db.exec(await readMigration(enforcement)), /reconciliation incomplete/i);
  await db.exec('rollback');
  console.log('PASS cutover refuses incomplete legacy reconciliation'); passed++;
  await db.query(`insert into private.app_file_scopes(object_id,object_name,org_id,scope_type,project_id,review_reference)
    values ($1,$2,$3,'project',$4,'fixture: verified project reference')`, [obj, legacy, ids.org, ids.project]);
  const canonicalExisting=(await insert()).rows[0].id;
  await assert.rejects(db.exec(await readMigration(enforcement)), /reconciliation incomplete/i);
  await db.exec('rollback');
  console.log('PASS pre-existing canonical names require explicit review too'); passed++;
  await db.query(`insert into private.app_file_scopes(object_id,object_name,org_id,scope_type,project_id,review_reference)
    values ($1,$2,$3,'project',$4,'fixture: deliberately conflicting review')`, [canonicalExisting,projectPath(),ids.org,ids.archived]);
  await assert.rejects(db.exec(await readMigration(enforcement)), /reconciliation incomplete/i);
  await db.exec('rollback');
  console.log('PASS canonical path and reviewed scope disagreement blocks cutover'); passed++;
  await db.query('delete from private.app_file_scopes where object_id=$1',[canonicalExisting]);
  await db.query('delete from storage.objects where id=$1',[canonicalExisting]);
  await db.exec(await readMigration(enforcement));
}
await check('same-org excluded project member cannot read or list another project file', async () => {
  await asUser(member2); assert.equal(await count(), 0);
});
await check('viewer reads reviewed files but cannot upload', async () => {
  await db.query('update user_projects set role=$1 where user_id=$2', ['viewer', ids.member]);
  await asUser(); assert.equal(await count(), 1);
  await denied("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2)", [projectPath(), ids.member]);
});
await check('field member uploads a new file to the named project', async () => {
  await asUser(); await insert(); assert.equal(await count(), 2);
});
await check('field member cannot upload to a foreign project under their org prefix', async () => {
  await asUser(); await denied("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2)", [projectPath(ids.foreign), ids.member]);
});
await check('missing project and legacy/flat write paths fail closed', async () => {
  await asUser();
  for (const path of [projectPath(ids.missing), `${ids.org}/uploads/new.pdf`, 'uploads/new.pdf', `${ids.org}/projects/not-a-uuid/uploads/a.pdf`]) {
    await denied("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2)", [path, ids.member]);
  }
});
await check('removed uploader cannot read, modify, move, or delete its file', async () => {
  await db.query('delete from organization_members where user_id=$1', [ids.member]);
  await asUser(); assert.equal(await count(), 0);
  assert.equal((await db.query("update storage.objects set metadata='{}' returning id")).rows.length, 0);
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 0);
  await denied("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2)", [projectPath(), ids.member]);
});
await check('owner field role can update and delete a reviewed legacy object', async () => {
  await asUser();
  assert.equal((await db.query("update storage.objects set metadata='{}' returning id")).rows.length, 1);
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 1);
});
await check('viewer uploader cannot update/delete/upsert after downgrade', async () => {
  await db.query('update user_projects set role=$1 where user_id=$2', ['viewer', ids.member]);
  await asUser();
  assert.equal((await db.query("update storage.objects set metadata='{}' returning id")).rows.length, 0);
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 0);
  await denied("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2) on conflict(bucket_id,name) do update set metadata='{}'", [legacy, ids.member]);
});
await check('rename and upsert check destination project and immutable ownership', async () => {
  await asUser(); await insert();
  await db.query("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2) on conflict(bucket_id,name) do update set metadata='{}'", [projectPath(), ids.member]);
  await denied('update storage.objects set name=$1 where name=$2', [projectPath(ids.foreign, ids.otherOrg), projectPath()]);
  await denied('update storage.objects set owner=$1 where name=$2', [ids.owner, projectPath()]);
  assert.equal((await db.query('update storage.objects set name=$1 where name=$2 returning id', [projectPath().replace('file.pdf', 'renamed.pdf'), projectPath()])).rows.length, 1);
});
await check('foreign organization and anonymous caller see no app files', async () => {
  await asUser(ids.outsider); assert.equal(await count(), 0);
  await asUser(null, 'anon'); await denied('select * from storage.objects');
});
await check('same-org nonowner cannot modify another member file', async () => {
  await asUser(ids.owner); assert.equal(await count(), 1);
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 0);
});
await check('organization documents require admin writes, current-member reads', async () => {
  const path = `${ids.org}/organization/uploads/policy.pdf`;
  await asUser(); await denied("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2)", [path, ids.member]);
  await asUser(ids.owner); await insert(path, ids.owner);
  await asUser(member2); assert.equal(await count(), 1);
});
await check('avatars are owner writable and only shared when the actual profile points to them', async () => {
  const path = `${ids.org}/users/${ids.member}/avatars/face.png`;
  await asUser(); await insert(path);
  await asUser(member2); assert.equal(await count(), 0);
  await admin(); await db.query('insert into user_profiles values($1,$2)', [ids.member, path]);
  await asUser(member2); assert.equal(await count(), 1);
  await denied("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2)", [path.replace('face','forged'), member2]);
});
await check('archived project remains readable by its current admin but unwritable', async () => {
  await db.query('update projects set is_deleted=true where id=$1', [ids.project]);
  await asUser(); assert.equal(await count(), 0);
  await asUser(ids.owner); assert.equal(await count(), 1);
  await denied("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2)", [projectPath(), ids.owner]);
});
if (!beforeFix) {
  await check('legacy grants do not survive object recreation or path changes', async () => {
    await db.query('update storage.objects set id=gen_random_uuid() where id=$1', [obj]);
    await asUser(); assert.equal(await count(), 0);
  });
  await check('private scope registry is inaccessible to users and anonymous callers', async () => {
    await asUser(); await denied('select * from private.app_file_scopes');
    await denied("insert into private.app_file_scopes(object_id,object_name,scope_type,review_reference) values(gen_random_uuid(),'x','quarantine','forged-review')");
    await asUser(null, 'anon'); await denied("select private.app_file_can_access(null,'x',false)");
  });
  await check('quarantined legacy objects remain inaccessible even to workspace owners', async () => {
    await db.exec("update private.app_file_scopes set scope_type='quarantine',project_id=null");
    await asUser(ids.owner); assert.equal(await count(), 0);
  });
  await check('an explicit quarantine overrides a canonical-looking path', async () => {
    const created=(await insert()).rows[0].id;
    await db.query(`insert into private.app_file_scopes(object_id,object_name,scope_type,review_reference)
      values($1,$2,'quarantine','fixture: disputed canonical object')`,[created,projectPath()]);
    await asUser(); assert.equal(await count(),1);
  });
  await check('another permissive policy cannot reopen app-files read or writes', async () => {
    await db.exec('create policy unrelated_permissive on storage.objects for all to authenticated using(true) with check(true)');
    await asUser(member2); assert.equal(await count(),0);
    await denied("insert into storage.objects(bucket_id,name,owner) values('app-files',$1,$2)",[projectPath(),member2]);
    assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
    assert.equal((await db.query("update storage.objects set metadata='{}' returning id")).rows.length,0);
  });
}
await check('sibling bucket policies remain unchanged', async () => {
  await db.query("insert into storage.objects(bucket_id,name,owner) values('blueline-files','unchanged',$1)", [member2]);
  await asUser(member2);
  assert.equal(await scalar("select count(*)::int result from storage.objects where bucket_id='blueline-files'"), 1);
});
if (!beforeFix) {
  await admin();
  try {
    await db.exec(await readFile(new URL('./legacy-inventory.sql',import.meta.url),'utf8'));
    console.log('PASS actual metadata inventory SQL executes without persistent changes'); passed++;
  } catch (error) {
    console.error(`FAIL inventory: ${error.code} ${error.message}`); failed++;
    await db.exec('rollback');
  }
}
await db.close();
console.log(`${passed} passed; ${failed} failed (${beforeFix ? 'before fix' : 'candidate SQL'})`);
if (failed) process.exitCode = 1;
