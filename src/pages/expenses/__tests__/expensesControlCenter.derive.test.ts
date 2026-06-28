/**
 * Tests for expensesControlCenter.derive.ts
 * Pure logic — no DOM, no network.
 */
import { describe, it, expect } from "vitest";
import {
  buildExpensesSummary,
  expenseStatusTone,
  type ExpenseRecord,
} from "../expensesControlCenter.derive";

// ── Fixtures ──────────────────────────────────────────────────────────────
const NOW_MONTH = new Date().toISOString().slice(0, 7); // "YYYY-MM"
function thisMonth(day = "05"): string { return `${NOW_MONTH}-${day}`; }

const PAID_100: ExpenseRecord = {
  id: "1",
  amount: 100,
  payment_status: "Paid",
  expense_date: "2024-01-10",
  vendor: "Acme Steel",
  cost_code: "01-100",
  cost_code_name: "Structural Steel",
};

const UNPAID_200: ExpenseRecord = {
  id: "2",
  amount: 200,
  payment_status: "Unpaid",
  expense_date: "2024-02-01",
  vendor: "Bolts Inc",
  cost_code: "01-200",
  cost_code_name: "Bolts",
};

const PENDING_50: ExpenseRecord = {
  id: "3",
  amount: 50,
  payment_status: "Pending Approval",
  expense_date: thisMonth(),
  vendor: "Acme Steel",
  cost_code: "01-100",
  cost_code_name: "Structural Steel",
};

const VOIDED_999: ExpenseRecord = {
  id: "4",
  amount: 999,
  payment_status: "Voided",
  expense_date: thisMonth(),
  vendor: "VoidCo",
  cost_code: "01-300",
  cost_code_name: "Misc",
};

const THIS_MONTH_PAID: ExpenseRecord = {
  id: "5",
  amount: 75,
  payment_status: "Paid",
  expense_date: thisMonth("10"),
  vendor: "FastFab",
  cost_code: "01-100",
  cost_code_name: "Structural Steel",
};

// ── Tests ─────────────────────────────────────────────────────────────────
describe("buildExpensesSummary", () => {
  it("returns zero summary for empty array", () => {
    const s = buildExpensesSummary([]);
    expect(s.totalCount).toBe(0);
    expect(s.totalAmount).toBe(0);
    expect(s.paidAmount).toBe(0);
    expect(s.outstandingAmount).toBe(0);
    expect(s.approvalQueue).toHaveLength(0);
    expect(s.byCategory).toHaveLength(0);
    expect(s.byVendor).toHaveLength(0);
  });

  it("excludes Voided expenses from all monetary totals", () => {
    const s = buildExpensesSummary([VOIDED_999, PAID_100]);
    expect(s.totalCount).toBe(1);
    expect(s.totalAmount).toBe(100);
  });

  it("sums paid amount correctly", () => {
    const s = buildExpensesSummary([PAID_100, THIS_MONTH_PAID, UNPAID_200]);
    expect(s.paidAmount).toBe(175);
    expect(s.paidCount).toBe(2);
  });

  it("sums outstanding (Unpaid + Pending) correctly", () => {
    const s = buildExpensesSummary([PAID_100, UNPAID_200, PENDING_50]);
    expect(s.outstandingAmount).toBe(250);
    expect(s.outstandingCount).toBe(2);
  });

  it("counts this-month expenses correctly", () => {
    const s = buildExpensesSummary([PAID_100, THIS_MONTH_PAID, PENDING_50, VOIDED_999]);
    // VOIDED_999 is this month but voided → excluded from active → excluded from thisMonth
    // THIS_MONTH_PAID + PENDING_50 are both this month and non-voided
    expect(s.thisMonthCount).toBe(2);
    expect(s.thisMonthAmount).toBe(125);
  });

  it("approval queue contains only Pending Approval, sorted oldest first", () => {
    const older: ExpenseRecord = { ...PENDING_50, id: "older", expense_date: "2023-01-01" };
    const newer: ExpenseRecord = { ...PENDING_50, id: "newer", expense_date: "2024-06-01" };
    const s = buildExpensesSummary([newer, older, PAID_100]);
    expect(s.approvalQueue.map((r) => r.id)).toEqual(["older", "newer"]);
  });

  it("byCategory groups by cost_code_name, descending by amount", () => {
    const s = buildExpensesSummary([PAID_100, PENDING_50, UNPAID_200]);
    // Structural Steel (100+50=150), Bolts (200)
    expect(s.byCategory[0].category).toBe("Bolts");
    expect(s.byCategory[0].amount).toBe(200);
    expect(s.byCategory[1].category).toBe("Structural Steel");
    expect(s.byCategory[1].amount).toBe(150);
  });

  it("byVendor groups by vendor, descending by amount", () => {
    const s = buildExpensesSummary([PAID_100, PENDING_50, UNPAID_200]);
    // Acme Steel: 150, Bolts Inc: 200
    expect(s.byVendor[0].vendor).toBe("Bolts Inc");
    expect(s.byVendor[0].amount).toBe(200);
    expect(s.byVendor[1].vendor).toBe("Acme Steel");
    expect(s.byVendor[1].amount).toBe(150);
  });

  it("avoids float drift when summing many amounts", () => {
    // 0.1 × 3 = 0.30000000000000004 in naive float addition
    const rows: ExpenseRecord[] = Array.from({ length: 3 }, (_, i) => ({
      id: String(i),
      amount: 0.1,
      payment_status: "Paid",
      expense_date: "2024-01-01",
    }));
    const s = buildExpensesSummary(rows);
    expect(s.totalAmount).toBe(0.3);
  });

  it("handles null amounts gracefully", () => {
    const row: ExpenseRecord = { id: "x", amount: null, payment_status: "Unpaid", expense_date: "2024-01-01" };
    const s = buildExpensesSummary([row]);
    expect(s.totalAmount).toBe(0);
    expect(s.outstandingAmount).toBe(0);
  });
});

describe("expenseStatusTone", () => {
  it("maps known statuses to correct tones", () => {
    expect(expenseStatusTone("Paid")).toBe("good");
    expect(expenseStatusTone("Pending Approval")).toBe("warn");
    expect(expenseStatusTone("Unpaid")).toBe("danger");
    expect(expenseStatusTone("Voided")).toBe("neutral");
    expect(expenseStatusTone(null)).toBe("neutral");
    expect(expenseStatusTone(undefined)).toBe("neutral");
    expect(expenseStatusTone("Unknown")).toBe("neutral");
  });
});
