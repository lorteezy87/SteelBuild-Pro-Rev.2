import { describe, expect, it } from "vitest";
import {
  buildScheduleHeroChips,
  buildScheduleHeroStats,
  buildScheduleKpiCells,
  buildScheduleRiskReasons,
  formatScheduleDate,
} from "../scheduleCommandCenter.presentation";
import type { ScheduleSummary, TaskRecord } from "../scheduleCommandCenter.derive";

const SUMMARY: ScheduleSummary = {
  total: 10,
  critical: 2,
  activities: 8,
  atRisk: 3,
  overdue: 1,
  inLookahead: 4,
  pctComplete: 42,
  pctCompleteCoverage: { weighted: 7, total: 8 },
  tbd: 2,
  milestones: 3,
  lookaheadQueue: [],
  milestoneQueue: [],
  riskQueue: [],
};

describe("scheduleCommandCenter presentation derivations", () => {
  it("preserves TBD for absent and invalid dates and formats valid dates in UTC", () => {
    expect(formatScheduleDate(null)).toBe("TBD");
    expect(formatScheduleDate(undefined)).toBe("TBD");
    expect(formatScheduleDate("not-a-date")).toBe("TBD");
    expect(formatScheduleDate("2026-09-12")).toBe("9/12/26");
  });

  it("builds hero and KPI values without changing fallback semantics", () => {
    expect(buildScheduleHeroChips(SUMMARY)).toEqual([
      { label: "10 Tasks" },
      { label: "2 Critical", tone: "danger" },
      { label: "2 TBD", tone: "warn" },
    ]);
    expect(buildScheduleHeroStats(SUMMARY, 0, null)).toEqual([
      { value: "0%", label: "Complete" },
      { value: "—", label: "Project Health" },
    ]);
    expect(buildScheduleKpiCells(SUMMARY)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "% Complete", value: "42%", tone: "warn" }),
      expect.objectContaining({ label: "TBD / Unscheduled", value: 2, tone: "warn" }),
    ]));
  });

  it("derives stable risk reasons without treating partial dates as TBD", () => {
    const task: TaskRecord = {
      end_date: "2026-09-11",
      start_date: null,
      priority: "Critical",
      blockers: "Waiting on steel",
      resource_names: null,
      assigned_to: null,
    };
    expect(buildScheduleRiskReasons(task, new Date("2026-09-12T18:00:00Z"))).toEqual([
      "Overdue",
      "Critical priority",
      "Blocked",
      "Unassigned",
    ]);
  });
});
