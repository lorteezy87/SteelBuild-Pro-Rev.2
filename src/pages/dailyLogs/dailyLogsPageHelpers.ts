/**
 * Pure helpers for DailyLogs page shell.
 */
import { localToday } from "@/utils/dates";

export function getDateCutoff(preset: string, now: Date = new Date()): string | null {
  if (preset === "today") {
    return localToday();
  }
  if (preset === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.getFullYear(), now.getMonth(), diff)
      .toISOString()
      .slice(0, 10);
  }
  if (preset === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
  }
  return null;
}

export function filterLiveDailyLogs<T extends { is_deleted?: boolean | null }>(rawLogs: T[]): T[] {
  return (rawLogs || []).filter((r) => !r.is_deleted);
}

export type DailyLogLike = {
  date?: string | null;
  activities?: string | null;
  delays?: string | null;
  crew_name?: string | null;
  superintendent?: string | null;
  headcount?: number | null;
  hours_worked?: number | null;
  safety_incidents?: number | null;
  delay_hours?: number | null;
  [k: string]: unknown;
};

export function filterDailyLogs(
  logs: DailyLogLike[],
  opts: { dateRange: string; searchTerm: string; now?: Date },
): DailyLogLike[] {
  let result = logs || [];
  const cutoff = getDateCutoff(opts.dateRange, opts.now);
  if (cutoff) {
    result = result.filter((log) => (log.date || "") >= cutoff);
  }
  if (opts.searchTerm.trim()) {
    const term = opts.searchTerm.trim().toLowerCase();
    result = result.filter((log) => {
      const fields = [
        log.activities,
        log.delays,
        log.crew_name,
        log.superintendent,
      ];
      return fields.some(
        (f) => typeof f === "string" && f.toLowerCase().includes(term),
      );
    });
  }
  return result;
}

export function computeDailyLogMetrics(filteredLogs: DailyLogLike[]) {
  const totalManHours = filteredLogs.reduce(
    (sum, log) => sum + (log.hours_worked || 0) * (log.headcount || 0),
    0,
  );
  const avgCrewSize =
    filteredLogs.length > 0
      ? filteredLogs.reduce((sum, log) => sum + (log.headcount || 0), 0) /
        filteredLogs.length
      : 0;
  const safetyIncidents = filteredLogs.reduce(
    (sum, log) => sum + (log.safety_incidents || 0),
    0,
  );
  const delayHours = filteredLogs.reduce(
    (sum, log) => sum + (log.delay_hours || 0),
    0,
  );
  return { totalManHours, avgCrewSize, safetyIncidents, delayHours };
}
