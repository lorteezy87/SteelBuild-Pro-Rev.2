import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationsUrl = new URL('../../migrations/', import.meta.url);
const candidates = (await readdir(migrationsUrl))
  .filter(name => name.endsWith('_isolate_email_account_credentials.sql'));
assert.equal(candidates.length, 1, 'Expected exactly one isolate_email_account_credentials migration');
const migration = await readFile(new URL(candidates[0], migrationsUrl), 'utf8');

const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema private;
    create table public.email_accounts (
      id uuid primary key,
      project_id uuid not null,
      email_address text not null,
      display_name text,
      access_token text,
      refresh_token text,
      token_expires_at timestamptz,
      updated_at timestamptz not null default now()
    );
    grant select on public.email_accounts to authenticated;
    insert into public.email_accounts (
      id, project_id, email_address, display_name,
      access_token, refresh_token, token_expires_at, updated_at
    ) values
      ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
       'oauth@example.invalid', 'OAuth mailbox', 'access-secret', 'refresh-secret',
       '2027-01-02T03:04:05Z', '2026-10-10T01:02:03Z'),
      ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
       'forward@example.invalid', 'Forward-only mailbox', null, null, null,
       '2026-10-10T02:03:04Z');
  `);

  await db.exec(migration);

  const publicColumns = (await db.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'email_accounts'
    order by ordinal_position
  `)).rows.map(row => row.column_name);
  assert.equal(publicColumns.includes('access_token'), false);
  assert.equal(publicColumns.includes('refresh_token'), false);
  assert.equal(publicColumns.includes('token_expires_at'), false);

  const credentials = (await db.query(`
    select account_id, access_token, refresh_token,
           to_char(token_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') token_expires_at,
           to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') updated_at
    from private.email_account_credentials
    order by account_id
  `)).rows;
  assert.deepEqual(credentials, [{
    account_id: '10000000-0000-4000-8000-000000000001',
    access_token: 'access-secret',
    refresh_token: 'refresh-secret',
    token_expires_at: '2027-01-02T03:04:05Z',
    updated_at: '2026-10-10T01:02:03Z',
  }]);

  for (const role of ['anon', 'authenticated', 'service_role']) {
    const privilege = (await db.query(
      `select has_table_privilege($1, 'private.email_account_credentials', 'select') result`,
      [role],
    )).rows[0].result;
    assert.equal(privilege, false, `${role} must not read mailbox credentials directly`);
  }

  await db.exec('set role authenticated');
  const visible = (await db.query('select * from public.email_accounts order by id')).rows;
  assert.equal(visible.length, 2);
  assert.equal(Object.hasOwn(visible[0], 'access_token'), false);
  await assert.rejects(
    db.query('select * from private.email_account_credentials'),
    error => error.code === '42501',
  );

  await db.exec('reset role');
  await db.query('delete from public.email_accounts where id = $1', ['10000000-0000-4000-8000-000000000001']);
  const remaining = (await db.query('select count(*)::int result from private.email_account_credentials')).rows[0].result;
  assert.equal(remaining, 0, 'credentials must follow account deletion');

  console.log('PASS email account credentials are migrated, hidden, and lifecycle-bound');
} finally {
  await db.close();
}
