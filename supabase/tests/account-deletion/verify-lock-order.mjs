import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const readMigration = (name) => readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
const original = await readMigration('20260927160000_account_deletion_releases_authorship.sql');
const migration = await readMigration('20261007090057_acquire_erasure_relation_locks_before_rows.sql');
const functionStart = original.indexOf('create or replace function public.erase_my_sole_member_workspaces');
const originalFunction = original.slice(functionStart, original.indexOf('$function$;', functionStart) + 11);
const originalTail = originalFunction.slice(originalFunction.indexOf('  -- Membership writes lock'));
assert.equal(migration.slice(migration.indexOf('  -- Membership writes lock'), migration.indexOf('$function$;') + 11), originalTail,
  'The fresh ownership, sole-member check, authorization/reason delegates and deletion body remain unchanged');
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teammate = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const org = '0a000000-0000-4000-8000-000000000001';
const project = '0b000000-0000-4000-8000-000000000001';
const expectedTables = ['aaa_empty_child', 'organization_members', 'organizations', 'projects', 'zzz child'];
const db = new PGlite();

async function user(id) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id })]);
}

async function reset(mode) {
  await db.exec(`
    truncate test.lock_attempt_rows, test.erased;
    alter sequence test.attempt restart with 1;
    alter sequence test.ticks restart with 1;
    delete from public.organization_members;
    delete from public.projects;
    delete from public.organizations;
    insert into public.organizations values ('${org}');
    insert into public.organization_members values ('${org}', '${owner}', 'owner');
    insert into public.projects values ('${project}', '${org}', false);
  `);
  await db.query("select set_config('test.mode', $1, false)", [mode]);
  await user(owner);
}

async function sequence(name) {
  return (await db.query(`select last_value::int, is_called from test.${name}`)).rows[0];
}

const call = (reason = 'Account deletion lock regression') => db.query('select public.erase_my_sole_member_workspaces($1) result', [reason]);
const catalog = () => db.query(`select proowner, proacl, prorettype, proargtypes, prosecdef, provolatile,
  proparallel, proisstrict, proleakproof, procost, prorows, proconfig
  from pg_proc where oid='public.erase_my_sole_member_workspaces(text)'::regprocedure`);

