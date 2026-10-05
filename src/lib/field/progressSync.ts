import { todayLocalISO } from "@/lib/dateMath";
import { progressUpdatePatch } from "@/lib/field/fieldToday";

export interface ScheduleProgressTask {
  id?: string;
  status?: string | null;
  percent_complete?: unknown;
  actual_start_date?: string | null;
  actual_finish_date?: string | null;
  [key: string]: unknown;
}

export interface ScheduleTaskProgressGateway {
  get(id: string): Promise<ScheduleProgressTask>;
  update(id: string, patch: Record<string, unknown>): Promise<unknown>;
}

export interface PersistScheduleProgressInput {
  gateway: ScheduleTaskProgressGateway;
  id: string;
  pct: unknown;
  capturedDay?: string;
  /**
   * The day work first went underway, when it differs from `capturedDay` —
   * carried by a queued op that superseded an earlier, still-unreplayed one.
   */
  startCapturedDay?: string | null;
}

/**
 * Persist one field progress change against the task's CURRENT server state.
 *
 * Field screens can be open for hours while another user edits the same task.
 * Deriving actual dates from the rendered/cached row can therefore overwrite a
 * newer actual_start_date / actual_finish_date. Re-read immediately before the
 * update and derive only the still-missing actuals from that server row.
 */
export async function persistScheduleProgress({
  gateway,
  id,
  pct,
  capturedDay,
  startCapturedDay,
}: PersistScheduleProgressInput): Promise<unknown> {
  const current = await gateway.get(id);
  const patch = progressUpdatePatch(current, pct, capturedDay);

  // `deriveActualsPatch` knows only one day, so a task that both started and
  // finished during one offline stretch gets the completion day for both. Only
  // the queue knows the earlier day, and only when it stamped a start just now:
  // an actual_start_date the server already holds is left exactly as it is.
  if (startCapturedDay && patch.actual_start_date && startCapturedDay < patch.actual_start_date) {
    patch.actual_start_date = startCapturedDay;
  }

  return gateway.update(id, patch as Record<string, unknown>);
}

/**
 * Backward-compatible capture-day recovery for progress ops queued before the
 * explicit captureDay field was added. New ops persist captureDay directly so
 * a later timezone change cannot reinterpret the foreman's original work day.
 */
export function captureDayFromTimestamp(value: unknown): string | undefined {
  const millis =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(millis)) return undefined;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return undefined;
  return todayLocalISO(date);
}
