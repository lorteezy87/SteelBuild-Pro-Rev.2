import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute the candidate SQL itself against the minimum relationship schema.
const sql = await readFile(new URL('../../migrations/20261008023000_gc_issuance_shop_set_impact_links.sql', import.meta.url), 'utf8');
const db = new PGlite();
const project = '11111111-1111-4111-8111-111111111111';
const foreignProject = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const issuance = '44444444-4444-4444-8444-444444444444';
const foreignIssuance = '55555555-5555-4555-8555-555555555555';
const shopA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const shopB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deletedShop = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const foreignShop = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const uuidArray = (ids) => ids.length
  ? `ARRAY[${ids.map((id) => `'${id}'::uuid`).join(',')}]`
  : 'ARRAY[]::uuid[]';

async function replace(ids, projectId = project, gcId = issuance) {
  const { rows } = await db.query(
    `select public.replace_gc_issuance_shop_set_links('${projectId}'::uuid,'${gcId}'::uuid,${uuidArray(ids)}) result`,
  );
  return rows[0].result;
}

async function links(gcId = issuance) {
  const { rows } = await db.query(
    'select project_id, drawing_set_id, created_by from public.gc_issuance_shop_sets where gc_drawing_set_id=$1 order by drawing_set_id',
    [gcId],
  );
  return rows;
}

async function eventCount() {
  const { rows } = await db.query('select count(*)::integer total from public.gc_issuance_shop_set_events');
  return rows[0].total;
}

try {
  await db.exec(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;
    create function public.user_has_project_access(p_project_id uuid)
      returns boolean language sql stable as $$ select p_project_id = '${project}'::uuid $$;
    create function public.user_has_project_role_at_least(p_project_id uuid, p_min_role text)
      returns boolean language sql stable as $$
        select p_project_id = '${project}'::uuid and p_min_role = 'pm' and auth.uid() = '${actor}'::uuid
      $$;
    create table public.projects (id uuid primary key);
    create table public.gc_drawing_sets (
      id uuid primary key, project_id uuid not null references public.projects(id),
      is_deleted boolean not null default false, deleted_at timestamptz,
      steel_impact text not null default 'unknown'
    );
    create table public.drawing_sets (
      id uuid primary key, project_id uuid not null references public.projects(id),
      is_deleted boolean not null default false, deleted_at timestamptz,
      set_approval_status text
    );
    insert into public.projects values ('${project}'), ('${foreignProject}');
    insert into public.gc_drawing_sets values
      ('${issuance}','${project}',false,null,'unknown'),
      ('${foreignIssuance}','${foreignProject}',false,null,'unknown');
    insert into public.drawing_sets values
      ('${shopA}','${project}',false,null,'Pending'),
      ('${shopB}','${project}',false,null,'Pending'),
      ('${deletedShop}','${project}',true,now(),'Pending'),
      ('${foreignShop}','${foreignProject}',false,null,'Pending');
  `);
  await db.exec(sql);

  let result = await replace([shopA, shopB]);
  assert.deepEqual(result.shop_set_ids, [shopA, shopB]);
  assert.equal(result.added_count, 2);
  assert.deepEqual(await links(), [
    { project_id: project, drawing_set_id: shopA, created_by: actor },
    { project_id: project, drawing_set_id: shopB, created_by: actor },
  ]);
  assert.equal(await eventCount(), 1, 'the reviewed replacement is audited');

  result = await replace([shopB, shopA]);
  assert.equal(result.unchanged, true, 'reordering is a no-op');
  assert.equal(await eventCount(), 1, 'no duplicate audit for no-op');

  for (const ids of [[foreignShop], [deletedShop], [shopA, shopA]]) {
    await assert.rejects(replace(ids));
    assert.equal((await links()).length, 2, 'invalid replacement rolls back all links');
    assert.equal(await eventCount(), 1, 'invalid replacement leaves no audit row');
  }
  await assert.rejects(replace([shopA], foreignProject, issuance), /Not authorized/);
  await assert.rejects(replace([shopA], project, foreignIssuance), /Active GC issuance/);

  await assert.rejects(db.query(
    'insert into public.gc_issuance_shop_sets(project_id,gc_drawing_set_id,drawing_set_id) values($1,$2,$3)',
    [project, issuance, foreignShop],
  ), /foreign key|constraint/i, 'composite FK rejects cross-project direct writes');

  // A member of one project can read its links, not another tenant's, and
  // cannot bypass the reviewed RPC with direct relation DML.
  await db.query(
    'insert into public.gc_issuance_shop_sets(project_id,gc_drawing_set_id,drawing_set_id) values($1,$2,$3)',
    [foreignProject, foreignIssuance, foreignShop],
  );
  await db.exec('set role authenticated');
  const { rows: visibleLinks } = await db.query('select project_id from public.gc_issuance_shop_sets');
  assert.equal(visibleLinks.length, 2, 'the signed-in project member sees their two links');
  assert.ok(visibleLinks.every((link) => link.project_id === project));
  await assert.rejects(db.query(
    'insert into public.gc_issuance_shop_sets(project_id,gc_drawing_set_id,drawing_set_id) values($1,$2,$3)',
    [project, issuance, deletedShop],
  ), /permission denied/i, 'direct authenticated writes are unavailable');
  await db.exec('reset role');

  // An existing link remains traceable after soft deletion; it can be kept or
  // explicitly removed, while a fresh link to another archived set is refused.
  await db.query('update public.drawing_sets set is_deleted=true where id=$1', [shopB]);
  result = await replace([shopA, shopB]);
  assert.equal(result.unchanged, true);
  result = await replace([shopA]);
  assert.equal(result.removed_count, 1);
  assert.deepEqual((await links()).map((link) => link.drawing_set_id), [shopA]);
  assert.equal(await eventCount(), 2);

  await assert.rejects(db.query(
    'update public.gc_drawing_sets set steel_impact=$1 where id=$2', ['none', issuance],
  ), /Remove affected shop-set links/i, 'no-impact cannot contradict an existing exact link');
  await db.query('update public.gc_drawing_sets set steel_impact=$1 where id=$2', ['pending_review', issuance]);
  await replace([]);
  await db.query('update public.gc_drawing_sets set steel_impact=$1 where id=$2', ['none', issuance]);
  await assert.rejects(replace([shopA]), /Record the GC issuance as impacted or under review/i);
  assert.equal((await links()).length, 0, 'a no-impact issuance cannot gain an affected-set link');

  const { rows: shopRows } = await db.query('select set_approval_status from public.drawing_sets where id=$1', [shopA]);
  assert.equal(shopRows[0].set_approval_status, 'Pending', 'impact mapping never grants approval');
  assert.ok(!/\b(update|insert into)\s+public\.(fab_releases|drawing_revisions|submittal_rounds)\b/i.test(sql),
    'candidate does not write fabrication, distribution or approval state');

  await db.exec('set role anon');
  await assert.rejects(replace([shopA]), /permission denied|Not authorized/i);
  await db.exec('reset role');

  console.log('GC issuance / shop-set mapping SQL: reviewed links, tenant FKs, invalid-target rollback, audit, and no implied approval passed');
} finally {
  await db.close();
}