try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema test;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    create table public.organizations(id uuid primary key);
    create table public.organization_members(org_id uuid references public.organizations, user_id uuid, role text);
    create table public.projects(id uuid primary key, org_id uuid references public.organizations, is_deleted boolean);
    create table public.aaa_empty_child(project_id uuid);
    create table public."zzz child"(project_id uuid);
    create table public.no_user_trigger(project_id uuid);
    create table public.disabled_trigger(project_id uuid);
    create table public.replica_trigger(project_id uuid);
    create table public.data_erasure_log(project_id uuid);
    create table public.unrelated(id uuid);
    create view public.project_view as select project_id from public.aaa_empty_child;
    create table test.lock_attempt_rows(attempt int, relation_name text);
    create table test.erased(org_id uuid);
    create sequence test.attempt; create sequence test.ticks;
    create function test.passthrough() returns trigger language plpgsql as $$ begin return new; end $$;
    create function public.soft_delete_project(p_id uuid) returns void language sql as $$
      update public.projects set is_deleted=true where id=p_id
    $$;
    create function public.hard_delete_organization(p_id uuid, p_reason text) returns void language plpgsql as $$
    begin
      if length(btrim(coalesce(p_reason,''))) < 12 then raise exception 'reason required' using errcode='23514'; end if;
      if exists(select 1 from public.projects where org_id=p_id and not is_deleted) then raise exception 'ARCHIVE_FIRST'; end if;
      insert into test.erased values(p_id);
      delete from public.projects where org_id=p_id;
      delete from public.organization_members where org_id=p_id;
      delete from public.organizations where id=p_id;
    end $$;
  `);
  for (const table of [...expectedTables, 'disabled_trigger', 'replica_trigger', 'data_erasure_log', 'unrelated']) {
    await db.exec(`create trigger test_guard before update on public."${table}" for each row execute function test.passthrough()`);
  }
  await db.exec(`alter table public.disabled_trigger disable trigger test_guard;
    alter table public.replica_trigger enable replica trigger test_guard;`);
  await db.exec(originalFunction);
  await db.exec(`revoke all on function public.erase_my_sole_member_workspaces(text) from public, anon;
    grant execute on function public.erase_my_sole_member_workspaces(text) to authenticated;`);
  const before = (await catalog()).rows;
  await db.exec(migration);
  assert.deepEqual((await catalog()).rows, before, 'CREATE OR REPLACE preserves privileges and every function setting including the 60s timeout');

  await reset('none');
  assert.deepEqual((await call()).rows[0].result, { org_ids: [org], project_ids: [project] },
    'Unmodified migration executes its real LOCK TABLE statements and normal erasure delegates');

  // PGlite has one session. Inject only the lock boundary and clock/backoff,
  // keeping the shipped PL/pgSQL loop and exception/subtransaction unchanged.
  // Transactional probe rows prove partial attempt rollback before backoff;
  // nontransactional sequences make retries/deadlines visible after errors.
  // Actual lock release and concurrent SQL must also pass hosted two-session tests.
  await db.exec(`
    create function test.now() returns timestamptz language sql volatile as $$
      select timestamptz '2026-10-07 00:00:00+00' +
        (case when is_called then last_value else 0 end) * interval '50 milliseconds' from test.ticks
    $$;
    create function test.before_lock(p_table text) returns void language plpgsql as $$
    declare v_attempt int; v_mode text := current_setting('test.mode');
    begin
      if p_table='aaa_empty_child' then perform nextval('test.attempt'); end if;
      select last_value into v_attempt from test.attempt;
      insert into test.lock_attempt_rows values(v_attempt,p_table);
      if p_table='zzz child' and (v_mode='always_conflict' or (v_attempt=1 and v_mode in ('member_during_retry','owner_removed_during_retry'))) then
        raise exception 'synthetic competing writer' using errcode='55P03';
      end if;
      if p_table='zzz child' and v_attempt=1 and v_mode='catalog_changed' then
        create table public.zzzz_new_child(project_id uuid);
        create trigger test_guard before update on public.zzzz_new_child for each row execute function test.passthrough();
      end if;
    end $$;
    create function test.backoff() returns void language plpgsql as $$
    begin
      if exists(select 1 from test.lock_attempt_rows) then raise exception 'partial attempt survived into backoff'; end if;
      perform nextval('test.ticks');
      if current_setting('test.mode')='member_during_retry' then
        insert into public.organization_members values('${org}','${teammate}','member');
      elsif current_setting('test.mode')='owner_removed_during_retry' then
        update public.organization_members set role='member' where user_id='${owner}';
      elsif current_setting('test.mode')='catalog_changed' then
        if to_regclass('public.zzzz_new_child') is not null then raise exception 'changed catalog attempt was not rolled back'; end if;
        create table public.zzzz_new_child(project_id uuid);
        create trigger test_guard before update on public.zzzz_new_child for each row execute function test.passthrough();
      end if;
    end $$;
  `);
  const lockStatement = "execute format('lock table public.%I in share row exclusive mode nowait', v_lock_table);";
  const sleepStatement = 'perform pg_sleep(least(0.05, greatest(0.0, extract(epoch from v_lock_deadline - clock_timestamp()))));';
  assert.equal(migration.split(lockStatement).length, 2);
  assert.equal(migration.split(sleepStatement).length, 2);
  const instrumented = migration.replace(lockStatement, `perform test.before_lock(v_lock_table);\n        ${lockStatement}`)
    .replace(sleepStatement, 'perform test.backoff();').replaceAll('clock_timestamp()', 'test.now()');
  await db.exec(instrumented);

  await reset('capture');
  await call();
  assert.deepEqual((await db.query('select relation_name from test.lock_attempt_rows order by relation_name')).rows.map(row => row.relation_name), expectedTables,
    'Locks empty project tables and quoted names, excludes disabled/replica/internal-only/unrelated/view/audit targets');
  assert.equal((await sequence('attempt')).last_value, 1);

  await reset('catalog_changed');
  assert.deepEqual((await call()).rows[0].result, { org_ids: [org], project_ids: [project] });
  assert.equal((await sequence('attempt')).last_value, 2, 'A changed candidate set releases the first attempt and replans');
  assert.deepEqual((await db.query('select relation_name from test.lock_attempt_rows order by relation_name')).rows.map(row => row.relation_name), [...expectedTables, 'zzzz_new_child'],
    'The new complete attempt includes the new potential trigger-toggle relation');
  await db.exec('drop table public.zzzz_new_child');

  for (const mode of ['member_during_retry', 'owner_removed_during_retry']) {
    await reset(mode);
    assert.deepEqual((await call()).rows[0].result, { org_ids: [], project_ids: [] },
      'Membership and ownership changes during the failed attempt must be re-read before erasure');
    assert.equal((await sequence('attempt')).last_value, 2);
    assert.equal((await sequence('ticks')).last_value, 1);
    assert.deepEqual((await db.query('select distinct attempt from test.lock_attempt_rows')).rows, [{ attempt: 2 }],
      'Only the complete successful lock attempt survives its subtransaction');
    assert.equal((await db.query('select count(*)::int n from test.erased')).rows[0].n, 0);
    assert.equal((await db.query('select is_deleted from public.projects')).rows[0].is_deleted, false);
  }

  await reset('always_conflict');
  await assert.rejects(call(), error => error.code === '55P03' && /ERASURE_BUSY/.test(error.message),
    'Persistent contention exits with lock-not-available, never a success/deadlock');
  assert.equal((await sequence('attempt')).last_value, 160, '50ms retries stop at the exact eight-second fake-clock deadline');
  assert.equal((await sequence('ticks')).last_value, 160);
  assert.equal((await db.query('select count(*)::int n from test.lock_attempt_rows')).rows[0].n, 0);
  assert.equal((await db.query('select is_deleted from public.projects')).rows[0].is_deleted, false);

  await reset('always_conflict');
  await user(teammate);
  assert.deepEqual((await call('')).rows[0].result, { org_ids: [], project_ids: [] });
  assert.equal((await sequence('attempt')).is_called, false, 'No owned workspace returns before any relation-lock attempt');
  await user(null);
  await assert.rejects(call(), error => error.code === '42501');
  assert.equal((await sequence('attempt')).is_called, false, 'Anonymous calls are rejected before lock acquisition');

  await reset('capture');
  await assert.rejects(call('short'), error => error.code === '23514', 'Original reason guard is still enforced');
  assert.equal((await db.query('select is_deleted from public.projects')).rows[0].is_deleted, false, 'Failed reason validation rolls back archival');
  console.log('PASS: real lock set and quoted targets; unchanged authorization/deletion body, ACL and 60s timeout; deterministic partial-attempt rollback, 8s retry deadline, fresh membership/ownership, no-owner fast path and atomic reason failure. Hosted multi-session overlap remains required.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}
