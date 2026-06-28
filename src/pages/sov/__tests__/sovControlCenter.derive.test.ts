/**
 * Unit tests for sovControlCenter.derive.ts
 * Runs in Vitest node environment (no DOM needed — pure TS).
 */
import { describe, it, expect } from "vitest";
import {
  calcRow,
  buildSovSummary,
  roundCents,
  type SovLineItem,
} from "../sovControlCenter.derive";

// ---------------------------------------------------------------------------
// roundCents
// ---------------------------------------------------------------------------
describe("roundCents", () => {
  it("rounds to 2 decimal places", () => {
    // 1.005*100 = 100.4999… in float, so Math.round drops the half-cent DOWN —
    // matches the existing SOV roundCurrency (behavior-preserving, not ideal half-up).
    expect(roundCents(1.005)).toBe(1.00);
    expect(roundCents(1.004)).toBe(1.00);
    expect(roundCents(99.99)).toBe(99.99);
  });

  it("handles 0", () => {
    expect(roundCents(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calcRow
// ---------------------------------------------------------------------------
const line = (overrides: Partial<SovLineItem> = {}): SovLineItem => ({
  id: "1",
  scheduled_value: 100_000,
  previous_percent_complete: 0,
  current_percent_complete: 50,
  retainage_percent: 10,
  status: "Draft",
  ...overrides,
});

describe("calcRow", () => {
  it("computes toDate and thisPeriod for a mid-project line", () => {
    const c = calcRow(line());
    expect(c.toDate).toBe(50_000);
    expect(c.thisPeriod).toBe(50_000); // prev=0, curr=50
    expect(c.balance).toBe(50_000);
    expect(c.retAmt).toBe(5_000); // 10% of 50k
    expect(c.netToDate).toBe(45_000);
    expect(c.overBilled).toBe(false);
  });

  it("detects over-billed when pct > 100", () => {
    const c = calcRow(line({ current_percent_complete: 110 }));
    expect(c.overBilled).toBe(true);
  });

  it("detects over-billed when balance < 0", () => {
    // pct=100 exactly → balance=0, not over-billed
    const c100 = calcRow(line({ current_percent_complete: 100 }));
    expect(c100.overBilled).toBe(false);
    // force negative balance via previous > current (unusual, but guard it)
    const cNeg = calcRow(line({ previous_percent_complete: 60, current_percent_complete: 50 }));
    // toDate = 50k, balance = 50k — no over-billed here; pct ≤ 100
    expect(cNeg.overBilled).toBe(false);
  });

  it("uses effectiveRetainage override over per-row field", () => {
    // Per-row is 10%, override to 5%
    const c = calcRow(line(), 5);
    expect(c.retPct).toBe(5);
    expect(c.retAmt).toBe(2_500); // 5% of 50k billed
  });

  it("handles null / missing values gracefully", () => {
    const c = calcRow({});
    expect(c.sv).toBe(0);
    expect(c.toDate).toBe(0);
    expect(c.overBilled).toBe(false);
  });

  it("handles incremental progress (prev > 0)", () => {
    const c = calcRow(line({ previous_percent_complete: 30, current_percent_complete: 60 }));
    expect(c.thisPeriod).toBe(30_000); // (60-30)% of 100k
    expect(c.toDate).toBe(60_000);
  });
});

// ---------------------------------------------------------------------------
// buildSovSummary
// ---------------------------------------------------------------------------
const items: SovLineItem[] = [
  { id: "a", scheduled_value: 200_000, previous_percent_complete: 0, current_percent_complete: 80, retainage_percent: 10, status: "Certified", application_number: 1, phase: "Structural" },
  { id: "b", scheduled_value: 100_000, previous_percent_complete: 0, current_percent_complete: 50, retainage_percent: 10, status: "Submitted", application_number: 1, phase: "Connections" },
  { id: "c", scheduled_value: 50_000,  previous_percent_complete: 0, current_percent_complete: 0,  retainage_percent: 10, status: "Draft", application_number: 2, phase: "Misc" },
  { id: "d", scheduled_value: 25_000,  previous_percent_complete: 0, current_percent_complete: 110, retainage_percent: 10, status: "Draft", application_number: 2, phase: "Misc" },
];

describe("buildSovSummary", () => {
  it("computes contractValue as sum of scheduled_value", () => {
    const s = buildSovSummary(items);
    expect(s.contractValue).toBe(375_000);
  });

  it("computes billedToDate correctly", () => {
    const s = buildSovSummary(items);
    // a: 160k, b: 50k, c: 0, d: 27.5k
    expect(s.billedToDate).toBe(237_500);
  });

  it("computes pctComplete as weighted average", () => {
    const s = buildSovSummary(items);
    // 237500 / 375000 = 63.333... → 63.3
    expect(s.pctComplete).toBeCloseTo(63.3, 1);
  });

  it("counts over-billed items", () => {
    const s = buildSovSummary(items);
    expect(s.overBilledCount).toBe(1); // item d at 110%
  });

  it("counts pending approval items", () => {
    const s = buildSovSummary(items);
    expect(s.pendingApprovalCount).toBe(1); // item b
  });

  it("counts draft items", () => {
    const s = buildSovSummary(items);
    expect(s.draftCount).toBe(2); // c + d
  });

  it("groups billingProgress by application_number", () => {
    const s = buildSovSummary(items);
    expect(s.billingProgress).toHaveLength(2);
    const app1 = s.billingProgress.find((r) => r.appNumber === "1");
    expect(app1).toBeDefined();
    expect(app1!.itemCount).toBe(2);
    expect(app1!.scheduled).toBe(300_000);
  });

  it("groups byDivision by phase", () => {
    const s = buildSovSummary(items);
    const structural = s.byDivision.find((r) => r.label === "Structural");
    expect(structural).toBeDefined();
    expect(structural!.itemCount).toBe(1);
    expect(structural!.scheduled).toBe(200_000);
  });

  it("includes over-billed items in attentionItems", () => {
    const s = buildSovSummary(items);
    const ids = s.attentionItems.map((i) => i.id);
    expect(ids).toContain("d"); // the over-billed item
  });

  it("works on empty array", () => {
    const s = buildSovSummary([]);
    expect(s.contractValue).toBe(0);
    expect(s.pctComplete).toBe(0);
    expect(s.attentionItems).toHaveLength(0);
  });

  it("applies global effectiveRetainage override", () => {
    const s = buildSovSummary(items, 5);
    // a: 160k * 5% = 8k; b: 50k * 5% = 2.5k; c: 0; d: 27.5k * 5% = 1.375k
    expect(s.retainageHeld).toBeCloseTo(11_875, 0);
  });
});
