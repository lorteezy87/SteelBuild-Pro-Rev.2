import { describe, expect, it } from "vitest";
import {
  filterLiveRecords,
  filterInspections,
  computeInspectionStats,
  nextStatusFilterToggle,
} from "../inspectionsPageHelpers";

describe("inspectionsPageHelpers", () => {
  it("filters, stats, toggle", () => {
    expect(filterLiveRecords([{ id: 1 }, { id: 2, is_deleted: true }])).toHaveLength(1);
    const rows = [
      { inspection_type: "Weld", status: "Scheduled", sign_off_status: null },
      { inspection_type: "Coating", status: "Completed", sign_off_status: "Approved" },
      { inspection_type: "Weld", status: "In Progress", sign_off_status: "Rejected" },
    ];
    expect(filterInspections(rows, { filterType: "Weld", filterStatus: "all" })).toHaveLength(2);
    const s = computeInspectionStats(rows);
    expect(s.total).toBe(3);
    expect(s.approved).toBe(1);
    expect(s.rejected).toBe(1);
    expect(nextStatusFilterToggle("Scheduled", "Scheduled")).toBe("all");
    expect(nextStatusFilterToggle("all", "Scheduled")).toBe("Scheduled");
  });
});

import {
  INSPECTION_TYPES,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_COLORS,
} from "../inspectionsPageHelpers";

describe("inspection catalogs", () => {
  it("has types, statuses, and status colors", () => {
    expect(INSPECTION_TYPES.length).toBeGreaterThan(5);
    expect(INSPECTION_STATUSES).toContain("Completed");
    expect(INSPECTION_STATUS_COLORS.Completed).toBeTruthy();
  });
});
