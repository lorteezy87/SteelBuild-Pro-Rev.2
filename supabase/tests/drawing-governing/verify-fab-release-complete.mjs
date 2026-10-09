import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const setSql = await readFile(new URL('../../migrations/20261008013546_align_drawing_set_governing_submittal.sql', import.meta.url), 'utf8');
const releaseSql = await readFile(new URL('../../migrations/20261008041759_enforce_complete_fab_release_set_gate.sql', import.meta.url), 'utf8');
const db = new PGlite();
const project = '11111111-1111-4111-8111-111111111111';
const otherProject = '22222222-2222-4222-8222-222222222222';
const setId = '33333333-3333-4333-8333-333333333333';
const sheetA = '44444444-4444-4444-8444-444444444444';
const sheetB = '55555555-5555-4555-8555-555555555555';
const otherSheet = '66666666-6666-4666-8666-666666666666';
const revisionA = '77777777-7777-4777-8777-777777777777';
const revisionB = '88888888-8888-4888-8888-888888888888';
const signoffA = '99999999-9999-4999-8999-999999999999';
const signoffB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const holdId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rfiId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function blockers(ids) {
  const { rows } = await db.query('select * from public.evaluate_fab_release_package($1::uuid[])', [ids]);
  return rows;
}
async function release(ids, override = null, projectId = project) {
  const { rows } = await db.query(`
    insert into public.fab_release_log(project_id, drawing_ids, override_reason)
    values ($1::uuid, $2::uuid[], $3::text)
    returning drawing_count, blocking_rfi_numbers
  `, [projectId, ids, override]);
  return rows[0];
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
    create function auth.uid() returns uuid language sql stable as $$ select '${sheetA}'::uuid $$;
    create function public.user_has_project_access(p_project_id uuid) returns boolean
      language sql stable as $$ select p_project_id = '${project}'::uuid $$;
    create table public.projects (id uuid primary key, metadata jsonb);
    create table public.drawing_sets (id uuid primary key, project_id uuid not null, set_name text,
      is_deleted boolean not null default false, deleted_at timestamptz, set_approval_status text);
    create table public.drawings (id uuid primary key, project_id uuid not null, drawing_set_id uuid,
      sheet_number text, is_deleted boolean not null default false, deleted_at timestamptz,
      is_superseded boolean default false, file_url text,
      stage text, set_approval_status text, ifc_status text);
    create table public.submittals (id uuid primary key, project_id uuid not null, submittal_number text,
      status text, submittal_type text, ball_in_court text, submitted_date date,
      updated_at timestamptz, round_number integer, created_at timestamptz, drawing_set_ids uuid[],
      is_deleted boolean not null default false, deleted_at timestamptz);
    create table public.drawing_revisions (id uuid primary key, project_id uuid not null,
      drawing_id uuid not null, is_current boolean not null default false,
      archived_at timestamptz, release_status text not null);
    create table public.drawing_signoffs (id uuid primary key, project_id uuid not null,
      drawing_revision_id uuid not null, drawing_id uuid not null, stamp_type text not null,
      is_voided boolean not null default false);
    create table public.drawing_holds (id uuid primary key, project_id uuid not null,
      drawing_id uuid, is_active boolean not null);
    create table public.rfis (id uuid primary key, project_id uuid not null,
      drawing_set_id uuid, drawing_id uuid, rfi_number text, status text,
      is_deleted boolean not null default false);
    create function public.fab_release_blocking_rfis(p_sheet_ids uuid[])
      returns table(rfi_number text) language sql stable as $$ select null::text where false $$;
    create function public.evaluate_fab_release_package(p_drawing_ids uuid[])
      returns table(kind text, title text, sheet_numbers text[], rfi_numbers text[])
      language sql stable security definer as $$
        select null::text, null::text, null::text[], null::text[] where false
      $$;
    create table public.fab_release_log (id bigserial primary key, project_id uuid not null,
      drawing_ids uuid[] not null, drawing_count integer not null default 0,
      blocking_rfi_numbers text[] not null default '{}', override_reason text);
  `);
  await db.exec(setSql);
  await db.exec(releaseSql);
  await db.exec(`
    create trigger trg_enforce_fab_release_gate before insert on public.fab_release_log
      for each row execute function public.enforce_fab_release_gate();
    insert into public.projects values ('${project}', '{}'::jsonb), ('${otherProject}', '{}'::jsonb);
    insert into public.drawing_sets(id,project_id,set_name)
      values ('${setId}','${project}','S - Structural');
    insert into public.drawings(id,project_id,drawing_set_id,sheet_number,file_url) values
      ('${sheetA}','${project}','${setId}','S-101','private/s-101.pdf'),
      ('${sheetB}','${project}','${setId}','S-102','private/s-102.pdf'),
      ('${otherSheet}','${otherProject}',null,'FOREIGN','private/foreign.pdf');
    insert into public.submittals(id,project_id,submittal_number,status,submittal_type,
      ball_in_court,submitted_date,updated_at,created_at,drawing_set_ids)
      values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${project}','SD-1','Approved',
      'Shop Drawing','GC','2026-10-01','2026-10-01','2026-10-01',array['${setId}'::uuid]);
    insert into public.drawing_revisions(id,project_id,drawing_id,is_current,release_status) values
      ('${revisionA}','${project}','${sheetA}',true,'released_for_shop'),
      ('${revisionB}','${project}','${sheetB}',true,'released_for_shop');
  `);

  assert.deepEqual(await blockers([sheetA, sheetB]), [], 'complete clear set passes package preflight');
  assert.equal((await db.query('select public.piece_control_drawing_is_approved($1::uuid) as ok', [sheetA])).rows[0].ok, true);
  await assert.rejects(release([sheetA]), /Include every active sheet/,
    'a direct partial insert cannot omit a blocked sibling');
  assert.equal((await release([sheetA, sheetB])).drawing_count, 2);
  for (const [field, status] of [
    ['stage', 'Rejected'],
    ['set_approval_status', 'Revise and Resubmit'],
    ['ifc_status', 'Returned'],
  ]) {
    await db.query(`update public.drawings set ${field}=$1 where id=$2`, [status, sheetB]);
    await assert.rejects(release([sheetA, sheetB]), /rejected or revise-and-resubmit/,
      `a direct insert cannot bypass ${field} on a sibling with an older IFC submittal`);
    await db.query(`update public.drawings set ${field}=null where id=$1`, [sheetB]);
  }
  await db.query("update public.drawings set sheet_number=null, stage='Rejected' where id=$1", [sheetB]);
  await assert.rejects(release([sheetA, sheetB]), /rejected or revise-and-resubmit/,
    'a rejected sibling without a sheet mark still blocks direct release');
  await db.query("update public.drawings set sheet_number='S-102', stage=null where id=$1", [sheetB]);
  await assert.rejects(release([otherSheet], 'override', project), /outside this project/,
    'an override cannot cross the project boundary');

  await db.query('insert into public.drawing_holds values ($1,$2,$3,true)', [holdId, project, sheetB]);
  assert.ok((await blockers([sheetA])).some((row) => row.kind === 'active_holds'),
    'package preflight includes sibling hold evidence');
  assert.equal((await db.query('select public.piece_control_drawing_is_approved($1::uuid) as ok', [sheetA])).rows[0].ok, false);
  await assert.rejects(release([sheetA, sheetB]), /unresolved release evidence/,
    'insert trigger rechecks sibling hold after any client preflight');
  await release([sheetA], 'PM partial-release acknowledgement');
  await db.query('update public.drawing_holds set is_active=false where id=$1', [holdId]);

  await db.query("update public.drawing_revisions set release_status='received' where id=$1", [revisionB]);
  assert.ok((await blockers([sheetA, sheetB])).some((row) => row.kind === 'current_revision_not_distributed'));
  await assert.rejects(release([sheetA, sheetB]), /unresolved release evidence/,
    'new current revision blocks direct release');
  await db.query("update public.drawing_revisions set release_status='released_for_shop' where id=$1", [revisionB]);

  await db.query("update public.projects set metadata='{" + '"require_fab_signoffs":true' + "}'::jsonb where id=$1", [project]);
  await assert.rejects(release([sheetA, sheetB]), /unresolved release evidence/,
    'project opt-in signoff is enforced server-side');
  await db.query('insert into public.drawing_signoffs values ($1,$2,$3,$4,$5,false)',
    [signoffA, project, revisionA, sheetA, 'approved_for_fabrication']);
  await db.query('insert into public.drawing_signoffs values ($1,$2,$3,$4,$5,false)',
    [signoffB, project, revisionB, sheetB, 'approved_as_noted']);
  assert.equal((await release([sheetA, sheetB])).drawing_count, 2);

  await db.query("insert into public.rfis values ($1,$2,$3,null,'RFI-7','Open',false)", [rfiId, project, setId]);
  assert.ok((await blockers([sheetA, sheetB])).some((row) => row.kind === 'open_rfis'));
  await assert.rejects(release([sheetA, sheetB]), /unresolved release evidence/);
  assert.deepEqual((await release([sheetA], 'PM reviewed RFI-7')).blocking_rfi_numbers, ['RFI-7'],
    'override snapshots set-level RFI even when the client supplied one sheet');
  await db.query("update public.rfis set status='Answered' where id=$1", [rfiId]);
  assert.deepEqual(await blockers([sheetA, sheetB]), [], 'answered RFI restores the same package gate');

  console.log('complete fab release: package/set parity, sibling inclusion, hold/revision/signoff/RFI and override passed');
} finally {
  await db.close();
}
