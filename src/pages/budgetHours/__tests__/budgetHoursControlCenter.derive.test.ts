/**
 * Unit tests for buildBudgetHoursSummary.
 * Pure logic only — no React, no network.
 */
import { describe, it, expect } from "vitest";
import {
  buildBudgetHoursSummary,
  variancePct,
  fmtPct,
  varianceTone,
} from "../budgetHoursControlCenter.derive";
import type { BudgetHourRow } from "../budgetHoursControlCenter.derive";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<BudgetHourRow> = {}): BudgetHourRow {
  return {
    id: "r1",
    category: "Standard",
    scope_item: "Columns",
    is_specialty: false,
    is_deleted: false,
    shop_hours_budget: 100,
    shop_hours_actual: 80,
    field_hours_budget: 50,
    field_hours_actual: 40,
    notes: null,
    sort_order: 1,
    metadata: null,
    ...overrides,
  };
}

// ─── variancePct ──────────────────────────────────────────────────────────────

describe("variancePct", () => {
  it("returns 0 when both budget and actual are 0", () => {
    expect(variancePct(0, 0)).toBe(0);
  });

  it("returns 100 when budget is 0 and actual > 0", () => {
    expect(variancePct(0, 50)).toBe(100);
  });

  it("returns negative pct when actual < budget", () => {
    expect(variancePct(100, 80)).toBeCloseTo(-20);
  });

  it("returns positive pct when actual > budget", () => {
    expect(variancePct(100, 120)).toBeCloseTo(20);
  });
});

// ─── varianceTone ─────────────────────────────────────────────────────────────

describe("varianceTone", () => {
  it("returns good when at or under budget", () => {
    expect(varianceTone(-5)).toBe("good");
    expect(varianceTone(0)).toBe("good");
  });

  it("returns warn when slightly over (1–9%)", () => {
    expect(varianceTone(5)).toBe("warn");
  });

  it("returns danger when >= 10% over", () => {
    expect(varianceTone(10)).toBe("danger");
    expect(varianceTone(50)).toBe("danger");
  });
});

// ─── fmtPct ───────────────────────────────────────────────────────────────────

describe("fmtPct", () => {
  it("prefixes positive with +", () => {
    expect(fmtPct(5.25)).toBe("+5.3%");
  });

  it("no prefix for 0", () => {
    expect(fmtPct(0)).toBe("0.0%");
  });

  it("no prefix for negative", () => {
    expect(fmtPct(-10)).toBe("-10.0%");
  });

  it("returns em-dash for NaN / Infinity", () => {
    expect(fmtPct(NaN)).toBe("—");
    expect(fmtPct(Infinity)).toBe("—");
  });
});

// ─── buildBudgetHoursSummary ──────────────────────────────────────────────────

