// ── Dependency parsing ───────────────────────────────────────────────────
//
// Local helper that flattens predecessor IDs out of the new link-object
// shape `{ id, type, lag_days }`. Arrow rendering and the dependency
// label below only care about the predecessor ID, not the link type or
// lag — those are handled by the shared cascade utility. parseDependencies
// also accepts the legacy id-string array shape, so this stays
// back-compat through a partial deploy.
//
// Extracted from ScheduleGantt.jsx as a pure thin wrapper. Re-exporting
// from a dedicated module keeps the Gantt's import surface focused and
// gives downstream files (and unit tests) a stable home for predecessor
// helpers.
import { parseDependencies } from "@/services/scheduleCascade";

export function parseDeps(raw) {
  return parseDependencies(raw).map((l) => l.id);
}

/**
 * Build the comma-joined predecessor label for the Gantt PRED column.
 *
 * `lookup(id)` resolves a predecessor id to its task row (or undefined).
 * Orphaned dependencies — an id whose task no longer exists (the predecessor
 * was deleted but the link wasn't cleaned up) — are skipped, so the cell shows
 * the surviving predecessors (or "—" via the caller's `|| "—"`) instead of the
 * literal string "undefined" that `undefined?.task_name?.slice(…) + "…"` used
 * to produce.
 *
 * @param {string[]} depIds                predecessor ids (from parseDeps)
 * @param {(id: string) => any} lookup     id → task row (or undefined)
 * @returns {string} comma-joined labels, or "" when none resolve
 */
export function formatPredecessorLabels(depIds, lookup) {
  return (Array.isArray(depIds) ? depIds : [])
    .map((id) => {
      const t = typeof lookup === "function" ? lookup(id) : undefined;
      if (!t) return null; // orphaned dependency — referenced task no longer exists
      if (t.wbs_code) return t.wbs_code;
      if (t.task_name) return `${t.task_name.slice(0, 6)}…`;
      return "—";
    })
    .filter(Boolean)
    .join(", ");
}
