/**
 * autoScheduleDetailing.js
 *
 * Given a list of newly-created drawings, insert one "Detailing / Submittal"
 * schedule task per drawing into `schedule_tasks` — unless one already
 * exists for that drawing.
 *
 * This was previously inlined in 2 places (`useDrawings.js`, `Drawings.jsx`)
 * and skipped entirely by `DrawingSetUploadModal`. Moving it here fixes
 * three bugs at once:
 *   1. Date gate: `(due_date || submitted_date)` used to bail on ~55% of
 *      rows. schedule_tasks.start_date / end_date are nullable, so we just
 *      pass null when the drawing doesn't have dates yet — the schedule UI
 *      renders "—" for missing dates.
 *   2. Bulk upload never created tasks. Now does.
 *   3. Idempotency: re-running the same upload used to double-insert. We
 *      now tag each task with `metadata.source = "drawing"` + `metadata
 *      .drawing_id`, then pre-query to skip any drawing that already has
 *      a task linked to it.
 *
 * The function returns { created, skipped, failed } so callers can report
 * accurate counts in toast/progress UI.
 */

import { supabase } from "@/lib/supabase";

/**
 * @param {Array<object>} drawings  Array of drawing rows (already persisted).
 *                                  Each needs: id, project_id, sheet_number,
 *                                  title (optional), discipline (optional),
 *                                  reviewer (optional), spec_section (optional),
 *                                  priority_flag (optional), due_date (optional),
 *                                  submitted_date (optional), project_name
 *                                  (optional — falls back to caller-supplied).
 * @param {object} opts
 * @param {string} opts.projectName  Fallback project name for all rows.
 * @returns {Promise<{created: number, skipped: number, failed: number}>}
 */
export async function autoCreateDetailingTasks(drawings, { projectName = "" } = {}) {
  const list = (drawings || []).filter((d) => d && d.id && d.project_id);
  if (list.length === 0) return { created: 0, skipped: 0, failed: 0 };

  const projectId = list[0].project_id; // all drawings in one batch share a project
  const drawingIds = list.map((d) => d.id);

  // 1. Dedup: look up existing tasks already linked to any of these drawings.
  //    We stamp metadata.drawing_id on our task rows — that's our join key.
  //    If the DB query fails for some reason, we proceed without dedup
  //    (the RLS-protected insert below will still respect any unique idx).
  let existingLinkedIds = new Set();
  try {
    const { data, error } = await supabase
      .from("schedule_tasks")
      .select("metadata")
      .eq("project_id", projectId)
      .filter("metadata->>drawing_id", "in", `(${drawingIds.join(",")})`);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const did = row?.metadata?.drawing_id;
        if (did) existingLinkedIds.add(did);
      }
    }
  } catch {
    // ignore — fall through without dedup
  }

  const toInsert = [];
  let skipped = 0;
  for (const d of list) {
    if (existingLinkedIds.has(d.id)) {
      skipped += 1;
      continue;
    }
    toInsert.push(rowFor(d, projectName));
  }

  if (toInsert.length === 0) {
    return { created: 0, skipped, failed: 0 };
  }

  // 2. Bulk insert. If the batch fails we fall back to per-row so one bad
  //    record doesn't lose the whole batch.
  let created = 0;
  let failed = 0;
  try {
    const { error } = await supabase.from("schedule_tasks").insert(toInsert);
    if (error) throw error;
    created = toInsert.length;
  } catch (bulkErr) {
    console.warn("[autoScheduleDetailing] bulk insert failed, falling back:", bulkErr);
    for (const row of toInsert) {
      try {
        const { error } = await supabase.from("schedule_tasks").insert(row);
        if (error) throw error;
        created += 1;
      } catch (rowErr) {
        console.warn("[autoScheduleDetailing] row insert failed:", rowErr, row);
        failed += 1;
      }
    }
  }

  return { created, skipped, failed };
}

function rowFor(d, fallbackProjectName) {
  const start = d.submitted_date || d.due_date || null;
  const end   = d.due_date || d.submitted_date || null;

  const notes = [
    d.discipline    ? `Discipline: ${d.discipline}`      : "",
    d.reviewer      ? `Reviewer: ${d.reviewer}`          : "",
    d.spec_section  ? `Spec: ${d.spec_section}`          : "",
  ].filter(Boolean).join(" | ");

  return {
    project_id:     d.project_id,
    project_name:   d.project_name || fallbackProjectName || "",
    task_name:      `${d.sheet_number || "DWG"} — ${d.title || "Drawing Review"}`,
    task_type:      "Submittal",
    phase:          "Detailing",
    start_date:     start,
    end_date:       end,
    status:         "Not Started",
    priority:       d.priority_flag ? "High" : "Normal",
    percent_complete: 0,
    notes:          notes || null,
    metadata:       { source: "drawing", drawing_id: d.id, sheet_number: d.sheet_number || null },
  };
}
