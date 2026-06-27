import { describe, it, expect } from "vitest";
import { daysUntil, riskScore, ballInCourtSummary, buildRfiSummary } from "../rfiControlCenter.derive";
import { daysOpen } from "../utils";

// Build an ISO date (YYYY-MM-DD) `offsetDays` from today (UTC midnight basis).
function isoOffset(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe("daysUntil", () => {
  it("returns null for missing/invalid dates", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil("not-a-date")).toBeNull();
  });
  it("is negative in the past, ~0 today, positive in the future", () => {
    expect(daysUntil(isoOffset(-3))).toBeLessThan(0);
    expect(daysUntil(isoOffset(0))).toBe(0);
    expect(daysUntil(isoOffset(5))).toBeGreaterThan(0);
  });
});

describe("riskScore", () => {
  it("ranks an overdue critical RFI above a fresh low-priority one", () => {
    const hot = { status: "Open", priority: "Critical", submitted_date: isoOffset(-30), date_required: isoOffset(-5) };
    const calm = { status: "Open", priority: "Low", submitted_date: isoOffset(-1), date_required: isoOffset(20) };
    expect(riskScore(hot)).toBeGreaterThan(riskScore(calm));
  });
  it("adds weight for incomplete-response status", () => {
    const base = { status: "Open", priority: "Medium", submitted_date: isoOffset(-2), date_required: isoOffset(10) };
    const incomplete = { ...base, status: "Incomplete Response" };
    expect(riskScore(incomplete)).toBeGreaterThan(riskScore(base));
  });
});

describe("ballInCourtSummary", () => {
  const rfis = [
    { id: "1", rfi_number: "RFI #001", status: "Open", ball_in_court: "Engineer", submitted_date: isoOffset(-10) },
    { id: "2", rfi_number: "RFI #002", status: "Open", ball_in_court: "Engineer", submitted_date: isoOffset(-4) },
    { id: "3", rfi_number: "RFI #003", status: "Open", ball_in_court: "GC", submitted_date: isoOffset(-6) },
    { id: "4", rfi_number: "RFI #004", status: "Closed", ball_in_court: "GC", submitted_date: isoOffset(-99) },
    { id: "5", rfi_number: "RFI #005", status: "Open", ball_in_court: null, submitted_date: isoOffset(-1) },
  ];
  it("groups OPEN rfis by company, counts, and finds the oldest number", () => {
    const rows = ballInCourtSummary(rfis);
    const eng = rows.find((r) => r.company === "Engineer");
    expect(eng?.count).toBe(2);
    expect(eng?.oldestNumber).toBe("RFI #001"); // older submitted_date
    const gc = rows.find((r) => r.company === "GC");
    expect(gc?.count).toBe(1); // the Closed one is excluded
  });
  it("buckets a null ball_in_court under 'Contractor' and sorts by count desc", () => {
    const rows = ballInCourtSummary(rfis);
    expect(rows[0].company).toBe("Engineer"); // highest count first
    expect(rows.some((r) => r.company === "Contractor")).toBe(true);
  });
  it("reports a finite, non-negative average age", () => {
    const rows = ballInCourtSummary(rfis);
    for (const r of rows) {
      expect(Number.isFinite(r.avgAgeDays)).toBe(true);
      expect(r.avgAgeDays).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("buildRfiSummary", () => {
  const rfis = [
    { id: "1", status: "Open", priority: "Critical", submitted_date: isoOffset(-10), date_required: isoOffset(-2), cost_impact: true, cost_impact_amount: 5000 },
    { id: "2", status: "Under Review", priority: "Medium", submitted_date: isoOffset(-5), date_required: isoOffset(2), schedule_impact: true, schedule_impact_days: 3 },
    { id: "3", status: "Incomplete Response", priority: "High", submitted_date: isoOffset(-8), date_required: isoOffset(20) },
    { id: "4", status: "Answered", priority: "Low", submitted_date: isoOffset(-20), date_answered: isoOffset(-1) },
    { id: "5", status: "Closed", priority: "Low", submitted_date: isoOffset(-30), date_answered: isoOffset(-2) },
  ];
  it("computes the KPI counts from real fields", () => {
    const s = buildRfiSummary(rfis);
    expect(s.total).toBe(5);
    expect(s.needAction).toBe(3); // Open + Under Review + Incomplete Response
    expect(s.overdue).toBe(1); // #1 only (not closed, date_required in past)
    expect(s.incomplete).toBe(1);
    expect(s.critical).toBe(1);
    expect(s.dueSoon).toBe(1); // #2 due in 2d
    expect(s.responseRate).toBe(40); // 2 of 5 answered/closed
    expect(s.costExposure).toBe(5000);
    expect(s.scheduleExposure).toBe(3);
  });
  it("returns a riskQueue and workQueue of open RFIs, hottest first", () => {
    const s = buildRfiSummary(rfis);
    expect(s.riskQueue.length).toBeGreaterThan(0);
    expect(s.riskQueue[0].id).toBe("1"); // overdue critical is hottest
    expect(s.workQueue.length).toBeGreaterThan(0);
    expect(s.ballInCourt).toBeInstanceOf(Array);
  });
});
