import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Exercises the SQL shipped by the candidate, not a copy of its function body.
const sql = await readFile(new URL('../../migrations/20261008022100_serialize_piece_drawing_set_links.sql', import.meta.url), 'utf8');
const db = new PGlite();
const project = '11111111-1111-4111-8111-111111111111';
const otherProject = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const parent = '44444444-4444-4444-8444-444444444444';
const sibling = '55555555-5555-4555-8555-555555555555';
const child = '66666666-6666-4666-8666-666666666666';
const foreignPiece = '77777777-7777-4777-8777-777777777777';
const setA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const setB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const setC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const deletedSet = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const foreignSet = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

async function rpc(name, pieceId, drawingSetId, projectId = project) {
  const { rows } = await db.query(`select public.${name}($1::uuid,$2::uuid,$3::uuid) as result`, [
    projectId, pieceId, drawingSetId,
  ]);
  return rows[0].result;
}

async function links(pieceId) {
  const { rows } = await db.query(
    'select drawing_set_id, created_by from public.piece_drawing_sets where piece_id=$1 order by drawing_set_id',
    [pieceId],
  );
  return rows;
}

async function events(pieceId) {
  const { rows } = await db.query(
    'select event_type, previous_state, next_state, created_by from public.piece_events where piece_id=$1 order by id',
    [pieceId],
  );
  return rows;
}

