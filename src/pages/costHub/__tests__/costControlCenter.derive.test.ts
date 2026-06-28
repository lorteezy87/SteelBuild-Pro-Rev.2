/**
 * costControlCenter.derive.test.ts
 *
 * Tests the pure derivation functions used by the Cost Control Center.
 * No React, no network, no DOM needed — runs in the Vitest node environment.
 */
import { describe, it, expect, vi } from "vitest";

// Mock the costCodes module so tests aren't coupled to the full catalog
vi.mock("@/components/shared/costCodes", () => ({
  COST_CODES: [
    { code: "01-100", name: "Structural Steel" },
    { code: "01-200", name: "Misc Metals" },
  ],
  CATEGORY_ORDER: ["Labor", "Materials", "Subcontractor"],
  CATEGORY_COLORS: { Labor: "#3B82F6", Materials: "#F59E0B", Subcontractor: "#10B981" },
}));

import {
  buildBarChartData,
  buildCumulativeData,
  buildCategoryPieData,
  buildVarianceAlerts,
  buildCoAging,
  costStatusTone,
} from "../costControlCenter.derive";

// ─── Shared fixtures ────────────────────────────────────────────────────────

const CODE_A = {
  id: "cc-1",
  cost_code_number: "01-100",
  description: "Structural Steel",
  phase: "Labor",
  budget_amount: 100_000,
  actual_cost: 80_000,
  committed_cost: 90_000,
  forecast_to_complete: 15_000,
};
const CODE_B = {
  id: "cc-2",
  cost_code_number: "01-200",
  description: "Misc Metals",
  phase: "Materials",
  budget_amount: 50_000,
  actual_cost: 55_000,  // over budget
  committed_cost: 55_000,
  forecast_to_complete: 5_000,
};
const CODE_ZERO = {
  id: "cc-3",
  cost_code_number: "01-300",
  description: "Empty",
  phase: "Subcontractor",
  budget_amount: 0,
  actual_cost: 0,
  committed_cost: 0,
  forecast_to_complete: 0,
};
const codes = [CODE_A, CODE_B, CODE_ZERO];

// ─── buildBarChartData ───────────────────────────────────────────────────────

describe("buildBarChartData", () => {
  it("excludes codes with no budget, actual, or committed", () => {
    const result = buildBarChartData(codes);
    expect(result.map((d) => d.code)).not.toContain("01-300");
  });

  it("returns correct budget/actual/committed per code", () => {
    const result = buildBarChartData([CODE_A]);
    expect(result[0].budget).toBe(100_000);
    expect(result[0].actual).toBe(80_000);
    expect(result[0].committed).toBe(90_000);
  });

  it("computes variance as actual − budget", () => {
    const result = buildBarChartData([CODE_B]);
    expect(result[0].variance).toBe(5_000); // 55k - 50k
  });

  it("sorts by code ascending", () => {
    const result = buildBarChartData(codes);
    const codes_ = result.map((d) => d.code);
    expect(codes_).toEqual([...codes_].sort());
  });

  it("handles empty input", () => {
    expect(buildBarChartData([])).toEqual([]);
  });

  it("tolerates string numbers", () => {
    const result = buildBarChartData([{ ...CODE_A, budget_amount: "100000", actual_cost: "80000", committed_cost: "90000" }]);
    expect(result[0].budget).toBe(100_000);
  });
});

// ─── buildCumulativeData ─────────────────────────────────────────────────────

describe("buildCumulativeData", () => {
  it("returns a running sum sorted by budget descending", () => {
    const result = buildCumulativeData([CODE_A, CODE_B]);
    // CODE_A has bigger budget (100k > 50k), so it goes first
    expect(result[0].budget).toBe(100_000);
    expect(result[1].budget).toBe(150_000); // cumulative: 100k + 50k
  });

  it("cumulative actual accumulates correctly", () => {
    const result = buildCumulativeData([CODE_A, CODE_B]);
    expect(result[1].actual).toBe(80_000 + 55_000);
  });

  it("handles single code", () => {
    const result = buildCumulativeData([CODE_A]);
    expect(result).toHaveLength(1);
    expect(result[0].budget).toBe(100_000);
  });

  it("handles empty input", () => {
    expect(buildCumulativeData([])).toEqual([]);
  });
});

// ─── buildCategoryPieData ────────────────────────────────────────────────────

