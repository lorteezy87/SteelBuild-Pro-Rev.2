/**
 * stageDates.js — Detailing-phase stage-gate dates.
 *
 * The detailing phase on a steel project runs through four review
 * gates — OFA (office for approval), BFA (back from approval), FFF
 * (final for fab / for fabrication), Released (IFC, issued for
 * construction). Each gate has its own start AND end date so the
 * schedule can track when each window was opened and when it closes.
 *
 * Storage: `schedule_tasks.metadata.stage_dates = { OFA: { start, end },
 * BFA: {...}, FFF: {...}, Released: {...} }`. All keys + nested fields
 * optional; each value an ISO YYYY-MM-DD string. No schema migration —
 * metadata is a JSONB column on schedule_tasks.
 *
 * Backward compatibility: rows written under the old single-date shape
 * (`{ OFA: "2026-01-15" }`) are read as `{ start: null, end: "2026-01-15" }`,
 * since the original semantics treated the value as the gate's
 * clearance date.
 *
 * Derivation: the Gantt bar still needs `start_date` and `end_date`
 * to render. Every write goes through `applyStageDatesToTask(task,
 * stageDates)` which:
 *   - Writes `metadata.stage_dates` in the new {start,end} shape
 *   - Derives `start_date` = earliest filled gate start (or end)
 *   - Derives `end_date`   = latest   filled gate end   (or start)
 *   - Derives `metadata.detailing_stage` = currently-active gate
 *     (the first gate whose end_date is in the future; falls back to
 *     the latest filled gate when everything is in the past)
 *
 * "Most updated date": the schedule's effective due date is the active
 * gate's end_date — see `getEffectiveDueDate` below. As OFA closes and
 * BFA opens, the schedule auto-shifts to track BFA's end, and so on.
 */

// Canonical ordered list of detailing gates the UI tracks. Order
// matters — it's how we pick which stage is "current" and walk
// forward when figuring out the next due window.
export const DETAILING_STAGE_GATES = ["OFA", "BFA", "FFF", "Released"];

