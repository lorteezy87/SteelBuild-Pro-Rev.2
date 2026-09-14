import { PHASE_NUMBER } from "@/utils/phases";
import type { SanitizedTaskUpdate, ScheduleTask } from "./types";
import { assertScheduleDateRange } from "./scheduleDateValidation";

/**
 * Auto-generate a WBS code for a task. Format is now "<phase>.<n>"
 * where <phase> is the numeric phase id (1-7 from PHASE_NUMBER) and
 * <n> is the next available index within that phase.
 *
 * Examples:
 *   Detailing, first task      → "2.1"
 *   Detailing, third task      → "2.3"
 *   Installation, first task   → "6.1"
 *
 * Falls back to "0.<n>" if we don't know the phase — rare enough
 * that we'd rather have something consistent than invent a prefix.
 */
export function generateWBS(phase: string | undefined, existingTasks: ScheduleTask[]): string {
  const phaseNum = PHASE_NUMBER[phase as keyof typeof PHASE_NUMBER] ?? 0;
  const samePhase = (existingTasks || []).filter((t) => t.phase === phase);
  // Match the new X.Y / X.Y.Z format. The final numeric segment is
  // this task's index within the phase — we take the max and add 1.
  // Old DET-003-style codes in the DB are also matched (trailing
  // digits) so the counter doesn't restart when a project hasn't
  // been migrated yet.
  let maxIdx = 0;
  for (const t of samePhase) {
    const code = t.wbs_code;
    if (!code) continue;
    // Prefer new-format pattern "<phase>.<n>" or "<phase>.<n>.<m>"
    const mNew = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(code);
    if (mNew) {
      const idx = parseInt(mNew[2], 10);
      if (Number.isFinite(idx) && idx > maxIdx) maxIdx = idx;
      continue;
    }
    // Legacy "ABC-NNN" — pull the trailing number as a fallback.
    const mLeg = /(\d+)$/.exec(code);
    if (mLeg) {
      const idx = parseInt(mLeg[1], 10);
      if (Number.isFinite(idx) && idx > maxIdx) maxIdx = idx;
    }
  }
  return `${phaseNum}.${maxIdx + 1}`;
}

/**
 * Result of {@link computePhaseWbs}: the task list with WBS codes filled in,
 * and the subset of persisted rows whose generated code should be written back
 * to the DB (background backfill).
 */
export interface PhaseWbsResult {
  tasks: ScheduleTask[];
  toBackfill: Array<{ id: string; wbs: string }>;
}

/**
 * Pure two-pass WBS backfill. Assigns "<phase>.<n>" codes to tasks that don't
 * have one, where <phase> is the numeric phase id (PHASE_NUMBER 1-7) and <n>
 * is the next sequence within that phase.
 *
 * First pass finds the highest n seen per phase, accepting both new-format
 * (2.3 / 2.3.1) and legacy-format (DET-003) codes so new codes pick up from
 * there without colliding. Second pass assigns codes to tasks missing one.
 *
 * Only persisted rows (those with a DB id) are added to `toBackfill`; a row
 * without an id can't be UPDATE-targeted anyway, so skipping it is
 * behavior-preserving. The caller is responsible for persisting `toBackfill`.
 */
