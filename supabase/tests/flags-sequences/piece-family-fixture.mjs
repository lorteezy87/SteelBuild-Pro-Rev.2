import { functionDefinition, tableDefinition, readMigration, ids } from './fixture.mjs';
import { pieceCommandSources, renameFunction, archiveSource } from './piece-command-sources.mjs';

export const familyIds = {
  batch:'50000000-0000-4000-8000-000000000001',
  workPackage:'60000000-0000-4000-8000-000000000001',
  drawing:'70000000-0000-4000-8000-000000000001',
  drawingSet:'80000000-0000-4000-8000-000000000001',
  material:'90000000-0000-4000-8000-000000000001',
};
export async function installPieceFamilies(db) {
  const schema=await readMigration('20260101000010_baseline_schema.sql');
  for (const table of ['drawings','drawing_sets','fab_releases','risks','model_elements']) {
    await db.exec(tableDefinition(schema,table));
    await db.exec(`alter table public.${table} add primary key(id)`);
  }
  const slice1=await readMigration('20260718010000_piece_control_slice1.sql');
  const slice2=await readMigration('20260718020000_piece_control_slice2.sql');
  const slice3=await readMigration('20260718030000_piece_control_slice3.sql');
  const slice4=await readMigration('20260718040000_piece_control_slice4.sql');
  const slice5=await readMigration('20260718050000_piece_control_slice5.sql');
  const slice7=await readMigration('20260718070000_piece_control_slice7.sql');
  const adopted=await readMigration('20260915120000_adopt_2026_fab_release_gate.sql');
  for (const [source,tables] of [
    [slice1,['piece_import_batches','piece_import_rows']],
    [slice2,['piece_drawings']],
    [slice3,['material_requirements','piece_material_requirements','material_receipt_events']],
    [slice4,['piece_station_configurations','piece_station_completions']],
  ]) for (const table of tables) await db.exec(tableDefinition(source,table));
  await db.exec(`alter table pieces drop constraint pieces_lifecycle_status_check;
    alter table piece_events drop constraint piece_events_event_type_check;
    alter table model_elements add column piece_id uuid;`);
  await db.exec(tableDefinition(adopted,'piece_drawing_sets'));
  const fabAlter=slice3.indexOf('ALTER TABLE "public"."fab_releases"');
  await db.exec(slice3.slice(fabAlter,slice3.indexOf(';',fabAlter)+1));
  await db.exec(functionDefinition(await readMigration('20260905130000_work_package_control_center.sql'),'refresh_work_package_progress'));
  await db.exec(functionDefinition(await readMigration('20260720213000_archive_canonical_pieces.sql'),'archive_piece_lots'));
  await db.exec(functionDefinition(await readMigration(archiveSource),'soft_delete_project'));
  await db.exec('revoke all on function soft_delete_project(uuid) from public,anon,service_role; grant execute on function soft_delete_project(uuid) to authenticated;');
  for(const name of ['piece_import_normalize_payload','piece_import_reconcile_row']) await db.exec(functionDefinition(slice1,name));
  for(const name of ['validate_piece_station_configuration','seed_default_piece_stations']) await db.exec(functionDefinition(slice4,name));
  for(const [name,path,sourceName=name] of pieceCommandSources) {
    const source=functionDefinition(await readMigration(path),sourceName);
    await db.exec(sourceName===name?source:renameFunction(source,sourceName,name));
  }
  for(const name of ['ship_piece_lots','deliver_piece_lots','erect_piece_lots']) await db.exec(renameFunction(functionDefinition(slice5,name),name,`${name}_impl`));
  for(const name of ['release_work_package_canonical','split_piece_lot','advance_piece_station','ship_piece_lots','deliver_piece_lots','erect_piece_lots']) await db.exec(functionDefinition(slice7,name));
  await db.exec(functionDefinition(await readMigration('20260728040000_advance_piece_stations_bulk.sql'),'advance_piece_stations'));
  await db.exec(functionDefinition(await readMigration('20260905090000_sync_production_stages_to_pieces.sql'),'sync_production_stages_to_pieces'));
  await db.query("insert into piece_import_batches(id,project_id,source_type,uploaded_by,status) values($1,$2,'manual',$3,'approved')",[familyIds.batch,ids.archived,ids.owner]);
  await db.query('insert into work_packages(id,project_id,name) values($1,$2,$3)',[familyIds.workPackage,ids.archived,'Archived package']);
}

// Invocations intentionally use invalid business payloads for most families:
// authorization must reject the archived parent before any business work.
// Separate active success cases exercise normal writes below/in the verifier.
export const archivedFamilyCommands = [
  ['stage import', "select stage_piece_import_batch($1,'manual','fixture','[]') as result"],
  ['approve import', `select approve_piece_import_batch('${familyIds.batch}') as result`,false],
  ['apply import', `select apply_piece_import_batch('${familyIds.batch}') as result`,false],
  ['assign package', 'select assign_pieces_to_work_package($1,\'{}\'::uuid[],null) as result'],
  ['unassign package', 'select unassign_pieces_from_work_package($1,\'{}\'::uuid[]) as result'],
  ['link drawing', 'select link_piece_drawing($1,null,null) as result'],
  ['unlink drawing', 'select unlink_piece_drawing($1,null,null) as result'],
  ['link drawing set', 'select link_piece_drawing_set($1,null,null) as result'],
  ['unlink drawing set', 'select unlink_piece_drawing_set($1,null,null) as result'],
  ['create material', "select create_material_requirement($1,'TEST') as result"],
  ['map material', "select map_material_requirement_to_pieces($1,null,'{}'::uuid[]) as result"],
  ['receive material', "select set_material_requirement_receipt_state($1,null,'received') as result"],
  ['station configuration', "select set_project_station_configuration($1,'[]') as result"],
  ['split lot', "select split_piece_lot($1,null,'[]') as result"],
  ['advance station', "select advance_piece_station($1,null,'cut') as result"],
  ['bulk advance', "select advance_piece_stations($1,'{}'::uuid[],'cut') as result"],
  ['ship lots', "select ship_piece_lots($1,'{}'::uuid[]) as result"],
  ['deliver lots', "select deliver_piece_lots($1,'{}'::uuid[]) as result"],
  ['erect lots', "select erect_piece_lots($1,'{}'::uuid[]) as result"],
  ['sync production', "select sync_production_stages_to_pieces($1,'[]') as result"],
  ['canonical release', `select release_work_package_canonical('${familyIds.workPackage}') as result`,false],
  ['link model elements', 'select link_model_elements_to_pieces($1) as result'],
  ['link model elements page', 'select link_model_elements_to_pieces_page($1,1,null) as result'],
];
