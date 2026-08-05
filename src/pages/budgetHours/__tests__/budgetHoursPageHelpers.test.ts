import { describe, expect, it } from "vitest";
import {
  nextBudgetHourSortOrder,
  buildBlankBudgetHourRow,
  buildScopeCreatePayload,
} from "../budgetHoursPageHelpers";

describe("budgetHoursPageHelpers", () => {
  it("nextBudgetHourSortOrder from max sort", () => {
    expect(nextBudgetHourSortOrder([])).toBe(10);
    expect(nextBudgetHourSortOrder([{ sort_order: 5 }, { sort_order: 20 }])).toBe(30);
    expect(nextBudgetHourSortOrder([{ sort_order: null }])).toBe(10);
  });

  it("buildBlankBudgetHourRow", () => {
    const row = buildBlankBudgetHourRow("p1", 40);
    expect(row.project_id).toBe("p1");
    expect(row.sort_order).toBe(40);
    expect(row.scope_item).toBe("New Scope Item");
    expect(row.shop_hours_budget).toBe(0);
  });

  it("buildScopeCreatePayload merges patch", () => {
    const payload = buildScopeCreatePayload(
      { scope_item: "Beams", category: "Standard" },
      "p9",
      50,
    );
    expect(payload).toEqual({
      scope_item: "Beams",
      category: "Standard",
      project_id: "p9",
      sort_order: 50,
      metadata: {},
    });
  });
});
