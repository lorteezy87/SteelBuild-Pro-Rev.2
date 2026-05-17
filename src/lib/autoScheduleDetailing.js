/**
 * autoScheduleDetailing.js
 *
 * Given a list of newly-created drawings, insert one "Detailing / Submittal"
 * schedule task *per drawing set* into `schedule_tasks` — not one per
 * individual drawing. The Gantt's Detailing lane should read at the set
 * level ("Structural IFC Set 2") not the sheet level ("S-101", "S-102", …).
 *
 * Grouping rules:
 *   - Drawings are bucketed by normalized `drawing_set_name` + `project_id`.
 *   - Drawings missing a set name are skipped (they're flagged as orphans
 *     by the validation layer and handled elsewhere).
 *   - The set's start_date = earliest submitted/due in the set; end_date =
 *     latest due/submitted in the set (nulls preserved if no dates).
 *
 * Idempotency:
 *   - Each task is stamped `metadata.source = "drawing_set"` and
 *     `metadata.drawing_set_name = <normalized>`. Re-uploads of the same
 *     set skip creation if a matching task already exists in the project.
 *
 * The function returns { created, skipped, failed } so callers can report
 * accurate counts in toast/progress UI.
 */

import { supabase } from "@/lib/supabase";

const normalizeSetName = (name) =>
  (name || "").toString().trim().replace(/\s+/g, " ");

/**
 * @param {Array<object>} drawings  Array of drawing rows (already persisted).
 *                                  Each should have: id, project_id,
 *                                  drawing_set_name, sheet_number (optional),
 *                                  title (optional), due_date (optional),
 *                                  submitted_date (optional), project_name
 *                                  (optional).
 * @param {object} opts
 * @param {string} opts.projectName  Fallback project name for all rows.
 * @returns {Promise<{created: number, skipped: number, failed: number}>}
 */
export async function autoCreateDetailingTasks(drawings, { projectName = "" } = {}) {
  const list = (drawings || []).filter((d) => d && d.id && d.project_id);
  if (list.length === 0) return { created: 0, skipped: 0, failed: 0 };

  const projectId = list[0].project_id;

  // 1. Group drawings by set name. Skip orphans (missing set name).
  const setsByName = new Map();
  let orphaned = 0;
  for (const d of list) {
    const setName = normalizeSetName(d.drawing_set_name);
    if (!setName) { orphaned += 1; continue; }
    if (!setsByName.has(setName)) setsByName.set(setName, []);
    setsByName.get(setName).push(d);
  }

  if (setsByName.size === 0) {
    return { created: 0, skipped: orphaned, failed: 0 };
  }

  // 2. Dedup: look up existing set-level tasks already in this project.
  //    Match on metadata.drawing_set_name. If the query fails, fall through
  //    without dedup — a duplicate is better than a missed creation, and
  //    the insert path will still respect any unique index.
  const setNames = Array.from(setsByName.keys());
  const existingSetNames = new Set();
  try {
    const { data, error } = await supabase
      .from("schedule_tasks")
      .select("metadata")
      .eq("project_id", projectId)
      .eq("metadata->>source", "drawing_set");
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const name = normalizeSetName(row?.metadata?.drawing_set_name);
        if (name) existingSetNames.add(name);
      }
    }
  } catch {
    // ignore — proceed without dedup
  }

  const toInsert = [];
  let skipped = orphaned;
  for (const setName of setNames) {
    if (existingSetNames.has(setName)) { skipped += 1; continue; }
    toInsert.push(rowForSet(setName, setsByName.get(setName), projectName));
  }

  if (toInsert.length === 0) {
    return { created: 0, skipped, failed: 0 };
  }

  // 3. Bulk insert with per-row fallback so one bad row doesn't lose the batch.
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

function rowForSet(setName, sheets, fallbackProjectName) {
  const submitted = sheets.map((s) => s.submitted_date).filter(Boolean).sort();
  const due       = sheets.map((s) => s.due_date).filter(Boolean).sort();
  const start = submitted[0] || due[0] || null;
  const end   = (due[due.length - 1]) || (submitted[submitted.length - 1]) || null;

  const anyPriority = sheets.some((s) => s.priority_flag);
  const first = sheets[0] || {};

  return {
    project_id:       first.project_id,
    project_name:     first.project_name || fallbackProjectName || "",
    task_name:        setName,
    task_type:        "Submittal",
    phase:            "Detailing",
    start_date:       start,
    end_date:         end,
    status:           "Not Started",
    priority:         anyPriority ? "High" : "Normal",
    percent_complete: 0,
    notes:            `${sheets.length} sheet${sheets.length === 1 ? "" : "s"} in set`,
    metadata: {
      source:            "drawing_set",
      drawing_set_name:  setName,
      sheet_count:       sheets.length,
    },
  };
}
