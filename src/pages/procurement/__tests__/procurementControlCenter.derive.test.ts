import { describe, it, expect } from "vitest";
import {
  daysUntil,
  isOverdue,
  isLate,
  computedShipDate,
  riskScore,
  vendorSummary,
  buildProcurementSummary,
} from "../procurementControlCenter.derive";
import type { ProcurementItem } from "../procurementControlCenter.derive";

/** Return an ISO date offset from today by `n` days. */
function isoOffset(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function item(overrides: Partial<ProcurementItem>): ProcurementItem {
  return { id: "test", status: "PO Issued", ...overrides };
}

// ─── daysUntil ─────────────────────────────────────────────────────────────

describe("daysUntil", () => {
  it("returns null for missing/invalid dates", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil("not-a-date")).toBeNull();
  });
  it("returns 0 for today, negative for past, positive for future", () => {
    expect(daysUntil(isoOffset(0))).toBe(0);
    expect(daysUntil(isoOffset(-5))).toBeLessThan(0);
    expect(daysUntil(isoOffset(7))).toBeGreaterThan(0);
  });
});

// ─── isOverdue ─────────────────────────────────────────────────────────────

describe("isOverdue", () => {
  it("is true when required_date is past and status is open", () => {
    expect(isOverdue(item({ required_date: isoOffset(-1), status: "PO Issued" }))).toBe(true);
  });
  it("is false when terminal (Received)", () => {
    expect(isOverdue(item({ required_date: isoOffset(-1), status: "Received" }))).toBe(false);
  });
  it("is false when terminal (Cancelled)", () => {
    expect(isOverdue(item({ required_date: isoOffset(-1), status: "Cancelled" }))).toBe(false);
  });
  it("is false when required_date is in the future", () => {
    expect(isOverdue(item({ required_date: isoOffset(3), status: "PO Issued" }))).toBe(false);
  });
  it("is false when required_date is absent", () => {
    expect(isOverdue(item({ required_date: null, status: "PO Issued" }))).toBe(false);
  });
});

// ─── isLate ────────────────────────────────────────────────────────────────

describe("isLate", () => {
  it("is true when expected_ship_date is after required_date", () => {
    const i = item({
      required_date: isoOffset(5),
      expected_ship_date: isoOffset(10),
      status: "In Production",
    });
    expect(isLate(i)).toBe(true);
  });
  it("is false when expected_ship_date is before required_date", () => {
    const i = item({
      required_date: isoOffset(10),
      expected_ship_date: isoOffset(5),
      status: "In Production",
    });
    expect(isLate(i)).toBe(false);
  });
  it("is false for terminal statuses", () => {
    const i = item({
      required_date: isoOffset(5),
      expected_ship_date: isoOffset(10),
      status: "Received",
    });
    expect(isLate(i)).toBe(false);
  });
});

// ─── computedShipDate ──────────────────────────────────────────────────────

describe("computedShipDate", () => {
  it("returns null when order_placed_date or lead_time_weeks is missing", () => {
    expect(computedShipDate(item({ order_placed_date: null, lead_time_weeks: 4 }))).toBeNull();
    expect(computedShipDate(item({ order_placed_date: "2026-01-01", lead_time_weeks: null }))).toBeNull();
  });
  it("adds lead_time_weeks * 7 days to order_placed_date", () => {
    const result = computedShipDate(item({ order_placed_date: "2026-01-01", lead_time_weeks: 2 }));
    expect(result).toBe("2026-01-15");
  });
});

// ─── riskScore ─────────────────────────────────────────────────────────────

describe("riskScore", () => {
  it("ranks an overdue item higher than a comfortable future item", () => {
    const hot = item({ required_date: isoOffset(-5), is_long_lead: true, status: "PO Issued" });
    const calm = item({ required_date: isoOffset(60), status: "Confirmed" });
    expect(riskScore(hot)).toBeGreaterThan(riskScore(calm));
  });
  it("adds weight for long-lead flag", () => {
    const base = item({ required_date: isoOffset(30), status: "Quoted" });
    const ll = item({ required_date: isoOffset(30), status: "Quoted", is_long_lead: true });
    expect(riskScore(ll)).toBeGreaterThan(riskScore(base));
  });
});

