import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../../migrations_quarantine/20261008032840_transactional_reviewed_shop_drawing_revision.sql', import.meta.url), 'utf8');
const db = new PGlite();
const id = {
  project: '11111111-1111-4111-8111-111111111111',
  foreignProject: '22222222-2222-4222-8222-222222222222',
  org: '33333333-3333-4333-8333-333333333333',
  foreignOrg: '44444444-4444-4444-8444-444444444444',
  actor: '55555555-5555-4555-8555-555555555555',
  foreignActor: '66666666-6666-4666-8666-666666666666',
  set: '77777777-7777-4777-8777-777777777777',
  d1: '88888888-8888-4888-8888-888888888888',
  d2: '99999999-9999-4999-8999-999999999999',
  foreignDrawing: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  supersededDrawing: 'abababab-abab-4bab-8bab-abababababab',
  r1: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  r2: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  firstRequest: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  secondRequest: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  thirdRequest: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  legacySet: '12345678-1234-4234-8234-123456789abc',
  legacyDrawing: '23456789-2345-4345-8345-23456789abcd',
};
const oldPath = `${id.org}/uploads/old.pdf`;
const newPath = `${id.org}/uploads/new.pdf`;
const nextPath = `${id.org}/uploads/next.pdf`;

async function one(query, params = []) {
  return (await db.query(query, params)).rows[0];
}
async function rows(query, params = []) {
  return (await db.query(query, params)).rows;
}
async function actor(value) {
  await db.query("select set_config('test.actor', $1, false)", [value]);
}
async function setRow() {
  return one('select * from public.drawing_sets where id=$1', [id.set]);
}
async function drawingRow(drawingId) {
  return one('select * from public.drawings where id=$1', [drawingId]);
}
async function currentRevision(drawingId) {
  return one('select * from public.drawing_revisions where drawing_id=$1 and is_current=true', [drawingId]);
}
function same(sheet, current) {
  return {
    action: 'same', drawing_id: sheet.id, sheet_number: sheet.sheet_number,
    expected_updated_at: sheet.updated_at,
    expected_revision_id: current?.id ?? null,
  };
}
function revised(sheet, current, revisionCode, pdfPage) {
  return {
    ...same(sheet, current), action: 'revised', reviewed: true,
    sheet_title: sheet.title, revision_code: revisionCode, pdf_page: pdfPage,
    extracted_text: `Reviewed source page ${pdfPage}`, callouts: [],
  };
}
function added(sheetNumber, revisionCode, pdfPage) {
  return {
    action: 'added', reviewed: true, sheet_number: sheetNumber,
    sheet_title: `Detail ${sheetNumber}`, discipline: 'Structural',
    revision_code: revisionCode, pdf_page: pdfPage,
    extracted_text: `Reviewed source page ${pdfPage}`, callouts: [],
  };
}
async function call({
  requestId = id.firstRequest, expectedSet = null, label = 'B', path = label === 'B' ? newPath : nextPath,
  sheets, projectId = id.project, setId = id.set,
} = {}) {
  const set = expectedSet ?? await setRow();
  const { rows: result } = await db.query(`
    select public.apply_reviewed_shop_drawing_revision(
      $1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5::text,$6::text,
      $7::date,$8::text,$9::text,$10::text,$11::text,$12::jsonb
    ) as result`, [
      projectId, setId, requestId, set.updated_at, set.revision,
      label, '2026-10-08', 'Reviewed detailer', 'Connection change',
      'superseded', path, JSON.stringify(sheets),
    ]);
  return result[0].result;
}

