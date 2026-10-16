import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ids, actor, request, execute, type Database } from './fixture.ts';
import { denied, snapshot } from './cases.ts';
import { readDrawingEvidence, type DrawingEvidenceExtension } from '../../../src/lib/drawingCommands/evidenceExport.ts';

export const exportCandidateUrl = new URL('../../candidates/drawing-source-observation-export.sql', import.meta.url);
export const recoveryUrl = new URL('./recovery.sql', import.meta.url);
const client = (db: Database) => ({ rpc: async (_name: string, args: Record<string, unknown>) => {
  const result = await db.query('select public.get_drawing_source_observations($1,$2,$3,$4,$5) value',
    [args.p_project_id, args.p_after_receipt, args.p_after_drawing, args.p_snapshot_token, args.p_limit]);
  return { data: result.rows[0].value, error: null };
} });
async function read(db: Database) {
  await db.exec('set local role authenticated');
  try { return await readDrawingEvidence(client(db), ids.project); } finally { await db.exec('reset role'); }
}
async function seed(db: Database, count = 1) {
  // Synthetic fixture history only; never an operational recovery path.
  await execute(db, await request(db));
  await db.query(`insert into steelbuild_drawing_revision.requests(id,actor_id,request_id,operation,project_id,set_id,payload_sha256,result)
    select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1,gen_random_uuid(),'revise_set',$2,$3,repeat('a',64),'{}'
    from generate_series(1,$4::integer) i`, [ids.pm, ids.project, ids.set, count]);
  await db.query(`insert into steelbuild_drawing_revision.source_observations(receipt_id,drawing_id,project_id,drawing_set_id,parent_file_url,parent_pdf_page,extracted_text,callouts)
    select id,$1,project_id,set_id,case when right(id::text,1)='1' then null else 'fixture/prior.pdf' end,3,
    case when right(id::text,1)='1' then null else '' end,
    case when right(id::text,1)='1' then null when right(id::text,1)='2' then 'null'::jsonb else '[]'::jsonb end
    from steelbuild_drawing_revision.requests where id::text like '10000000-%'`, [ids.drawing]);
  // Remove command's extra observation so the requested history size is exact.
  await db.exec("delete from steelbuild_drawing_revision.source_observations where receipt_id::text not like '10000000-%'");
}
export async function runExportCases(db: Database, actualPostgres = false) {
  let checks = 0;
  async function check(name: string, run: () => Promise<void>) {
    await db.exec('begin'); await actor(db);
    try { await run(); checks++; console.log(`PASS export ${name}`); } finally { await db.exec('rollback;reset role'); }
  }
  await check('exports1001ObservationsWithoutCapLoss', async () => {
    await seed(db, 1001); await actor(db, ids.viewer);
    const extension = await read(db); assert.equal(extension.observations.length, 1001);
    assert.equal(extension.observations[0].callouts_is_sql_null, true);
    assert.equal(extension.observations[1].callouts, null); assert.equal(extension.observations[1].callouts_is_sql_null, false);
    assert.deepEqual(extension.observations[2].callouts, []); assert.equal(extension.observations[2].extracted_text, '');
    assert.equal(Object.hasOwn(extension.observations[0], 'request_id'), false);
    assert.equal(Object.hasOwn(extension.observations[0], 'actor_id'), false);
  });
  await check('foreignExportDenied and MFA enforced without PM floor', async () => {
    await seed(db); await actor(db, ids.foreign);
    await denied(db, () => readDrawingEvidence(client(db), ids.project), /NOT_AUTHORIZED/);
    await actor(db, ids.viewer, 'aal1'); await denied(db, () => readDrawingEvidence(client(db), ids.project), /NOT_AUTHORIZED/);
    await actor(db, ids.viewer); assert.equal((await read(db)).observations.length, 1);
    await db.exec("alter table public.projects add column status text;update public.projects set status='Archived'");
    assert.equal((await read(db)).observations.length, 1, 'A status label is not the soft-deletion visibility boundary');
    for (const role of ['anon', 'service_role']) {
      await db.exec(`savepoint denied_role;set local role ${role}`);
      try { await assert.rejects(() => client(db).rpc('', { p_project_id: ids.project, p_limit: 500 }), /permission denied/); }
      finally { await db.exec('rollback to savepoint denied_role;reset role'); }
    }
  });
  await check('legacy JSON own prototype-related keys are lossless evidence', async () => {
    await seed(db);
    const value = '{"__proto__":{"polluted":true},"constructor":{"prototype":"__proto__"},"prototype":["__proto__"]}';
    await db.query('update steelbuild_drawing_revision.source_observations set callouts=$1', [value]);
    const observation = (await read(db)).observations[0];
    assert.equal(observation.callouts_is_sql_null, false);
    assert.deepEqual(observation.callouts, JSON.parse(value));
    assert.equal(Object.hasOwn(observation.callouts as object, '__proto__'), true);
    assert.equal('polluted' in {}, false);
  });
  await check('exportRosterChangeFailsClosed for inserts erasure and malformed cursors', async () => {
    await seed(db, 2); const first = (await client(db).rpc('', { p_project_id: ids.project, p_limit: 1 })).data as Record<string, unknown>;
    const cursor = first.next_cursor as Record<string, string>;
    await denied(db, () => client(db).rpc('', { p_project_id: ids.project, p_after_receipt: ids.foreign, p_after_drawing: ids.drawing, p_snapshot_token: first.snapshot_token, p_limit: 500 }), /INVALID/);
    await db.exec("delete from steelbuild_drawing_revision.source_observations where receipt_id='10000000-0000-4000-8000-000000000002'");
    await denied(db, () => client(db).rpc('', { p_project_id: ids.project, p_after_receipt: cursor.receipt_id, p_after_drawing: cursor.drawing_id, p_snapshot_token: first.snapshot_token, p_limit: 500 }), /CONFLICT/);
    for (const args of [{ p_after_receipt: cursor.receipt_id }, { p_limit: 501 }, { p_limit: 0 }, { p_snapshot_token: 'bad' }]) {
      await denied(db, () => client(db).rpc('', { p_project_id: ids.project, p_limit: 500, ...args }), /INVALID/);
    }
    await db.exec('savepoint before_empty');
    await db.exec('delete from steelbuild_drawing_revision.source_observations');
    assert.equal((await read(db)).observations.length, 0);
    await db.exec('rollback to savepoint before_empty');
    const afterErasure = await read(db);
    await db.query(`insert into steelbuild_drawing_revision.source_observations(receipt_id,drawing_id,project_id,drawing_set_id)
      values('10000000-0000-4000-8000-000000000002',$1,$2,$3)`, [ids.drawing, ids.project, ids.set]);
    await denied(db, () => client(db).rpc('', { p_project_id: ids.project, p_snapshot_token: afterErasure.snapshot_token, p_limit: 500 }), /CONFLICT/);
  });
  await check('account deletion nulls receipt actor without business-observation loss', async () => {
    await seed(db, 3); const before = await read(db);
    await db.exec('set local role drawing_fixture_auth_admin'); await db.query('delete from auth.users where id=$1', [ids.pm]); await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.requests where actor_id is not null')).rows[0].n, 0);
    await actor(db, ids.viewer); assert.deepEqual(await read(db), before);
  });
  await check('erasureRemovesOnlySyntheticProject and soft archive retains evidence', async () => {
    await seed(db, 3); const before = await snapshot(db);
    await db.query('select public.soft_delete_project($1)', [ids.project]);
    assert.deepEqual((await snapshot(db))['steelbuild_drawing_revision.source_observations'], before['steelbuild_drawing_revision.source_observations']);
    await denied(db, () => readDrawingEvidence(client(db), ids.project), /NOT_AUTHORIZED/);
    await db.query('select public.hard_delete_project($1,$2)', [ids.project, 'Synthetic observation erasure']);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.source_observations')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from public.projects where id=$1', [ids.foreignProject])).rows[0].n, 1);
  });
  await check('maximum-history token and page query plans', async () => {
    await seed(db, 10000);
    const foreignSet = '77777777-7777-4777-8777-777777777779', foreignDrawing = '88888888-8888-4888-8888-888888888880';
    await db.query("insert into public.drawing_sets(id,project_id,set_name) values($1,$2,'Other project')", [foreignSet, ids.foreignProject]);
    await db.query("insert into public.drawings(id,project_id,drawing_set_id,sheet_number) values($1,$2,$3,'FOREIGN')", [foreignDrawing, ids.foreignProject, foreignSet]);
    await db.query(`insert into steelbuild_drawing_revision.requests(id,actor_id,request_id,operation,project_id,set_id,payload_sha256,result)
      select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1,gen_random_uuid(),'revise_set',$2,$3,repeat('b',64),'{}' from generate_series(1,30000) i`, [ids.foreign, ids.foreignProject, foreignSet]);
    await db.query(`insert into steelbuild_drawing_revision.source_observations(receipt_id,drawing_id,project_id,drawing_set_id)
      select id,$1,project_id,set_id from steelbuild_drawing_revision.requests where project_id=$2`, [foreignDrawing, ids.foreignProject]);
    await db.exec('analyze steelbuild_drawing_revision.source_observations');
    const started = Date.now(); assert.equal((await read(db)).observations.length, 10000);
    console.log(`EXPORT 10000 observations / 21 page+final calls: ${Date.now() - started}ms (${actualPostgres ? 'PG17' : 'PGlite'})`);
    // Explain the actual candidate statement, including a generic plan (PL/pgSQL
    // can switch after repeated calls). A simplified look-alike misses OR-cursor
    // plans that rescan the preceding history on every page.
    const candidate = await readFile(exportCandidateUrl, 'utf8');
    const start = candidate.indexOf('WITH roster AS MATERIALIZED');
    let query = candidate.slice(start, candidate.indexOf('INTO v_result FROM roster;', start) + 'INTO v_result FROM roster;'.length).replace('INTO v_result', '');
    for (const [i, name] of ['p_project_id', 'p_after_receipt', 'p_after_drawing', 'p_snapshot_token', 'p_limit'].entries()) query = query.replaceAll(new RegExp(`\\b${name}\\b`, 'g'), `$${i + 1}`);
    await db.exec(`set local plan_cache_mode=force_generic_plan;prepare export_plan(uuid,uuid,uuid,text,integer) as ${query}`);
    const plans = (await db.query(`explain (analyze,buffers,format json) execute export_plan('${ids.project}','10000000-0000-4000-8000-000000009000','${ids.drawing}',null,500)`)).rows;
    console.log(`EXPORT exact generic query plan ${JSON.stringify(plans)}`);
    const planText = JSON.stringify(plans);
    assert.match(planText, /drawing_source_observations_project_cursor/);
    function inspect(value: unknown) {
      if (Array.isArray(value)) { value.forEach(inspect); return; }
      if (!value || typeof value !== 'object') return;
      const plan = value as Record<string, unknown>;
      if (plan['Relation Name'] === 'source_observations') {
        assert.notEqual(plan['Node Type'], 'Seq Scan');
        assert.equal(plan['Rows Removed by Filter'] ?? 0, 0, 'No preceding history or foreign project rescan per page');
      }
      Object.values(plan).forEach(inspect);
    }
    inspect(plans); await db.exec('deallocate export_plan');
  });
  await check('restoreCannotMintReceiptOrApproval', async () => {
    const script = await readFile(recoveryUrl, 'utf8');
    // Server addresses can be container bridge addresses even when the harness
    // connects through a validated loopback published port. This source check
    // is not a substitute for the actual-PG refusal/positive tests below.
    assert.ok(script.includes("current_setting('drawing_recovery.client_loopback_verified',true)"));
    if (!actualPostgres) {
      await db.exec('savepoint recovery_guard');
      try { await assert.rejects(() => db.exec(script), /disposable loopback fixture/); }
      finally { await db.exec('rollback to savepoint recovery_guard'); }
      return;
    }
    for (const marker of ['empty_fixture_verified', 'client_loopback_verified']) {
      for (const value of ['', 'invalid']) {
        await db.exec('savepoint missing_recovery_marker');
        await db.query('select set_config($1,$2,true)', [`drawing_recovery.${marker}`, value]);
        try { await assert.rejects(() => db.exec(script), /disposable loopback fixture/); }
        finally { await db.exec('rollback to savepoint missing_recovery_marker'); }
        assert.equal((await db.query("select to_regnamespace('drawing_observation_recovery') value")).rows[0].value, null);
      }
    }
    await seed(db, 4);
    const specialCallouts = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":"__proto__"},"prototype":["__proto__"]}');
    await db.query("update steelbuild_drawing_revision.source_observations set callouts=$1 where receipt_id='10000000-0000-4000-8000-000000000004'", [JSON.stringify(specialCallouts)]);
    const extension: DrawingEvidenceExtension = await read(db);
    const beforeState = await snapshot(db);
    const before = { requests: beforeState['steelbuild_drawing_revision.requests'], approvals: beforeState['public.submittals'] };
    await db.exec('create temp table drawing_recovery_input(envelope jsonb, remaps jsonb) on commit drop');
    await db.query('insert into drawing_recovery_input values($1,$2)', [JSON.stringify({ export_version: 2, project: { id: ids.project }, tables: { drawing_sets: [{ id: ids.set, project_id: ids.project }], drawings: [{ id: ids.drawing, project_id: ids.project, drawing_set_id: ids.set }] }, extensions: { drawing_evidence: extension } }),
      JSON.stringify([{ kind: 'project', original_id: ids.project, destination_id: ids.project }, { kind: 'set', original_id: ids.set, destination_id: ids.set2 }, { kind: 'drawing', original_id: ids.drawing, destination_id: ids.drawing2 }])]);
    for (const mutation of [
      `envelope=jsonb_set(envelope,'{extensions,drawing_evidence,version}','2')`,
      `envelope=jsonb_set(envelope,'{extensions,drawing_evidence,observations,0,project_id}','"${ids.foreignProject}"')`,
      `envelope=jsonb_set(envelope,'{extensions,drawing_evidence,observations,0,callouts}','[]')`,
      `envelope=jsonb_set(envelope,'{extensions,drawing_evidence,snapshot_token}','"${'b'.repeat(64)}"')`,
      `envelope=jsonb_set(envelope,'{tables,drawings,0,drawing_set_id}','"${ids.set2}"')`,
      `remaps=jsonb_set(remaps,'{2,destination_id}','"${ids.foreign}"')`,
      `envelope=jsonb_set(envelope,'{extensions,drawing_evidence,observations}',(envelope#>'{extensions,drawing_evidence,observations}')||(envelope#>'{extensions,drawing_evidence,observations,0}'))`,
    ]) {
      await db.exec('savepoint invalid_recovery');
      await db.exec(`update drawing_recovery_input set ${mutation}`);
      try { await assert.rejects(() => db.exec(script), /Invalid|Foreign|mismatch|roster|duplicate/i); }
      finally { await db.exec('rollback to savepoint invalid_recovery'); }
      assert.equal((await db.query("select to_regnamespace('drawing_observation_recovery') value")).rows[0].value, null);
      assert.deepEqual(await snapshot(db), beforeState);
    }
    await db.exec(script);
    assert.deepEqual((await db.query('select original_observation from drawing_observation_recovery.observations order by original_receipt_id,original_drawing_id')).rows.map(r => r.original_observation), extension.observations);
    const recovered = (await db.query('select destination_set_id,destination_drawing_id,callouts is null sql_null,callouts from drawing_observation_recovery.observations order by original_receipt_id')).rows;
    assert.ok(recovered.every(row => row.destination_set_id === ids.set2 && row.destination_drawing_id === ids.drawing2));
    assert.deepEqual(recovered.map(row => [row.sql_null, row.callouts]), [[true, null], [false, null], [false, []], [false, specialCallouts]]);
    assert.equal(Object.hasOwn(recovered[3].callouts as object, '__proto__'), true);
    assert.equal('polluted' in {}, false);
    const afterState = await snapshot(db);
    const after = { requests: afterState['steelbuild_drawing_revision.requests'], approvals: afterState['public.submittals'] };
    assert.deepEqual(after.requests, before.requests); assert.deepEqual(after.approvals, before.approvals);
    assert.deepEqual(afterState, beforeState);
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db.query("select has_schema_privilege($1,'drawing_observation_recovery','USAGE') allowed", [role])).rows[0].allowed, false);
  });
  return checks;
}
