import { describe, expect, it } from "vitest";
import {
  safeNum,
  buildRedFlagAlerts,
  buildExpensesCsvString,
  EXPENSE_CSV_HEADERS,
} from "../utils";

describe("expenses utils", () => {
  it("safeNum and red flags", () => {
    expect(safeNum("12")).toBe(12);
    expect(safeNum("x")).toBe(0);
    const alerts = buildRedFlagAlerts({
      totalCommitted: 200,
      totalBudget: 100,
      topVendors: [{ vendor: "Acme", total: 100 }],
      activeExpenses: [],
      formatCurrencyShort: (n) => `$${n}`,
      now: new Date("2026-08-05T12:00:00Z"),
    });
    expect(alerts.some((a) => a.key === "budget-overrun")).toBe(true);
  });

  it("builds csv string with headers", () => {
    const csv = buildExpensesCsvString([
      { expense_number: "E-1", description: 'Say "hi"', amount: 10 },
    ]);
    expect(csv.split("\n")[0]).toContain(EXPENSE_CSV_HEADERS[0]);
    expect(csv).toContain("E-1");
  });
});
