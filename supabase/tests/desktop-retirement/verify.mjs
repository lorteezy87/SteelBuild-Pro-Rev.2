import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);`);
  await db.exec(readFileSync(new URL('../../migrations/20260721230000_desktop_session_handoffs.sql', import.meta.url), 'utf8'));
  const routines = ['public.create_desktop_session_handoff(text,uuid,text,text,jsonb,timestamptz,timestamptz)', 'public.consume_desktop_session_handoff(text,text)'];
  for (const routine of routines) assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['service_role', routine, 'execute'])).rows[0].allowed, true);
  await db.exec(readFileSync(new URL('../../migrations/20261009221740_retire_desktop_companion_handoff.sql', import.meta.url), 'utf8'));
  let checks = 0;
  for (const role of ['anon','authenticated','service_role']) {
    for (const routine of routines) {
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', [role, routine, 'execute'])).rows[0].allowed, false);
      checks++;
    }
    assert.equal((await db.query("select has_table_privilege($1,'private.desktop_session_handoffs','select,insert,update,delete') as allowed", [role])).rows[0].allowed, false);
    checks++;
  }
  assert.equal((await db.query("select to_regclass('private.desktop_session_handoffs') is not null as retained")).rows[0].retained, true);
  console.log(`PASS ${checks + 1} desktop retirement SQL checks; historical schema retained, no runtime access`);
} finally { await db.close(); }
