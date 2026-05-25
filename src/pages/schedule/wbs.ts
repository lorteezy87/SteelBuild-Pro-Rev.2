import { PHASE_NUMBER } from "@/utils/phases";
import type { SanitizedTaskUpdate, ScheduleTask } from "./types";

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
  const phaseNum = PHASE_NUMBER[phase] ?? 0;
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
    if ("_stored_start_date" in data) fields.start_date = data._stored_start_date || null;
    if ("_stored_end_date" in data) fields.end_date = data._stored_end_date || null;
    if ("_stored_duration" in data) fields.duration = data._stored_duration;
    if ("_stored_percent_complete" in data) fields.percent_complete = data._stored_percent_complete;
  }

  return { id, fields };
}