describe("buildCategoryPieData", () => {
  it("sums actual_cost by phase/category", () => {
    const result = buildCategoryPieData(codes);
    const labor = result.find((d) => d.name === "Labor");
    expect(labor?.value).toBe(80_000); // CODE_A.actual_cost
    const materials = result.find((d) => d.name === "Materials");
    expect(materials?.value).toBe(55_000); // CODE_B.actual_cost
  });

  it("excludes categories with zero actual", () => {
    // CODE_ZERO has phase Subcontractor with 0 actual
    const result = buildCategoryPieData(codes);
    expect(result.find((d) => d.name === "Subcontractor")).toBeUndefined();
  });

  it("handles empty input — all categories excluded", () => {
    expect(buildCategoryPieData([])).toEqual([]);
  });
});

// ─── buildVarianceAlerts ─────────────────────────────────────────────────────

describe("buildVarianceAlerts", () => {
  it("includes only over-budget codes", () => {
    const result = buildVarianceAlerts(codes, 0);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("01-200");
  });

  it("computes pctOver correctly", () => {
    const result = buildVarianceAlerts([CODE_B], 0);
    // (55000 - 50000) / 50000 * 100 = 10%
    expect(result[0].pctOver).toBeCloseTo(10);
  });

  it("sets exceedsContingency when variance > contingency", () => {
    const result = buildVarianceAlerts([CODE_B], 3_000); // variance=5k > 3k
    expect(result[0].exceedsContingency).toBe(true);
  });

  it("exceedsContingency is false when contingency=0", () => {
    const result = buildVarianceAlerts([CODE_B], 0);
    expect(result[0].exceedsContingency).toBe(false);
  });

  it("sorts by variance descending", () => {
    const CODE_C = { ...CODE_A, id: "cc-4", cost_code_number: "01-400", budget_amount: 10_000, actual_cost: 20_000 };
    const result = buildVarianceAlerts([CODE_B, CODE_C], 0);
    // CODE_C variance=10k > CODE_B variance=5k → CODE_C first
    expect(result[0].code).toBe("01-400");
  });

  it("returns empty array for no overages", () => {
    expect(buildVarianceAlerts([CODE_A], 0)).toEqual([]);
  });
});

// ─── buildCoAging ────────────────────────────────────────────────────────────

describe("buildCoAging", () => {
  const pastDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  it("marks COs open >30 days and not terminal as stale", () => {
    const co = { id: "co-1", co_number: "CO-001", title: "Test", status: "Submitted", co_amount: 5_000, submitted_date: pastDate(35) };
    const result = buildCoAging([co]);
    expect(result[0].isStale).toBe(true);
  });

  it("does NOT mark Approved CO as stale even if old", () => {
    const co = { id: "co-1", co_number: "CO-001", title: "Test", status: "Approved", co_amount: 5_000, submitted_date: pastDate(60) };
    const result = buildCoAging([co]);
    expect(result[0].isStale).toBe(false);
  });

  it("handles null submitted_date gracefully", () => {
    const co = { id: "co-1", co_number: "CO-001", title: "Test", status: "Submitted", co_amount: 0, submitted_date: null as string | null };
    const result = buildCoAging([co]);
    expect(result[0].daysOpen).toBeNull();
    expect(result[0].isStale).toBe(false);
  });

  it("sorts by daysOpen descending (oldest first)", () => {
    const recent = { id: "co-2", co_number: "CO-002", title: "T", status: "Submitted", co_amount: 0, submitted_date: pastDate(5) };
    const old_ = { id: "co-3", co_number: "CO-003", title: "T", status: "Submitted", co_amount: 0, submitted_date: pastDate(60) };
    const result = buildCoAging([recent, old_]);
    expect(result[0].id).toBe("co-3");
  });

  it("returns empty array for empty input", () => {
    expect(buildCoAging([])).toEqual([]);
  });
});

// ─── costStatusTone ──────────────────────────────────────────────────────────

describe("costStatusTone", () => {
  it("returns danger when is_over is true", () => {
    expect(costStatusTone({ is_over: true, used_pct: 110 })).toBe("danger");
  });

  it("returns warn when used_pct > 85", () => {
    expect(costStatusTone({ is_over: false, used_pct: 90 })).toBe("warn");
  });

  it("returns good when under 85%", () => {
    expect(costStatusTone({ is_over: false, used_pct: 50 })).toBe("good");
  });

  it("returns good for zero values", () => {
    expect(costStatusTone({ is_over: false, used_pct: 0 })).toBe("good");
  });

  it("returns good when fields are undefined", () => {
    expect(costStatusTone({})).toBe("good");
  });
});
