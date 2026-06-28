/**
 * Tests for the Pay Applications Control Center derive module.
 *
 * Key invariant: ALL money assertions must use integer-safe comparisons.
 * money.ts stores and returns dollars-as-float, but accumulates via integer cents
 * to avoid drift. Never compare raw floating-point sums here.
 *
 * The $1.005 rounding case (line 7 retainage) is intentionally NOT tested here —
 * that belongs in src/lib/payapp/__tests__/g702.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  buildPayAppSummary,
  buildPayAppPanelQueues,
  payAppStatusTone,
  fmtPeriod,
} from "../payApplicationsControlCenter.derive";
import type { PayApplication } from "@/lib/payapp/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeApp(overrides: Partial<PayApplication> & { id: string }): PayApplication {
  return {
    project_id: "proj-1",
    application_number: 1,
    status: "draft",
    retainage_percent: 10,
    original_contract_sum: 100000,
    net_change_orders: 0,
    total_completed_stored: 0,
    total_retainage: 0,
    less_previous_certificates: 0,
    current_payment_due: 0,
    is_deleted: false,
    ...overrides,
  };
}

const APP_DRAFT = makeApp({ id: "a1", application_number: 1, status: "draft", current_payment_due: 0, total_completed_stored: 0, total_retainage: 0 });
const APP_SUBMITTED = makeApp({ id: "a2", application_number: 2, status: "submitted", current_payment_due: 10000, total_completed_stored: 11111.11, total_retainage: 1111.11 });
const APP_APPROVED  = makeApp({ id: "a3", application_number: 3, status: "approved",  current_payment_due: 18000, total_completed_stored: 20000, total_retainage: 2000 });
const APP_PAID      = makeApp({ id: "a4", application_number: 4, status: "paid",      current_payment_due: 22500, total_completed_stored: 25000, total_retainage: 2500 });
const APP_VOID      = makeApp({ id: "a5", application_number: 5, status: "void",      current_payment_due: 5000,  total_completed_stored: 5000,  total_retainage: 500 });

// ---------------------------------------------------------------------------
// buildPayAppSummary — KPIs
// ---------------------------------------------------------------------------

describe("buildPayAppSummary", () => {
  it("returns zeros for an empty list", () => {
    const s = buildPayAppSummary([]);
    expect(s.total).toBe(0);
    expect(s.pendingPaymentDue).toBe(0);
    expect(s.totalPaid).toBe(0);
    expect(s.retainageHeld).toBe(0);
    expect(s.balanceToFinish).toBe(0);
    expect(s.percentComplete).toBe(0);
    expect(s.latestApp).toBeNull();
  });

  it("counts only non-deleted apps in total", () => {
    const deleted = makeApp({ id: "del", status: "draft", is_deleted: true });
    const s = buildPayAppSummary([APP_DRAFT, deleted]);
    expect(s.total).toBe(1);
  });

  it("pending payment sums submitted + approved current_payment_due via cents", () => {
    const s = buildPayAppSummary([APP_SUBMITTED, APP_APPROVED, APP_PAID]);
    // 10000 + 18000 = 28000 — integer cents safe
    expect(s.pendingPaymentDue).toBe(28000);
  });

  it("totalPaid sums only paid app current_payment_due", () => {
    const s = buildPayAppSummary([APP_SUBMITTED, APP_APPROVED, APP_PAID]);
    expect(s.totalPaid).toBe(22500);
  });

  it("retainageHeld excludes void apps", () => {
    const s = buildPayAppSummary([APP_PAID, APP_VOID]);
    // only APP_PAID.total_retainage = 2500; void excluded
    expect(s.retainageHeld).toBe(2500);
  });

  it("latestApp is the highest application_number non-void app", () => {
    const s = buildPayAppSummary([APP_DRAFT, APP_PAID, APP_VOID]);
    // void is excluded, APP_PAID (#4) > APP_DRAFT (#1)
    expect(s.latestApp?.id).toBe("a4");
  });

  it("percentComplete uses total_completed_stored / (original + net_COs)", () => {
    // APP_PAID: completed=25000, contract=100000, COs=0 → 25%
    const s = buildPayAppSummary([APP_PAID]);
    expect(s.percentComplete).toBe(25);
  });

  it("balanceToFinish = contract_sum − (completed − retainage)", () => {
    // APP_PAID: contract=100000, COs=0
    // earned_less_ret = 25000 − 2500 = 22500
    // balance = 100000 − 22500 = 77500
    const s = buildPayAppSummary([APP_PAID]);
    expect(s.balanceToFinish).toBe(77500);
  });

  it("handles fractional cents gracefully via sumMoney (no drift)", () => {
    // 3 apps each with 0.01 retainage → sum must equal 0.03 exactly
    const apps = [1, 2, 3].map((n) =>
      makeApp({ id: `f${n}`, application_number: n, status: "approved", total_retainage: 0.01, current_payment_due: 0, total_completed_stored: 0 }),
    );
    const s = buildPayAppSummary(apps);
    // sumMoney accumulates via integer cents: 1+1+1=3 cents → 0.03
    expect(s.retainageHeld).toBe(0.03);
  });

  it("status counts are accurate", () => {
    const all = [APP_DRAFT, APP_SUBMITTED, APP_APPROVED, APP_PAID, APP_VOID];
    const s = buildPayAppSummary(all);
    expect(s.draftCount).toBe(1);
    expect(s.submittedCount).toBe(1);
    expect(s.approvedCount).toBe(1);
    expect(s.paidCount).toBe(1);
    expect(s.voidCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildPayAppPanelQueues — panel content
// ---------------------------------------------------------------------------

describe("buildPayAppPanelQueues", () => {
  const all = [APP_DRAFT, APP_SUBMITTED, APP_APPROVED, APP_PAID, APP_VOID];

  it("awaitingAction includes submitted + approved only", () => {
    const q = buildPayAppPanelQueues(all);
    const ids = q.awaitingAction.map((a) => a.id);
    expect(ids).toContain("a2"); // submitted
    expect(ids).toContain("a3"); // approved
    expect(ids).not.toContain("a1"); // draft
    expect(ids).not.toContain("a4"); // paid
    expect(ids).not.toContain("a5"); // void
  });

  it("byStatus only includes statuses that have apps", () => {
    // only one draft, one submitted, etc.
    const q = buildPayAppPanelQueues(all);
    const statuses = q.byStatus.map((b) => b.status);
    expect(statuses).toContain("draft");
    expect(statuses).toContain("submitted");
    expect(statuses.length).toBe(5); // all 5 statuses have 1 app each
  });

  it("byStatus total uses sumMoney for pending payment due", () => {
    const q = buildPayAppPanelQueues([APP_SUBMITTED, APP_APPROVED]);
    const subRow = q.byStatus.find((b) => b.status === "submitted");
    expect(subRow?.total).toBe(10000);
  });

  it("recent returns up to 5 apps sorted desc by application_number", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      makeApp({ id: `r${i}`, application_number: i + 1, status: "paid", current_payment_due: 1000, total_completed_stored: 1000, total_retainage: 100 }),
    );
    const q = buildPayAppPanelQueues(many);
    expect(q.recent.length).toBe(5);
    expect(q.recent[0].application_number).toBe(7);
    expect(q.recent[4].application_number).toBe(3);
  });

  it("excludes deleted apps from all queues", () => {
    const deleted = makeApp({ id: "del", status: "submitted", is_deleted: true, current_payment_due: 99999 });
    const q = buildPayAppPanelQueues([deleted, APP_SUBMITTED]);
    expect(q.awaitingAction.every((a) => a.id !== "del")).toBe(true);
    expect(q.recent.every((a) => a.id !== "del")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// payAppStatusTone
// ---------------------------------------------------------------------------

describe("payAppStatusTone", () => {
  it("maps each status to the correct tone", () => {
    expect(payAppStatusTone("paid")).toBe("good");
    expect(payAppStatusTone("approved")).toBe("good");
    expect(payAppStatusTone("submitted")).toBe("info");
    expect(payAppStatusTone("draft")).toBe("neutral");
    expect(payAppStatusTone("void")).toBe("danger");
    expect(payAppStatusTone(null)).toBe("neutral");
    expect(payAppStatusTone(undefined)).toBe("neutral");
    expect(payAppStatusTone("unknown")).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// fmtPeriod
// ---------------------------------------------------------------------------

describe("fmtPeriod", () => {
  it("returns — when both dates are null", () => {
    expect(fmtPeriod(makeApp({ id: "x", period_from: null, period_to: null }))).toBe("—");
  });

  it("returns through-only when period_from is missing", () => {
    expect(fmtPeriod(makeApp({ id: "x", period_from: null, period_to: "2026-06-30" }))).toBe("through 2026-06-30");
  });

  it("returns from–to when both are present", () => {
    expect(fmtPeriod(makeApp({ id: "x", period_from: "2026-06-01", period_to: "2026-06-30" }))).toBe("2026-06-01 – 2026-06-30");
  });
});