describe("buildBudgetHoursSummary", () => {
  it("returns zero KPIs for empty rows", () => {
    const s = buildBudgetHoursSummary([]);
    expect(s.totalBudgetHours).toBe(0);
    expect(s.totalActualHours).toBe(0);
    expect(s.pctUsed).toBe(0);
    expect(s.overBudgetCount).toBe(0);
    expect(s.byTrade).toHaveLength(0);
  });

  it("computes shop + field totals correctly", () => {
    const rows = [
      makeRow({ id: "r1", shop_hours_budget: 100, shop_hours_actual: 80, field_hours_budget: 50, field_hours_actual: 60 }),
      makeRow({ id: "r2", scope_item: "Beams", shop_hours_budget: 200, shop_hours_actual: 200, field_hours_budget: 100, field_hours_actual: 100 }),
    ];
    const s = buildBudgetHoursSummary(rows);
    expect(s.shopBudget).toBe(300);
    expect(s.shopActual).toBe(280);
    expect(s.fieldBudget).toBe(150);
    expect(s.fieldActual).toBe(160);
    expect(s.totalBudgetHours).toBe(450);
    expect(s.totalActualHours).toBe(440);
  });

  it("flags rows as over budget when actual > budget", () => {
    const rows = [
      makeRow({ id: "r1", shop_hours_budget: 100, shop_hours_actual: 150, field_hours_budget: 50, field_hours_actual: 50 }),
      makeRow({ id: "r2", scope_item: "Beams", shop_hours_budget: 100, shop_hours_actual: 80, field_hours_budget: 50, field_hours_actual: 40 }),
    ];
    const s = buildBudgetHoursSummary(rows);
    expect(s.overBudgetCount).toBe(1);
    expect(s.overBudgetRows[0].scopeItem).toBe("Columns");
  });

  it("excludes Misses rows from budget totals", () => {
    const rows = [
      makeRow({ id: "r1" }),
      makeRow({
        id: "r-miss",
        category: "Misses",
        scope_item: "Misses / Gap in Scope",
        shop_hours_budget: 9999,
        shop_hours_actual: 9999,
        field_hours_budget: 9999,
        field_hours_actual: 9999,
      }),
    ];
    const s = buildBudgetHoursSummary(rows);
    expect(s.totalBudgetHours).toBe(150); // only r1 (100+50)
    expect(s.totalActualHours).toBe(120); // only r1 (80+40)
  });

  it("rolls up actuals from linked work packages when present", () => {
    const wpsById = new Map([
      ["wp1", { id: "wp1", shop_hours_actual: 200, field_hours_actual: 100 }],
    ]);
    const rows = [
      makeRow({
        id: "r1",
        shop_hours_actual: 0,
        field_hours_actual: 0,
        metadata: { linked_work_package_ids: ["wp1"] },
      }),
    ];
    const s = buildBudgetHoursSummary(rows, wpsById);
    expect(s.shopActual).toBe(200);
    expect(s.fieldActual).toBe(100);
    expect(s.byTrade[0].isLinked).toBe(true);
  });

  it("builds bar chart data limited to 12 rows", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeRow({ id: `r${i}`, scope_item: `Item ${i}` }),
    );
    const s = buildBudgetHoursSummary(rows);
    expect(s.barChartData.length).toBeLessThanOrEqual(12);
  });

  it("builds pie data for shop/field split", () => {
    const rows = [makeRow({ id: "r1", shop_hours_budget: 100, field_hours_budget: 50 })];
    const s = buildBudgetHoursSummary(rows);
    const shopPie = s.byCategoryPie.find((d) => d.name === "Shop");
    const fieldPie = s.byCategoryPie.find((d) => d.name === "Field");
    expect(shopPie?.value).toBe(100);
    expect(fieldPie?.value).toBe(50);
  });

  it("pct used rounds to nearest integer", () => {
    const rows = [
      makeRow({
        id: "r1",
        shop_hours_budget: 100,
        shop_hours_actual: 75,
        field_hours_budget: 0,
        field_hours_actual: 0,
      }),
    ];
    const s = buildBudgetHoursSummary(rows);
    expect(s.pctUsed).toBe(75);
  });

  it("returns misses from missesRow.metadata.misses", () => {
    const rows = [
      makeRow({ id: "r1" }),
      makeRow({
        id: "r-miss",
        category: "Misses",
        scope_item: "Misses / Gap in Scope",
        metadata: {
          misses: [
            { id: "m1", location: "East Wall", rough_cost: 5000, explanation: "Added scope" },
          ],
        },
      }),
    ];
    const s = buildBudgetHoursSummary(rows);
    expect(s.misses).toHaveLength(1);
    expect(s.misses[0].location).toBe("East Wall");
  });

  it("counts standard vs specialty rows", () => {
    const rows = [
      makeRow({ id: "r1", category: "Standard", is_specialty: false }),
      makeRow({ id: "r2", category: "Standard", is_specialty: false, scope_item: "Beams" }),
      makeRow({ id: "r3", category: "Specialty", is_specialty: true, scope_item: "Custom Stairs" }),
    ];
    const s = buildBudgetHoursSummary(rows);
    expect(s.standardCount).toBe(2);
    expect(s.specialtyCount).toBe(1);
  });
});
