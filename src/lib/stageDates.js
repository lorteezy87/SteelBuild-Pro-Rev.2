/**
 * stageDates.js — Detailing-phase stage-gate dates.
 *
 * The detailing phase on a steel project runs through four review
 * gates — OFA (office for approval), BFA (back from approval), FFF
 * (final for fab / for fabrication), Released (IFC, issued for
 * construction). Instead of asking the user to manage this as a
 * start/finish date pair on a single task, we let them enter the
 * date each gate was issued or cleared.
 *
 * Storage: `schedule_tasks.metadata.stage_dates = { OFA, BFA, FFF,
 * Released }` — all four keys optional, each an ISO YYYY-MM-DD
 * string. No schema migration — metadata is already a JSONB column
 * on schedule_tasks.
 *
 * Derivation: the Gantt bar still needs `start_date` and `end_date`
 * to render, and the existing status/overdue/predecessor logic
 * reads those columns directly. So every write goes through
 * `applyStageDatesToTask(task, stageDates)` which:
 *   - Writes `metadata.stage_dates`
 *   - Derives `start_date` = earliest filled stage date
 *   - Derives `end_date`   = latest filled stage date
 *   - Derives `metadata.detailing_stage` = last gate with a date
 *
 * That keeps every existing Gantt code path working without
 * per-phase branches — the Detailing task just looks like any other
 * to the rest of the app.
 */

// Canonical ordered list of detailing gates the UI tracks. Order
// matters — it's how we pick which stage is "current" when multiple
// dates are filled. Earlier gates are upstream; the latest filled
// one is what the stage dropdown should show.
export const DETAILING_STAGE_GATES = ["OFA", "BFA", "FFF", "Released"];

// Labels + colors for each gate — pulled into both the drawer form
// and the Gantt cell so the visual language stays consistent.
export const DETAILING_STAGE_META = {
  OFA:      { label: "OFA",      caption: "Office for Approval",   color: "#0EA5E9" },
  BFA:      { label: "BFA",      caption: "Back from Approval",    color: "#F59E0B" },
  // FFF gate previously rendered purple; swapped to teal to stay inside
  // the project's no-purple/no-pink industrial palette.
  FFF:      { label: "FFF",      caption: "Final for Fabrication", color: "#0d9488" },
  Released: { label: "Released", caption: "Issued for Construction (IFC)", color: "#22C55E" },
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read the stage-date map off a task. Tolerates task.metadata being
 * null, a string, or an object with an unrelated shape. Returns a
 * fresh object keyed by the canonical gates so callers can spread-
 * edit without mutating the underlying record.
 */
export function getStageDates(task) {
  const out = { OFA: null, BFA: null, FFF: null, Released: null };
  if (!task) return out;
  const md = task.metadata;
  if (!md || typeof md !== "object") return out;
  const raw = md.stage_dates;
  if (!raw || typeof raw !== "object") return out;
  for (const gate of DETAILING_STAGE_GATES) {
    const v = raw[gate];
    if (typeof v === "string" && ISO_DATE_RE.test(v)) out[gate] = v;
  }
  return out;
}

/**
 * Return the canonical gate name a task is "currently at" based on
 * its filled stage dates. Rule: the latest gate (in DETAILING_STAGE_
 * GATES order) with a date is the current stage. Returns null when
 * no dates are filled so the UI can fall back to whatever's in
 * metadata.detailing_stage today.
 */
export function deriveCurrentStage(stageDates) {
  if (!stageDates) return null;
  for (let i = DETAILING_STAGE_GATES.length - 1; i >= 0; i--) {
    const gate = DETAILING_STAGE_GATES[i];
    if (stageDates[gate]) return gate;
  }
  return null;
}

/**
 * Derive { start_date, end_date } from filled stage dates. Start is
 * the earliest filled gate; end is the latest. Returns both null
 * when nothing is filled — callers should leave the task's existing
 * dates alone in that case.
 */
export function deriveStartEndFromStages(stageDates) {
  const filled = DETAILING_STAGE_GATES
    .map((g) => stageDates?.[g])
    .filter((d) => typeof d === "string" && ISO_DATE_RE.test(d));
  if (filled.length === 0) return { start_date: null, end_date: null };
  // Lexical min/max of YYYY-MM-DD is date min/max — no parsing needed.
  const sorted = [...filled].sort();
  return { start_date: sorted[0], end_date: sorted[sorted.length - 1] };
}

/**
 * Compose a patch that can be shallow-merged into a task update.
 * The returned object contains:
 *   - metadata: existing metadata merged with stage_dates + the
 *               derived detailing_stage
 *   - start_date / end_date: derived from filled stages (ONLY when
 *               at least one gate is filled; otherwise omitted so
 *               the user's existing dates are preserved)
 *
 * Passing an empty stageDates map with every gate null is a "clear
 * all gates" — the metadata is written as `{ stage_dates: {} }`
 * but start/end are NOT touched so the bar doesn't disappear from
 * the Gantt mid-edit.
 */
export function applyStageDatesToTask(task, stageDates) {
  const cleanStageDates = {};
  for (const gate of DETAILING_STAGE_GATES) {
    if (stageDates && typeof stageDates[gate] === "string" && ISO_DATE_RE.test(stageDates[gate])) {
      cleanStageDates[gate] = stageDates[gate];
    }
  }
  const existingMeta = (task?.metadata && typeof task.metadata === "object") ? task.metadata : {};
  const mergedMeta = {
    ...existingMeta,
    stage_dates: cleanStageDates,
    detailing_stage: deriveCurrentStage(cleanStageDates) || existingMeta.detailing_stage || null,
  };
  const patch = { metadata: mergedMeta };
  const { start_date, end_date } = deriveStartEndFromStages(cleanStageDates);
  if (start_date) patch.start_date = start_date;
  if (end_date)   patch.end_date   = end_date;
  return patch;
}

/**
 * Quick predicate for callers that want to branch the UI on "is
 * this a detailing task that should use the stage-gate date layout
 * instead of plain start/end pickers?". Central so future phases
 * (e.g. Fabrication gates) can opt in by extending this single
 * helper rather than grepping the codebase.
 */
export function usesStageDates(task) {
  return task?.phase === "Detailing";
}
