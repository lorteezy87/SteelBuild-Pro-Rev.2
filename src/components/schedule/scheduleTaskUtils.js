// ── Task / phase helpers extracted from ScheduleGantt.jsx ──────────────
//
// Pure stateless helpers for normalizing phase keys, computing display
// percentages, detecting milestones, sanitising task names, and the
// shared status-color palette. None of these touch React or the Gantt
// layout — they're safe to import from any consumer that needs the same
// derivation rules (Task list, lookahead, exports, etc.) so we don't
// drift on what "displayed %" or "milestone" means across views.
import { derivePhase } from "../../utils/phases";
import { GANTT_PHASE_HEX, GANTT_STATUS_HEX } from "../../lib/ganttTheme";
import { isMilestoneTask as isMilestoneTaskCanonical } from "../../lib/schedule/taskFields";

// ── Phase definition — ordered 1-7 ──────────────────────────────────────
export const PHASES = [
  { id: 1, label: "Pre-Construction",    key: "Pre-Construction",  color: GANTT_PHASE_HEX["Pre-Construction"] },
  { id: 2, label: "Detailing",           key: "Detailing",         color: GANTT_PHASE_HEX.Detailing },
  { id: 3, label: "Procurement",         key: "Procurement",       color: GANTT_PHASE_HEX.Procurement },
  { id: 4, label: "Fabrication",         key: "Fabrication",       color: GANTT_PHASE_HEX.Fabrication },
  { id: 5, label: "Delivery",            key: "Delivery",          color: GANTT_PHASE_HEX.Delivery },
  { id: 6, label: "Installation",        key: "Installation",      color: GANTT_PHASE_HEX.Installation },
  { id: 7, label: "Closeout",            key: "Closeout",          color: GANTT_PHASE_HEX.Closeout },
];
// Also catch Erection as Installation
export const PHASE_KEY_MAP = { Erection: "Installation" };

export function normalizePhase(task) {
  const raw = task.phase || derivePhase(task) || "";
  return PHASE_KEY_MAP[raw] || raw;
}

export const PHASE_BY_KEY = Object.fromEntries(PHASES.map(p => [p.key, p]));

// ── Display helpers ──────────────────────────────────────────────────────
//
// Two readers, because "how complete is this task" has an answer the UI can be
// missing. `percent_complete` is nullable, and reopening a finished task now
// sets it back to null on purpose — the work is no longer done and nothing in
// that transition says how much of it remains (see reconcileStatusPercent).
//
//   percentCompleteOrNull → null when unknown. Use it for any CLAIM: a printed
//                           figure, an average, a "this task is stalled" test.
//   displayPct            → 0 when unknown. Use it only where the number is a
//                           GEOMETRY: a progress-bar width, a fill fraction.
//
// Rendering unknown as an affirmative 0% is the pattern CLAUDE.md bans, and it
// is not hypothetical here: a task reopened from Complete would otherwise print
// "0%" and land in the stalled filter one click after showing 100%.

/**
 * Percent complete, or null when it is genuinely unknown.
 *
 * A task marked Complete always reads 100 even if the stored column is stale or
 * zero — a common data-entry gap, and the status is the stronger signal.
 */
export function percentCompleteOrNull(task) {
  if (!task) return null;
  if (task.status === "Complete") return 100;
  if (task.percent_complete === null || task.percent_complete === undefined) return null;
  const v = Number(task.percent_complete);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
}

/**
 * Percent complete for drawing, where a missing value has to be some width.
 *
 * Do not use this to state a percentage or to average one — it cannot tell an
 * unknown from a real zero. Use {@link percentCompleteOrNull} for that.
 */
export function displayPct(task) {
  return percentCompleteOrNull(task) ?? 0;
}

// Milestone lives in lib/schedule/taskFields alongside the writer that keeps
// its three columns in sync — a reader and a writer that can drift are how
// task_type='Milestone' rows ended up invisible to the calendar and reports,
// which read `is_milestone`. Re-exported here so existing importers of this
// module keep working against the one definition.
export const isMilestoneTask = isMilestoneTaskCanonical;

// Resource names sometimes get pasted into the task name field by mistake
// (e.g. "Stair #2Jagdish"). If the trailing chunk of the task name matches a
// known resource on the same task, strip it for display.
export function sanitizeTaskName(task) {
  const raw = (task?.task_name || "").trim();
  if (!raw) return raw;
  const resources = (task.resource_names || task.assigned_to || "")
    .split(/[,/;]/)
    .map(r => r.trim())
    .filter(Boolean);
  let cleaned = raw;
  for (const r of resources) {
    if (r.length < 2) continue;
    // Trailing match with optional whitespace/punctuation
    const re = new RegExp(`[\\s\\-_/]*${r.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "i");
    cleaned = cleaned.replace(re, "").trim();
  }
  return cleaned || raw;
}

// ── Status helpers ────────────────────────────────────────────────────────
export const STATUS_COLOR = {
  "Complete":    GANTT_STATUS_HEX.complete,
  "In Progress": GANTT_STATUS_HEX.inProgress,
  "Delayed":     GANTT_STATUS_HEX.delayed,
  "Overdue":     GANTT_STATUS_HEX.delayed,
  "On Hold":     GANTT_STATUS_HEX.onHold,
  "Not Started": GANTT_STATUS_HEX.notStarted,
};

export function statusColor(s) { return STATUS_COLOR[s] || "var(--text-muted)"; }
