/**
 * Pure helpers for DailyLogs page shell.
 */
import { filterLiveRecords } from "@/pages/shared/filterLiveRecords";
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


/** Alias for daily-log soft-delete filter. */
export const filterLiveDailyLogs = filterLiveRecords;

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

export const DAILY_LOG_DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
] as const;

export type DailyLogCopySource = {
  crew_name?: string | null;
  headcount?: number | null;
  superintendent?: string | null;
  equipment_used?: string | null;
  date?: string | null;
  [k: string]: unknown;
};

/** Most recent log by date (null when empty). */
export function pickMostRecentDailyLog<T extends DailyLogCopySource>(
  logs: T[],
): T | null {
  if (!(logs || []).length) return null;
  return [...logs].sort(
    (a, b) => new Date(String(b.date || 0)).getTime() - new Date(String(a.date || 0)).getTime(),
  )[0];
}

/** Prefill form seed when copying yesterday/most-recent log. */
export function buildCopyFromRecentLogSeed(
  mostRecent: DailyLogCopySource,
  todayIso: string,
): {
  crew_name: string;
  headcount: number;
  superintendent: string;
  equipment_used: string;
  activities: string;
  delays: string;
  safety_notes: string;
  date: string;
} {
  return {
    crew_name: mostRecent.crew_name || "",
    headcount: mostRecent.headcount || 0,
    superintendent: mostRecent.superintendent || "",
    equipment_used: mostRecent.equipment_used || "",
    activities: "",
    delays: "",
    safety_notes: "",
    date: todayIso,
  };
}


export const DAILY_LOGS_COMMAND_SUBTITLE =
  "Field superintendent journal · man-hours · safety · delays";

/** Local calendar date YYYY-MM-DD (page uses UTC ISO date for copy seed historically). */
export function utcIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
