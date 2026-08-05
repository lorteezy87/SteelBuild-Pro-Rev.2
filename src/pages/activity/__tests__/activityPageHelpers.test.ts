import { describe, expect, it } from "vitest";
import {getDateCutoff,
  uniqueActivityUsers,
  uniqueActivityEntities,
  filterActivities,
  activityHasActiveFilters,
  buildActivityCsvRows,
  ACTIVITY_CSV_HEADERS, buildActivityCsvString, activityCsvFilename} from "../activityPageHelpers";

const NOW = new Date("2026-08-05T12:00:00Z");

describe("activityPageHelpers", () => {
  it("date cutoffs", () => {
    expect(getDateCutoff("all", NOW)).toBeNull();
    const today = getDateCutoff("today", NOW)!;
    expect(today.getFullYear()).toBe(2026);
    expect(today.getMonth()).toBe(7);
    expect(today.getDate()).toBe(5);
    const d7 = getDateCutoff("7d", NOW)!;
    expect(d7.getDate()).toBe(29);
    expect(d7.getMonth()).toBe(6);
  });

  it("unique users/entities and filter", () => {
    const rows = [
      { performed_by: "a@x.com", entity_type: "RFI", project_id: "p1", timestamp: "2026-08-04T10:00:00Z", action: "create" },
      { userName: "b@x.com", entityType: "Drawing", projectId: "p2", created_at: "2026-07-01T10:00:00Z", action: "update" },
      { performed_by: "a@x.com", entity_type: "RFI", project_id: "p1", timestamp: "2026-08-05T08:00:00Z" },
    ];
    expect(uniqueActivityUsers(rows)).toEqual(["a@x.com", "b@x.com"]);
    expect(uniqueActivityEntities(rows)).toEqual(["RFI", "Drawing"]);
    expect(
      filterActivities(rows, {
        filterProject: "p1",
        filterUser: "all",
        filterEntity: "all",
        dateRange: "all",
      }, NOW),
    ).toHaveLength(2);
    expect(
      filterActivities(rows, {
        filterProject: "all",
        filterUser: "all",
        filterEntity: "all",
        dateRange: "7d",
      }, NOW),
    ).toHaveLength(2);
    expect(
      filterActivities(rows, {
        filterProject: "all",
        filterUser: "b@x.com",
        filterEntity: "Drawing",
        dateRange: "all",
      }, NOW),
    ).toHaveLength(1);
  });

  it("active filters and csv", () => {
    expect(
      activityHasActiveFilters({
        filterProject: "all",
        filterUser: "all",
        filterEntity: "all",
        dateRange: "all",
      }),
    ).toBe(false);
    expect(
      activityHasActiveFilters({
        filterProject: "p1",
        filterUser: "all",
        filterEntity: "all",
        dateRange: "all",
      }),
    ).toBe(true);
    const rows = buildActivityCsvRows(
      [{ timestamp: "2026-01-01T00:00:00Z", performed_by: "u", action: "x", entity_type: "RFI", entity_name: "R1", project_name: "P", description: "d" }],
      () => "TS",
    );
    expect(rows[0]).toEqual(["TS", "u", "x", "RFI", "R1", "P", "d"]);
    expect(ACTIVITY_CSV_HEADERS).toHaveLength(7);
  });
});

describe("buildActivityCsvString", () => {
  it("joins header and quoted rows", () => {
    const csv = buildActivityCsvString([["a", "b"]]);
    expect(csv.split("\n").length).toBeGreaterThan(1);
    expect(csv).toContain('"a"');
    expect(activityCsvFilename(new Date("2026-08-05T00:00:00Z"))).toBe("activity-audit-2026-08-05.csv");
  });
});
