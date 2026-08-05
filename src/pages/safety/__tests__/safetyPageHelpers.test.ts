import { describe, expect, it } from "vitest";
import { filterLiveRecords, filterSafetyIncidents, computeSafetyStats } from "../safetyPageHelpers";

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
