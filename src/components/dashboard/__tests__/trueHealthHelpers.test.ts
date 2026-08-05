import { describe, expect, it } from "vitest";
import { buildTrueHealthRows } from "../trueHealthHelpers";

describe("buildTrueHealthRows", () => {
  it("aggregates BAC/EV/AC and CPI per project", () => {
    const projects = [
      { id: "p1", project_number: "P-1", name: "Alpha Tower" },
      { id: "p2", project_number: "P-2", name: "Beta Bridge" },
    ];
    const wps = [
      {
        project_id: "p1",
        budgeted_labor_value: 100,
        budgeted_material_value: 100,
        percent_complete: 50,
        actual_labor_cost_to_date: 80,
        actual_material_cost_to_date: 20,
      },
      {
        project_id: "p2",
        budgeted_labor_value: 0,
        budgeted_material_value: 0,
        percent_complete: 0,
        actual_labor_cost_to_date: 0,
        actual_material_cost_to_date: 0,
      },
    ];
    const rows = buildTrueHealthRows(projects, wps);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("P-1");
    expect(rows[0].bac).toBe(200);
    expect(rows[0].ev).toBe(100);
    expect(rows[0].ac).toBe(100);
    expect(rows[0].cpi).toBe(1);
    expect(rows[0].acColor).toBe("var(--status-success)");
  });

  it("falls back to original_budget_at_completion when WP BAC is 0", () => {
    const projects = [
      { id: "p1", project_number: "P-1", name: "Solo", original_budget_at_completion: 500 },
    ];
    const rows = buildTrueHealthRows(projects, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].bac).toBe(500);
  });

  it("handles null inputs", () => {
    expect(buildTrueHealthRows(null, null)).toEqual([]);
  });

  it("colors warning and error CPI bands", () => {
    const projects = [{ id: "p1", project_number: "W", name: "Warn" }];
    const warn = buildTrueHealthRows(projects, [
      {
        project_id: "p1",
        budgeted_labor_value: 100,
        budgeted_material_value: 0,
        percent_complete: 90,
        actual_labor_cost_to_date: 100,
        actual_material_cost_to_date: 0,
      },
    ]);
    expect(warn[0].cpi).toBeCloseTo(0.9);
    expect(warn[0].acColor).toBe("var(--status-warning)");

    const err = buildTrueHealthRows(projects, [
      {
        project_id: "p1",
        budgeted_labor_value: 100,
        budgeted_material_value: 0,
        percent_complete: 50,
        actual_labor_cost_to_date: 100,
        actual_material_cost_to_date: 0,
      },
    ]);
    expect(err[0].cpi).toBe(0.5);
    expect(err[0].acColor).toBe("var(--status-error)");
  });
});
