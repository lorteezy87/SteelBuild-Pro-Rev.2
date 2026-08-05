import { describe, expect, it } from "vitest";
import {
  filterLiveRecords,
  filterSafetyIncidents,
  computeSafetyStats,
  SAFETY_INCIDENT_TYPES,
  SAFETY_SEVERITIES,
  SAFETY_STATUS_FILTERS,
  nextFilterToggle,
  safetyCommandSubtitle,
  createEmptySafetyFilters,
} from "../safetyPageHelpers";

describe("safetyPageHelpers", () => {
  it("filters and stats", () => {
    expect(filterLiveRecords([{ id: 1, is_deleted: true }])).toHaveLength(0);
    const rows = [
      { incident_type: "Injury", severity: "Critical", status: "Open" },
      { incident_type: "Near Miss", severity: "High", status: "Closed" },
      { incident_type: "Hazard", severity: "Low", status: "Open" },
    ];
    expect(filterSafetyIncidents(rows, { filterType: "Injury", filterSeverity: "all", filterStatus: "all" })).toHaveLength(1);
    const s = computeSafetyStats(rows);
    expect(s.total).toBe(3);
    expect(s.critical).toBe(1);
    expect(s.injuries).toBe(1);
    expect(s.open).toBe(2);
  });
});

describe("safety filter tokens", () => {
  it("exposes types, severities, statuses", () => {
    expect(SAFETY_INCIDENT_TYPES).toContain("Near Miss");
    expect(SAFETY_SEVERITIES).toEqual(["Critical", "High", "Medium", "Low"]);
    expect(SAFETY_STATUS_FILTERS[0]).toBe("all");
  });

  it("toggles KPI filters and builds subtitle", () => {
    expect(nextFilterToggle("Critical", "Critical")).toBe("all");
    expect(nextFilterToggle("all", "Injury")).toBe("Injury");
    expect(safetyCommandSubtitle(2, 1)).toBe(
      "2 open · 1 critical · injuries / near-misses / hazards",
    );
    expect(createEmptySafetyFilters()).toEqual({
      filterType: "all",
      filterSeverity: "all",
      filterStatus: "all",
    });
  });
});
