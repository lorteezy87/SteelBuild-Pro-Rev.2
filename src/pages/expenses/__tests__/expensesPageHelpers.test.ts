import { describe, expect, it } from "vitest";
import {
  filterActiveExpenses,
  computeExpenseKpis,
  remainingTone,
  matchesDateRange,
  filterExpenses,
  pruneSelectedIds,
  computeSpendByCostCode,
  computeStatusBreakdown,
  computeTopVendors,
  nextKpiFilterState,
  toggleSelectedId,
  toggleSelectAllIds,
} from "../expensesPageHelpers";

describe("expensesPageHelpers", () => {
  const expenses = [
    { id: "1", amount: 100, payment_status: "Paid", expense_date: "2026-06-15", description: "Bolts", vendor: "Acme", cost_code: "01", expense_type: "Material" },
    { id: "2", amount: 50, payment_status: "Unpaid", expense_date: "2026-06-20", description: "Crane", vendor: "LiftCo", cost_code: "02", expense_type: "Equipment" },
    { id: "3", amount: 25, payment_status: "Voided", expense_date: "2026-05-01", description: "Void", vendor: "Acme", cost_code: "01", expense_type: "Material" },
  ];

  it("filters active expenses and kpis", () => {
    const active = filterActiveExpenses(expenses);
    expect(active).toHaveLength(2);
    const kpis = computeExpenseKpis(active, 200);
    expect(kpis.totalCommitted).toBe(150);
    expect(kpis.totalPaid).toBe(100);
    expect(kpis.paidCount).toBe(1);
    expect(kpis.totalOutstanding).toBe(50);
    expect(kpis.pctUsed).toBe(75);
    expect(remainingTone(-1, 50)).toBe("var(--status-error)");
    expect(remainingTone(10, 95)).toBe("var(--status-warning)");
    expect(remainingTone(50, 50)).toBe("var(--status-success)");
  });

  it("matches date ranges and filters lists", () => {
    const now = new Date("2026-06-25T12:00:00");
    expect(matchesDateRange("2026-06-10", "this_month", now)).toBe(true);
    expect(matchesDateRange("2026-05-10", "this_month", now)).toBe(false);
    expect(matchesDateRange("2026-06-20", "last_30", now)).toBe(true);

    const filtered = filterExpenses(expenses, {
      debouncedSearch: "crane",
      costCodeFilter: "all",
      typeFilter: "all",
      statusFilter: "all",
      wpFilter: "all",
      dateRangeFilter: "all",
      now,
    });
    expect(filtered.map((e) => e.id)).toEqual(["2"]);

    const outstanding = filterExpenses(expenses, {
      debouncedSearch: "",
      costCodeFilter: "all",
      typeFilter: "all",
      statusFilter: "_outstanding",
      wpFilter: "all",
      dateRangeFilter: "all",
      now,
    });
    expect(outstanding.map((e) => e.id)).toEqual(["2"]);
  });

  it("computes spend/status/vendor and selection helpers", () => {
    const active = filterActiveExpenses(expenses);
    expect(computeSpendByCostCode(active, [{ code: "01", name: "A" }, { code: "02", name: "B" }])[0].code).toBe("01");
    expect(computeStatusBreakdown(expenses).find((s) => s.status === "Paid")?.count).toBe(1);
    expect(computeTopVendors(active)[0].vendor).toBe("Acme");
    expect(pruneSelectedIds(["1", "9"], new Set(["1"]))).toEqual(["1"]);
    expect(nextKpiFilterState("paid", "paid")).toEqual({ activeKPI: null, statusFilter: "all" });
    expect(nextKpiFilterState(null, "outstanding").statusFilter).toBe("_outstanding");
    expect(toggleSelectedId(["1"], "2")).toEqual(["1", "2"]);
    expect(toggleSelectAllIds(["1"], ["1", "2"])).toEqual(["1", "2"]);
    expect(toggleSelectAllIds(["1", "2"], ["1", "2"])).toEqual([]);
  });
});
