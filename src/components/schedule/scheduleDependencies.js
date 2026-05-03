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