// ─── vendorSummary ─────────────────────────────────────────────────────────

describe("vendorSummary", () => {
  const items: ProcurementItem[] = [
    { id: "1", status: "PO Issued", vendor: "Nucor", required_date: isoOffset(-1) },
    { id: "2", status: "Quoted", vendor: "Nucor", required_date: isoOffset(30) },
    { id: "3", status: "PO Issued", vendor: "CMC", required_date: isoOffset(10) },
    { id: "4", status: "Received", vendor: "Nucor" },   // terminal — excluded from open count
    { id: "5", status: "PO Issued", vendor: null },     // no vendor → "Unassigned"
  ];

  it("groups open items by vendor and excludes terminal rows", () => {
    const rows = vendorSummary(items);
    const nucor = rows.find((r) => r.vendor === "Nucor");
    expect(nucor?.count).toBe(2);  // only the two open Nucor rows
  });

  it("counts overdue correctly", () => {
    const rows = vendorSummary(items);
    const nucor = rows.find((r) => r.vendor === "Nucor");
    expect(nucor?.overdueCount).toBe(1);
  });

  it("maps null vendor to 'Unassigned'", () => {
    const rows = vendorSummary(items);
    expect(rows.some((r) => r.vendor === "Unassigned")).toBe(true);
  });

  it("sorts by count desc", () => {
    const rows = vendorSummary(items);
    expect(rows[0].vendor).toBe("Nucor"); // most items
  });
});

// ─── buildProcurementSummary ───────────────────────────────────────────────

describe("buildProcurementSummary", () => {
  const today = isoOffset(0);
  const items: ProcurementItem[] = [
    // Open items
    { id: "1", status: "Identified",   vendor: "Nucor",  required_date: isoOffset(-3), is_long_lead: true, expected_ship_date: isoOffset(5), weight_tons: 10 },
    { id: "2", status: "PO Issued",    vendor: "CMC",    required_date: isoOffset(14), weight_tons: 5 },
    { id: "3", status: "In Production",vendor: "Nucor",  required_date: isoOffset(7),  is_long_lead: true, expected_ship_date: isoOffset(10), weight_tons: 8 },
    // Shipped (awaiting delivery)
    { id: "4", status: "Shipped",      vendor: "Metals Plus", required_date: isoOffset(2), weight_tons: 3 },
    // Terminal
    { id: "5", status: "Received",     vendor: "CMC",    weight_tons: 20 },
    { id: "6", status: "Cancelled",    vendor: "Other",  weight_tons: 1 },
  ];

  it("computes total, open, partiallyReceived correctly", () => {
    const s = buildProcurementSummary(items);
    expect(s.total).toBe(6);
    expect(s.open).toBe(4);          // Identified, PO Issued, In Production, Shipped
    expect(s.partiallyReceived).toBe(1); // just the Shipped row
  });

  it("counts overdue correctly", () => {
    const s = buildProcurementSummary(items);
    expect(s.overdue).toBe(1);   // item #1 required_date -3d, not terminal
  });

  it("counts long-lead and slipping correctly", () => {
    const s = buildProcurementSummary(items);
    expect(s.longLead).toBe(2);       // items 1 and 3
    // item 1: required_date -3d, expected_ship +5d → ship after need-by → slipping
    // item 3: required_date +7d, expected_ship +10d → ship after need-by → slipping
    expect(s.longLeadSlipping).toBe(2);
  });

  it("sums total weight across ALL items including terminal", () => {
    const s = buildProcurementSummary(items);
    expect(s.totalWeightTons).toBe(47); // 10+5+8+3+20+1
  });

  it("returns attentionQueue ordered hottest first", () => {
    const s = buildProcurementSummary(items);
    expect(s.attentionQueue.length).toBeGreaterThan(0);
    // overdue item should be first
    expect(s.attentionQueue[0].id).toBe("1");
  });

  it("returns awaitingDelivery as the Shipped items", () => {
    const s = buildProcurementSummary(items);
    expect(s.awaitingDelivery.length).toBe(1);
    expect(s.awaitingDelivery[0].id).toBe("4");
  });

  it("returns a vendorSummary array", () => {
    const s = buildProcurementSummary(items);
    expect(Array.isArray(s.vendorSummary)).toBe(true);
  });
});
