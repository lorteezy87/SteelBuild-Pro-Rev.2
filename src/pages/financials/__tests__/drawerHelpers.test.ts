import { describe, expect, it } from "vitest";
import {
  compareDrawerRows,
  sortDrawerRows,
  nextDrawerSort,
  partitionChangeOrders,
  enrichBillingRows,
  buildCompletedPaymentCycles,
} from "../drawerHelpers";

describe("drawer sort helpers", () => {
  it("prefers numeric compare and flips with nextDrawerSort", () => {
    const rows = [{ n: 2, name: "b" }, { n: 10, name: "a" }, { n: 1, name: "c" }];
    expect(sortDrawerRows(rows, "n", "asc").map((r) => r.n)).toEqual([1, 2, 10]);
    expect(sortDrawerRows(rows, "name", "asc").map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(nextDrawerSort("n", "asc", "n")).toEqual({ sortCol: "n", sortDir: "desc" });
    expect(nextDrawerSort("n", "asc", "name")).toEqual({ sortCol: "name", sortDir: "desc" });
    expect(compareDrawerRows({ n: 1 }, { n: 2 }, "n", "asc")).toBeLessThan(0);
  });
});

describe("partitionChangeOrders", () => {
  it("splits approved vs pending review", () => {
    const { approved, pending } = partitionChangeOrders([
      { status: "Approved" },
      { status: "Submitted" },
      { status: "Under Review" },
      { status: "Draft" },
    ]);
    expect(approved).toHaveLength(1);
    expect(pending).toHaveLength(2);
  });
});

describe("enrichBillingRows / completed cycles", () => {
  const safeNumber = (v: unknown) => Number(v) || 0;
  const periodDisplay = (a: unknown, b: unknown) => `${a || ""}-${b || ""}`;

  it("computes billed and dtp encodings", () => {
    const now = new Date("2026-06-20T12:00:00Z").getTime();
    const rows = enrichBillingRows(
      [
        {
          scheduled_value: 1000,
          current_percent_complete: 50,
          submitted_date: "2026-06-10",
          payment_received_date: "2026-06-15",
          period_from: "2026-05-01",
          period_to: "2026-05-31",
        },
        {
          scheduled_value: 200,
          current_percent_complete: 100,
          submitted_date: "2026-06-01",
          period_from: null,
          period_to: null,
        },
      ],
      { nowMs: now, safeNumber, periodDisplay },
    );
    expect(rows[0]._billedToDate).toBe(500);
    expect(rows[0]._daysToPayment).toBe(5);
    expect(rows[1]._daysToPayment).toBeLessThan(0);
    expect(rows[0]._period).toBe("2026-05-01-2026-05-31");
  });

  it("builds completed payment cycles", () => {
    const cycles = buildCompletedPaymentCycles(
      [
        { submitted_date: "2026-01-01", payment_received_date: "2026-01-11", scheduled_value: 50 },
        { submitted_date: "2026-01-01", scheduled_value: 50 },
      ],
      safeNumber,
    );
    expect(cycles).toHaveLength(1);
    expect(cycles[0]._daysToPayment).toBe(10);
    expect(cycles[0]._scheduled).toBe(50);
  });
});
