import { describe, expect, it } from "vitest";
import { MILESTONE_STATUS_OPTIONS } from "../projectMilestonesHelpers";
import { HEALTH_BUCKETS } from "../projectsHealthHelpers";
import { KEY_ACTIVITY_WINDOWS } from "../upcomingKeyActivitiesHelpers";
import { MILESTONE_WINDOWS } from "../upcomingMilestonesHelpers";
import { COMPLETED_WINDOWS } from "../tasksCompletedHelpers";
import { TASKS_REPORT_TYPES, TASKS_REPORT_STATUSES } from "../tasksReportHelpers";
import { HEAD_H } from "@/components/schedule/scheduleGanttHelpers";

describe("report filter catalogs + gantt head", () => {
  it("milestone status options", () => {
    expect(MILESTONE_STATUS_OPTIONS.map((o) => o.key)).toEqual(["all", "open", "complete"]);
  });
  it("health buckets", () => {
    expect(HEALTH_BUCKETS).toHaveLength(4);
    expect(HEALTH_BUCKETS[0].key).toBe("On Track");
  });
  it("window catalogs", () => {
    expect(KEY_ACTIVITY_WINDOWS.map((w) => w.key)).toEqual(["7", "14", "30"]);
    expect(MILESTONE_WINDOWS.map((w) => w.key)).toEqual(["30", "60", "90", "180"]);
    expect(COMPLETED_WINDOWS.at(-1)?.key).toBe("all");
  });
  it("tasks report type/status", () => {
    expect(TASKS_REPORT_TYPES).toContain("Fabrication");
    expect(TASKS_REPORT_STATUSES).toContain("Delayed");
  });
  it("schedule gantt HEAD_H", () => {
    expect(HEAD_H).toBe(40);
  });
});
