import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../migrations/20261017081417_preserve_empty_drawing_set_on_sheet_delete.sql', import.meta.url), 'utf8');
const capture = await readFile(new URL('../../_capture/production-public-functions-2026-09-15.sql', import.meta.url), 'utf8');
const baseline = await readFile(new URL('../../migrations/20260101000010_baseline_schema.sql', import.meta.url), 'utf8');
const capturedHelper = capture.match(/CREATE OR REPLACE FUNCTION public\.recount_drawing_set\(p_set_id uuid\)[\s\S]*?\$function\$\s*$/m);
// The production capture omits trailing semicolons between definitions.
const helper = capture.slice(capture.indexOf('CREATE OR REPLACE FUNCTION public.recount_drawing_set(p_set_id uuid)')).split('$function$')[0]
  + '$function$' + capture.slice(capture.indexOf('CREATE OR REPLACE FUNCTION public.recount_drawing_set(p_set_id uuid)')).split('$function$')[1] + '$function$;';
assert.ok(capturedHelper, 'Reviewed production helper must remain available');
const baselineSync = baseline.match(/CREATE OR REPLACE FUNCTION "public"\."sync_drawing_set_counts"\(\)[\s\S]*?\$\$;/)?.[0];
assert.ok(baselineSync);
const db = new PGlite();
const setId = '11111111-1111-4111-8111-111111111111';
const sheetId = '22222222-2222-4222-8222-222222222222';
const submittalId = '33333333-3333-4333-8333-333333333333';
const historicalSet = '44444444-4444-4444-8444-444444444444';
const archivedSet = '55555555-5555-4555-8555-555555555555';
const archivedSheet = '66666666-6666-4666-8666-666666666666';

