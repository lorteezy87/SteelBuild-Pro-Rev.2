/**
 * ifcRosterImport.js — persist an extracted IFC piece roster (extractIfcRoster)
 * into model_registry + model_elements. This is what backfills
 * model_elements.element_guid (IFC GlobalId), so summarizeElementStatuses can
 * build guidsByStatus and the 3D viewer can color geometry by fab status.
 *
 * Replace-on-import (MVP is one IFC model per project), written so a failed
 * save never leaves the project without a model: the NEW registry row + roster
 * are inserted first, and only once every chunk landed is the prior active
 * model superseded and its IFC roster soft-deleted. If a chunk fails the new
 * model is discarded and the old one stays active. (The previous order —
 * retire the old model, then insert — is why a project ended up with only
 * `superseded` registry rows after one bad save.) CSV-sourced model_elements
 * are left untouched (only source='ifc' rows are replaced).
 */
import { supabase } from "@/lib/supabase";
import { entities } from "@/api/supabaseClient";
import { linkModelElementsToPieces } from "@/lib/pieceControl/modelElementLink";

const CHUNK = 500;

/** Best-effort removal of a half-written model so the prior one stays active. */
async function discardModel(projectId, modelId, now) {
  await supabase
    .from("model_elements")
    .update({ is_deleted: true, deleted_at: now })
    .eq("project_id", projectId)
    .eq("model_id", modelId);
  await supabase
    .from("model_registry")
    .update({ is_deleted: true, deleted_at: now, status: "archived", updated_at: now })
    .eq("id", modelId);
}

/**
 * @param {object} args
 * @param {string} args.projectId
 * @param {string} args.fileName
 * @param {string} [args.schema]      IFC schema (stored as coordinate_system label)
 * @param {string} [args.fileUrl]     Storage path of the uploaded .ifc (so the
 *                                     viewer can auto-load it next visit)
 * @param {Array}  args.rows          extractIfcRoster().rows
 * @param {(done: number, total: number) => void} [args.onProgress]  roster rows written
 * @returns {Promise<{ modelId: string, created: number, linkSummary: object|null }>}
 */
export async function importIfcRoster({ projectId, fileName, schema, fileUrl, rows, onProgress }) {
  if (!projectId) throw new Error("No active project.");
  const safeRows = rows || []; // a model with no marks still persists (file_url only)
  const now = new Date().toISOString();

  // 1. Create the new model anchor. It is `active` from the start so the
  //    stored-model query (latest active by upload_date) picks it up as soon as
  //    the roster is complete; the prior model is retired in step 3.
  const { data: reg, error: regErr } = await supabase
    .from("model_registry")
    .insert({
      project_id: projectId,
      file_name: fileName,
      file_url: fileUrl || null,
      file_type: "IFC",
      source: "local",
      status: "active",
      coordinate_system: schema || null,
      upload_date: now,
      revision_number: 1,
      metadata: { parts: safeRows.length, imported_from: "ifc_roster" },
    })
    .select("id")
    .single();
  if (regErr) throw regErr;
  const modelId = reg.id;

  // 2. Bulk-insert the roster. Each row carries the IFC GlobalId (element_guid)
  //    + the assembly mark (piece_mark) — the geometry↔status join.
  const records = safeRows.map((r) => ({
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
  onProgress?.(0, records.length);
  try {
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      await entities.ModelElement.bulkCreate(chunk);
      created += chunk.length;
      onProgress?.(created, records.length);
    }
  } catch (err) {
    try { await discardModel(projectId, modelId, now); } catch { /* keep the original error */ }
    throw err;
  }

  // 3. Retire the previous IFC model + roster now that the replacement is whole.
  const { error: supErr } = await supabase
    .from("model_registry")
    .update({ status: "superseded", superseded_by: modelId, updated_at: now })
    .eq("project_id", projectId)
    .eq("file_type", "IFC")
    .eq("status", "active")
    .neq("id", modelId);
  if (supErr) throw supErr;

  const { error: delErr } = await supabase
    .from("model_elements")
    .update({ is_deleted: true, deleted_at: now })
    .eq("project_id", projectId)
    .eq("source", "ifc")
    .eq("is_deleted", false)
    // Legacy IFC rows can carry a null model_id; `neq` alone would skip them.
    .or(`model_id.is.null,model_id.neq.${modelId}`);
  if (delErr) throw delErr;

  // Lot-aware mark → canonical piece link (RPC or client fallback if migration lag).
  let linkSummary = null;
  try {
    linkSummary = await linkModelElementsToPieces(projectId);
  } catch {
    /* link is best-effort after import */
  }

  return { modelId, created, linkSummary };
}

/**
 * Remove the project's active IFC model — soft-deletes the model_registry row(s)
 * and the IFC-sourced model_elements, so the viewer returns to the upload state.
 * CSV-sourced elements are left alone.
 */
export async function removeProjectModel(projectId) {
  if (!projectId) throw new Error("No active project.");
  const now = new Date().toISOString();

  const { error: regErr } = await supabase
    .from("model_registry")
    .update({ is_deleted: true, deleted_at: now, status: "archived" })
    .eq("project_id", projectId)
    .eq("file_type", "IFC")
    .eq("is_deleted", false);
  if (regErr) throw regErr;

  const { error: elErr } = await supabase
    .from("model_elements")
    .update({ is_deleted: true, deleted_at: now })
    .eq("project_id", projectId)
    .eq("source", "ifc")
    .eq("is_deleted", false);
  if (elErr) throw elErr;
}
