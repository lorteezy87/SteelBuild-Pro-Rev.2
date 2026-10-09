import assert from 'node:assert/strict';
import { fixture, ids, migration, readMigration } from './fixture.mjs';

const { db, admin, as } = await fixture();
const before = process.argv.includes('--before-fix');
let passed = 0, failed = 0;
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const verified = () => rows('select * from public.get_verified_email_mailboxes($1)', [ids.project]);
async function check(name, run) {
  await admin(); await db.exec('begin');
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
  finally { await db.exec('rollback'); await admin(); }
}
async function denied(sql, args = []) {
  await db.exec('savepoint denial');
  await assert.rejects(db.query(sql, args), e => ['42501','42703','23514'].includes(e.code));
  await db.exec('rollback to savepoint denial');
}
async function bind(overrides = {}) {
  const values = { account_id: ids.account, project_id: ids.project, org_id: ids.org, email_address: 'project@example.invalid', account_provider: 'outlook', connection_type: 'manual_forward', send_provider: 'resend', provider_connection_id: 'synthetic-connection', verified_by: 'synthetic-operator', verification_reference: 'synthetic-proof', ...overrides };
  await db.query(`insert into steelbuild_email_private.mailbox_bindings (${Object.keys(values).join(',')}) values (${Object.keys(values).map((_,i)=>`$${i+1}`).join(',')})`, Object.values(values));
}
try {
  if (!before) await db.exec(await readMigration(migration));
  for (const role of ['viewer','field','pm','admin']) {
    await check(`${role} reads safe metadata without any credential columns`, async () => {
      await db.query('update user_projects set role=$1', [role]); await as();
      const [account] = await rows('select * from public.email_accounts');
      assert.equal(account.email_address, 'project@example.invalid');
      for (const name of ['access_token','refresh_token','token_expires_at']) assert.equal(Object.hasOwn(account,name), false, `${name} must not be exposed`);
    });
  }
  await check('field members cannot administer mailboxes', async () => {
    await db.exec("update user_projects set role='field'"); await as();
    assert.equal((await rows("update email_accounts set display_name='forged' returning id")).length, 0);
    await denied('insert into email_accounts(project_id,email_address) values($1,$2)', [ids.project,'added@example.invalid']);
  });
  if (!before) {
    await check('credential backfill is exact and never creates a verified binding', async () => {
      const [credential] = await rows('select * from steelbuild_email_private.mailbox_credentials');
      assert.equal(credential.access_token,'synthetic-access'); assert.equal(credential.refresh_token,'synthetic-refresh');
      assert.equal((await rows('select * from steelbuild_email_private.mailbox_bindings')).length, 0);
      await as('service_role'); assert.deepEqual(await verified(), []);
      assert.deepEqual(await rows('select * from get_email_account_credentials($1)', [ids.account]), []);
    });
    for (const role of ['anon','authenticated']) {
      await check(`${role} cannot read/write private tables or call service RPCs`, async () => {
        await as(role);
        await denied('select * from steelbuild_email_private.mailbox_credentials');
        await denied('select * from steelbuild_email_private.mailbox_bindings');
        await denied('select * from get_verified_email_mailboxes($1)', [ids.project]);
        await denied('select * from get_email_account_credentials($1)', [ids.account]);
        await denied('select store_email_account_credentials($1,$2,$3,null)', [ids.account,'attack','attack']);
      });
    }
    await check('PM can edit metadata but cannot add credential columns', async () => {
      await as(); assert.equal((await rows("update email_accounts set display_name='Project' returning id")).length,1);
      await denied("update email_accounts set access_token='forged'");
      await denied('insert into steelbuild_email_private.mailbox_bindings(account_id) values($1)', [ids.account]);
    });
    await check('verification metadata remains available to project viewers', async () => {
      await bind(); await db.exec("update user_projects set role='viewer'"); await as();
      assert.deepEqual(await rows('select * from get_email_account_verification($1)', [ids.project]), [{ account_id: ids.account, verified: true, send_provider: 'resend' }]);
    });
    await check('unverified mailbox metadata remains visible with a false status', async () => {
      await as(); assert.deepEqual(await rows('select * from get_email_account_verification($1)', [ids.project]), [{ account_id: ids.account, verified: false, send_provider: null }]);
    });
    for (const who of ['outsider','removed']) {
      await check(`${who} cannot inspect verification or edit metadata`, async () => {
        if (who === 'removed') await db.exec('delete from organization_members');
        await as('authenticated', who === 'outsider' ? ids.outsider : ids.user);
        assert.deepEqual(await rows('select * from get_email_account_verification($1)', [ids.project]), []);
        assert.deepEqual(await rows("update email_accounts set display_name='forged' where id=$1 returning id", [ids.account]), []);
      });
    }
    await check('service retrieves and refreshes credentials only for a current verified mailbox', async () => {
      await bind(); await as('service_role');
      assert.equal((await verified())[0].email_address,'project@example.invalid');
      assert.equal((await rows('select * from get_email_account_credentials($1)', [ids.account]))[0].access_token,'synthetic-access');
      await rows('select store_email_account_credentials($1,$2,$3,$4)', [ids.account,'new-access','new-refresh','2031-01-01']);
      assert.equal((await rows('select * from get_email_account_credentials($1)', [ids.account]))[0].refresh_token,'new-refresh');
    });
    await check('unverified mailbox cannot receive refreshed credentials', async () => {
      await as('service_role'); await denied('select store_email_account_credentials($1,$2,$3,null)', [ids.account,'new','new']);
    });
    for (const change of [{org_id:ids.otherOrg},{project_id:ids.foreign},{email_address:'forged@example.invalid'},{account_provider:'gmail'},{connection_type:'oauth'}]) {
      await check(`mismatched verified snapshot ${Object.keys(change)[0]} is rejected`, async () => {
        await bind(change); await as('service_role'); assert.deepEqual(await verified(), []);
        assert.deepEqual(await rows('select * from get_email_account_credentials($1)', [ids.account]), []);
      });
    }
    await check('a revoked binding cannot send or retrieve credentials', async () => {
      await bind(); await db.exec('update steelbuild_email_private.mailbox_bindings set revoked_at=now()');
      await as('service_role'); assert.deepEqual(await verified(), []);
      assert.deepEqual(await rows('select * from get_email_account_credentials($1)', [ids.account]), []);
    });
    await check('archived project cannot send or retrieve credentials', async () => {
      await bind(); await db.exec('update projects set is_deleted=true'); await as('service_role');
      assert.deepEqual(await verified(), []); assert.deepEqual(await rows('select * from get_email_account_credentials($1)', [ids.account]), []);
    });
    for (const column of ['email_address','provider','connection_type']) {
      await check(`editing ${column} invalidates binding and old tokens even after reverting`, async () => {
        await bind(); await as();
        const value = {email_address:'changed@example.invalid',provider:'gmail',connection_type:'oauth'}[column];
        await db.query(`update email_accounts set ${column}=$1 where id=$2`, [value,ids.account]);
        await admin(); assert.deepEqual(await rows('select * from steelbuild_email_private.mailbox_credentials'), []);
        await db.query(`update email_accounts set ${column}=$1 where id=$2`, [{email_address:'project@example.invalid',provider:'outlook',connection_type:'manual_forward'}[column],ids.account]);
        await as('service_role'); assert.deepEqual(await verified(), []);
      });
    }
    await check('deactivation revokes trust; reactivation cannot silently restore it', async () => {
      await bind(); await as(); await db.exec('update email_accounts set is_active=false; update email_accounts set is_active=true');
      await as('service_role'); assert.deepEqual(await verified(), []);
    });
    await check('display-name edits preserve verified authority', async () => {
      await bind(); await as(); await db.exec("update email_accounts set display_name='New name'");
      await as('service_role'); assert.equal((await verified())[0].display_name,'New name');
    });
    await check('mailbox id and project cannot be reassigned', async () => {
      await bind(); await as(); await denied('update email_accounts set id=$1 where id=$2', [ids.otherAccount,ids.account]);
      await denied('update email_accounts set project_id=$1 where id=$2', [ids.foreign,ids.account]);
    });
    await check('deleting an account cascades credentials and verification', async () => {
      await bind(); await as(); await db.query('delete from email_accounts where id=$1', [ids.account]);
      await admin(); assert.deepEqual(await rows('select * from steelbuild_email_private.mailbox_credentials'), []);
      assert.deepEqual(await rows('select * from steelbuild_email_private.mailbox_bindings'), []);
    });
    await check('all private tables have RLS and public definers have pinned paths/explicit ACLs', async () => {
      const tables = await rows("select relrowsecurity from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='steelbuild_email_private' and relkind='r'");
      assert.equal(tables.length,2); assert.ok(tables.every(t=>t.relrowsecurity));
      const functions = await rows("select proname,proconfig,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and proname in ('get_verified_email_mailboxes','get_email_account_credentials','store_email_account_credentials','get_email_account_verification')");
      assert.equal(functions.length,4); for (const f of functions) { assert.ok(f.proconfig.includes('search_path=""')); assert.equal(f.anon,false); }
    });
  }
} finally { await db.close(); }
console.log(`${passed} passed; ${failed} failed${before ? ' (before candidate)' : ''}`);
if (failed) process.exitCode=1;
