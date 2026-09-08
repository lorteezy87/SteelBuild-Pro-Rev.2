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
 *
 * The rollback is best-effort — it runs over the same connection that just
 * failed — so on failure the thrown error is stamped with
 * ROSTER_ROLLBACK_FIELD: "clean" when every rollback statement verifiably
 * succeeded, "dirty" when it did not. Callers MUST branch on it before telling
 * anyone the project was left unchanged.
 */
import { supabase } from "@/lib/supabase";
import { entities } from "@/api/supabaseClient";
import { linkModelElementsToPieces } from "@/lib/pieceControl/modelElementLink";
import { ROSTER_ROLLBACK_FIELD } from "@/lib/ifc/persistSteps";

const CHUNK = 500;

/**
 * Page size for soft-deletes. The `authenticated` role runs with
 * statement_timeout=8s, and model_elements carries 11 indexes, so a single
 * UPDATE over a whole project's roster (live rosters reach ~28k rows) cannot
 * finish inside the budget — it dies with "canceling statement due to statement
 * timeout". 1000 also matches PostgREST's db-max-rows, so the id page is one
 * round trip. Each page is its own statement, so the work is unbounded in total
 * but bounded per statement.
 */
const SOFT_DELETE_PAGE = 1000;

/**
 * Soft-delete every matching row, ONE PAGE PER STATEMENT.
 *
 * `applyFilter` narrows a `select("id")` builder; the loop is self-consuming
 * because each page flips `is_deleted` to true and the filter always requires
 * `is_deleted = false`, so no offset bookkeeping is needed.
 *
 * @param {(q: any) => any} applyFilter
 * @param {string} now  ISO stamp — also the undo handle (see restoreSoftDeleted)
 * @param {(done: number) => void} [onProgress]
 * @returns {Promise<number>} rows soft-deleted
 */
async function softDeleteInPages(applyFilter, now, onProgress) {
  let total = 0;
  for (;;) {
    const { data, error } = await applyFilter(
      supabase.from("model_elements").select("id").eq("is_deleted", false),
    ).limit(SOFT_DELETE_PAGE);
    if (error) throw error;
    const ids = (data || []).map((r) => r.id);
    if (!ids.length) break;

    const { error: updErr } = await supabase
      .from("model_elements")
      .update({ is_deleted: true, deleted_at: now })
      .in("id", ids);
    if (updErr) throw updErr;

    total += ids.length;
    onProgress?.(total);
    if (ids.length < SOFT_DELETE_PAGE) break;
  }
  return total;
}

/**
 * Undo the soft-deletes this run performed. `deleted_at` is stamped with the
 * run's own `now`, so it identifies exactly the rows this import retired and
 * nothing else. Paged for the same statement-timeout reason.
 *
 * `excludeModelId` is not optional in practice: the rollback ALSO soft-deletes
 * the new model's own rows with that same `now`, so an unscoped restore
 * un-deletes the half-written roster it is there to remove — leaving the old
 * roster and a partial new one both live, i.e. the doubled piece count, off a
 * rollback that reported success on a perfectly healthy connection.
 */
async function restoreSoftDeleted(projectId, now, excludeModelId) {
  for (;;) {
    let q = supabase
      .from("model_elements")
      .select("id")
      .eq("project_id", projectId)
      .eq("is_deleted", true)
      .eq("deleted_at", now);
    // Legacy IFC rows can carry a null model_id, so `neq` alone would drop them.
    if (excludeModelId) q = q.or(`model_id.is.null,model_id.neq.${excludeModelId}`);
    const { data, error } = await q.limit(SOFT_DELETE_PAGE);
    if (error) throw error;
    const ids = (data || []).map((r) => r.id);
    if (!ids.length) break;
    const { error: updErr } = await supabase
      .from("model_elements")
      .update({ is_deleted: false, deleted_at: null })
      .in("id", ids);
    if (updErr) throw updErr;
    if (ids.length < SOFT_DELETE_PAGE) break;
  }
}

