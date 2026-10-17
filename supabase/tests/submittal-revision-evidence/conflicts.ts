import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { actor, ids, type Database } from './fixture.ts';
import { command, execute, parent, submit } from './cases.ts';

export const conflictMigrationUrl = new URL('../../migrations/20261017081234_nonretryable_submittal_revision_conflicts.sql', import.meta.url);
const signatures = ['steelbuild_workflow.apply_round(uuid,uuid,timestamp with time zone,text,uuid,uuid[],jsonb,boolean,text)', 'public.publish_drawing_revision(uuid,text)'];
async function definitions(db: Database) {
  return (await db.query<{ definition: string; owner: number; acl: unknown; config: unknown; security: boolean }>(
    'select pg_get_functiondef(p.oid) definition,proowner owner,proacl acl,proconfig config,prosecdef security from pg_proc p where p.oid=any($1::regprocedure[]) order by p.oid', [signatures])).rows;
}

export async function installConflictMigration(db: Database) {
  const before = await definitions(db);
  await db.exec(await readFile(conflictMigrationUrl, 'utf8'));
  const after = await definitions(db);
  assert.deepEqual(after, before.map(fn => ({ ...fn, definition: fn.definition.replaceAll("ERRCODE='40001'", "ERRCODE='PT409'") })), 'Only the three reviewed SQLSTATE literals may change; preserve ownership, grants and configuration');
}

export async function runConflictMigrationSafetyCases(db: Database) {
  const sql = await readFile(conflictMigrationUrl, 'utf8');
  for (const drift of ['missing', 'duplicate'] as const) {
    await db.exec('begin');
    try {
      const definition = (await db.query<{ definition: string }>('select pg_get_functiondef($1::regprocedure) definition', [signatures[1]])).rows[0].definition;
      const guard = "RAISE EXCEPTION 'ROUND_STALE_ROSTER: The revision parent changed; reload' USING ERRCODE='40001';";
      const changed = drift === 'missing' ? definition.replace(guard, guard.replace('reload', 'review again')) : definition.replace(guard, `${guard}\n/* ${guard} */`);
      assert.notEqual(changed, definition);
      await db.exec(changed);
      const before = await definitions(db);
      await db.exec('savepoint migration_rejected');
      await assert.rejects(db.exec(sql), /CONFLICT_PATCH_DRIFT/);
      await db.exec('rollback to savepoint migration_rejected');
      assert.deepEqual(await definitions(db), before, 'A later drift rejection must roll back earlier function replacements atomically');
      console.log(`PASS ${drift} guard drift rejects the entire conflict patch`);
    } finally { await db.exec('rollback'); }
  }
}

async function snapshot(db: Database) {
  await db.exec('reset role');
  const tables = ['public.submittals', 'public.submittal_rounds', 'public.submittal_round_revision_evidence', 'public.drawings', 'public.drawing_revisions', 'steelbuild_workflow.round_requests', 'steelbuild_workflow.round_context'];
  const rows = [];
  for (const table of tables) rows.push((await db.query(`select to_jsonb(t) row from ${table} t order by to_jsonb(t)::text`)).rows);
  await db.exec('set role authenticated');
  return rows;
}

export async function runConflictCases(db: Database) {
  await actor(db);
  for (const scenario of ['parent', 'roster', 'publish'] as const) {
    await db.exec('begin;set local role authenticated');
    try {
      const reviewed = await parent(db);
      if (scenario === 'parent') await execute(db, command(reviewed, submit));
      if (scenario === 'publish') await db.query('update public.drawings set is_deleted=true where id=$1', [ids.drawing]);
      const before = await snapshot(db);
      await db.exec('savepoint rejected_conflict');
      const attempt = scenario === 'publish'
        ? db.query("select public.publish_drawing_revision($1,'released_for_shop')", [ids.revision])
        : execute(db, command(reviewed, submit, undefined, scenario === 'roster' ? [ids.revision] : undefined));
      await assert.rejects(attempt, (error: unknown) => {
        const failure = error as { code?: string; message?: string };
        assert.equal(failure.code, 'PT409', 'A deterministic stale review must return HTTP conflict without PostgREST serialization retry');
        assert.match(failure.message || '', scenario === 'parent' ? /ROUND_STALE:/ : /ROUND_STALE_ROSTER:/);
        return true;
      });
      await db.exec('rollback to savepoint rejected_conflict');
      assert.deepEqual(await snapshot(db), before, 'Rejected conflict must preserve parent, revisions, round evidence, receipts and context');
      console.log(`PASS nonretryable ${scenario} conflict and unchanged state`);
    } finally { await db.exec('rollback'); }
  }
}
