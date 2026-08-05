import { describe, expect, it } from "vitest";
import { filterWarranties, computeWarrantyStats, daysUntilExpiry } from "../warrantyPageHelpers";

const TODAY = new Date("2026-08-05T12:00:00");
TODAY.setHours(0, 0, 0, 0);

describe("warrantyPageHelpers", () => {
  it("days and filter/stats", () => {
    expect(daysUntilExpiry("2026-08-15", TODAY)).toBe(10);
    const rows = [
      { warranty_type: "Material", expiration_date: "2026-09-01", is_active: true },
      { warranty_type: "Welds", expiration_date: "2026-08-01", is_active: true },
      { warranty_type: "Material", expiration_date: "2026-10-01", is_active: false },
    ];
    expect(filterWarranties(rows, { filterType: "Material", filterStatus: "all" }, TODAY)).toHaveLength(2);
    expect(filterWarranties(rows, { filterType: "all", filterStatus: "expired" }, TODAY)).toHaveLength(1);
    const stats = computeWarrantyStats(rows, TODAY);
    expect(stats.total).toBe(3);
    expect(stats.expired).toBe(1);
    expect(stats.active).toBe(1);
  });
});
