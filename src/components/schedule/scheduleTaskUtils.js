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
// Tasks marked Complete should always read as 100% in the UI even if the
// underlying percent_complete field is stale or 0 (common data-entry gap).
export function displayPct(task) {
  if (!task) return 0;
  if (task.status === "Complete") return 100;
  const v = Number(task.percent_complete);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

// Only treat a task as a milestone if the user explicitly flagged it.
// Auto-detection (duration === 0 or same start/end) was incorrectly marking
// every newly-created task as a milestone because AddTaskModal defaults both
// dates to today.
export function isMilestoneTask(task) {
  if (!task) return false;
  if (task.milestone) return true;
  return false;
}

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
  "On Hold":     GANTT_STATUS_HEX.onHold,
  "Not Started": GANTT_STATUS_HEX.notStarted,
};

export function statusColor(s) { return STATUS_COLOR[s] || "var(--text-muted)"; }
