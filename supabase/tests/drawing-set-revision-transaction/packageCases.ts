import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { actor, request, createRequest, execute, createSet, prepareFixtureInstall, reviewedPayloads, manualInstallUrl, type Database } from './fixture.ts';
import { snapshot } from './cases.ts';

export async function runInstallationCases(db: Database) {
  await prepareFixtureInstall(db);
  const sql = await readFile(manualInstallUrl, 'utf8');
  const before = (await db.query("select encode(sha256(convert_to(pg_get_functiondef('public.soft_delete_project(uuid)'::regprocedure),'UTF8')),'hex') hash")).rows[0].hash;
  const expected = (await db.query("select current_setting('drawing_cutover.expected_prerequisites') value")).rows[0].value as string;
  const prerequisites = JSON.parse(expected) as { identity: string; sha256: string }[];
  let checks = 0;
  for (const invalid of [[], prerequisites.slice(1), [...prerequisites, prerequisites[0]], prerequisites.map((p, i) => i ? p : { ...p, sha256: '0'.repeat(64) })]) {
    await db.query("select set_config('drawing_cutover.expected_prerequisites',$1,false)", [JSON.stringify(invalid)]);
    await assert.rejects(() => db.exec(sql), /CUTOVER_PREREQUISITE/); await db.exec('rollback');
    assert.equal((await db.query("select to_regnamespace('steelbuild_drawing_revision') name")).rows[0].name, null);
    assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n, 0);
    checks++; console.log('PASS missing/omitted/duplicate/stale prerequisite refuses before installation');
  }
  await db.query("select set_config('drawing_cutover.expected_prerequisites',$1,false)", [expected]);
  await db.exec('alter default privileges grant execute on functions to drawing_fixture_inherited');
  await assert.rejects(() => db.exec(sql), /CUTOVER_EFFECTIVE_EXECUTE_EXPOSURE/); await db.exec('rollback');
  assert.equal((await db.query("select to_regnamespace('steelbuild_drawing_revision') name")).rows[0].name, null);
  await db.exec('alter default privileges revoke execute on functions from drawing_fixture_inherited');
  checks++; console.log('PASS inherited effective mutation EXECUTE aborts installation without broad role revocation');
  // Fail the fourth stamp AFTER all four exact payloads executed; rollback must undo everything.
  await db.exec(`alter table supabase_migrations.schema_migrations add constraint fixture_fourth_failure check(version <> '${reviewedPayloads[3].version}')`);
  await assert.rejects(() => db.exec(sql), /fixture_fourth_failure/);
  await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n, 0);
  assert.equal((await db.query("select to_regnamespace('steelbuild_drawing_revision') name")).rows[0].name, null);
  assert.equal((await db.query("select encode(sha256(convert_to(pg_get_functiondef('public.soft_delete_project(uuid)'::regprocedure),'UTF8')),'hex') hash")).rows[0].hash, before);
  await db.exec('alter table supabase_migrations.schema_migrations drop constraint fixture_fourth_failure');
  console.log('PASS fourth payload/stamp failure rolls back entire installation and all ledger rows');
  await db.exec(sql);
  const ledger = (await db.query('select version,statements from supabase_migrations.schema_migrations order by version')).rows;
  assert.deepEqual(ledger, reviewedPayloads.map(payload => ({ version: payload.version, statements: [payload.payload] })));
  console.log('PASS executed whole payloads equal exact ordered promoted bytes and one-element ledger statements');
  return checks + 2;
}

/** The installed package must be disabled before any TEST-ONLY positive grants. */
export async function runPackageCases(db: Database) {
  let checks = 0;
  for (const create of [false, true]) {
    await db.exec('begin'); await actor(db);
    try {
      const payload = await (create ? createRequest : request)(db);
      const before = await snapshot(db);
      await db.exec('savepoint disabled;set local role authenticated');
      await assert.rejects(() => (create ? createSet : execute)(db, payload), /permission denied/);
      await db.exec('rollback to savepoint disabled;reset role');
      assert.deepEqual(await snapshot(db), before);
      checks++; console.log(`PASS disabled installation denies direct ${create ? 'create' : 'revise'} RPC`);
    } finally { await db.exec('rollback;reset role'); }
  }
  const fingerprint = async () => (await db.query('select steelbuild_drawing_revision.catalog_fingerprint() hash')).rows[0].hash;
  const disabledHash = await fingerprint();
  const capture = await readFile(new URL('../../drawing-cutover/activation-capture.sql', import.meta.url), 'utf8');
  await db.exec('grant execute on function public.apply_drawing_set_revision(uuid,jsonb) to service_role');
  try { await assert.rejects(() => db.exec(capture), /CUTOVER_NOT_DISABLED/); }
  finally { await db.exec('rollback;revoke execute on function public.apply_drawing_set_revision(uuid,jsonb) from service_role'); }
  checks++; console.log('PASS capture rejects effective service-role mutation exposure');
  const result = await db.exec(capture) as { rows?: { state?: string; sha256?: string }[] }[];
  const rows = result.flatMap(r => r.rows ?? []);
  assert.equal(rows.find(r => r.state === 'installed_disabled')?.sha256, disabledHash);
  const enabledHash = rows.find(r => r.state === 'prospective_enabled_same_instances')?.sha256;
  assert.match(enabledHash ?? '', /^[a-f0-9]{64}$/); assert.notEqual(enabledHash, disabledHash);
  assert.equal(await fingerprint(), disabledHash);
  assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.package_review')).rows[0].n, 0);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await db.query("select has_function_privilege($1,'steelbuild_drawing_revision.catalog_snapshot()','EXECUTE') permitted", [role])).rows[0].permitted, false);
  }
  checks++; console.log('PASS operator-only complete capture shares fingerprint and rolls back prospective grants without approval');
  const activation = await readFile(new URL('../../drawing-cutover/activate-manual.sql', import.meta.url), 'utf8');
  for (const [disabled, enabled] of [[null, null], ['0'.repeat(64), enabledHash], [disabledHash, '0'.repeat(64)]]) {
    await db.query("select set_config('drawing_cutover.expected_disabled_sha256',$1,false),set_config('drawing_cutover.expected_enabled_sha256',$2,false)", [disabled ?? '', enabled ?? '']);
    await assert.rejects(() => db.exec(activation), /CUTOVER_REVIEW_BINDINGS_REQUIRED|CUTOVER_DISABLED_CATALOG_MISMATCH|CUTOVER_ENABLED_CATALOG_MISMATCH/);
    await db.exec('rollback'); assert.equal(await fingerprint(), disabledHash);
    assert.equal((await db.query('select count(*)::int n from steelbuild_drawing_revision.package_review')).rows[0].n, 0);
    checks++; console.log('PASS absent/stale literal review hashes refuse activation and roll back grants');
  }
  // Explicit synthetic approval ONLY; no actual environment is approved by this fixture.
  await db.query("select set_config('drawing_cutover.expected_disabled_sha256',$1,false),set_config('drawing_cutover.expected_enabled_sha256',$2,false)", [disabledHash, enabledHash]);
  await db.exec(activation); assert.equal(await fingerprint(), enabledHash);
  assert.equal((await db.query('select approved from steelbuild_drawing_revision.package_review')).rows[0].approved, true);
  checks++; console.log('PASS reviewed same-instance literals activate exact prospective grants atomically');
  await db.exec('delete from steelbuild_drawing_revision.package_review;revoke execute on function public.create_drawing_set_from_review(uuid,jsonb),public.apply_drawing_set_revision(uuid,jsonb) from authenticated');
  return checks;
}
