import { describe, expect, it } from "vitest";
import {
  getDateCutoff,
  filterLiveDailyLogs,
  filterDailyLogs,
  computeDailyLogMetrics,
} from "../dailyLogsPageHelpers";

describe("dailyLogsPageHelpers", () => {
  it("date cutoffs for presets", () => {
    const now = new Date("2026-06-15T12:00:00Z"); // Monday
    expect(getDateCutoff("all", now)).toBeNull();
    expect(getDateCutoff("month", now)).toBe("2026-06-01");
    expect(getDateCutoff("week", now)).toBe("2026-06-15");
  });

  it("filters live, date range, search, and metrics", () => {
    expect(filterLiveDailyLogs([{ id: "1" }, { id: "2", is_deleted: true }])).toHaveLength(1);
    const logs = [
      { date: "2026-06-16", activities: "Bolt up", crew_name: "A", hours_worked: 8, headcount: 2, safety_incidents: 0, delay_hours: 1 },
      { date: "2026-06-10", activities: "Weld", superintendent: "Sam", hours_worked: 10, headcount: 1, safety_incidents: 1, delay_hours: 0 },
    ];
    // week of Mon 2026-06-15 → cutoff 2026-06-15 (UTC)
    const week = filterDailyLogs(logs, { dateRange: "week", searchTerm: "", now: new Date("2026-06-15T12:00:00Z") });
    expect(week.map((l) => l.date)).toEqual(["2026-06-16"]);
    const search = filterDailyLogs(logs, { dateRange: "all", searchTerm: "sam" });
    expect(search).toHaveLength(1);
    const m = computeDailyLogMetrics(logs as any);
    expect(m.totalManHours).toBe(8 * 2 + 10 * 1);
    expect(m.safetyIncidents).toBe(1);
    expect(m.delayHours).toBe(1);
  });
});

import {
  DAILY_LOG_DATE_PRESETS,
  pickMostRecentDailyLog,
  buildCopyFromRecentLogSeed,
} from "../dailyLogsPageHelpers";

describe("daily log copy helpers", () => {
  it("presets and pick most recent", () => {
    expect(DAILY_LOG_DATE_PRESETS[0].key).toBe("today");
    const most = pickMostRecentDailyLog([
      { date: "2026-01-01", crew_name: "A" },
      { date: "2026-02-01", crew_name: "B" },
    ]);
    expect(most?.crew_name).toBe("B");
    expect(pickMostRecentDailyLog([])).toBeNull();
  });

  it("builds copy seed", () => {
    const seed = buildCopyFromRecentLogSeed(
      { crew_name: "Crew", headcount: 4, superintendent: "Sam", equipment_used: "Crane" },
      "2026-08-05",
    );
    expect(seed).toMatchObject({
      crew_name: "Crew",
      headcount: 4,
      activities: "",
      date: "2026-08-05",
    });
  });
});

import { DAILY_LOGS_COMMAND_SUBTITLE, utcIsoDate } from "../dailyLogsPageHelpers";

describe("daily log subtitle and utc date", () => {
  it("exposes command subtitle", () => {
    expect(DAILY_LOGS_COMMAND_SUBTITLE).toContain("Field superintendent");
  });

  it("utcIsoDate slices ISO date", () => {
    expect(utcIsoDate(new Date("2026-08-05T23:30:00.000Z"))).toBe("2026-08-05");
  });
});
