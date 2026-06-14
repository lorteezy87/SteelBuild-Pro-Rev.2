/**
 * ifcRosterImport.js — persist an extracted IFC piece roster (extractIfcRoster)
 * into model_registry + model_elements. This is what backfills
 * model_elements.element_guid (IFC GlobalId), so summarizeElementStatuses can
 * build guidsByStatus and the 3D viewer can color geometry by fab status.
 *
 * Replace-on-import (MVP is one IFC model per project): any prior active IFC
 * model is superseded and its roster soft-deleted, then the new model + roster
 * are written. CSV-sourced model_elements are left untouched (only source='ifc'
 * rows are replaced).
 */
import { supabase } from "@/lib/supabase";
import { entities } from "@/api/supabaseClient";

const CHUNK = 500;

/**
 * @param {object} args
 * @param {string} args.projectId
 * @param {string} args.fileName
 * @param {string} [args.schema]      IFC schema (stored as coordinate_system label)
 * @param {Array}  args.rows          extractIfcRoster().rows
 * @returns {Promise<{ modelId: string, created: number }>}
 */
export async function importIfcRoster({ projectId, fileName, schema, rows }) {
  if (!projectId) throw new Error("No active project.");
  if (!rows?.length) throw new Error("No pieces found in the model to import.");
  const now = new Date().toISOString();

  // 1. Replace any prior IFC model for this project.
  const { error: supErr } = await supabase
    .from("model_registry")
    .update({ status: "superseded", updated_at: now })
    .eq("project_id", projectId)
    .eq("file_type", "IFC")
    .eq("status", "active");
  if (supErr) throw supErr;

  const { error: delErr } = await supabase
    .from("model_elements")
    .update({ is_deleted: true, deleted_at: now })
    .eq("project_id", projectId)
    .eq("source", "ifc")
    .eq("is_deleted", false);
  if (delErr) throw delErr;

  // 2. Create the model anchor.
  const { data: reg, error: regErr } = await supabase
    .from("model_registry")
    .insert({
      project_id: projectId,
      file_name: fileName,
      file_type: "IFC",
      source: "local",
      status: "active",
      coordinate_system: schema || null,
      upload_date: now,
      revision_number: 1,
      metadata: { parts: rows.length, imported_from: "ifc_roster" },
    })
    .select("id")
    .single();
  if (regErr) throw regErr;
  const modelId = reg.id;

  // 3. Bulk-insert the roster. Each row carries the IFC GlobalId (element_guid)
  //    + the assembly mark (piece_mark) — the geometry↔status join.
  const records = rows.map((r) => ({
    project_id: projectId,
    model_id: modelId,
    source: "ifc",
    element_guid: r.element_guid,
    piece_mark: r.piece_mark,
    assembly_mark: r.assembly_mark || null,
    sequence_number: r.sequence_number || null,
    quantity: r.quantity ?? 1,
    metadata: { part_mark: r.part_mark || null, ifc_type: r.ifc_type || null, name: r.name || null },
  }));

  let created = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    await entities.ModelElement.bulkCreate(chunk);
    created += chunk.length;
  }

  return { modelId, created };
}
