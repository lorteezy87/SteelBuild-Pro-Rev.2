import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../../migrations/20261008013546_align_drawing_set_governing_submittal.sql', import.meta.url), 'utf8');
const db = new PGlite();
const project = '11111111-1111-4111-8111-111111111111';
const foreignProject = '22222222-2222-4222-8222-222222222222';
const drawingSet = '33333333-3333-4333-8333-333333333333';
const sheet = '44444444-4444-4444-8444-444444444444';
const approved = '55555555-5555-4555-8555-555555555555';
const draft = '66666666-6666-4666-8666-666666666666';
const productData = '99999999-9999-4999-8999-999999999999';
const unknownType = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignSheet = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const hold = '77777777-7777-4777-8777-777777777777';
const rfi = '88888888-8888-4888-8888-888888888888';
const revision = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const foreignRevision = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mismatchedSignoff = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const matchingSignoff = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function evaluate() {
  const { rows } = await db.query('select public.evaluate_fab_release_set($1::uuid, $2::uuid) as result', [project, drawingSet]);
  return rows[0].result;
}

function blockerKinds(result) {
  return result.blockers.map((blocker) => blocker.kind);
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
    create function public.user_has_project_access(p_project_id uuid) returns boolean
      language sql stable as $$ select p_project_id = '${project}'::uuid $$;
    create table public.projects (id uuid primary key, metadata jsonb);
    create table public.drawing_sets (
      id uuid primary key, project_id uuid not null, set_name text,
      is_deleted boolean not null default false, deleted_at timestamptz,
      set_approval_status text
    );
    create table public.drawings (
      id uuid primary key, project_id uuid not null, drawing_set_id uuid, sheet_number text,
      is_deleted boolean not null default false, deleted_at timestamptz,
      is_superseded boolean default false, file_url text
    );
    create table public.submittals (
      id uuid primary key, project_id uuid not null, submittal_number text, status text, submittal_type text,
      ball_in_court text, approved_date date, submitted_date date, updated_at timestamptz,
      round_number integer, created_at timestamptz, drawing_set_ids uuid[],
      is_deleted boolean not null default false, deleted_at timestamptz
    );
    create table public.drawing_revisions (
      id uuid primary key, project_id uuid not null, drawing_id uuid not null,
      is_current boolean not null default false, archived_at timestamptz,
      release_status text not null
    );
    create table public.drawing_signoffs (
      id uuid primary key, project_id uuid not null, drawing_revision_id uuid not null,
      drawing_id uuid not null, stamp_type text not null, is_voided boolean not null default false
    );
    create table public.drawing_holds (
      id uuid primary key, project_id uuid not null, drawing_id uuid, is_active boolean not null
    );
    create table public.rfis (
      id uuid primary key, project_id uuid not null, drawing_set_id uuid, drawing_id uuid,
      rfi_number text, status text, is_deleted boolean not null default false
    );
    create function public.fab_release_blocking_rfis(p_sheet_ids uuid[])
      returns table(rfi_number text) language sql stable as $$ select null::text where false $$;
    insert into public.projects(id, metadata) values ('${project}', '{}'::jsonb);
    insert into public.drawing_sets(id, project_id, set_name) values ('${drawingSet}', '${project}', 'S - Structural');
    insert into public.drawings(id, project_id, drawing_set_id, sheet_number, file_url)
      values ('${sheet}', '${project}', '${drawingSet}', 'S-101', 'private/s-101.pdf'),
             ('${foreignSheet}', '${foreignProject}', '${drawingSet}', 'SECRET-1', null);
    insert into public.submittals(id, project_id, submittal_number, status, submittal_type, ball_in_court, submitted_date, updated_at, created_at, drawing_set_ids)
      values
      ('${approved}', '${project}', 'SUB-001', 'Approved', 'Shop Drawing', 'GC', '2026-10-01', '2026-10-01', '2026-09-28', array['${drawingSet}'::uuid]),
      ('${draft}', '${project}', 'SUB-002', 'Draft', 'Shop Drawing', 'Detailer', null, '2026-10-02', '2026-10-02', array['${drawingSet}'::uuid]),
      ('${productData}', '${project}', 'SUB-003', 'Approved', 'Product Data', 'GC', '2026-10-03', '2026-10-03', '2026-10-03', array['${drawingSet}'::uuid]),
      ('${unknownType}', '${project}', 'SUB-004', 'Approved', null, 'GC', '2026-10-04', '2026-10-04', '2026-10-04', array['${drawingSet}'::uuid]);
  `);
  await db.exec(sql);

  let result = await evaluate();
  assert.equal(result.rule_version, 'drawing-shop-v2', 'client can refuse stale hosted gate semantics');
  assert.equal(result.governing_stage, 'IFC', 'linked approved shop round still governs');
  assert.equal(result.ok, false, 'an approved round and attached PDF do not replace missing current revision evidence');
  assert.ok(blockerKinds(result).includes('missing_current_revision'));
  await db.query(
    'insert into public.drawing_revisions(id,project_id,drawing_id,is_current,release_status) values ($1,$2,$3,true,$4)',
    [revision, project, sheet, 'released_for_shop'],
  );
  result = await evaluate();
  assert.equal(result.ok, true, 'submitted IFC round governs over newer unsent draft');
  assert.equal(result.submittal_id, approved);
  assert.equal(result.governing_stage, 'IFC');
  assert.equal(result.sheet_count, 1, 'foreign-project sheet pointing at the set is not disclosed or gated');
  assert.deepEqual(result.sheet_ids, [sheet]);

  await db.query("update public.drawing_revisions set release_status='received' where id=$1", [revision]);
  result = await evaluate();
  assert.ok(blockerKinds(result).includes('current_revision_not_distributed'), 'a newly received current revision blocks the older IFC approval');
  await db.query("update public.drawing_revisions set release_status='released_for_shop' where id=$1", [revision]);
  await db.query("update public.drawing_sets set set_approval_status='pending_review' where id=$1", [drawingSet]);
  result = await evaluate();
  assert.ok(blockerKinds(result).includes('set_revision_pending_review'), 'review-pending set cannot be cleared by the older approval');
  await db.query('update public.drawing_sets set set_approval_status=null where id=$1', [drawingSet]);
  assert.equal((await evaluate()).ok, true, 'cleared review state and shop distribution remove the revision blockers');

  await db.query('insert into public.drawing_holds values ($1,$2,$3,true)', [hold, project, sheet]);
  result = await evaluate();
  assert.equal(result.ok, false, 'active sheet hold blocks the set');
  assert.ok(blockerKinds(result).includes('active_holds'));
  await db.query('update public.drawing_holds set is_active=false where id=$1', [hold]);
  assert.equal((await evaluate()).ok, true, 'clearing the hold restores the gate');

  await db.query("insert into public.rfis values ($1,$2,$3,null,'RFI #001','Open',false)", [rfi, project, drawingSet]);
  result = await evaluate();
  assert.equal(result.ok, false, 'open set RFI blocks the set');
  assert.ok(blockerKinds(result).includes('open_rfis'));
  await db.query("update public.rfis set status='Answered' where id=$1", [rfi]);
  assert.equal((await evaluate()).ok, true, 'answered RFI restores the gate');

  await db.query("update public.projects set metadata='{" + '"require_fab_signoffs":true' + "}'::jsonb where id=$1", [project]);
  assert.ok(blockerKinds(await evaluate()).includes('missing_signoffs'), 'opt-in requires a signoff on the active current revision');
  await db.query(
    'insert into public.drawing_revisions(id,project_id,drawing_id,is_current,release_status) values ($1,$2,$3,true,$4)',
    [foreignRevision, foreignProject, foreignSheet, 'released_for_shop'],
  );
  await db.query(
    'insert into public.drawing_signoffs values ($1,$2,$3,$4,$5,false)',
    [mismatchedSignoff, project, foreignRevision, sheet, 'approved_for_fabrication'],
  );
  assert.ok(blockerKinds(await evaluate()).includes('missing_signoffs'), 'independent revision and sheet FKs cannot be cross-linked to bypass signoff');
  await db.query(
    'insert into public.drawing_signoffs values ($1,$2,$3,$4,$5,false)',
    [matchingSignoff, project, revision, sheet, 'approved_for_fabrication'],
  );
  assert.equal((await evaluate()).ok, true, 'matching active current-revision signoff clears opt-in');
  await db.query('update public.drawing_signoffs set is_voided=true where id=$1', [matchingSignoff]);
  assert.ok(blockerKinds(await evaluate()).includes('missing_signoffs'), 'voided signoff cannot authorize fabrication');
  await db.query('update public.drawing_signoffs set is_voided=false where id=$1', [matchingSignoff]);
  await db.query("update public.projects set metadata='{}'::jsonb where id=$1", [project]);

  await db.query('update public.submittals set ball_in_court=null where id=$1', [approved]);
  result = await evaluate();
  assert.equal(result.governing_stage, 'BFA', 'unknown approval handoff cannot imply IFC');
  assert.ok(blockerKinds(result).includes('not_ifc'));
  await db.query("update public.submittals set ball_in_court='GC' where id=$1", [approved]);

  await db.query('update public.submittals set drawing_set_ids=null where id=any($1::uuid[])', [[approved, draft]]);
  result = await evaluate();
  assert.equal(result.submittal_id, null, 'neither Product Data nor unknown type can govern a shop set');
  assert.ok(blockerKinds(result).includes('no_submittal'));
  await db.query('update public.submittals set drawing_set_ids=array[$1::uuid] where id=any($2::uuid[])', [drawingSet, [approved, draft]]);

  await db.query('update public.drawings set file_url=null where id=$1', [sheet]);
  assert.ok(blockerKinds(await evaluate()).includes('no_file'));
  await db.query("update public.drawings set file_url='   ' where id=$1", [sheet]);
  assert.ok(blockerKinds(await evaluate()).includes('no_file'), 'whitespace URL is not a PDF');
  await db.query("update public.drawings set file_url='private/s-101.pdf' where id=$1", [sheet]);
  await db.query('update public.drawings set deleted_at=now() where id=$1', [sheet]);
  result = await evaluate();
  assert.equal(result.sheet_count, 0, 'timestamp-deleted sheet is excluded');
  assert.ok(blockerKinds(result).includes('no_sheets'));
  await db.query('update public.drawings set deleted_at=null where id=$1', [sheet]);

  await db.query('update public.drawing_sets set deleted_at=now() where id=$1', [drawingSet]);
  await assert.rejects(evaluate(), /Drawing set not found in this project/, 'timestamp-deleted set is inaccessible');
  await db.query('update public.drawing_sets set deleted_at=null where id=$1', [drawingSet]);
  await db.query('update public.submittals set deleted_at=now() where id=$1', [approved]);
  result = await evaluate();
  assert.equal(result.submittal_id, draft, 'timestamp-deleted approval is ignored');
  assert.ok(blockerKinds(result).includes('not_ifc'));

  await assert.rejects(
    db.query('select public.evaluate_fab_release_set($1::uuid, $2::uuid)', [foreignProject, drawingSet]),
    /Not authorized for this project/,
    'a foreign project is denied before its drawing set can be read',
  );

  console.log('drawing governing gate: submitted/draft, BIC, exact link, hold, RFI, PDF, deletion and project guard passed');
} finally {
  await db.close();
}
