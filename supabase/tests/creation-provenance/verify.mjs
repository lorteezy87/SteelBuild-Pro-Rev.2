import assert from 'node:assert/strict';
import { createFixture, ids, readMigration } from './fixture.mjs';

const beforeFix = process.argv.includes('--before-fix');
const { db, admin, asUser } = await createFixture();
let passed = 0;
let failed = 0;
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
async function check(name, verify) {
  await admin();
  await db.exec('begin');
  try { await verify(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  finally { await db.exec('rollback'); await admin(); }
}
async function denied(sql, params = [], code = '42501') {
  await db.exec('savepoint expected_denial');
  await assert.rejects(db.query(sql, params), error => error.code === code);
  await db.exec('rollback to savepoint expected_denial');
}
const createProject = (org = ids.emptyOrg) => db.query('select create_project($1::jsonb) result', [JSON.stringify({ name: 'New project', org_id: org })]);
const log = (project = ids.project, submittal = ids.submittal, metadata = {}) => db.query(
  "select log_submittal_event($1,$2,'status_changed','Draft','Submitted',$3::jsonb)", [project, submittal, JSON.stringify(metadata)]);
const expectLogDenied = (project = ids.project, submittal = ids.submittal) => denied(
  "select log_submittal_event($1,$2,'status_changed','Draft','Submitted')", [project, submittal]);

try {
  if (!beforeFix) {
    await db.exec(await readMigration('20261008201934_enforce_authoritative_project_creation_caps.sql'));
    await db.exec(await readMigration('20261008201944_bind_submittal_event_provenance.sql'));
    await check('project owner-bootstrap failure rolls back both project and quota state', async () => {
      await db.exec(`create function public.reject_test_project_owner() returns trigger language plpgsql as $$ begin raise exception 'test project owner failure'; end $$;
        create trigger reject_test_project_owner before insert on user_projects for each row execute function reject_test_project_owner()`);
      await asUser(ids.owner);
      await denied('select create_project($1::jsonb)', [JSON.stringify({ name: 'Rollback', org_id: ids.emptyOrg })], 'P0001');
      await admin();
      assert.equal(await scalar('select count(*)::int result from projects where org_id=$1', [ids.emptyOrg]), 0);
      assert.equal(await scalar('select count(*)::int result from private.project_creation_state where org_id=$1', [ids.emptyOrg]), 0);
    });
  }
  await check('direct organization INSERT cannot create an orphan or paid workspace', async () => {
    await asUser(ids.owner);
    await denied("insert into organizations(name,plan,created_by) values ('Orphan','enterprise',$1)", [ids.owner]);
  });
  await check('direct project INSERT cannot bypass atomic owner bootstrap', async () => {
    await asUser(ids.owner);
    await denied("insert into projects(org_id,name) values ($1,'Unowned')", [ids.emptyOrg]);
  });
  await check('organization RPC atomically creates a free workspace and actual owner', async () => {
    await asUser(ids.member);
    const org = await scalar("select create_organization('Created','new-org') result");
    assert.equal(org.plan, 'free'); assert.equal(org.created_by, ids.member);
    await admin();
    assert.equal(await scalar("select role result from organization_members where org_id=$1 and user_id=$2", [org.id, ids.member]), 'owner');
  });
  await check('organization RPC keeps the existing unlimited organization-count contract', async () => {
    await asUser(ids.owner);
    await scalar("select create_organization('First','first') result");
    await scalar("select create_organization('Second','second') result");
  });
  await check('organization bootstrap failure rolls back the workspace row', async () => {
    await db.exec(`create function public.reject_test_owner() returns trigger language plpgsql as $$ begin raise exception 'test membership failure'; end $$;
      create trigger reject_test_owner before insert on organization_members for each row execute function reject_test_owner()`);
    const count = await scalar('select count(*)::int result from organizations');
    await asUser(ids.member);
    await denied("select create_organization('Rollback','rollback')", [], 'P0001');
    await admin(); assert.equal(await scalar('select count(*)::int result from organizations'), count);
  });
  await check('anonymous organization creation remains denied', async () => {
    await asUser(null, 'anon'); await denied("select create_organization('Anon','anon')");
  });
  await check('client organization UPDATE cannot escalate billing', async () => {
    await asUser(ids.owner); await denied("update organizations set plan='enterprise' where id=$1", [ids.org]);
  });
  await check('billing service can still update plan fields', async () => {
    await asUser(null, 'service_role');
    await db.query("update organizations set plan='pro',stripe_customer_id='cus_test' where id=$1", [ids.org]);
    assert.equal(await scalar('select plan result from organizations where id=$1', [ids.org]), 'pro');
  });
  await check('project RPC preserves owner assignment and org administrator forward cover', async () => {
    await db.query("insert into organization_members(org_id,user_id,role) values ($1,$2,'member')", [ids.emptyOrg, ids.member]);
    await asUser(ids.member);
    const project = (await createProject()).rows[0].result;
    await admin();
    const owners = (await db.query('select user_id,role from user_projects where project_id=$1 order by user_id', [project.id])).rows;
    assert.deepEqual(owners, [{ user_id: ids.owner, role: 'owner' }, { user_id: ids.member, role: 'owner' }]);
  });
  await check('foreign organization project creation remains denied', async () => {
    await asUser(ids.owner); await denied('select create_project($1::jsonb)', [JSON.stringify({ name: 'Foreign', org_id: ids.otherOrg })], 'P0001');
  });
  await check('free plan permits its first project and denies the second RPC', async () => {
    await asUser(ids.owner); await createProject();
    await denied('select create_project($1::jsonb)', [JSON.stringify({ name: 'Second', org_id: ids.emptyOrg })], 'P0001');
  });
  await check('privileged direct INSERT obeys the same free cap', async () => {
    await asUser(null, 'service_role');
    await denied("insert into projects(org_id,name) values ($1,'Over cap')", [ids.org], 'P0001');
  });
  await check('bulk project INSERT cannot exceed the cap within one statement', async () => {
    await denied("insert into projects(org_id,name) values ($1,'One'),($1,'Two')", [ids.emptyOrg], 'P0001');
    assert.equal(await scalar('select count(*)::int result from projects where org_id=$1', [ids.emptyOrg]), 0);
  });
  await check('archived projects do not consume an active slot', async () => {
    await db.query('update projects set is_deleted=true where id=$1', [ids.project]);
    await asUser(ids.owner); await createProject(ids.org);
  });
  await check('reactivation cannot add an active project above the limit', async () => {
    await denied('update projects set is_deleted=false where id=$1', [ids.archived], 'P0001');
  });
  await check('NULL legacy active state also counts toward the cap', async () => {
    // The baseline is NOT NULL; exercise the coalesce contract for an older
    // shared schema without weakening any committed production constraint.
    await db.exec('alter table projects alter column is_deleted drop not null');
    await db.query('update projects set is_deleted=null where id=$1', [ids.project]);
    await denied('update projects set is_deleted=null where id=$1', [ids.archived], 'P0001');
  });
  await check('project move cannot exceed destination organization capacity', async () => {
    await denied('update projects set org_id=$1 where id=$2', [ids.org, ids.foreign], 'P0001');
  });
  await check('project move into an available organization remains valid', async () => {
    await db.query('update projects set org_id=$1 where id=$2', [ids.emptyOrg, ids.project]);
    assert.equal(await scalar('select org_id result from projects where id=$1', [ids.project]), ids.emptyOrg);
  });
  await check('archived move remains non-occupying; later reactivation is capped', async () => {
    await db.query('update projects set org_id=$1 where id=$2', [ids.otherOrg, ids.archived]);
    await denied('update projects set is_deleted=false where id=$1', [ids.archived], 'P0001');
  });
  await check('ordinary project edits do not reserve a new slot at capacity', async () => {
    await asUser(ids.member);
    await db.query("update projects set name='Edited' where id=$1", [ids.project]);
    assert.equal(await scalar('select name result from projects where id=$1', [ids.project]), 'Edited');
  });
  await check('pro plan permits ten active projects and denies the eleventh', async () => {
    await db.query("update organizations set plan='pro' where id=$1", [ids.emptyOrg]);
    await db.query("insert into projects(org_id,name) select $1,'Project '||n from generate_series(1,10) n", [ids.emptyOrg]);
    await denied("insert into projects(org_id,name) values ($1,'Eleven')", [ids.emptyOrg], 'P0001');
  });
  await check('enterprise plan retains the existing unlimited project contract', async () => {
    await db.query("update organizations set plan='enterprise' where id=$1", [ids.emptyOrg]);
    await db.query("insert into projects(org_id,name) select $1,'Project '||n from generate_series(1,12) n", [ids.emptyOrg]);
    assert.equal(await scalar('select count(*)::int result from projects where org_id=$1', [ids.emptyOrg]), 12);
  });
  await check('downgraded over-cap organization can archive and edit, but cannot add', async () => {
    await db.query("update organizations set plan='pro' where id=$1", [ids.emptyOrg]);
    await db.query("insert into projects(org_id,name) values ($1,'One'),($1,'Two')", [ids.emptyOrg]);
    await db.query("update organizations set plan='free' where id=$1", [ids.emptyOrg]);
    await db.query("update projects set name='Still editable' where org_id=$1", [ids.emptyOrg]);
    await denied("insert into projects(org_id,name) values ($1,'Three')", [ids.emptyOrg], 'P0001');
    await db.query('update projects set is_deleted=true where org_id=$1', [ids.emptyOrg]);
    await asUser(ids.owner); await createProject();
  });
  if (!beforeFix) {
    await check('all successful occupancy changes write a serialization revision', async () => {
      await db.query("update organizations set plan='pro' where id=$1", [ids.emptyOrg]);
      await db.query("insert into projects(org_id,name) values ($1,'Inserted')", [ids.emptyOrg]);
      await db.query('update projects set org_id=$1 where id=$2', [ids.emptyOrg, ids.project]);
      await db.query('update projects set org_id=$1,is_deleted=false where id=$2', [ids.emptyOrg, ids.archived]);
      assert.equal(await scalar('select revision::int result from private.project_creation_state where org_id=$1', [ids.emptyOrg]), 3);
    });
    await check('failed project creation rolls back its serialization revision', async () => {
      await asUser(ids.owner); await createProject(); await admin();
      await denied("insert into projects(org_id,name) values ($1,'Overflow')", [ids.emptyOrg], 'P0001');
      assert.equal(await scalar('select revision::int result from private.project_creation_state where org_id=$1', [ids.emptyOrg]), 1);
    });
    await check('quota serialization state and trigger cannot be changed by clients', async () => {
      await asUser(ids.owner); await denied('select * from private.project_creation_state');
      await denied('select private.enforce_project_creation_cap()');
    });
  }
  for (const role of ['viewer', 'field']) {
    await check(`${role} cannot fabricate submittal events`, async () => {
      await db.query('update user_projects set role=$1 where user_id=$2', [role, ids.member]);
      await asUser(); await expectLogDenied();
    });
  }
  await check('PM cannot attach a foreign parent to a local project event', async () => {
    await asUser(); await expectLogDenied(ids.project, ids.foreignSubmittal);
  });
  await check('PM cannot spoof a foreign project for its local parent', async () => {
    await asUser(); await expectLogDenied(ids.foreign, ids.submittal);
  });
  await check('missing submittal denies without leaking an FK failure', async () => {
    await asUser(); await expectLogDenied(ids.project, '40000000-0000-4000-8000-000000000099');
  });
  await check('archived parent cannot accept new activity', async () => {
    await db.query('update submittals set is_deleted=true where id=$1', [ids.submittal]);
    await asUser(); await expectLogDenied();
  });
  await check('archived project cannot accept activity even with retained PM membership', async () => {
    await db.query('update projects set is_deleted=true where id=$1', [ids.project]);
    await asUser(); await expectLogDenied();
  });
  await check('removed workspace member with a stale PM row cannot log events', async () => {
    await db.query('delete from organization_members where user_id=$1', [ids.member]);
    await asUser(); await expectLogDenied();
  });
  await check('PM event uses authoritative parent project and authenticated actor', async () => {
    await asUser(); await log(ids.project, ids.submittal, { note: 'Review completed', actor_id: ids.outsider });
    const row = (await db.query('select * from submittal_activity')).rows[0];
    assert.equal(row.project_id, ids.project); assert.equal(row.submittal_id, ids.submittal); assert.equal(row.actor_id, ids.member);
    assert.equal(row.metadata.note, 'Review completed');
  });
  await check('workspace owner retains permitted event writes', async () => {
    await asUser(ids.owner); await log();
    assert.equal(await scalar('select actor_id result from submittal_activity'), ids.owner);
  });
  await check('direct activity-table INSERT remains denied', async () => {
    await asUser(); await denied("insert into submittal_activity(project_id,submittal_id,event_type,actor_id) values ($1,$2,'created',$3)", [ids.project, ids.submittal, ids.outsider]);
  });
  await check('anonymous event calls remain denied', async () => {
    await asUser(null, 'anon'); await expectLogDenied();
  });
  await check('captured transmit, response and attachment workflows still append authentic events', async () => {
    await asUser();
    const round = await scalar("select to_jsonb(transmit_submittal_round($1,'2026-10-08','GC')) result", [ids.submittal]);
    await db.query('select attach_revision_to_submittal_round($1,$2,$3)', [ids.submittal, ids.drawing, ids.revision]);
    await db.query("select record_submittal_response($1,'2026-10-09','Approved','Detailer','Approved', '[]')", [round.id]);
    const events = (await db.query('select event_type,actor_id,project_id,submittal_id from submittal_activity order by event_type')).rows;
    assert.deepEqual(events.map(row => row.event_type), ['file_uploaded', 'round_created', 'round_returned']);
    for (const row of events) {
      assert.equal(row.actor_id, ids.member); assert.equal(row.project_id, ids.project); assert.equal(row.submittal_id, ids.submittal);
    }
  });
  if (!beforeFix) {
    await check('candidate privileged functions have pinned search paths and no anon execution', async () => {
      const functions = (await db.query(`select n.nspname,p.proname,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anonymous
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname='enforce_project_creation_cap')
        or (n.nspname='public' and p.proname in ('create_project','create_organization','log_submittal_event'))`)).rows;
      assert.equal(functions.length, 4);
      for (const fn of functions) { assert.ok(fn.proconfig.includes('search_path=""')); assert.equal(fn.anonymous, false); }
    });
  }
} finally {
  await db.close();
}
console.log(`${passed} passed; ${failed} failed${beforeFix ? ' (pre-fix vulnerability reproduction)' : ''}`);
if (failed) process.exitCode = 1;