/**
 * Put the project back the way it was before this run, and SAY WHETHER IT
 * WORKED.
 *
 * Without this, a failure in the retire phase left BOTH rosters live — the new
 * one inserted and active, the old one never soft-deleted — while the error told
 * the operator "the previous model is still active — retry the save", so the
 * retry stacked a third roster on top. One project reached 3 live rosters and
 * 45,543 rows against a true count of 13,992.
 *
 * Three rules, each one a bug this used to have:
 *  • Every statement checks its `{ error }`. supabase-js does not throw on a
 *    failed statement — postgrest-js turns even a dead connection into a
 *    RESOLVED `{ error: { message: "TypeError: Failed to fetch" } }` — so an
 *    unchecked `.update()` reports a repair that never happened.
 *  • Stages run cheapest-and-most-decisive first, and every stage is attempted
 *    even after an earlier one fails. A rollback runs over the connection that
 *    just died, so the two small registry PATCHes that decide which model the
 *    project serves must not sit behind two unbounded paged passes.
 *  • The restore is scoped away from this run's own rows (see
 *    restoreSoftDeleted).
 *
 * @returns {Promise<boolean>} true only when EVERY stage verifiably succeeded
 */
async function rollbackImport(projectId, modelId, now) {
  const stages = [
    // 1. Stop serving the half-written model.
    async () => {
      const { error } = await supabase
        .from("model_registry")
        .update({ is_deleted: true, deleted_at: now, status: "archived", updated_at: now })
        .eq("id", modelId);
      if (error) throw error;
    },
    // 2. Put the model this run retired back in charge.
    async () => {
      const { error } = await supabase
        .from("model_registry")
        .update({ status: "active", superseded_by: null, updated_at: now })
        .eq("project_id", projectId)
        .eq("superseded_by", modelId);
      if (error) throw error;
    },
    // 3. Un-retire the previous roster BEFORE dropping this run's rows: real
    //    pieces missing from the 3D view is a worse end-state than extra ones.
    () => restoreSoftDeleted(projectId, now, modelId),
    // 4. Drop what this run wrote.
    () => softDeleteInPages((q) => q.eq("project_id", projectId).eq("model_id", modelId), now),
  ];

  let clean = true;
  for (const stage of stages) {
    try {
      await stage();
    } catch (err) {
      clean = false;
      console.error(`[importIfcRoster] rollback stage failed for model ${modelId}:`, err);
    }
  }
  return clean;
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
  // Steps 2 AND 3 are both inside the guard. Retiring the old model used to sit
  // OUTSIDE it, so a failure there (reliably, on any large roster — see
  // SOFT_DELETE_PAGE) threw with the new roster already inserted and live and
  // the old one never retired: two rosters live at once, and an error message
  // inviting a retry that stacked a third.
  try {
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      await entities.ModelElement.bulkCreate(chunk);
      created += chunk.length;
      onProgress?.(created, records.length);
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

    await softDeleteInPages(
      (q) =>
        q
          .eq("project_id", projectId)
          .eq("source", "ifc")
          // Legacy IFC rows can carry a null model_id; `neq` alone would skip them.
          .or(`model_id.is.null,model_id.neq.${modelId}`),
      now,
    );
  } catch (err) {
    // Roll back, then say WHICH of the two outcomes happened — the operator's
    // next move is opposite in each. Swallowing the rollback's own failure (what
    // this used to do) is how a dead connection produced "the project's model
    // list was left unchanged" over a project that was, right then, carrying the
    // old roster plus a partial new one.
    let rollback = "dirty";
    try {
      rollback = (await rollbackImport(projectId, modelId, now)) ? "clean" : "dirty";
    } catch (rollbackErr) {
      console.error(`[importIfcRoster] rollback threw for model ${modelId}:`, rollbackErr);
    }
    if (rollback === "dirty") {
      console.error(
        `[importIfcRoster] rollback did NOT complete for project ${projectId} / model ${modelId} — ` +
        `the project may hold leftover rows from this attempt (deleted_at handle ${now}).`,
      );
    }
    // Stamped on the original error object so its shape (PostgREST code/message,
    // SupabaseOperationError) survives for callers and Sentry.
    if (err && typeof err === "object") err[ROSTER_ROLLBACK_FIELD] = rollback;
    throw err;
  }

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

  // Paged — a whole-project roster is far too big for one statement under the
  // 8s authenticated timeout.
  await softDeleteInPages((q) => q.eq("project_id", projectId).eq("source", "ifc"), now);
}