// Labels + colors for each gate — pulled into both the drawer form
// and the Gantt cell so the visual language stays consistent.
export const DETAILING_STAGE_META = {
  OFA:      { label: "OFA",      caption: "Office for Approval",   color: "#0EA5E9" },
  BFA:      { label: "BFA",      caption: "Back from Approval",    color: "#F59E0B" },
  // FFF gate previously rendered purple; swapped to teal to stay inside
  // the project's no-purple/no-pink industrial palette.
  FFF:      { label: "FFF",      caption: "Final for Fabrication", color: "#0d9488" },
  Released: { label: "Released", caption: "Released for Fabrication",     color: "#22C55E" },
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isISO(v) {
  return typeof v === "string" && ISO_DATE_RE.test(v);
}

function emptyGate() {
  return { start: null, end: null };
}

/**
 * Read the stage-date map off a task. Tolerates task.metadata being
 * null, a string, or an object with an unrelated shape, AND tolerates
 * legacy single-date rows. Returns a fresh object keyed by the
 * canonical gates so callers can spread-edit without mutating the
 * underlying record. Each value is `{ start, end }`.
 */
export function getStageDates(task) {
  const out = DETAILING_STAGE_GATES.reduce((acc, g) => {
    acc[g] = emptyGate();
    return acc;
  }, {});
  if (!task) return out;
  const md = task.metadata;
  if (!md || typeof md !== "object") return out;
  const raw = md.stage_dates;
  if (!raw || typeof raw !== "object") return out;
  for (const gate of DETAILING_STAGE_GATES) {
    const v = raw[gate];
    if (!v) continue;
    if (typeof v === "string") {
      // Legacy shape: a single ISO string. The original semantics were
      // "the date the gate cleared", so treat that as `end`.
      if (isISO(v)) out[gate] = { start: null, end: v };
    } else if (typeof v === "object") {
      out[gate] = {
        start: isISO(v.start) ? v.start : null,
        end:   isISO(v.end)   ? v.end   : null,
      };
    }
  }
  return out;
}

/** Today as an ISO YYYY-MM-DD string in local time. */
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Pick the gate that the schedule should track right now. Rules:
 *   1. Walk gates in canonical order, return the first one whose
 *      `end` is on or after today (the active or next-upcoming gate).
 *   2. If every filled gate's end is in the past, return the LAST
 *      gate that has any date filled (we've finished the workflow).
 *   3. If nothing is filled at all, return null.
 *
 * `today` defaults to the local-clock today; callers can pass an
 * override for tests / fixed-clock rendering.
 */
export function getActiveStage(stageDates, today = todayISO()) {
  if (!stageDates) return null;
  // Forward sweep: first gate whose end is today-or-later, OR whose
  // start is filled but end isn't (open-ended window — the user is
  // mid-stage and hasn't committed the close date yet).
  for (const gate of DETAILING_STAGE_GATES) {
    const v = stageDates[gate];
    if (!v) continue;
    if (v.end && v.end >= today) return gate;
    if (v.start && !v.end) return gate;
  }
  // Fall back: latest filled gate (everything's done / in the past).
  for (let i = DETAILING_STAGE_GATES.length - 1; i >= 0; i--) {
    const gate = DETAILING_STAGE_GATES[i];
    const v = stageDates[gate];
    if (v && (v.start || v.end)) return gate;
  }
  return null;
}

/**
 * The effective "what's due and when" date for the schedule. Returns
 * the active gate's end_date (or start_date, if end isn't set yet).
 * Returns null when no gate has any date filled.
 */
export function getEffectiveDueDate(stageDates, today = todayISO()) {
  const gate = getActiveStage(stageDates, today);
  if (!gate) return null;
  const v = stageDates?.[gate];
  return v?.end || v?.start || null;
}

/**
 * Back-compat alias kept for callers (drawer / gantt) that imported
 * `deriveCurrentStage` from the previous single-date model. Same
 * semantics now: walks the gates and picks the active one.
 */
export function deriveCurrentStage(stageDates, today = todayISO()) {
  return getActiveStage(stageDates, today);
}

/**
 * Derive { start_date, end_date } envelope for the Gantt bar.
 * - start_date = earliest filled gate start (or end, if start missing)
 * - end_date   = latest   filled gate end   (or start, if end missing)
 * Returns both null when nothing is filled.
 */
export function deriveStartEndFromStages(stageDates) {
  const starts = [];
  const ends = [];
  for (const gate of DETAILING_STAGE_GATES) {
    const v = stageDates?.[gate];
    if (!v) continue;
    if (isISO(v.start)) starts.push(v.start);
    if (isISO(v.end))   ends.push(v.end);
  }
  if (!starts.length && !ends.length) {
    return { start_date: null, end_date: null };
  }
  // Lexical min/max of YYYY-MM-DD = chronological min/max.
  const allFirst = [...starts, ...ends].sort();
  const allLast  = [...starts, ...ends].sort();
  const start_date = starts.length ? starts.sort()[0] : allFirst[0];
  const end_date   = ends.length   ? ends.sort().slice(-1)[0] : allLast.slice(-1)[0];
  return { start_date, end_date };
}

/**
 * Compose a patch that can be shallow-merged into a task update.
 * The returned object contains:
 *   - metadata.stage_dates: cleaned new-shape map
 *   - metadata.detailing_stage: derived active gate
 *   - start_date / end_date: derived envelope (only when at least
 *     one gate has any date; otherwise omitted so existing dates
 *     are preserved while the user is mid-edit)
 */
export function applyStageDatesToTask(task, stageDates) {
  const cleanStageDates = {};
  for (const gate of DETAILING_STAGE_GATES) {
    const v = stageDates?.[gate];
    if (!v) continue;
    const cleaned = {
      start: isISO(v.start) ? v.start : null,
      end:   isISO(v.end)   ? v.end   : null,
    };
    if (cleaned.start || cleaned.end) cleanStageDates[gate] = cleaned;
  }
  const existingMeta = (task?.metadata && typeof task.metadata === "object") ? task.metadata : {};
  const mergedMeta = {
    ...existingMeta,
    stage_dates: cleanStageDates,
    detailing_stage:
      getActiveStage(cleanStageDates) ||
      existingMeta.detailing_stage ||
      null,
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
