import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createCommercialFixture, ids } from './fixture.mjs';

const { db, asUser, admin } = await createCommercialFixture();
const migration = name => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
const helpers = JSON.parse(await readFile(new URL('./erasure-helpers.json', import.meta.url), 'utf8'));
try {
  await db.exec(await migration('20261007112918_transactional_numbered_record_creates.sql'));
  await asUser();
  for (const [kind, payload] of Object.entries({
    change_orders: { title: 'Erasure steel CO', co_amount: 200 },
    change_requests: { title: 'Erasure steel CR' },
    deliveries: { delivery_title: 'Erasure steel load' },
    sov_items: { description: 'Erasure steel SOV', scheduled_value: 200 },
    backcharges: { title: 'Erasure steel rework', amount: 50, notice_date: '2026-10-07' },
  })) await db.query('select public.create_numbered_record($1,$2,$3,$4::jsonb)', [ids.project,kind,randomUUID(),JSON.stringify(payload)]);
  await admin();
  await db.exec(`
    alter table organizations add column name text default 'Synthetic workspace';
    alter table projects add column project_number text default 'SYNTHETIC';
    alter table projects add column deleted_at timestamptz;
    create table data_erasure_log(kind text,org_id uuid,org_name text,project_id uuid,project_name text,project_number text,requested_by uuid,requested_by_email text,reason text,row_counts jsonb,storage_prefix text);
    create table account_deletions(org_id uuid,org_name text,deleted_by uuid,projects_deleted integer,note text);
    create table note_folders(id uuid primary key,org_id uuid,parent_folder_id uuid references note_folders(id));
    create table note_folder_audit_events(org_id uuid);
    create table note_folder_mutation_receipts(org_id uuid);
    create table note_folder_migrations(org_id uuid);
    create table billing_events(org_id uuid);
    create table organization_invitations(org_id uuid);
    create table vendors(org_id uuid);
  `);
  for (const helper of helpers) await db.exec(`${helper.definition};`);
  for (const file of [
    '20260927150000_erasure_census_admits_project_admins.sql',
    '20260912055243_hard_delete_project_dependency_ordered_deletes.sql',
    '20260912062606_hard_delete_organization_cursor_and_note_folders.sql',
    '20260914120000_adopt_production_soft_delete_project.sql',
    '20261007090057_acquire_erasure_relation_locks_before_rows.sql',
  ]) await db.exec(await migration(file));
  // Test the actual sole-member account-erasure command, census, trigger
  // suppression and dependency-ordered delete loop with a new private table.
  await db.query('delete from organization_members where org_id=$1 and user_id<>$2',[ids.org,ids.pm]);
  await db.query("update organization_members set role='owner' where org_id=$1 and user_id=$2",[ids.org,ids.pm]);
  await db.query("update user_projects set role='admin' where project_id=$1 and user_id=$2",[ids.project,ids.pm]);
  await asUser();
  const census = (await db.query('select public.project_row_counts($1) as counts',[ids.project])).rows[0].counts;
  assert.equal(census.numbered_create_receipts,5,'Dynamic census must discover all private create receipts');
  const erased = (await db.query('select public.erase_my_sole_member_workspaces($1) as result',['Synthetic account erasure regression'])).rows[0].result;
  assert.deepEqual(erased,{org_ids:[ids.org],project_ids:[ids.project]});
  await admin();
  assert.equal((await db.query('select count(*)::int as count from numbered_create_receipts')).rows[0].count,0);
  assert.equal((await db.query("select row_counts->>'numbered_create_receipts' as count from data_erasure_log where kind='project'")).rows[0].count,'5');
  assert.equal((await db.query('select id from organizations')).rows[0].id,ids.otherOrg,'Unrelated workspace must survive');
  await db.query('delete from auth.users where id=$1',[ids.pm]);
  assert.equal((await db.query('select count(*)::int as count from auth.users where id=$1',[ids.pm])).rows[0].count,0);
  console.log('PASS actual account-erasure chain discovers private receipts, archives and erases the sole-member project, preserves another workspace, and permits account deletion. No hosted data was written.');
} catch (error) {
  console.error(`FAIL account-erasure receipt compatibility: ${error.message}`);
  process.exitCode=1;
} finally { await db.close(); }
