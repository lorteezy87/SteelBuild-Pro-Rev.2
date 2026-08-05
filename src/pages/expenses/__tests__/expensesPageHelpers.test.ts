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

import { filterVisibleAlerts, nextDismissedAlertKeys } from "../expensesPageHelpers";

describe("expense alert dismiss helpers", () => {
  it("filters dismissed and appends keys", () => {
    const alerts = [{ key: "a" }, { key: "b" }, { key: "c" }];
    expect(filterVisibleAlerts(alerts, ["b"]).map((a) => a.key)).toEqual(["a", "c"]);
    expect(nextDismissedAlertKeys(["a"], "b")).toEqual(["a", "b"]);
    expect(nextDismissedAlertKeys(["a"], "a")).toEqual(["a"]);
  });
});

import {
  buildBurndownSeries,
  burndownColor,
  buildMonthlySpendTrend,
} from "../expensesPageHelpers";

describe("expense chart series", () => {
  it("builds burndown remaining series", () => {
    const points = buildBurndownSeries(
      [
        { expense_date: "2026-01-02", amount: 100, payment_status: "Paid" },
        { expense_date: "2026-01-01", amount: 50, payment_status: "Paid" },
        { expense_date: "2026-01-03", amount: 999, payment_status: "Voided" },
      ],
      200,
    );
    expect(points[0]).toEqual({ x: 0, y: 200 });
    expect(points[1]).toEqual({ x: 1, y: 150 }); // Jan 1 first
    expect(points[2]).toEqual({ x: 2, y: 50 });
    expect(buildBurndownSeries([], 100)).toEqual([]);
    expect(burndownColor(5, 100)).toBe("var(--status-error)");
    expect(burndownColor(15, 100)).toBe("var(--status-warning)");
    expect(burndownColor(50, 100)).toBe("var(--status-success)");
  });

  it("builds 6-month spend trend", () => {
    const now = new Date(2026, 5, 15); // June 2026
    const months = buildMonthlySpendTrend(
      [
        { expense_date: "2026-06-01", amount: 10, payment_status: "Paid" },
        { expense_date: "2026-05-01", amount: 20, payment_status: "Paid" },
        { expense_date: "2026-05-02", amount: 5, payment_status: "Voided" },
      ],
      now,
    );
    expect(months).toHaveLength(6);
    expect(months[months.length - 1].key).toBe("2026-06");
    expect(months[months.length - 1].total).toBe(10);
    expect(months[months.length - 2].total).toBe(20);
  });
});
