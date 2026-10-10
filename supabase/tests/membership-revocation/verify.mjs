import assert from 'node:assert/strict';
import { createFixture, ids, readMigration } from './fixture.mjs';

const { db, admin, asUser } = await createFixture();
const beforeFix = process.argv.includes('--before-fix');
let passed = 0;
let failed = 0;
async function check(name, verify) {
  await admin();
  await db.exec('begin');
  try {
    await verify();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await db.exec('rollback');
    await admin();
  }
}
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
const minimum = (role, project = ids.project) => scalar('select public.user_has_project_role_at_least($1,$2) result', [project, role]);
const exact = (role, project = ids.project) => scalar('select public.user_has_project_role($1,$2) result', [project, role]);
const resolved = (project = ids.project) => scalar('select public.get_my_project_role($1) result', [project]);
async function revokeMember(role = 'admin') {
  await db.query('update user_projects set role=$1 where user_id=$2', [role, ids.member]);
  await db.query('delete from organization_members where org_id=$1 and user_id=$2', [ids.org, ids.member]);
  await asUser();
}

try {
  if (!beforeFix) {
    await db.exec(await readMigration('20261008032524_require_current_workspace_membership_for_project_roles.sql'));
  }
  // Each test catches a missing membership gate in one actual SQL resolver.
  for (const role of ['viewer', 'field', 'pm', 'admin', 'owner']) {
    await check(`removed ${role} cannot satisfy a minimum project role`, async () => {
      await revokeMember(role);
      assert.equal(await minimum(role), false);
      assert.equal(await scalar('select public.user_is_project_admin($1) result', [ids.project]), false);
    });
    await check(`removed ${role} cannot satisfy an exact project role`, async () => {
      await revokeMember(role);
      assert.equal(await exact(role), false);
    });
    await check(`removed ${role} has no resolved project role`, async () => {
      await revokeMember(role);
      assert.equal(await resolved(), null);
    });
  }
  await check('removed admin cannot archive an invisible project through the definer RPC', async () => {
    await revokeMember();
    assert.equal(await scalar('select count(*)::int result from projects where id=$1', [ids.project]), 0);
    await db.exec('savepoint archive_denial');
    await assert.rejects(db.query('select public.soft_delete_project($1)', [ids.project]), error => error.code === '42501');
    await db.exec('rollback to savepoint archive_denial');
    await admin();
    assert.equal(await scalar('select is_deleted result from projects where id=$1', [ids.project]), false);
  });
  const explicitCases = [
    { role: 'viewer', field: false, pm: false, admin: false },
    { role: 'field', field: true, pm: false, admin: false },
    { role: 'pm', field: true, pm: true, admin: false },
    { role: 'admin', field: true, pm: true, admin: true },
    { role: 'owner', field: true, pm: true, admin: true },
  ];
  for (const scenario of explicitCases) {
    await check(`current explicit ${scenario.role} retains its project authority`, async () => {
      await db.query('update user_projects set role=$1 where user_id=$2', [scenario.role, ids.member]);
      await asUser();
      assert.equal(await minimum('viewer'), true);
      assert.equal(await minimum('field'), scenario.field);
      assert.equal(await minimum('pm'), scenario.pm);
      assert.equal(await minimum('admin'), scenario.admin);
      assert.equal(await exact(scenario.role), true);
      assert.equal(await resolved(), scenario.role);
    });
  }
  for (const [role, field, pm] of [['viewer', false, false], ['field', true, false], ['pm', true, true], [null, false, false]]) {
    await check(`current member retains ${role ?? 'no'} workspace default role`, async () => {
      await db.query('delete from user_projects where user_id=$1', [ids.member]);
      await db.query('update organizations set member_default_project_role=$1 where id=$2', [role, ids.org]);
      await asUser();
      assert.equal(await resolved(), role);
      assert.equal(await minimum('viewer'), role !== null);
      assert.equal(await minimum('field'), field);
      assert.equal(await minimum('pm'), pm);
      assert.equal(await minimum('admin'), false);
      assert.equal(await exact(role ?? 'viewer'), false, 'exact role stays explicit-only');
    });
  }
  await check('explicit viewer remains below the workspace PM default', async () => {
    await db.query("update user_projects set role='viewer' where user_id=$1", [ids.member]);
    await db.query("update organizations set member_default_project_role='pm' where id=$1", [ids.org]);
    await asUser();
    assert.equal(await minimum('pm'), false);
    assert.equal(await resolved(), 'viewer');
  });
  for (const orgRole of ['owner', 'admin']) {
    await check(`workspace ${orgRole} retains the existing admin bypass`, async () => {
      await db.query('update organization_members set role=$1 where user_id=$2', [orgRole, ids.member]);
      await db.query("update user_projects set role='viewer' where user_id=$1", [ids.member]);
      await asUser();
      assert.equal(await minimum('admin'), true);
      assert.equal(await exact('admin'), false);
      assert.equal(await resolved(), 'viewer', 'preserve the explicit-role display precedence');
    });
  }
  await check('membership in another workspace does not revive stale project authority', async () => {
    await db.query('insert into user_projects values($1,$2,$3)', [ids.project, ids.outsider, 'admin']);
    await asUser(ids.outsider);
    assert.equal(await minimum('admin'), false);
    assert.equal(await exact('admin'), false);
    assert.equal(await resolved(), null);
  });
  await check('a current member receives no role in another workspace project', async () => {
    await asUser();
    assert.equal(await minimum('viewer', ids.foreign), false);
    assert.equal(await exact('admin', ids.foreign), false);
    assert.equal(await resolved(ids.foreign), null);
  });
  await check('role helper execution remains authenticated-only', async () => {
    for (const signature of ['user_has_project_role(uuid,text)', 'get_my_project_role(uuid)', 'user_has_project_role_at_least(uuid,text)']) {
      assert.equal(await scalar("select has_function_privilege('authenticated',$1,'execute') result", [signature]), true);
      assert.equal(await scalar("select has_function_privilege('anon',$1,'execute') result", [signature]), false);
      assert.equal(await scalar("select has_function_privilege('service_role',$1,'execute') result", [signature]), false);
    }
  });
  await check('a current project admin can archive an active project', async () => {
    await asUser();
    await db.query('select public.soft_delete_project($1)', [ids.project]);
    await admin();
    const row = (await db.query('select is_deleted, deleted_at is not null as stamped from projects where id=$1', [ids.project])).rows[0];
    assert.deepEqual(row, { is_deleted: true, stamped: true });
  });
  await check('current project admin retains archived-project erasure census authority', async () => {
    await asUser();
    assert.equal(await minimum('admin', ids.archived), true);
    assert.equal(await exact('admin', ids.archived), true);
    assert.equal(await resolved(ids.archived), 'admin');
    assert.equal(await scalar('select public.user_has_project_access($1) result', [ids.archived]), false);
    assert.equal((await scalar('select public.project_row_counts($1) result', [ids.archived])).project_data, 1);
  });
  await check('current workspace owner retains archived-project erasure census authority', async () => {
    await asUser(ids.owner);
    assert.equal(await minimum('admin', ids.archived), true);
    assert.equal((await scalar('select public.project_row_counts($1) result', [ids.archived])).project_data, 1);
  });
  await check('removed admin loses archived-project authority', async () => {
    await revokeMember();
    assert.equal(await minimum('admin', ids.archived), false);
    assert.equal(await exact('admin', ids.archived), false);
    assert.equal(await resolved(ids.archived), null);
    await assert.rejects(db.query('select public.project_row_counts($1)', [ids.archived]), error => error.code === '42501');
  });
  await check('missing identity and unknown projects fail closed', async () => {
    await asUser(null);
    assert.equal(await minimum('viewer'), false);
    assert.equal(await exact('admin'), false);
    assert.equal(await resolved(), null);
    await asUser();
    assert.equal(await minimum('viewer', ids.missing), false);
    assert.equal(await exact('admin', ids.missing), false);
    assert.equal(await resolved(ids.missing), null);
  });
  console.log(`${passed} passed; ${failed} failed${beforeFix ? ' against pre-fix definitions' : ''}.`);
  if (failed > 0) process.exitCode = 1;
} finally {
  await db.close();
}
