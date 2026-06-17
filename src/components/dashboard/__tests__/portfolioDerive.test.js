import { describe, it, expect } from "vitest";
import {
  computeCoExposure, computeTotalTons, computeFabricatedTonnage,
  computeDeliveriesStats, computeRfiTurnaround,
} from "../portfolioDerive";

describe("computeCoExposure", () => {
  it("buckets COs and sums exposure (pending + disputed), excluding Void", () => {
    const e = computeCoExposure([
      { status: "Approved", co_amount: 1000 },
      { status: "Submitted", co_amount: 500 },          // pending
      { status: "Under Review", co_amount: 0 },          // unpriced
      { status: "Rejected", co_amount: 300 },            // disputed
      { status: "Void", co_amount: 9999 },               // excluded
      { status: "Rejected", co_amount: 0 },              // not disputed (0)
    ]);
    expect(e.approved.amount).toBe(1000);
    expect(e.pending.amount).toBe(500);
    expect(e.unpriced.items).toHaveLength(1);
    expect(e.disputed.amount).toBe(300);
    expect(e.totalExposure).toBe(800); // 500 + 300
  });

  it("honors the legacy cost_impact_amount field and handles empty input", () => {
    expect(computeCoExposure([{ status: "Submitted", cost_impact_amount: 250 }]).pending.amount).toBe(250);
    expect(computeCoExposure().totalExposure).toBe(0);
  });
});

describe("tonnage roll-ups", () => {
  const wps = [
    { phase: "Detailing", status: "In Progress", tonnage: 10 },   // pre-fab → excluded from fabricated
    { phase: "Fabrication", status: "In Progress", tonnage: 20 }, // counted
    { phase: "Delivery", status: "Complete", tonnage: 30 },       // counted
    { phase: "Erection", status: "Not Started", tonnage: 40 },    // wrong status → excluded
  ];
  it("computeTotalTons sums all tonnage", () => {
    expect(computeTotalTons(wps)).toBe(100);
    expect(computeTotalTons()).toBe(0);
  });
  it("computeFabricatedTonnage counts fab-and-beyond that's in progress/complete", () => {
    expect(computeFabricatedTonnage(wps)).toBe(50); // 20 + 30
  });
});

describe("computeDeliveriesStats", () => {
  const iso = (d) => d.toISOString().slice(0, 10);
  const past = new Date(); past.setDate(past.getDate() - 5);
  const future = new Date(); future.setDate(future.getDate() + 5);

  it("counts scheduled/in-transit/late and finds the next upcoming", () => {
    const s = computeDeliveriesStats([
      { status: "Scheduled", scheduled_date: iso(future) },
      { status: "In Transit", scheduled_date: iso(past) },
      { status: "Scheduled", scheduled_date: iso(past) },     // late (past, not delivered)
      { status: "Delivered", scheduled_date: iso(past) },     // not late
    ]);
    expect(s.scheduled).toBe(2);
    expect(s.inTransit).toBe(1);
    // isLate counts ANY non-delivered past delivery → both the past In-Transit and past Scheduled.
    expect(s.late).toBe(2);
    expect(s.lateList).toHaveLength(2);
    expect(s.lateList[0].daysLate).toBeGreaterThan(0); // exact value is tz-sensitive; just confirm it's late
    expect(s.nextDelivery?.scheduled_date).toBe(iso(future));
  });

  it("handles empty input", () => {
    const s = computeDeliveriesStats();
    expect(s).toEqual({ scheduled: 0, inTransit: 0, late: 0, lateList: [], nextDelivery: null });
  });
});

describe("computeRfiTurnaround", () => {
  it("averages submitted→responded days for closed RFIs (1 decimal)", () => {
    const r = computeRfiTurnaround([
      { status: "Answered", submitted_date: "2026-06-01", responded_date: "2026-06-05" }, // 4d
      { status: "Closed", submitted_date: "2026-06-01", responded_date: "2026-06-07" },   // 6d
      { status: "Open", submitted_date: "2026-06-01", responded_date: "2026-06-20" },     // ignored (open)
    ]);
    expect(r).toBe("5.0"); // (4 + 6) / 2
  });
  it("returns null when there are no closed RFIs", () => {
    expect(computeRfiTurnaround([{ status: "Open" }])).toBeNull();
    expect(computeRfiTurnaround()).toBeNull();
  });
});