try {
  await db.exec(`
    create schema auth;
    create schema storage;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.actor', true), '')::uuid $$;
    create function public.user_has_project_role_at_least(p_project_id uuid, p_role text)
      returns boolean language sql stable as $$
        select p_project_id = '${id.project}'::uuid
          and auth.uid() = '${id.actor}'::uuid and p_role = 'pm' $$;
    create function public.user_has_project_access(p_project_id uuid)
      returns boolean language sql stable as $$
        select p_project_id = '${id.project}'::uuid
          and auth.uid() = '${id.actor}'::uuid $$;
    create table public.projects (id uuid primary key, name text not null, org_id uuid not null);
    create table public.drawing_sets (
      id uuid primary key, project_id uuid not null references public.projects(id),
      set_name text, revision text, issued_date date, issued_by text, notes text,
      file_url text, sheet_count integer, revision_history text,
      is_deleted boolean not null default false, deleted_at timestamptz,
      is_locked boolean not null default false, updated_at timestamptz not null default now(),
      set_approval_status text, set_approved_date date, set_approved_by text,
      set_approval_notes text, current_submittal_id uuid, submittal_status text,
      discipline text
    );
    create table public.drawings (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.projects(id),
      project_name text, drawing_set_id uuid references public.drawing_sets(id),
      drawing_set_name text, sheet_number text, title text, discipline text,
      revision_number text, stage text, file_url text, pdf_page integer,
      is_superseded boolean default false, is_deleted boolean not null default false,
      deleted_at timestamptz, updated_at timestamptz default now(),
      set_approval_status text, set_approved_date date, ifc_status text,
      extracted_text text, callouts jsonb default '[]'::jsonb
    );
    create unique index uq_drawings_set_sheet_revision on public.drawings
      (project_id,drawing_set_id,sheet_number,revision_number)
      where is_deleted=false and sheet_number is not null and sheet_number<>'';
    create table public.drawing_revisions (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.projects(id),
      drawing_id uuid not null references public.drawings(id),
      revision_code text not null, sheet_number text not null, sheet_title text not null,
      version_number integer not null, is_current boolean not null default false,
      file_url text, pdf_page integer, archived_at timestamptz,
      supersedes_revision_id uuid references public.drawing_revisions(id),
      issued_at timestamptz, revision_notes text, release_status text default 'received',
      created_by uuid, updated_by uuid
    );
    create unique index ux_drawing_revisions_one_current on public.drawing_revisions(drawing_id)
      where is_current=true;
    create unique index ux_drawing_revisions_sheet_rev on public.drawing_revisions(drawing_id,revision_code);
    create unique index ux_drawing_revisions_unique_version on public.drawing_revisions(drawing_id,version_number);
    create table public.drawing_zones (
      id uuid primary key default gen_random_uuid(), drawing_revision_id uuid not null,
      is_active boolean not null default true, deleted_at timestamptz
    );
    create table public.submittals (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null, submittal_type text, status text,
      is_deleted boolean not null default false, deleted_at timestamptz,
      drawing_set_ids uuid[]
    );
    create table public.drawing_holds (
      id uuid primary key default gen_random_uuid(), project_id uuid not null,
      drawing_id uuid not null, is_active boolean not null default true
    );
    create table storage.objects (bucket_id text not null, name text not null, primary key(bucket_id,name));
    insert into public.projects values
      ('${id.project}','Steel Tower','${id.org}'),
      ('${id.foreignProject}','Other Project','${id.foreignOrg}');
    insert into public.drawing_sets (
      id,project_id,set_name,revision,issued_date,issued_by,file_url,sheet_count,
      revision_history,set_approval_status,set_approved_date,set_approved_by,discipline
    ) values (
      '${id.set}','${id.project}','Shop Package A','A','2026-10-01','Detailer',
      '${oldPath}',2,'[]','approved','2026-10-02','Engineer','Structural'
    );
    insert into public.drawings (
      id,project_id,project_name,drawing_set_id,drawing_set_name,sheet_number,title,
      discipline,revision_number,stage,file_url,pdf_page,set_approval_status
    ) values
      ('${id.d1}','${id.project}','Steel Tower','${id.set}','Shop Package A',
       'S-100','Connection A','Structural','A','Released','${oldPath}',1,'approved'),
      ('${id.d2}','${id.project}','Steel Tower','${id.set}','Shop Package A',
       'S-101','Connection B','Structural','A','Released','${oldPath}',2,'approved'),
      ('${id.foreignDrawing}','${id.foreignProject}','Other Project',null,'Other Set',
       'S-999','Foreign','Structural','A','Released',null,1,'approved');
    insert into public.drawing_revisions (
      id,project_id,drawing_id,revision_code,sheet_number,sheet_title,version_number,
      is_current,file_url,pdf_page,release_status
    ) values
      ('${id.r1}','${id.project}','${id.d1}','A','S-100','Connection A',1,true,
       '${oldPath}',1,'released_for_shop'),
      ('${id.r2}','${id.project}','${id.d2}','A','S-101','Connection B',1,true,
       '${oldPath}',2,'released_for_shop');
    insert into storage.objects values
      ('app-files','${oldPath}'),('app-files','${newPath}'),('app-files','${nextPath}');
  `);
  await actor(id.actor);
  await db.exec(sql);

  const originalSet = await setRow();
  const sheet1 = await drawingRow(id.d1);
  const sheet2 = await drawingRow(id.d2);
  const baselineSheets = [revised(sheet1, await currentRevision(id.d1), 'B', 3),
    same(sheet2, await currentRevision(id.d2)), added('S-102', 'B', 4)];
  const result = await call({ sheets: baselineSheets, expectedSet: originalSet });
  assert.equal(result.applied, true);
  assert.deepEqual([result.revised, result.added, result.removed, result.unchanged], [1, 1, 0, 1]);
  assert.equal(result.source_pages.length, 2, 'new evidence names each reviewed PDF page');
  assert.equal((await setRow()).revision, 'B');
  assert.equal((await setRow()).set_approval_status, 'pending_review');
  assert.equal((await setRow()).current_submittal_id, null);
  assert.equal((await drawingRow(id.d1)).stage, 'Not Started');
  assert.equal((await drawingRow(id.d1)).pdf_page, 3);
  assert.equal((await drawingRow(id.d2)).file_url, oldPath, 'unchanged sheet keeps old master');
  const current1 = await currentRevision(id.d1);
  assert.equal(current1.revision_code, 'B');
  assert.equal(current1.release_status, 'received', 'new revision does not inherit approval');
  assert.equal((await one('select is_current, release_status, archived_at from public.drawing_revisions where id=$1', [id.r1])).is_current, false);
  assert.equal((await one('select release_status from public.drawing_revisions where id=$1', [id.r1])).release_status, 'released_for_shop', 'prior release remains historical');
  assert.equal((await rows('select id from public.drawings where drawing_set_id=$1 and is_deleted=false', [id.set])).length, 3);

  const beforeRetry = (await rows('select id from public.drawing_revisions')).length;
  assert.deepEqual(await call({ sheets: baselineSheets, expectedSet: originalSet }), result, 'same request is replay-safe');
  assert.equal((await rows('select id from public.drawing_revisions')).length, beforeRetry);
  await db.exec('set role anon');
  try {
    await assert.rejects(
      call({ sheets: baselineSheets, expectedSet: originalSet }),
      /permission denied for function apply_reviewed_shop_drawing_revision/,
    );
  } finally {
    await db.exec('reset role');
  }
  await db.exec('set role authenticated');
  try {
    assert.deepEqual(await call({ sheets: baselineSheets, expectedSet: originalSet }), result,
      'authenticated PM can invoke the granted RPC');
    await assert.rejects(
      db.query(`insert into public.drawing_revision_apply_requests
        (project_id,drawing_set_id,request_id,request_sha256,applied_by)
        values($1,$2,$3,$4,$5)`, [id.project, id.set, id.secondRequest, '0'.repeat(64), id.actor]),
      /permission denied for table drawing_revision_apply_requests/,
      'browser role cannot forge a completed request ledger',
    );
  } finally {
    await db.exec('reset role');
  }
  await assert.rejects(
    call({ sheets: baselineSheets, expectedSet: originalSet, label: 'C' }),
    /request key was already used/i,
  );
  await assert.rejects(
    call({ sheets: baselineSheets, requestId: id.secondRequest, expectedSet: originalSet, label: 'C' }),
    /Drawing set changed since review/,
  );

  const afterSet = await setRow();
  const addedSheet = await one("select * from public.drawings where sheet_number='S-102'");
  const currentAdded = await currentRevision(addedSheet.id);
  const current2 = await currentRevision(id.d2);
  const afterSheets = [
    revised(await drawingRow(id.d1), current1, 'C', 5),
    same(await drawingRow(id.d2), current2),
    same(addedSheet, currentAdded),
  ];
  await db.query('update public.drawing_sets set is_locked=true where id=$1', [id.set]);
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C', sheets: afterSheets }),
    /Drawing set is locked/,
  );
  await db.query('update public.drawing_sets set is_locked=false where id=$1', [id.set]);
  await db.query(`insert into public.drawings
    (project_id,drawing_set_id,drawing_set_name,sheet_number,title,is_deleted)
    values($1,null,'Shop Package A','S-legacy','Name-only sheet',false)`, [id.project]);
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C', sheets: afterSheets }),
    /Legacy name-only sheets must be linked/,
  );
  await db.query("delete from public.drawings where sheet_number='S-legacy' and drawing_set_id is null");
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'A', sheets: afterSheets }),
    /Set revision label was already used in its history/,
  );
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C',
      sheets: [...afterSheets, same(await drawingRow(id.foreignDrawing), null)] }),
    /unknown, deleted, or cross-project drawing/,
    'foreign drawing cannot be smuggled into a roster',
  );
  assert.equal((await currentRevision(id.d1)).revision_code, 'B', 'failed batch rolls back prior row mutation');
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C',
      sheets: [{ ...afterSheets[0], expected_revision_id: id.r1 }, ...afterSheets.slice(1)] }),
    /Current sheet revision changed/,
  );
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C',
      sheets: [{ ...afterSheets[0], expected_updated_at: '2020-01-01T00:00:00Z' }, ...afterSheets.slice(1)] }),
    /Drawing roster changed since review/,
  );
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C',
      sheets: [{ ...afterSheets[0], pdf_page: 0 }, ...afterSheets.slice(1)] }),
    /reviewed mark, title, revision and 1-based source PDF page/,
  );
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C',
      sheets: [{ ...afterSheets[0], revision_code: 'A' }, ...afterSheets.slice(1)] }),
    /Revision code already exists/,
  );
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C',
      sheets: [afterSheets[0], { ...revised(await drawingRow(id.d2), current2, 'A', 6) }, afterSheets[2]] }),
    /Revision code already exists/,
    'failure after first sheet write rolls the whole statement back',
  );
  assert.equal((await currentRevision(id.d1)).revision_code, 'B');
  assert.equal((await setRow()).revision, 'B');
  assert.equal((await rows('select * from public.drawing_revision_apply_requests')).length, 1,
    'failed operations leave no idempotency ledger row');

  await db.query(`insert into public.drawings
    (id,project_id,drawing_set_id,drawing_set_name,sheet_number,title,
     revision_number,is_superseded,is_deleted)
    values($1,$2,$3,'Shop Package A','S-900','Old detail','A',true,false)`,
  [id.supersededDrawing, id.project, id.set]);
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C',
      sheets: [...afterSheets, added('s-900', 'C', 9)] }),
    /Sheet mark already exists in this set/,
    'new sheet cannot shadow a superseded mark',
  );
  assert.equal((await currentRevision(id.d1)).revision_code, 'B');

  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C',
      path: `${id.foreignOrg}/uploads/foreign.pdf`, sheets: afterSheets }),
    /source PDF must be an uploaded file in this workspace/,
  );
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C',
      path: `${id.org}/uploads/not-uploaded.pdf`, sheets: afterSheets }),
    /source PDF must be an uploaded file in this workspace/,
  );
  await db.query('insert into public.drawing_zones(drawing_revision_id) values($1)', [current1.id]);
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C', sheets: afterSheets }),
    /active zones/,
    'coordination zones fail closed until transactional carry-forward exists',
  );
  await db.query('delete from public.drawing_zones where drawing_revision_id=$1', [current1.id]);
  await db.query(`insert into public.submittals(project_id,submittal_type,status,drawing_set_ids)
    values($1,'Shop Drawing','Released for Fabrication',array[$2::uuid])`, [id.project, id.set]);
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C', sheets: afterSheets }),
    /exact current-revision coverage/,
    'older linked release cannot make a new unreviewed revision appear fab-ready',
  );
  await db.query('delete from public.submittals where project_id=$1', [id.project]);
  await actor(id.foreignActor);
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet, label: 'C', sheets: afterSheets }),
    /Project manager access is required/,
  );
  await actor(id.actor);

  await db.query('insert into public.drawing_holds(project_id,drawing_id) values($1,$2)',
    [id.project, id.d2]);
  await assert.rejects(
    call({ requestId: id.secondRequest, expectedSet: afterSet,
      label: 'C', sheets: [afterSheets[0], { ...afterSheets[1], action: 'removed' }, afterSheets[2]] }),
    /Release the active sheet hold/,
  );
  await db.query('delete from public.drawing_holds where drawing_id=$1', [id.d2]);

  const removal = await call({ requestId: id.secondRequest, expectedSet: afterSet,
    label: 'C', sheets: [afterSheets[0], { ...afterSheets[1], action: 'removed' }, afterSheets[2]] });
  assert.equal(removal.removed, 1);
  assert.equal((await drawingRow(id.d2)).is_deleted, true);
  assert.equal((await currentRevision(id.d2)), undefined);
  assert.equal((await setRow()).sheet_count, 2, 'removed sheet is absent from active count');

  await db.query(`insert into public.drawing_sets
    (id,project_id,set_name,revision,file_url,sheet_count,revision_history,discipline)
    values($1,$2,'Legacy History','A',$3,1,'[]','Structural')`,
  [id.legacySet, id.project, oldPath]);
  await db.query(`insert into public.drawings
    (id,project_id,project_name,drawing_set_id,drawing_set_name,sheet_number,title,
     discipline,revision_number,stage,file_url,pdf_page)
    values($1,$2,'Steel Tower',$3,'Legacy History','S-200','Legacy Connection',
           'Structural','A','Released',$4,1)`,
  [id.legacyDrawing, id.project, id.legacySet, oldPath]);
  const legacySet = await one('select * from public.drawing_sets where id=$1', [id.legacySet]);
  const legacyDrawing = await drawingRow(id.legacyDrawing);
  const legacyResult = await call({ requestId: id.thirdRequest, setId: id.legacySet,
    expectedSet: legacySet, label: 'B', sheets: [revised(legacyDrawing, null, 'B', 7)] });
  assert.equal(legacyResult.revised, 1);
  assert.deepEqual((await rows('select revision_code, is_current, archived_at from public.drawing_revisions where drawing_id=$1 order by version_number', [id.legacyDrawing]))
    .map((r) => [r.revision_code, r.is_current, r.archived_at !== null]),
  [['A', false, true], ['B', true, false]], 'missing current history is minted before supersession');

  console.log('drawing revision atomic candidate: reviewed apply, replay, rollback, stale, tenant, storage, approval and history scenarios passed');
} finally {
  await db.close();
}