async function parent(id) { return (await db.query('select * from public.drawing_sets where id=$1', [id])).rows[0]; }
async function helperProperties() {
  return (await db.query(`select p.proowner,p.proacl::text,p.prosecdef,p.proconfig,p.provolatile,p.proisstrict,p.procost,p.proparallel
    from pg_proc p where p.oid='public.recount_drawing_set(uuid)'::regprocedure`)).rows[0];
}
async function evidence() {
  return (await db.query(`select row_to_json(s) as submittal,
    (select jsonb_agg(to_jsonb(r) order by r.id) from public.drawing_revisions r) as revisions,
    (select jsonb_agg(to_jsonb(e) order by e.id) from public.submittal_round_revision_evidence e) as manifest
    from public.submittals s where s.id=$1`, [submittalId])).rows;
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.drawing_sets(id uuid primary key, project_id uuid, set_name text,
      is_deleted boolean not null default false, deleted_at timestamptz, sheet_count integer default 0,
      processed_count integer default 0, needs_review_count integer default 0, failed_count integer default 0, updated_at timestamptz);
    create table public.drawings(id uuid primary key, project_id uuid, drawing_set_id uuid references public.drawing_sets,
      is_deleted boolean not null default false, deleted_at timestamptz, stage text default 'Not Started',
      ai_extraction_status text, upload_status text);
    create table public.submittals(id uuid primary key, drawing_set_ids uuid[], status text, submittal_type text);
    create table public.drawing_revisions(id uuid primary key, drawing_id uuid, file_url text, is_current boolean);
    create table public.submittal_round_revision_evidence(id uuid primary key, submittal_id uuid, drawing_revision_id uuid, file_url text);
    ${helper}
    revoke all on function public.recount_drawing_set(uuid) from public,anon,authenticated;
    grant execute on function public.recount_drawing_set(uuid) to service_role;
    create function public.sync_drawing_set_counts() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
    begin
      if tg_op='UPDATE' and old.drawing_set_id is distinct from new.drawing_set_id then
        perform public.recount_drawing_set(old.drawing_set_id);
      end if;
      perform public.recount_drawing_set(case when tg_op='DELETE' then old.drawing_set_id else new.drawing_set_id end);
      return coalesce(new,old);
    end; $$;
    revoke all on function public.sync_drawing_set_counts() from public,anon,authenticated,service_role;
    create trigger trg_drawings_sync_set_counts after insert or delete or update of drawing_set_id,ai_extraction_status,upload_status,is_deleted
      on public.drawings for each row execute function public.sync_drawing_set_counts();
    grant select on all tables in schema public to authenticated;
    grant update on public.drawings to authenticated;
    insert into public.drawing_sets(id,set_name) values('${historicalSet}','Historical failure');
    insert into public.drawings(id,drawing_set_id) values('${historicalSet}','${historicalSet}');
    update public.drawings set is_deleted=true,deleted_at=now() where id='${historicalSet}';
    update public.drawings set is_deleted=false,deleted_at=null where id='${historicalSet}';
  `);
  assert.equal((await parent(historicalSet)).is_deleted, true, 'Captured helper reproduces last-sheet deletion + Undo hiding its parent');
  const historical = await parent(historicalSet);
  const properties = await helperProperties();
  const wrapper = (await db.query("select pg_get_functiondef('public.sync_drawing_set_counts()'::regprocedure) as definition")).rows[0].definition;
  await db.exec(migration);
  assert.deepEqual(await helperProperties(), properties, 'Owner, execute grants and function attributes must be preserved');
  assert.equal((await db.query("select pg_get_functiondef('public.sync_drawing_set_counts()'::regprocedure) as definition")).rows[0].definition, wrapper, 'Do not rewrite the installed trigger wrapper');
  assert.deepEqual(await parent(historicalSet), historical, 'Never backfill or resurrect previously archived sets');
  await db.exec(`
    insert into public.drawing_sets(id,set_name) values('${setId}','Recoverable package');
    insert into public.drawings(id,drawing_set_id,ai_extraction_status,upload_status) values('${sheetId}','${setId}','Processed','Complete');
    insert into public.submittals values('${submittalId}',array['${setId}']::uuid[],'Approved','Shop Drawing');
    insert into public.drawing_revisions values('${sheetId}','${sheetId}','retained/source.pdf',true);
    insert into public.submittal_round_revision_evidence values('${sheetId}','${submittalId}','${sheetId}','retained/source.pdf');
  `);
  const savedEvidence = await evidence();
  assert.equal((await parent(setId)).sheet_count, 1);
  assert.equal((await parent(setId)).processed_count, 1);
  await db.exec(`set role authenticated;
    update public.drawings set is_deleted=true,deleted_at=now() where id='${sheetId}'; reset role;`);
  const deletedParent = await parent(setId);
  assert.equal(deletedParent.sheet_count, 0);
  assert.equal(deletedParent.processed_count, 0);
  assert.equal(deletedParent.is_deleted, false, 'Deleting the last sheet must not archive its drawing set');
  assert.equal(deletedParent.deleted_at, null);
  await db.exec(`set role authenticated;
    update public.drawings set is_deleted=false,deleted_at=null where id='${sheetId}'; reset role;`);
  assert.equal((await parent(setId)).sheet_count, 1);
  assert.equal((await parent(setId)).processed_count, 1);
  assert.equal((await parent(setId)).is_deleted, false);
  const governing = await db.query(`select s.id,s.status from public.submittals s join public.drawing_sets ds on ds.id=any(s.drawing_set_ids)
    join public.drawings d on d.drawing_set_id=ds.id where d.id=$1 and not ds.is_deleted and ds.deleted_at is null`, [sheetId]);
  assert.deepEqual(governing.rows, [{ id: submittalId, status: 'Approved' }], 'Undo must retain the exact active parent / governing-submittal association (IFC workflow)');
  assert.deepEqual(await evidence(), savedEvidence, 'Soft-delete and Undo must preserve approval, manifests and revision/source evidence byte-for-byte');
  await db.exec(`insert into public.drawing_sets(id,set_name) values('${archivedSet}','Explicit admin archive');
    insert into public.drawings(id,drawing_set_id) values('${archivedSheet}','${archivedSet}');
    update public.drawing_sets set is_deleted=true,deleted_at=now() where id='${archivedSet}';
    update public.drawings set is_deleted=true,deleted_at=now() where id='${archivedSheet}';`);
  const explicitArchive = await parent(archivedSet);
  await db.exec(`set role authenticated;
    update public.drawings set is_deleted=false,deleted_at=null where id='${archivedSheet}'; reset role;`);
  const afterUndo = await parent(archivedSet);
  assert.equal(afterUndo.is_deleted, true);
  assert.deepEqual(afterUndo.deleted_at, explicitArchive.deleted_at, 'Sheet Undo cannot clear an explicit parent tombstone');
  await db.exec('set role authenticated');
  await assert.rejects(db.exec(`update public.drawing_sets set is_deleted=false,deleted_at=null where id='${archivedSet}'`), /permission denied/);
  await db.exec('reset role');
  await db.exec(`update public.drawings set ai_extraction_status='NeedsReview',upload_status='Complete' where id='${sheetId}'`);
  assert.equal((await parent(setId)).needs_review_count, 1);
  assert.equal((await parent(setId)).processed_count, 0);
  await db.exec(`update public.drawings set ai_extraction_status='Failed',upload_status='Failed' where id='${sheetId}'`);
  assert.equal((await parent(setId)).failed_count, 1);
  assert.equal((await parent(setId)).needs_review_count, 0);
  await db.exec(migration);
  assert.deepEqual(await helperProperties(), properties, 'Repeated application must preserve function privileges');
  assert.deepEqual((await db.query(`select has_function_privilege('anon','public.recount_drawing_set(uuid)','execute') as anon,
    has_function_privilege('authenticated','public.recount_drawing_set(uuid)','execute') as authenticated,
    has_function_privilege('service_role','public.recount_drawing_set(uuid)','execute') as service`)).rows,
    [{ anon: false, authenticated: false, service: true }]);
  await db.exec('drop function public.recount_drawing_set(uuid)');
  await assert.rejects(db.exec(migration), /baseline|lineage|absent/i, 'Missing helper with a helper-dependent wrapper must fail closed');
  assert.equal((await db.query("select to_regprocedure('public.recount_drawing_set(uuid)') as helper")).rows[0].helper, null);
  await db.exec(baselineSync);
  await db.exec(migration);
  assert.equal((await db.query("select to_regprocedure('public.recount_drawing_set(uuid)') as helper")).rows[0].helper, null, 'Count-only baseline must not acquire a new API-executable helper');
  await db.exec(helper);
  await db.exec("alter function public.recount_drawing_set(uuid) set search_path=public,pg_temp");
  await assert.rejects(db.exec(migration), /metadata differs/, 'Unreviewed function configuration must fail closed');
  await db.exec("alter function public.recount_drawing_set(uuid) set search_path=public");
  const changedHelper = helper.replace('\nbegin\n', '\nbegin\n  perform 1;\n');
  assert.notEqual(changedHelper, helper);
  await db.exec(changedHelper);
  const changedDefinition = (await db.query("select pg_get_functiondef('public.recount_drawing_set(uuid)'::regprocedure) as definition")).rows[0].definition;
  await assert.rejects(db.exec(migration), /body differs/, 'Unreviewed helper body must fail closed');
  assert.equal((await db.query("select pg_get_functiondef('public.recount_drawing_set(uuid)'::regprocedure) as definition")).rows[0].definition, changedDefinition);
  await db.exec(helper.replace("'Processed'", "'Pro cessed'"));
  await assert.rejects(db.exec(migration), /body differs/, 'Semantic whitespace inside a SQL literal must not bypass the body guard');
  console.log('Drawing-set recount: captured failure reproduced; last-sheet delete/Undo, immutable evidence, explicit archives, unchanged ACL, idempotence and baseline lineage passed.');
} finally { await db.close(); }
