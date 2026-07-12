/**
 * fieldPhase — resolve which project phase a field activity belongs to.
 *
 * Only `schedule_tasks` carries a real `phase` column. The four field
 * registers (punchlist_items, inspections, safety_incidents, daily_logs) do
 * not, so the Field Hub activity feed had no phase to show at all.
 *
 * Resolution order, best evidence first:
 *   1. `stored` — the record's own `phase` column. Nothing writes this yet;
 *      the branch exists so adding the column is purely additive.
 *   2. `linked` — daily logs reference real schedule tasks via
 *      `schedule_task_ids`; those tasks have a real phase. When a log spans
 *      several phases we report the earliest, since that's the work the crew
 *      is gated on.
 *   3. `derived` — keyword inference from the record's own text, via the
 *      app-wide `derivePhase`. A guess, and callers should render it as one.
 *
 * Callers get `source` back precisely so a guess never renders as a fact.
 *
 * Canonical display term is "Erection", not "Installation" — see the note at
 * the top of src/utils/phases.js. `derivePhase` and `schedule_tasks.phase`
 * both emit "Installation", so we fold it here.
 */
import { derivePhase, PHASE_ORDER, PHASES } from "@/utils/phases";

export const PHASE_SOURCE = {
  STORED: "stored",
  LINKED: "linked",
  DERIVED: "derived",
};

/** Field-activity row types, matching FieldActivityRow.type. */
export const FIELD_ACTIVITY_TYPES = {
  DAILY_LOG: "Daily Log",
  INSPECTION: "Inspection",
  SAFETY: "Safety",
  PUNCHLIST: "Punchlist",
};

/** Phases offered as filter chips in the field module, in lifecycle order. */
export const FIELD_PHASES = PHASES.filter((p) => p !== "Installation");

/** Fold the "Installation" alias onto the canonical field term "Erection". */
export function canonicalFieldPhase(phase) {
  if (!phase) return null;
  return phase === "Installation" ? "Erection" : phase;
}

/**
 * The text `derivePhase` should read for a given record. Each register keeps
 * its most phase-bearing description in a different column.
 */
function activityTextFor(record, type) {
  switch (type) {
    case FIELD_ACTIVITY_TYPES.PUNCHLIST:
      return record.description || record.category || "";
    case FIELD_ACTIVITY_TYPES.INSPECTION:
      return record.inspection_type || record.description || "";
    case FIELD_ACTIVITY_TYPES.SAFETY:
      return record.incident_type || record.description || "";
    case FIELD_ACTIVITY_TYPES.DAILY_LOG:
      return record.activities || record.crew_name || "";
    default:
      return record.description || record.title || "";
  }
}

/** The earliest phase (by lifecycle order) among the given phase names. */
function earliestPhase(phases) {
  let best = null;
  let bestOrder = Infinity;
  for (const p of phases) {
    const order = PHASE_ORDER[p];
    if (order === undefined) continue;
    if (order < bestOrder) {
      bestOrder = order;
      best = p;
    }
  }
  return best;
}

/**
 * Resolve a field activity's phase.
 *
 * @param {object} record  A punchlist item / inspection / incident / daily log.
 * @param {string} type    One of FIELD_ACTIVITY_TYPES.
 * @param {object} [opts]
 * @param {Map<string, {phase?: string|null}>} [opts.tasksById]  schedule_tasks by
 *        id, used to resolve a daily log's linked phase. A task's `phase` column
 *        is nullable; the earliest-phase reducer below already ignores nullish
 *        values (this keeps the type in sync with ScheduleTaskRef so the strict
 *        typecheck gate passes — Map value types are invariant in TS).
 * @returns {{ phase: string, source: string }}
 */
export function resolveFieldPhase(record, type, opts = {}) {
  const { tasksById } = opts;

  if (record?.phase) {
    return { phase: canonicalFieldPhase(record.phase), source: PHASE_SOURCE.STORED };
  }

  if (type === FIELD_ACTIVITY_TYPES.DAILY_LOG && tasksById) {
    const ids = Array.isArray(record?.schedule_task_ids) ? record.schedule_task_ids : [];
    const linked = ids
      .map((id) => tasksById.get(id)?.phase)
      .filter(Boolean)
      .map(canonicalFieldPhase);
    const earliest = earliestPhase(linked);
    if (earliest) return { phase: earliest, source: PHASE_SOURCE.LINKED };
  }

  // derivePhase falls back to "Pre-Construction" for text it can't classify,
  // which would be a confident-looking lie on a record with no description.
  // No text, no guess.
  const text = activityTextFor(record || {}, type).trim();
  if (!text) return { phase: null, source: PHASE_SOURCE.DERIVED };

  return {
    phase: canonicalFieldPhase(derivePhase({ activity: text })),
    source: PHASE_SOURCE.DERIVED,
  };
}

/** Index a schedule_tasks list by id, for resolveFieldPhase's `tasksById`. */
export function indexTasksById(tasks) {
  return new Map((tasks || []).filter((t) => t?.id).map((t) => [t.id, t]));
}
