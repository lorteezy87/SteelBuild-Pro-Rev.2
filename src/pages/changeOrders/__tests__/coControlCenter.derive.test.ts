import { describe, it, expect } from "vitest";
import {
  coStatusTone,
  buildCoSummary,
} from "../coControlCenter.derive";
import type { CoRecord } from "../coControlCenter.derive";

// Helpers
function makeCo(overrides: Partial<CoRecord>): CoRecord {
  return {
    id: Math.random().toString(36).slice(2),
    co_number: "CO #001",
    title: "Test CO",
    status: "Draft",
    co_amount: 0,
    schedule_impact_days: 0,
    submitted_date: null,
    approved_date: null,
    approved_by: null,
    source_rfi_id: null,
    ...overrides,
  };
}

// ISO date offset from today
function isoOffset(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ─── coStatusTone ─────────────────────────────────────────────────────────────

describe("coStatusTone", () => {
  it("maps each status to the correct tone", () => {
    expect(coStatusTone("Draft")).toBe("neutral");
    expect(coStatusTone("Submitted")).toBe("info");
    expect(coStatusTone("Under Review")).toBe("warn");
    expect(coStatusTone("Approved")).toBe("good");
    expect(coStatusTone("Rejected")).toBe("danger");
    expect(coStatusTone("Void")).toBe("neutral");
  });
  it("returns neutral for null / undefined / unknown values", () => {
    expect(coStatusTone(null)).toBe("neutral");
    expect(coStatusTone(undefined)).toBe("neutral");
    expect(coStatusTone("SomethingNew")).toBe("neutral");
  });
});

// ─── buildCoSummary — counts ──────────────────────────────────────────────────

describe("buildCoSummary — counts", () => {
  const cos: CoRecord[] = [
    makeCo({ status: "Draft",        co_amount: 10_000 }),
    makeCo({ status: "Draft",        co_amount: 5_000  }),
    makeCo({ status: "Submitted",    co_amount: 20_000, submitted_date: isoOffset(-5), source_rfi_id: "rfi-1" }),
    makeCo({ status: "Under Review", co_amount: 30_000, submitted_date: isoOffset(-3), source_rfi_id: "rfi-2", schedule_impact_days: 10 }),
    makeCo({ status: "Approved",     co_amount: 50_000, schedule_impact_days: 5 }),
    makeCo({ status: "Rejected",     co_amount: 8_000  }),
    makeCo({ status: "Void",         co_amount: 2_000  }),
  ];

  it("reports total, approved, pending, draft counts", () => {
    const s = buildCoSummary(cos);
    expect(s.total).toBe(7);
    expect(s.approved).toBe(1);
    expect(s.pending).toBe(2);  // Submitted + Under Review
    expect(s.draft).toBe(2);
  });

  it("sums totalApproved and totalPending correctly", () => {
    const s = buildCoSummary(cos);
    expect(s.totalApproved).toBe(50_000);
    expect(s.totalPending).toBe(50_000); // 20k + 30k
  });

  it("computes atRiskValue as totalPending + total draft amounts", () => {
    const s = buildCoSummary(cos);
    // totalPending = 50k, totalDraft = 15k
    expect(s.atRiskValue).toBe(65_000);
  });

  it("sums scheduleDays over non-terminal COs only", () => {
    const s = buildCoSummary(cos);
    // Under Review = 10d, Draft #1 = 0, Draft #2 = 0, Submitted = 0 → 10
    // Approved (terminal) and Rejected/Void (terminal) are excluded
    expect(s.scheduleDays).toBe(10);
  });

  it("counts rfiLinked as COs with a source_rfi_id", () => {
    const s = buildCoSummary(cos);
    expect(s.rfiLinked).toBe(2);
  });
});

// ─── buildCoSummary — queues ──────────────────────────────────────────────────

describe("buildCoSummary — workQueue", () => {
  it("contains only Submitted+Under Review, oldest first, max 6", () => {
    const cos: CoRecord[] = Array.from({ length: 8 }, (_, i) =>
      makeCo({
        id: String(i),
        status: i % 2 === 0 ? "Submitted" : "Under Review",
        submitted_date: isoOffset(-(10 - i)), // older index = older date
        co_amount: 1_000 * (i + 1),
      })
    );
    const s = buildCoSummary(cos);
    expect(s.workQueue.length).toBe(6);
    // First item should be the one with the earliest submitted_date
    const dates = s.workQueue.map((c) => c.submitted_date || "");
    expect(dates).toEqual([...dates].sort());
  });

  it("is empty when there are no pending COs", () => {
    const cos = [makeCo({ status: "Draft" }), makeCo({ status: "Approved" })];
    expect(buildCoSummary(cos).workQueue.length).toBe(0);
  });
});

describe("buildCoSummary — decisionQueue", () => {
  it("prefers Under Review over Submitted", () => {
    const cos: CoRecord[] = [
      makeCo({ status: "Submitted",    submitted_date: isoOffset(-10), co_amount: 1_000 }),
      makeCo({ status: "Under Review", submitted_date: isoOffset(-5),  co_amount: 2_000 }),
    ];
    const s = buildCoSummary(cos);
    expect(s.decisionQueue.every((c) => c.status === "Under Review")).toBe(true);
  });

  it("falls back to Submitted when no Under Review COs exist", () => {
    const cos: CoRecord[] = [
      makeCo({ status: "Submitted", submitted_date: isoOffset(-10), co_amount: 1_000 }),
      makeCo({ status: "Submitted", submitted_date: isoOffset(-2),  co_amount: 2_000 }),
    ];
    const s = buildCoSummary(cos);
    expect(s.decisionQueue.every((c) => c.status === "Submitted")).toBe(true);
  });

  it("caps at 5 items", () => {
    const cos: CoRecord[] = Array.from({ length: 10 }, (_, i) =>
      makeCo({ id: String(i), status: "Under Review", submitted_date: isoOffset(-i), co_amount: 1_000 })
    );
    expect(buildCoSummary(cos).decisionQueue.length).toBe(5);
  });
});

describe("buildCoSummary — riskQueue", () => {
  it("excludes Rejected and Void COs", () => {
    const cos: CoRecord[] = [
      makeCo({ status: "Draft",    co_amount: 100_000, schedule_impact_days: 100 }),
      makeCo({ status: "Rejected", co_amount: 999_000, schedule_impact_days: 999 }),
      makeCo({ status: "Void",     co_amount: 999_000, schedule_impact_days: 999 }),
    ];
    const s = buildCoSummary(cos);
    expect(s.riskQueue.every((c) => c.status !== "Rejected" && c.status !== "Void")).toBe(true);
  });

  it("sorts hottest (highest absolute amount × 0.001 + schedule×50) first", () => {
    const low  = makeCo({ id: "low",  status: "Draft", co_amount: 1_000,   schedule_impact_days: 0 });
    const high = makeCo({ id: "high", status: "Submitted", co_amount: 500_000, schedule_impact_days: 20 });
    const s = buildCoSummary([low, high]);
    expect(s.riskQueue[0].id).toBe("high");
  });

  it("caps at 5 items", () => {
    const cos: CoRecord[] = Array.from({ length: 10 }, (_, i) =>
      makeCo({ id: String(i), status: "Submitted", co_amount: 10_000 * (i + 1) })
    );
    expect(buildCoSummary(cos).riskQueue.length).toBe(5);
  });

  it("handles deducts (negative co_amount) by absolute value in risk score", () => {
    const credit  = makeCo({ id: "credit",  status: "Draft", co_amount: -200_000 });
    const addon   = makeCo({ id: "addon",   status: "Draft", co_amount:   10_000 });
    const s = buildCoSummary([addon, credit]);
    // Large deduct has higher absolute risk score
    expect(s.riskQueue[0].id).toBe("credit");
  });
});

// ─── edge cases ───────────────────────────────────────────────────────────────

describe("buildCoSummary — edge cases", () => {
  it("handles an empty list without throwing", () => {
    const s = buildCoSummary([]);
    expect(s.total).toBe(0);
    expect(s.totalApproved).toBe(0);
    expect(s.atRiskValue).toBe(0);
    expect(s.workQueue).toEqual([]);
    expect(s.decisionQueue).toEqual([]);
    expect(s.riskQueue).toEqual([]);
  });

  it("treats null co_amount as 0", () => {
    const cos = [makeCo({ status: "Approved", co_amount: null })];
    expect(buildCoSummary(cos).totalApproved).toBe(0);
  });

  it("treats null schedule_impact_days as 0", () => {
    const cos = [makeCo({ status: "Draft", schedule_impact_days: null })];
    expect(buildCoSummary(cos).scheduleDays).toBe(0);
  });
});