try {
  await db.exec(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;
    create function public.user_has_project_role_at_least(p_project_id uuid, p_min_role text)
      returns boolean language sql stable as $$
        select p_project_id = '${project}'::uuid and auth.uid() = '${actor}'::uuid
      $$;
    create table public.projects (id uuid primary key, piece_control_mode text);
    create table public.pieces (
      id uuid primary key, project_id uuid not null references public.projects(id),
      parent_piece_id uuid references public.pieces(id), is_deleted boolean not null default false,
      deleted_at timestamptz, is_container boolean not null default false
    );
    create table public.drawing_sets (
      id uuid primary key, project_id uuid not null references public.projects(id),
      is_deleted boolean not null default false, deleted_at timestamptz
    );
    create table public.piece_drawing_sets (
      id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
      piece_id uuid not null references public.pieces(id),
      drawing_set_id uuid not null references public.drawing_sets(id),
      created_by uuid, unique(piece_id, drawing_set_id)
    );
    create table public.piece_events (
      id bigint generated always as identity primary key,
      project_id uuid not null references public.projects(id),
      piece_id uuid not null references public.pieces(id), event_type text not null,
      previous_state jsonb, next_state jsonb, reason text, source_system text,
      created_by uuid
    );
    insert into public.projects values ('${project}','pilot'), ('${otherProject}','pilot');
    insert into public.pieces(id,project_id) values
      ('${parent}','${project}'), ('${sibling}','${project}'), ('${foreignPiece}','${otherProject}');
    insert into public.drawing_sets(id,project_id,is_deleted,deleted_at) values
      ('${setA}','${project}',false,null), ('${setB}','${project}',false,null),
      ('${setC}','${project}',false,null), ('${deletedSet}','${project}',false,now()),
      ('${foreignSet}','${otherProject}',false,null);
  `);
  await db.exec(sql);

  let result = await rpc('link_piece_drawing_set', parent, setA);
  assert.equal(result.linked, true, 'first link creates the relationship');
  assert.deepEqual(await links(parent), [{ drawing_set_id: setA, created_by: actor }]);
  assert.equal((await events(parent)).length, 1, 'first link emits one audit event');

  result = await rpc('link_piece_drawing_set', parent, setA);
  assert.equal(result.unchanged, true, 'relinking is idempotent');
  assert.equal((await events(parent)).length, 1, 'idempotent link emits no event');

  await rpc('link_piece_drawing_set', parent, setB);
  result = await rpc('replace_piece_drawing_set', parent, setC);
  assert.equal(result.linked, true, 'replacement adds the target set');
  assert.equal(result.unlinked_count, 2, 'replacement removes both previous sets');
  assert.deepEqual(result.removed_set_ids, [setA, setB]);
  assert.deepEqual(await links(parent), [{ drawing_set_id: setC, created_by: actor }]);

  const parentEvents = await events(parent);
  assert.deepEqual(parentEvents.map((event) => event.event_type), [
    'drawing_set_linked', 'drawing_set_linked',
    'drawing_set_unlinked', 'drawing_set_unlinked', 'drawing_set_linked',
  ], 'each actual link mutation is traceable');
  assert.deepEqual(
    parentEvents.filter((event) => event.event_type === 'drawing_set_unlinked')
      .map((event) => event.previous_state.drawing_set_id),
    [setA, setB],
  );
  assert.ok(parentEvents.every((event) => event.created_by === actor));

  result = await rpc('replace_piece_drawing_set', parent, setC);
  assert.equal(result.unchanged, true, 'replacing with the sole current target changes nothing');
  assert.equal((await events(parent)).length, 5, 'no-op replacement emits no audit event');

  await rpc('link_piece_drawing_set', parent, setA);
  result = await rpc('replace_piece_drawing_set', parent, setC);
  assert.equal(result.linked, false, 'an existing target link retains its identity');
  assert.equal(result.unlinked_count, 1);
  assert.deepEqual(await links(parent), [{ drawing_set_id: setC, created_by: actor }]);

  await rpc('link_piece_drawing_set', sibling, setA);
  const siblingEvents = (await events(sibling)).length;
  for (const target of [deletedSet, foreignSet]) {
    await assert.rejects(rpc('replace_piece_drawing_set', sibling, target), /Active drawing set not found/);
    assert.deepEqual(await links(sibling), [{ drawing_set_id: setA, created_by: actor }]);
  }
  assert.equal((await events(sibling)).length, siblingEvents, 'invalid targets cannot erase current links or log success');

  // The production table uses separate FKs, so a legacy link can point from
  // this project piece to a set in another project unless the RPC checks it.
  await db.query(
    'insert into public.piece_drawing_sets(project_id,piece_id,drawing_set_id,created_by) values($1,$2,$3,$4)',
    [otherProject, sibling, foreignSet, actor],
  );
  await assert.rejects(
    rpc('replace_piece_drawing_set', sibling, setB),
    /outside its project/,
    'a malformed cross-project source link fails without dropping valid links',
  );
  assert.deepEqual(await links(sibling), [
    { drawing_set_id: setA, created_by: actor },
    { drawing_set_id: foreignSet, created_by: actor },
  ]);
  await db.query('delete from public.piece_drawing_sets where piece_id=$1 and drawing_set_id=$2', [sibling, foreignSet]);

  await assert.rejects(
    rpc('replace_piece_drawing_set', foreignPiece, setC),
    /Active piece not found/,
    'cross-project pieces cannot be reassigned',
  );
  await assert.rejects(
    rpc('replace_piece_drawing_set', sibling, setB, otherProject),
    /Not authorized/,
    'foreign-project role is denied',
  );

  await db.exec(`
    create function public.reject_unlink_audit() returns trigger language plpgsql as $$
    begin
      if new.event_type = 'drawing_set_unlinked' then
        raise exception 'Synthetic audit write failure';
      end if;
      return new;
    end $$;
    create trigger reject_unlink_audit before insert on public.piece_events
      for each row execute function public.reject_unlink_audit();
  `);
  await assert.rejects(
    rpc('replace_piece_drawing_set', sibling, setB),
    /Synthetic audit write failure/,
    'a downstream audit failure aborts the entire replacement',
  );
  assert.deepEqual(await links(sibling), [{ drawing_set_id: setA, created_by: actor }], 'rollback restores old link and removes new link');
  assert.equal((await events(sibling)).length, siblingEvents, 'failed replacement emits no partial audit evidence');
  await db.exec('drop trigger reject_unlink_audit on public.piece_events; drop function public.reject_unlink_audit();');

  result = await rpc('unlink_piece_drawing_set', sibling, setA);
  assert.equal(result.unlinked, true);
  assert.deepEqual(await links(sibling), []);
  assert.equal((await events(sibling)).at(-1).event_type, 'drawing_set_unlinked');
  result = await rpc('unlink_piece_drawing_set', sibling, setA);
  assert.equal(result.unchanged, true);

  await db.query('insert into public.pieces(id,project_id,parent_piece_id) values($1,$2,$3)', [child, project, parent]);
  await assert.rejects(
    rpc('link_piece_drawing_set', parent, setB),
    /Container pieces cannot be linked/,
    'a split parent cannot acquire a parent-only link',
  );
  await assert.rejects(
    rpc('replace_piece_drawing_set', parent, setB),
    /Container pieces cannot be linked/,
    'a split parent cannot be reassigned exclusively',
  );
  assert.deepEqual(await links(parent), [{ drawing_set_id: setC, created_by: actor }]);

  // A historical split parent stays a container after its children are
  // archived. The child-existence check alone would let it acquire links that
  // actionable leaf-lot rollups deliberately exclude.
  await db.query('update public.pieces set is_container=true where id=$1', [parent]);
  await db.query('update public.pieces set is_deleted=true where id=$1', [child]);
  await assert.rejects(
    rpc('link_piece_drawing_set', parent, setB),
    /Container pieces cannot be linked/,
    'an explicit container with no active child still cannot acquire a set',
  );
  await assert.rejects(
    rpc('replace_piece_drawing_set', parent, setB),
    /Container pieces cannot be linked/,
    'an explicit container with no active child still cannot be reassigned',
  );
  assert.deepEqual(await links(parent), [{ drawing_set_id: setC, created_by: actor }]);

  const { rows: grants } = await db.query(`
    select proname, prosecdef
    from pg_proc where proname in (
      'link_piece_drawing_set', 'unlink_piece_drawing_set', 'replace_piece_drawing_set'
    ) order by proname
  `);
  assert.equal(grants.length, 3);
  assert.ok(grants.every((row) => row.prosecdef === true), 'relationship commands retain definer execution');
  for (const name of grants.map((row) => row.proname)) {
    const { rows } = await db.query(
      'select has_function_privilege($1::text,$2::text,$3::text) as allowed',
      ['anon', `public.${name}(uuid,uuid,uuid)`, 'EXECUTE'],
    );
    assert.equal(rows[0].allowed, false, `${name} is not executable by anon`);
  }

  console.log('piece drawing-set commands: link, unlink, atomic replace, audit, authorization and rollback passed');
} finally {
  await db.close();
}
