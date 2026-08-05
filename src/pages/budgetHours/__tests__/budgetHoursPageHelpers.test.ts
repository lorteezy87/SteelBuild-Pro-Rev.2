import { describe, expect, it } from "vitest";
import {
  varianceColor,
  fmtHoursOrBlank,
  filterLiveBudgetRows,
  partitionBudgetRows,
  computeBudgetTotals,
  effectiveActuals,
} from "../budgetHoursControlCenter.derive";

describe("budget hours page helper extensions", () => {
  it("colors and blanks hours", () => {
    expect(varianceColor(12)).toBe("var(--status-error)");
    expect(varianceColor(5)).toBe("var(--status-warning)");
    expect(varianceColor(-1)).toBe("var(--status-success)");
    expect(fmtHoursOrBlank(0)).toBe("—");
    expect(fmtHoursOrBlank(1.25)).toBe("1.3");
  });

  it("partitions and totals", () => {
    const rows = [
      { id: "1", category: "Standard", is_specialty: false, shop_hours_budget: 10, field_hours_budget: 5, shop_hours_actual: 8, field_hours_actual: 4, metadata: null },
      { id: "2", category: "Specialty", is_specialty: true, shop_hours_budget: 2, field_hours_budget: 0, shop_hours_actual: 1, field_hours_actual: 0, metadata: null },
      { id: "3", category: "Misses", is_specialty: false, shop_hours_budget: 0, field_hours_budget: 0, shop_hours_actual: 0, field_hours_actual: 0, metadata: null },
      { id: "4", category: "Standard", is_specialty: false, is_deleted: true, shop_hours_budget: 99, field_hours_budget: 0, shop_hours_actual: 0, field_hours_actual: 0, metadata: null },
    ] as any;
    expect(filterLiveBudgetRows(rows).map((r: any) => r.id)).toEqual(["1", "2", "3"]);
    const parts = partitionBudgetRows(filterLiveBudgetRows(rows) as any);
    expect(parts.standardRows.map((r) => r.id)).toEqual(["1"]);
    expect(parts.specialtyRows.map((r) => r.id)).toEqual(["2"]);
    expect(parts.missesRow?.id).toBe("3");
    const totals = computeBudgetTotals(filterLiveBudgetRows(rows) as any, new Map());
    expect(totals).toEqual({ sb: 12, sa: 9, fb: 5, fa: 4 });
    expect(effectiveActuals(rows[0], new Map()).shop).toBe(8);
  });
});