export function computePhaseWbs(scheduleTasks: ScheduleTask[]): PhaseWbsResult {
  const phaseCounts: Record<string, number> = {};
  const result: ScheduleTask[] = [];
  // First pass: find the highest n seen per phase, accepting both
  // new-format (2.3 / 2.3.1) and legacy-format (DET-003) codes.
  scheduleTasks.forEach((t) => {
    if (!t.wbs_code) return;
    const ph = t.phase || "Other";
    let idx = 0;
    const mNew = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(t.wbs_code);
    if (mNew) idx = parseInt(mNew[2], 10);
    else {
      const mLeg = /(\d+)$/.exec(t.wbs_code);
      if (mLeg) idx = parseInt(mLeg[1], 10);
    }
    if (Number.isFinite(idx)) {
      phaseCounts[ph] = Math.max(phaseCounts[ph] || 0, idx);
    }
  });
  // Second pass: assign WBS to tasks missing it
  const toBackfill: Array<{ id: string; wbs: string }> = [];
  scheduleTasks.forEach((t) => {
    if (t.wbs_code) {
      result.push(t);
    } else {
      const ph = t.phase || "Other";
      const phaseNum = PHASE_NUMBER[ph as keyof typeof PHASE_NUMBER] ?? 0;
      phaseCounts[ph] = (phaseCounts[ph] || 0) + 1;
      const wbs = `${phaseNum}.${phaseCounts[ph]}`;
      result.push({ ...t, wbs_code: wbs });
      // Only persisted rows (those with a DB id) can be backfilled; a row
      // without an id can't be UPDATE-targeted anyway, so skipping it is
      // behavior-preserving.
      if (t.id) toBackfill.push({ id: t.id, wbs });
    }
  });
  return { tasks: result, toBackfill };
}

export function sanitizeScheduleTaskUpdatePayload(data: ScheduleTask): SanitizedTaskUpdate {
  const {
    id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    created_date: _createdDate,
    updated_date: _updatedDate,
    ...rawFields
  } = data || {};
  const fields: Record<string, any> = {};
  const isSummaryRow = Boolean(data?._hasChildren || data?._isRolledUpSummary);

  Object.entries(rawFields).forEach(([key, value]) => {
    if (key.startsWith("_") || value === undefined) return;
    fields[key] = value;
  });

  if (isSummaryRow) {
    // A parent row DISPLAYS its children's rolled-up span, not the dates a PM
    // typed; buildScheduleTree keeps the typed values on _stored_* and the
    // derived ones on _rolled_*. Saving the displayed value would persist a
    // derived date as if it were hand-entered, so an untouched field is
    // restored from _stored_*.
    //
    // Restoring it UNCONDITIONALLY is what broke date editing on every parent
    // row: the PM's new date was replaced by the old stored one and the
    // mutation still reported "Task updated". So substitute only when the
    // payload still carries the derived value — that is what "untouched" means.
    //
    // A row WITHOUT _rolled_* is restored unconditionally, as before. The
    // rollup is not the only thing that overlays these columns: the
    // predecessor cascade (computeEffectiveDates) also replaces start_date /
    // end_date with computed values while preserving the originals on
    // _stored_*. Against a cascade-overlaid payload "differs from _stored_*"
    // is NOT evidence of an edit, so without the rolled-up reference there is
    // no safe way to tell the two apart and the conservative restore stands.
    const untouched = (field: string, rolledKey: string): boolean => {
      if (!(field in fields)) return true;
      if (!(rolledKey in data)) return true;
      return fields[field] === (data as Record<string, unknown>)[rolledKey];
    };

    // start_date and end_date are decided as a PAIR. Restoring one while
    // honouring the other can invert the window — edit a parent's start, let
    // the end fall back to an older stored value, and the payload is
    // start > end, which assertScheduleDateRange then rejects. The user edited
    // a coherent pair on screen; they get a coherent pair written.
    const startUntouched = !("_stored_start_date" in data)
      || untouched("start_date", "_rolled_start_date");
    const endUntouched = !("_stored_end_date" in data)
      || untouched("end_date", "_rolled_end_date");

    if (startUntouched && endUntouched) {
      if ("_stored_start_date" in data) fields.start_date = data._stored_start_date || null;
      if ("_stored_end_date" in data) fields.end_date = data._stored_end_date || null;
    }
    if ("_stored_duration" in data && untouched("duration", "_rolled_duration")) {
      fields.duration = data._stored_duration;
    }
    if (
      "_stored_percent_complete" in data
      && untouched("percent_complete", "_rolled_percent_complete")
    ) {
      fields.percent_complete = data._stored_percent_complete;
    }
  }

  assertScheduleDateRange(fields as ScheduleTask);

  return { id, fields };
}
