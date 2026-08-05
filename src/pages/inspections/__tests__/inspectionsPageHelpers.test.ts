import { describe, expect, it } from "vitest";
import {
  filterLiveRecords,
  filterInspections,
  computeInspectionStats,
  nextStatusFilterToggle,
  INSPECTION_TYPES,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_COLORS,
  inspectionsCommandSubtitle,
  resolveDeficiencyCount,
  inspectionNumberLabel,
  baseDeficiencyDescription,
  formatDeficiencyDescription,
  buildPunchlistCreatePayloadsFromInspection,
  buildInspectionPunchlistConvertedStamp,
  mergeInspectionMetadataWithConverted,
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

describe("inspection catalogs", () => {
  it("has types, statuses, and status colors", () => {
    expect(INSPECTION_TYPES.length).toBeGreaterThan(5);
    expect(INSPECTION_STATUSES).toContain("Completed");
    expect(INSPECTION_STATUS_COLORS.Completed).toBeTruthy();
  });

  it("builds command subtitle", () => {
    expect(inspectionsCommandSubtitle("all", "all")).toBe(
      "Welds · material · connections · coatings",
    );
    expect(inspectionsCommandSubtitle("Welds", "all")).toBe(
      "Welds · material · connections · coatings · (filtered)",
    );
  });
});

describe("inspection → punchlist convert pure builders", () => {
  it("resolves count, labels, descriptions", () => {
    expect(resolveDeficiencyCount(null)).toBe(1);
    expect(resolveDeficiencyCount("3")).toBe(3);
    expect(resolveDeficiencyCount(0)).toBe(1);
    expect(inspectionNumberLabel("abcdef12345")).toBe("INSP-abcdef12");
    expect(inspectionNumberLabel(null)).toBe("Inspection");
    expect(
      baseDeficiencyDescription({ findings: "crack", corrective_actions: "fix" }),
    ).toBe("crack");
    expect(
      formatDeficiencyDescription("INSP-abc", "gap", 0, 2),
    ).toBe("[INSP-abc #1/2] gap");
    expect(formatDeficiencyDescription("INSP-abc", "gap", 0, 1)).toBe("[INSP-abc] gap");
  });

  it("builds create payloads and metadata stamp", () => {
    const payloads = buildPunchlistCreatePayloadsFromInspection({
      id: "insp-00123456",
      deficiencies_count: 2,
      findings: "Weld porosity",
      corrective_actions: "Grind and reweld",
      location: "Grid B",
      sign_off_status: "Rejected",
      inspection_type: "Welds",
    });
    expect(payloads).toHaveLength(2);
    expect(payloads[0].priority).toBe("High");
    expect(payloads[0].description).toContain("#1/2");
    expect(payloads[0].metadata.deficiency_index).toBe(1);
    expect(payloads[1].metadata.deficiency_count).toBe(2);

    const stamp = buildInspectionPunchlistConvertedStamp(2, ["a", "b"], "2026-01-01T00:00:00.000Z");
    expect(stamp).toEqual({
      count: 2,
      at: "2026-01-01T00:00:00.000Z",
      ids: ["a", "b"],
    });
    expect(
      mergeInspectionMetadataWithConverted({ prior: true }, stamp),
    ).toEqual({ prior: true, punchlist_converted: stamp });
  });
});

import { createEmptyInspectionFilters } from "../inspectionsPageHelpers";

describe("createEmptyInspectionFilters", () => {
  it("resets type and status to all", () => {
    expect(createEmptyInspectionFilters()).toEqual({
      filterType: "all",
      filterStatus: "all",
    });
  });
});
