import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const fixture = await readFile(new URL('./live-helper-fixture.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../migrations/20260911062832_pin_workflow_helper_search_paths.sql', import.meta.url), 'utf8');
const db = new PGlite();
const transitions = ['backcharge', 'change_order', 'expense', 'pay_application', 'risk'];
const statuses = [null, '', 'draft', 'notice_sent', 'pending', 'disputed', 'approved', 'rejected', 'collected', 'void', 'submitted', 'paid', 'Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Void', 'Pending', 'Paid', 'Open', 'Mitigating', 'Mitigated', 'Accepted', 'Transferred', 'Closed'];
const bics = [null, '', '   ', 'Engineer', 'EOR', 'GC', 'Owner', 'Closed', 'Detailer'];
async function snapshot() {
  const results = [];
  for (const name of transitions) {
    const { rows } = await db.query(`select public.${name}_transition_allowed(a, b) as result from unnest($1::text[]) with ordinality x(a, i) cross join unnest($1::text[]) with ordinality y(b, j) order by i,j`, [statuses]);
    results.push(rows);
  }
  results.push((await db.query('select public.submittal_bic_class(b) as result from unnest($1::text[]) with ordinality x(b,i) order by i', [bics])).rows);
  results.push((await db.query(`select public.submittal_derived_stage(s,b,d) as result from unnest($1::text[]) with ordinality x(s,i) cross join unnest($2::text[]) with ordinality y(b,j) cross join unnest(array[null::date,'2026-09-11'::date]) with ordinality z(d,k) order by i,j,k`, [[...statuses, 'Approved as Noted', 'Revise and Resubmit', 'Released for Fabrication'], bics])).rows);
  const metadata = [null, {}, ...Array.from({ length: 16 }, (_, n) => ({ ofs_checklist: Object.fromEntries(['markups_incorporated', 'comments_addressed', 'sheets_ready', 'authorized_to_issue'].map((k,i) => [k, Boolean(n & (1 << i))])) }))];
  results.push((await db.query('select public.submittal_ofs_checklist_complete(m) as result from unnest($1::jsonb[]) with ordinality x(m,i) order by i', [metadata.map(m => m == null ? null : JSON.stringify(m))])).rows);
  return results;
}
const metadataQuery = `select proname, prosrc, provolatile, prosecdef, prorettype, proacl from pg_proc where pronamespace='public'::regnamespace order by proname`;
try {
  await db.exec(fixture);
  const before = await snapshot();
  const definitions = (await db.query(metadataQuery)).rows;
  await db.exec(`create schema caller_controlled; create function caller_controlled.btrim(text) returns text language sql immutable as $$ select ''::text $$; set search_path=caller_controlled,pg_catalog;`);
  assert.equal((await db.query("select public.submittal_bic_class('Engineer') as result")).rows[0].result, 'detailer', 'fixture must reproduce caller search-path influence');
  await db.exec('set search_path=public');
  await db.exec(migration);
  const hardened = (await db.query(`select proname from pg_proc where pronamespace='public'::regnamespace and proconfig @> array['search_path=""'] order by proname`)).rows;
  assert.equal(hardened.length, 8, 'all eight reviewed helpers must have an empty search path');
  assert.deepEqual(await snapshot(), before, 'trusted-path function results must remain unchanged');
  assert.deepEqual((await db.query(metadataQuery)).rows, definitions, 'function bodies, return types, volatility, grants and invoker semantics must not change');
  await db.exec('set search_path=caller_controlled,pg_catalog');
  assert.equal((await db.query("select public.submittal_bic_class('Engineer') as result")).rows[0].result, 'approver', 'pinned helper must ignore the caller-controlled btrim');
  await db.exec('set search_path=public');
  await db.exec(migration);
  assert.deepEqual(await snapshot(), before, 'repeat application must be idempotent');
  // Missing optional module functions must not be created or block a Rev 2-only replay.
  for (const name of transitions) await db.exec(`drop function public.${name}_transition_allowed(text,text)`);
  await db.exec(migration);
  assert.equal((await db.query("select count(*)::int as n from pg_proc where pronamespace='public'::regnamespace")).rows[0].n, 3);
  // Refuse an unreviewed definition, and roll back earlier changes within the same DO statement.
  await db.exec(fixture);
  await db.exec(`alter function public.backcharge_transition_allowed(text,text) reset search_path; create or replace function public.submittal_bic_class(p_bic text) returns text language sql immutable as $$select 'changed'::text$$;`);
  await assert.rejects(db.exec(migration), /unreviewed definition/i);
  assert.equal((await db.query("select proconfig from pg_proc where oid='public.backcharge_transition_allowed(text,text)'::regprocedure")).rows[0].proconfig, null, 'failed migration must not leave partial hardening');
  console.log(`PASS: eight pinned helpers; ${before.reduce((n,r) => n+r.length,0)} unchanged result cases; caller-schema isolation; idempotency; missing modules; changed-definition rollback.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
