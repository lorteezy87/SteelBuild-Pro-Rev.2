// Exact current source definitions for the active-project guard candidate.
// sourceName is used only for commands renamed to *_impl by slice 7.
export const pieceCommandSources = [
  ['set_piece_hold_impl','20260724130000_piece_control_production_hardening.sql'],
  ['bulk_update_piece_attributes_impl','20260727224500_bulk_update_piece_attributes.sql'],
  ['stage_piece_import_batch','20260720195844_optimize_piece_import_staging.sql'],
  ['approve_piece_import_batch','20260718010000_piece_control_slice1.sql'],
  ['apply_piece_import_batch','20260718010000_piece_control_slice1.sql'],
  ['assign_pieces_to_work_package','20260905130000_work_package_control_center.sql'],
  ['unassign_pieces_from_work_package','20260905130000_work_package_control_center.sql'],
  ['link_piece_drawing','20260718020000_piece_control_slice2.sql'],
  ['unlink_piece_drawing','20260718020000_piece_control_slice2.sql'],
  ['link_piece_drawing_set','20260915120000_adopt_2026_fab_release_gate.sql'],
  ['unlink_piece_drawing_set','20260915120000_adopt_2026_fab_release_gate.sql'],
  ['create_material_requirement','20260718030000_piece_control_slice3.sql'],
  ['map_material_requirement_to_pieces','20260718030000_piece_control_slice3.sql'],
  ['set_material_requirement_receipt_state','20260718030000_piece_control_slice3.sql'],
  ['set_project_station_configuration','20260718040000_piece_control_slice4.sql'],
  ['split_piece_lot_impl','20260718040000_piece_control_slice4.sql','split_piece_lot'],
  ['advance_piece_station_impl','20260718040000_piece_control_slice4.sql','advance_piece_station'],
  ['transition_piece_lots_canonical','20260718050000_piece_control_slice5.sql'],
  ['advance_piece_stations_impl','20260728040000_advance_piece_stations_bulk.sql'],
  ['sync_production_stages_to_pieces_impl','20260905090000_sync_production_stages_to_pieces.sql'],
  ['release_work_package_canonical_impl','20260905130000_work_package_control_center.sql'],
  ['link_model_elements_to_pieces','20260728053000_link_model_elements_chunked.sql'],
  ['link_model_elements_to_pieces_page','20260728053000_link_model_elements_chunked.sql'],
];

export const archiveSource = '20260914120000_adopt_production_soft_delete_project.sql';
export const archiveProjectLock = `  -- Match piece-command lock order: project first, then child rows.
  perform 1 from public.projects where id = p_project_id for update;
`;

export function guardPieceCommand(source, name) {
  const match = source.match(projectModeLookup);
  if (!match) throw new Error(`Missing project lookup: ${name}`);
  let guarded = source.replace(projectModeLookup, `v_mode := private.require_active_piece_project(${match[1]});`);
  // PostgreSQL has UUID ordering but no built-in max(uuid) aggregate. Keep the
  // latest page implementation's native UUID cursor ordering without that error.
  if (name === 'link_model_elements_to_pieces_page') {
    if (!guarded.includes('max(r.element_id) AS next_after')) throw new Error('Review changed model cursor source');
    guarded = guarded.replace('max(r.element_id) AS next_after', '(array_agg(r.element_id ORDER BY r.element_id DESC))[1] AS next_after');
  }
  if (name === 'release_work_package_canonical_impl') {
    // Resolve authorization first, then lock project before work package, as
    // archival does. Re-read the same active package under lock before using it.
    const initialRead = `  SELECT * INTO v_work_package
  FROM "public"."work_packages"
  WHERE "id" = p_work_package_id
    AND "is_deleted" = false
    AND "deleted_at" IS NULL
  FOR UPDATE;`;
    if (!guarded.includes(initialRead)) throw new Error('Review changed release package lookup');
    guarded = guarded.replace(initialRead, initialRead.replace('\n  FOR UPDATE;', ';'));
    const lookup = 'v_mode := private.require_active_piece_project(v_work_package.project_id);';
    guarded = guarded.replace(lookup, lookup + '\n\n' + initialRead.replace('    AND "is_deleted" = false', '    AND "project_id" = v_work_package.project_id\n    AND "is_deleted" = false') + "\n  IF v_work_package.id IS NULL THEN RAISE EXCEPTION 'Active work package not found'; END IF;");
  }
  return guarded;
}

export function renameFunction(source, previous, next) {
  return source.replace(new RegExp(`(FUNCTION (?:"public"|public)\\.)(?:"${previous}"|${previous})(?=\\()`, 'i'), `$1"${next}"`);
}
export const projectModeLookup = /SELECT\s+"?piece_control_mode"?\s+INTO\s+v_mode\s+FROM\s+(?:"public"|public)\.(?:"projects"|projects)\s+WHERE\s+"?id"?\s*=\s*([a-z_][a-z0-9_.]*)\s*;/i;
