import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../migrations/20261013093000_lock_down_feature_flag_reads.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const db = new PGlite();

const ids = {
  member: "10000000-0000-4000-8000-000000000001",
  admin: "10000000-0000-4000-8000-000000000002",
  outsider: "10000000-0000-4000-8000-000000000003",
};

let passed = 0;
let failed = 0;

async function admin() {
  await db.exec("reset role");
}

async function asAuthenticated(userId) {
  await admin();
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
}

async function check(name, verify) {
  await admin();
  await db.exec("begin");
  try {
    await verify();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await db.exec("rollback");
    await admin();
  }
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;

    create table auth.users (
      id uuid primary key,
      email text
    );

    create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    create table public.user_profiles (
      id uuid primary key,
      role text not null
    );

    create function public.user_is_system_admin() returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
      select exists (
        select 1
        from public.user_profiles up
        where up.id = (select auth.uid()) and up.role = 'admin'
      )
    $$;

    create table public.feature_flags (
      id uuid primary key,
      flag_key varchar(100) unique not null,
      enabled boolean not null default false,
      description text,
      user_overrides jsonb not null default '{}'::jsonb
    );

    alter table public.feature_flags enable row level security;
    create policy feature_flags_select on public.feature_flags
      for select to authenticated
      using ((select auth.uid()) is not null);
    grant select on public.feature_flags to authenticated;
    grant all on public.feature_flags to service_role;

    insert into auth.users(id, email) values
      ('${ids.member}', 'member@example.com'),
      ('${ids.admin}', 'admin@example.com'),
      ('${ids.outsider}', 'outsider@example.com');
    insert into public.user_profiles(id, role) values
      ('${ids.member}', 'field'),
      ('${ids.admin}', 'admin'),
      ('${ids.outsider}', 'viewer');
    insert into public.feature_flags(id, flag_key, enabled, description, user_overrides) values
      ('20000000-0000-4000-8000-000000000001', 'global_on', true, 'Globally enabled', '{}'),
      ('20000000-0000-4000-8000-000000000002', 'member_override', false, 'Member beta', '{"Member@Example.com": true}'),
      ('20000000-0000-4000-8000-000000000003', 'other_override', false, 'Someone else beta', '{"other@example.com": true}'),
      ('20000000-0000-4000-8000-000000000004', 'malformed_override', true, 'Invalid legacy value', '{"member@example.com": "yes"}');
  `);

  await db.exec(migration);

  await check("ordinary users cannot read raw override email metadata", async () => {
    await asAuthenticated(ids.member);
    const result = await db.query("select * from public.feature_flags");
    assert.equal(result.rows.length, 0);
  });

  await check("system admins retain raw flag management visibility", async () => {
    await asAuthenticated(ids.admin);
    const result = await db.query(
      "select flag_key, user_overrides from public.feature_flags order by flag_key",
    );
    assert.equal(result.rows.length, 4);
    assert.deepEqual(result.rows.find((row) => row.flag_key === "member_override")?.user_overrides, {
      "Member@Example.com": true,
    });
  });

  await check("the caller receives only effective keys and booleans", async () => {
    await asAuthenticated(ids.member);
    const result = await db.query("select * from public.get_my_feature_flags()");
    assert.deepEqual(Object.keys(result.rows[0]).sort(), ["enabled", "flag_key"]);
    assert.deepEqual(result.rows, [
      { flag_key: "global_on", enabled: true },
      { flag_key: "malformed_override", enabled: true },
      { flag_key: "member_override", enabled: true },
      { flag_key: "other_override", enabled: false },
    ]);
  });

  await check("another user's override never changes the caller's result", async () => {
    await asAuthenticated(ids.outsider);
    const result = await db.query(
      "select enabled from public.get_my_feature_flags() where flag_key = 'member_override'",
    );
    assert.equal(result.rows[0]?.enabled, false);
  });

  await check("missing authenticated identity fails closed", async () => {
    await asAuthenticated(null);
    const result = await db.query("select * from public.get_my_feature_flags()");
    assert.equal(result.rows.length, 0);
  });

  await check("only authenticated callers can execute the effective-read RPC", async () => {
    await admin();
    const privilege = async (role) => (
      await db.query(
        "select has_function_privilege($1, 'public.get_my_feature_flags()', 'execute') as allowed",
        [role],
      )
    ).rows[0].allowed;
    assert.equal(await privilege("authenticated"), true);
    assert.equal(await privilege("anon"), false);
    assert.equal(await privilege("service_role"), false);
  });

  await check("the migration is replay-safe", async () => {
    await admin();
    await db.exec(migration);
    await asAuthenticated(ids.member);
    const result = await db.query("select * from public.get_my_feature_flags()");
    assert.equal(result.rows.length, 4);
  });

  console.log(`${passed} passed; ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
} finally {
  await db.close();
}
