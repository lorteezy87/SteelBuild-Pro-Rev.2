import assert from 'node:assert/strict';
import { createFixture, ids, readMigration, functionDefinition, tableDefinition } from './fixture.mjs';
import { installPieceFamilies, archivedFamilyCommands, familyIds } from './piece-family-fixture.mjs';
import { pieceCommandSources, guardPieceCommand, renameFunction, archiveSource, archiveProjectLock } from './piece-command-sources.mjs';
import { latestFunctionSources, resolveFunctionSources } from './latest-function-sources.mjs';

const { db, admin, asUser } = await createFixture();
const schema = await readMigration('20260101000010_baseline_schema.sql');
const slice0 = await readMigration('20260718000000_piece_control_slice0.sql');
const slice7 = await readMigration('20260718070000_piece_control_slice7.sql');
const holds = await readMigration('20260724130000_piece_control_production_hardening.sql');
await db.exec(tableDefinition(schema,'work_packages'));
await db.exec('alter table work_packages add primary key(id); alter table projects add column piece_control_mode text default \'live\';');
await db.exec(tableDefinition(slice0,'pieces'));
await db.exec(tableDefinition(slice0,'piece_events'));
await db.exec(tableDefinition(slice7,'piece_control_command_failures'));
await db.exec('alter table pieces add column is_container boolean not null default false; alter table pieces enable row level security; grant select on pieces to authenticated;');
await db.exec('create policy piece_read on pieces for select to authenticated using(user_has_project_access(project_id));');
await db.exec(functionDefinition(slice7,'record_piece_control_command_failure'));
for (const name of ['set_piece_hold_impl','set_piece_hold']) await db.exec(functionDefinition(holds,name));
await db.exec('revoke all on function set_piece_hold_impl(uuid,uuid[],boolean,text), set_piece_hold(uuid,uuid[],boolean,text) from public,anon; grant execute on function set_piece_hold(uuid,uuid[],boolean,text) to authenticated;');
await db.exec(await readMigration('20260727224500_bulk_update_piece_attributes.sql'));
await db.exec(await readMigration('20260927150000_erasure_census_admits_project_admins.sql'));
const piece='40000000-0000-4000-8000-000000000001';
const archivedPiece='40000000-0000-4000-8000-000000000002';
await db.query('insert into pieces(id,project_id,piece_mark,on_hold,on_hold_reason) values($1,$2,\'B1\',true,\'Drawing hold\'),($3,$4,\'B2\',true,\'Drawing hold\')',[piece,ids.project,archivedPiece,ids.archived]);
await installPieceFamilies(db);
if (!process.argv.includes('--before')) await db.exec(await readMigration('20261009003246_require_active_project_for_piece_edits.sql'));
let passed=0,failed=0;
async function check(name, fn) {
  await admin(); await db.exec('begin');
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  finally { await db.exec('rollback'); }
}
const run = async (name,project,pieceId) => (await db.query(
  name==='holds' ? 'select set_piece_hold($1,$2,false,\'Reviewed clearance\') as result' : 'select bulk_update_piece_attributes($1,$2,\'{"sequence_number":"SEQ-2"}\') as result',
  [project,[pieceId]],
)).rows[0].result;
async function roleAs(role) {
  if (role==='owner') return asUser(ids.owner);
  await db.query('insert into user_projects(user_id,project_id,role) values($1,$2,$3) on conflict(user_id,project_id) do update set role=excluded.role',[ids.field,ids.archived,role]);
  await db.query('update user_projects set role=$1 where user_id=$2 and project_id=$3',[role,ids.field,ids.project]);
  await asUser(ids.field);
}
for (const command of ['holds','attributes']) {
  for (const role of ['field','pm','admin','owner']) {
    await check(`active ${role} retains ${command} mutation and audit`,async()=>{
      await roleAs(role); assert.equal((await run(command,ids.project,piece)).updated,1);
      await admin(); assert.equal((await db.query('select count(*)::int as n from piece_events where piece_id=$1',[piece])).rows[0].n,1);
    });
    await check(`archived ${role} cannot perform ${command} or record success`,async()=>{
      await roleAs(role); const result=await run(command,ids.archived,archivedPiece);
      assert.equal(result.ok,false); assert.equal(result.error_code,'42501');
      await admin(); const row=(await db.query('select on_hold,sequence_number from pieces where id=$1',[archivedPiece])).rows[0];
      assert.equal(row.on_hold,true); assert.equal(row.sequence_number,null);
      assert.equal((await db.query('select count(*)::int as n from piece_events where piece_id=$1',[archivedPiece])).rows[0].n,0);
    });
  }
  await check(`active viewer cannot perform ${command}`,async()=>{await asUser(ids.viewer); assert.equal((await run(command,ids.project,piece)).error_code,'42501');});
  await check(`removed member with stale role cannot perform ${command}`,async()=>{
    await db.query('delete from organization_members where user_id=$1',[ids.field]); await asUser(ids.field); assert.equal((await run(command,ids.project,piece)).error_code,'42501');
  });
  await check(`foreign member cannot perform ${command}`,async()=>{await asUser(ids.outsider); assert.equal((await run(command,ids.project,piece)).error_code,'42501');});
}
await check('archived administrator still has the role and can read the erasure census',async()=>{
  await asUser(ids.owner);
  assert.equal((await db.query('select user_has_project_role_at_least($1,\'admin\') as allowed',[ids.archived])).rows[0].allowed,true);
  assert.equal((await db.query('select project_row_counts($1) as counts',[ids.archived])).rows[0].counts.pieces,1);
});
await check('restored project becomes writable again without replacing role assignments',async()=>{
  await db.query('update projects set is_deleted=false where id=$1',[ids.archived]);
  await asUser(ids.owner); assert.equal((await run('holds',ids.archived,archivedPiece)).updated,1);
});
await check('archive deny is scoped to RPCs and adds no pieces triggers that could break FK erasure',async()=>{
  const rows=(await db.query("select tgname from pg_trigger where tgrelid='public.pieces'::regclass and not tgisinternal")).rows;
  assert.deepEqual(rows,[]);
});
for(const [name,sql,usesProject=true] of archivedFamilyCommands) {
  await check(`archived owner cannot enter ${name}`,async()=>{
    await asUser(ids.owner); await db.exec('savepoint archived_command');
    let code=null;
    try { const row=(await db.query(sql,usesProject?[ids.archived]:[])).rows[0]; code=row?.result?.error_code; }
    catch(error){code=error.code;}
    finally {await db.exec('rollback to archived_command; release archived_command');}
    assert.equal(code,'42501');
  });
}
const rpc=async(sql,args=[]) => (await db.query(sql,args)).rows[0].result;
await check('active PM stages approves and applies a real new-piece import',async()=>{
  await roleAs('pm');
  const batch=await rpc("select stage_piece_import_batch($1,'manual','Fixture','[{\"piece_mark\":\"N1\",\"quantity\":2}]') as result",[ids.project]);
  assert.ok(batch.batch_id);
  assert.equal((await rpc('select approve_piece_import_batch($1) as result',[batch.batch_id])).status,'approved');
  await rpc('select apply_piece_import_batch($1) as result',[batch.batch_id]);
  await admin(); assert.equal((await db.query("select quantity from pieces where piece_mark='N1'")).rows[0].quantity,'2');
});
await check('active field links and unlinks sheet and set evidence',async()=>{
  await db.query('insert into drawing_sets(id,project_id,set_name) values($1,$2,\'Framing\')',[familyIds.drawingSet,ids.project]);
  await db.query('insert into drawings(id,project_id,sheet_number) values($1,$2,\'S1\')',[familyIds.drawing,ids.project]);
  await asUser(ids.field);
  await rpc('select link_piece_drawing($1,$2,$3) as result',[ids.project,piece,familyIds.drawing]);
  await rpc('select link_piece_drawing_set($1,$2,$3) as result',[ids.project,piece,familyIds.drawingSet]);
  await admin(); assert.equal((await db.query('select count(*)::int as n from piece_drawing_sets')).rows[0].n,1);
  await asUser(ids.field);
  await rpc('select unlink_piece_drawing($1,$2,$3) as result',[ids.project,piece,familyIds.drawing]);
  await rpc('select unlink_piece_drawing_set($1,$2,$3) as result',[ids.project,piece,familyIds.drawingSet]);
  await admin(); assert.equal((await db.query('select count(*)::int as n from piece_drawing_sets')).rows[0].n,0);
});
await check('active field creates maps and receives material requirements',async()=>{
  await asUser(ids.field);
  const material=await rpc("select create_material_requirement($1,'M1') as result",[ids.project]);
  await rpc('select map_material_requirement_to_pieces($1,$2,$3) as result',[ids.project,material.id,[piece]]);
  const result=await rpc("select set_material_requirement_receipt_state($1,$2,'received',1,'Packing slip','PS-1') as result",[ids.project,material.id]);
  assert.equal(result.receipt_state,'received');
  await admin(); assert.equal((await db.query('select count(*)::int as n from material_receipt_events')).rows[0].n,1);
});
await check('active field splits a lot without losing quantity',async()=>{
  await db.query('update pieces set quantity=2 where id=$1',[piece]);
  await asUser(ids.field);
  const result=await rpc('select split_piece_lot($1,$2,\'[{"lot_code":"A","quantity":1},{"lot_code":"B","quantity":1}]\') as result',[ids.project,piece]);
  assert.equal(result.source_is_container,true); assert.equal(result.children.length,2);
});
await check('active field assigns and unassigns a work package with its real rollup',async()=>{
  await db.query('update work_packages set project_id=$1 where id=$2',[ids.project,familyIds.workPackage]);
  await asUser(ids.field);
  assert.equal((await rpc('select assign_pieces_to_work_package($1,$2,$3) as result',[ids.project,[piece],familyIds.workPackage])).assigned,1);
  const result=await rpc('select unassign_pieces_from_work_package($1,$2) as result',[ids.project,[piece]]);
  assert.equal(result.unassigned,1);
});
await check('active production advances stations and ships delivers erects a lot',async()=>{
  await db.query('update work_packages set project_id=$1 where id=$2',[ids.project,familyIds.workPackage]);
  await db.query('update pieces set work_package_id=$1,on_hold=false,on_hold_reason=null where id=$2',[familyIds.workPackage,piece]);
  await db.query("insert into fab_releases(project_id,work_package_id,release_number,name,status,canonical_release) values($1,$2,'FIXTURE','Fixture','Released',true)",[ids.project,familyIds.workPackage]);
  await db.query('select seed_default_piece_stations($1,$2)',[ids.project,ids.owner]);
  await asUser(ids.field);
  assert.equal((await rpc("select advance_piece_station($1,$2,'cut') as result",[ids.project,piece])).station_key,'cut');
  assert.equal((await rpc("select advance_piece_stations($1,$2,'fit') as result",[ids.project,[piece]])).advanced,1);
  const sync=await rpc('select sync_production_stages_to_pieces($1,\'[{"mark":"B1","target_station":"ready_to_ship"}]\') as result',[ids.project]);
  assert.equal(sync.advanced,1);
  for(const name of ['ship','deliver','erect']) assert.equal((await rpc(`select ${name}_piece_lots($1,$2) as result`,[ids.project,[piece]])).transitioned,1);
});
await check('active PM configures all six production stations',async()=>{
  await roleAs('pm');
  const configuration=['cut','fit','weld','qc','paint','ready_to_ship'].map((station_key,index)=>({station_key,station_name:station_key,sort_order:index+1,earned_percent:index<4?20:10}));
  const result=await rpc('select set_project_station_configuration($1,$2) as result',[ids.project,JSON.stringify(configuration)]);
  assert.equal(result.station_count,6); assert.equal(result.earned_percent_total,100);
});
await check('active canonical release still rejects an already released package',async()=>{
  await db.query('update work_packages set project_id=$1 where id=$2',[ids.project,familyIds.workPackage]);
  await db.query("insert into fab_releases(project_id,work_package_id,release_number,name,status,canonical_release) values($1,$2,'FIXTURE','Fixture','Released',true)",[ids.project,familyIds.workPackage]);
  await asUser(ids.owner); const result=await rpc('select release_work_package_canonical($1) as result',[familyIds.workPackage]);
  assert.match(result.error_message,/CANONICAL_RELEASE_ALREADY_EXISTS/);
});
await check('active field links the full model roster and preserves unmatched and ambiguous marks',async()=>{
  await db.query("insert into pieces(project_id,piece_mark,lot_code) values($1,'A1','L1'),($1,'A1','L2')",[ids.project]);
  await db.query("insert into model_elements(project_id,piece_mark,metadata) values($1,'B1','{}'),($1,'A1','{}'),($1,'A1','{\"lot_code\":\"L1\"}'),($1,'MISSING','{}')",[ids.project]);
  await asUser(ids.field);
  const result=await rpc('select link_model_elements_to_pieces($1) as result',[ids.project]);
  assert.deepEqual(result,{project_id:ids.project,linked:2,unchanged:0,unmatched:1,ambiguous:1});
  const repeated=await rpc('select link_model_elements_to_pieces($1) as result',[ids.project]);
  assert.equal(repeated.unchanged,2); assert.equal(repeated.linked,0);
  await admin(); assert.equal((await db.query('select count(*)::int n from model_elements where piece_id is not null')).rows[0].n,2);
});
await check('active field pages model links with ordered UUID cursors without omissions or repeats',async()=>{
  const elements=['a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003'];
  for(const id of elements) await db.query("insert into model_elements(id,project_id,piece_mark) values($1,$2,'B1')",[id,ids.project]);
  await asUser(ids.field);
  let after=null;
  for(const id of elements) {
    const result=await rpc('select link_model_elements_to_pieces_page($1,1,$2) as result',[ids.project,after]);
    assert.equal(result.processed,1); assert.equal(result.linked,1); assert.equal(result.next_after_id,id); assert.equal(result.done,false);
    after=result.next_after_id;
  }
  const last=await rpc('select link_model_elements_to_pieces_page($1,1,$2) as result',[ids.project,after]);
  assert.equal(last.processed,0); assert.equal(last.next_after_id,null); assert.equal(last.done,true);
  const repeated=await rpc('select link_model_elements_to_pieces_page($1,null,null) as result',[ids.project]);
  assert.equal(repeated.processed,3); assert.equal(repeated.unchanged,3); assert.equal(repeated.done,true);
  await admin(); assert.equal((await db.query('select count(*)::int n from model_elements where piece_id=$1',[piece])).rows[0].n,3);
});
await check('latest model linking timeouts and definer search paths are preserved',async()=>{
  for(const [name,timeout] of [['link_model_elements_to_pieces','180s'],['link_model_elements_to_pieces_page','60s']]) {
    const row=(await db.query('select prosecdef,proconfig from pg_proc where proname=$1',[name])).rows[0];
    assert.equal(row.prosecdef,true); assert.deepEqual(row.proconfig,['search_path=public',`statement_timeout=${timeout}`]);
  }
});
await check('project admin still archives existing children and skips absent child tables',async()=>{
  await db.query('update work_packages set project_id=$1 where id=$2',[ids.project,familyIds.workPackage]);
  await asUser(ids.owner); await db.query('select soft_delete_project($1)',[ids.project]);
  await admin();
  assert.equal((await db.query('select is_deleted from projects where id=$1',[ids.project])).rows[0].is_deleted,true);
  assert.equal((await db.query('select is_deleted from work_packages where id=$1',[familyIds.workPackage])).rows[0].is_deleted,true);
});
await check('project archival retains the admin role floor and already-archived error',async()=>{
  await asUser(ids.viewer); await db.exec('savepoint archive_denied');
  await assert.rejects(db.query('select soft_delete_project($1)',[ids.project]),{code:'42501'});
  await db.exec('rollback to archive_denied; release archive_denied');
  await asUser(ids.owner); await assert.rejects(db.query('select soft_delete_project($1)',[ids.archived]),{code:'P0002'});
});
await check('archived project administrator retains the guarded piece-archive operation',async()=>{
  await db.query('update pieces set on_hold=false,on_hold_reason=null where id=$1',[archivedPiece]);
  await asUser(ids.owner);
  const result=await rpc("select archive_piece_lots($1,$2,'ARCHIVE 1 PIECE','Approved obsolete lot removal') as result",[ids.archived,[archivedPiece]]);
  assert.equal(result.archived,1);
});
if(!process.argv.includes('--before')) {
  await check('private helper cannot be called directly by an API user',async()=>{
    await asUser(ids.owner); await assert.rejects(db.query('select private.require_active_piece_project($1)',[ids.project]),{code:'42501'});
  });
  await check('all command bodies preserve latest source with only reviewed guard cursor and lock changes',async()=>{
    const candidate=await readMigration('20261009003246_require_active_project_for_piece_edits.sql');
    for(const [name,path,sourceName=name] of pieceCommandSources) {
      let original=functionDefinition(await readMigration(path),sourceName).replaceAll('\r\n','\n');
      if(sourceName!==name) original=renameFunction(original,sourceName,name);
      assert.equal(functionDefinition(candidate,name),guardPieceCommand(original,name));
    }
  });
  await check('source inventory matches latest declarations across every migration including renames',async()=>{
    const latest=await latestFunctionSources(['20261009003246_require_active_project_for_piece_edits.sql']);
    for(const [name,path,sourceName=name] of [...pieceCommandSources,['soft_delete_project',archiveSource]]) {
      const definition=latest.get(name); assert.ok(definition,name);
      assert.equal(definition.path,path,name); assert.equal(definition.sourceName,sourceName,name);
      assert.equal(definition.sql,functionDefinition(await readMigration(path),sourceName).replaceAll('\r\n','\n'),name);
    }
  });
  await check('latest source resolver detects replacements and preserves renamed implementations',async()=>{
    const body=name=>`CREATE OR REPLACE FUNCTION public.${name}() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;`;
    const definitions=resolveFunctionSources([
      ['old.sql',body('command')],
      ['rename.sql','ALTER FUNCTION public.command() RENAME TO command_impl;\n'+body('command')],
      ['latest.sql',body('command_impl')],
    ]);
    assert.equal(definitions.get('command').path,'rename.sql');
    assert.equal(definitions.get('command_impl').path,'latest.sql');
  });
  await check('archive body preserves latest source with only project-first locking added',async()=>{
    const original=functionDefinition(await readMigration(archiveSource),'soft_delete_project').replaceAll('\r\n','\n');
    const expected=original.replace('  foreach v_table in array v_child_tables loop',archiveProjectLock+'  foreach v_table in array v_child_tables loop');
    const candidate=await readMigration('20261009003246_require_active_project_for_piece_edits.sql');
    assert.equal(functionDefinition(candidate,'soft_delete_project'),expected);
  });
  await check('release locks the project before re-reading and locking its work package',async()=>{
    const candidate=await readMigration('20261009003246_require_active_project_for_piece_edits.sql');
    const release=functionDefinition(candidate,'release_work_package_canonical_impl');
    const projectLock=release.indexOf('private.require_active_piece_project');
    assert.ok(projectLock>0);
    assert.ok(release.indexOf('FOR UPDATE')>projectLock);
    assert.ok(release.includes('AND "project_id" = v_work_package.project_id'));
  });
}
console.log(`${passed} passed; ${failed} failed (${process.argv.includes('--before')?'before archive candidate':'archive candidate SQL'})`);
await db.close(); if(failed)process.exitCode=1;
