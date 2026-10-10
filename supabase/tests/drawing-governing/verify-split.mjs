import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../../migrations/20261008021100_inherit_drawing_set_links_on_lot_split.sql', import.meta.url), 'utf8');
const db = new PGlite();
const project = '11111111-1111-4111-8111-111111111111';
const otherProject = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const parent = '44444444-4444-4444-8444-444444444444';
const historicalChild = '55555555-5555-4555-8555-555555555555';
const childA = '66666666-6666-4666-8666-666666666666';
const childB = '77777777-7777-4777-8777-777777777777';
const failedChild = '88888888-8888-4888-8888-888888888888';
const staleChild = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const setA = '99999999-9999-4999-8999-999999999999';
const setB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignSet = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

try {
  await db.exec(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;
    create table public.pieces (id uuid primary key, project_id uuid not null, parent_piece_id uuid);
    create table public.drawing_sets (id uuid primary key, project_id uuid not null);
    create table public.piece_drawing_sets (
      project_id uuid not null, piece_id uuid not null, drawing_set_id uuid not null,
      created_by uuid, unique(piece_id, drawing_set_id)
    );
    create table public.command_failures (id bigserial primary key, project_id uuid, message text);
    create function public.record_piece_control_command_failure(
      p_project_id uuid, p_command_name text, p_piece_ids uuid[], p_error_code text,
      p_error_message text, p_error_detail text, p_context jsonb
    ) returns jsonb language plpgsql as $$
    begin
      insert into public.command_failures(project_id, message) values (p_project_id, p_error_message);
      return jsonb_build_object('ok', false, 'error_code', p_error_code, 'error_message', p_error_message);
    end $$;
    create function public.split_piece_lot_impl(p_project_id uuid, p_piece_id uuid, p_allocations jsonb)
      returns jsonb language plpgsql as $$
    declare v_allocation jsonb; v_children jsonb := '[]'::jsonb;
    begin
      if not exists(select 1 from public.pieces where id=p_piece_id and project_id=p_project_id) then
        raise exception 'Source not in project';
      end if;
      for v_allocation in select value from jsonb_array_elements(p_allocations) loop
        insert into public.pieces(id,project_id,parent_piece_id)
          values ((v_allocation->>'piece_id')::uuid,p_project_id,p_piece_id);
        if v_allocation->>'fail' = 'true' then raise exception 'Synthetic split failure'; end if;
        v_children := v_children || jsonb_build_array(jsonb_build_object('piece_id',v_allocation->>'piece_id'));
      end loop;
      return jsonb_build_object('children',v_children);
    end $$;
    insert into public.pieces values ('${parent}','${project}',null), ('${historicalChild}','${project}','${parent}');
    insert into public.drawing_sets values ('${setA}','${project}'), ('${setB}','${project}'), ('${foreignSet}','${otherProject}');
    insert into public.piece_drawing_sets values
      ('${project}','${parent}','${setA}','${actor}'),
      ('${project}','${parent}','${setB}','${actor}');
  `);
  await db.exec(sql);

  let { rows } = await db.query('select public.split_piece_lot($1::uuid,$2::uuid,$3::jsonb) as result', [
    project, parent, JSON.stringify([{ piece_id: childA }, { piece_id: childB }]),
  ]);
  assert.equal(rows[0].result.children.length, 2, 'the original split result remains intact');
  ({ rows } = await db.query('select piece_id,drawing_set_id,created_by from public.piece_drawing_sets where piece_id=any($1::uuid[]) order by piece_id,drawing_set_id', [[childA, childB]]));
  assert.equal(rows.length, 4, 'both actionable child lots inherit both exact set links');
  assert.ok(rows.every((row) => row.created_by === actor));

  ({ rows } = await db.query('select count(*)::int as n from public.piece_drawing_sets where piece_id=$1', [historicalChild]));
  assert.equal(rows[0].n, 0, 'historical child links are not silently backfilled');

  await db.query('delete from public.piece_drawing_sets where piece_id=$1 and drawing_set_id=$2', [childA, setA]);
  ({ rows } = await db.query('select count(*)::int as n from public.piece_drawing_sets where piece_id=$1', [childA]));
  assert.equal(rows[0].n, 1, 'a child can be independently unlinked after split');

  ({ rows } = await db.query('select public.split_piece_lot($1::uuid,$2::uuid,$3::jsonb) as result', [
    project, parent, JSON.stringify([{ piece_id: failedChild, fail: true }]),
  ]));
  assert.equal(rows[0].result.ok, false, 'a failed split is journaled');
  ({ rows } = await db.query('select count(*)::int as n from public.pieces where id=$1', [failedChild]));
  assert.equal(rows[0].n, 0, 'failed split leaves no child piece');

  ({ rows } = await db.query('select public.split_piece_lot($1::uuid,$2::uuid,$3::jsonb) as result', [
    otherProject, parent, JSON.stringify([{ piece_id: failedChild }]),
  ]));
  assert.equal(rows[0].result.ok, false, 'foreign-project split is denied by the underlying command');
  ({ rows } = await db.query('select count(*)::int as n from public.piece_drawing_sets where piece_id=$1', [failedChild]));
  assert.equal(rows[0].n, 0, 'foreign-project attempt creates no drawing links');

  ({ rows } = await db.query('select public.split_piece_lot($1::uuid,$2::uuid,$3::jsonb) as result', [
    project, parent, JSON.stringify({ piece_id: failedChild }),
  ]));
  assert.equal(rows[0].result.ok, false, 'invalid allocation shape is journaled rather than failing in the journal');

  await db.query('insert into public.piece_drawing_sets values ($1,$2,$3,$4)', [otherProject, parent, foreignSet, actor]);
  ({ rows } = await db.query('select public.split_piece_lot($1::uuid,$2::uuid,$3::jsonb) as result', [
    project, parent, JSON.stringify([{ piece_id: staleChild }]),
  ]));
  assert.equal(rows[0].result.ok, false, 'a stale cross-project parent link fails closed');
  assert.match(rows[0].result.error_message, /outside its project/);
  ({ rows } = await db.query('select count(*)::int as n from public.pieces where id=$1', [staleChild]));
  assert.equal(rows[0].n, 0, 'failed link inheritance rolls back the new child lot');

  console.log('lot split drawing links: two-set inheritance, independent unlink, no backfill, project guard and atomic failure passed');
} finally {
  await db.close();
}
