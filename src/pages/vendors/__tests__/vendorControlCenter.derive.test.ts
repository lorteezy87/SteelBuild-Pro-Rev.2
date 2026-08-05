import { describe, it, expect } from "vitest";
import {
  vendorStatusTone,
  daysUntilExpiry,
  buildVendorSummary,
} from "../vendorControlCenter.derive";
import type { VendorRecord, VendorStatsMap } from "../vendorControlCenter.derive";

/** Build an ISO date string `offsetDays` from today (local midnight basis). */
function isoOffset(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ─── vendorStatusTone ────────────────────────────────────────────────────────

describe("vendorStatusTone", () => {
  it("maps Active → good", () => expect(vendorStatusTone("Active")).toBe("good"));
  it("maps Probation → warn", () => expect(vendorStatusTone("Probation")).toBe("warn"));
  it("maps Suspended → danger", () => expect(vendorStatusTone("Suspended")).toBe("danger"));
  it("maps Inactive → neutral", () => expect(vendorStatusTone("Inactive")).toBe("neutral"));
  it("maps null/undefined → neutral", () => {
    expect(vendorStatusTone(null)).toBe("neutral");
    expect(vendorStatusTone(undefined)).toBe("neutral");
  });
});

// ─── daysUntilExpiry ─────────────────────────────────────────────────────────

describe("daysUntilExpiry", () => {
  it("returns null for missing or invalid dates", () => {
    expect(daysUntilExpiry(null)).toBeNull();
    expect(daysUntilExpiry(undefined)).toBeNull();
    expect(daysUntilExpiry("not-a-date")).toBeNull();
  });
  it("is negative in the past, 0 today, positive in the future", () => {
    expect(daysUntilExpiry(isoOffset(-5))).toBeLessThan(0);
    expect(daysUntilExpiry(isoOffset(0))).toBe(0);
    expect(daysUntilExpiry(isoOffset(10))).toBeGreaterThan(0);
  });
});

// ─── buildVendorSummary ───────────────────────────────────────────────────────

const TODAY = isoOffset(0);
const EXPIRED = isoOffset(-5);
const EXPIRING_SOON = isoOffset(15);
const FINE = isoOffset(90);

const vendors: VendorRecord[] = [
  { id: "1", company_name: "Alpha Steel",    status: "Active",    is_preferred: true,  insurance_expiry: EXPIRED,        certifications_expiry: FINE },
  { id: "2", company_name: "Beta Fab",       status: "Active",    is_preferred: false, insurance_expiry: FINE,           certifications_expiry: EXPIRING_SOON },
  { id: "3", company_name: "Gamma Erect",    status: "Probation", is_preferred: false, insurance_expiry: FINE,           certifications_expiry: FINE },
  { id: "4", company_name: "Delta Coat",     status: "Inactive",  is_preferred: false, insurance_expiry: FINE,           certifications_expiry: FINE },
  { id: "5", company_name: "Epsilon Supply", status: "Suspended", is_preferred: false, insurance_expiry: FINE,           certifications_expiry: FINE },
];

const vendorStats: VendorStatsMap = {
  "Alpha Steel":    { totalSpend: 50_000, onTimeRate: 90, deliveryCount: 10 },
  "Beta Fab":       { totalSpend: 20_000, onTimeRate: 60, deliveryCount: 5  }, // < 70 → atRisk
  "Gamma Erect":    { totalSpend: 80_000, onTimeRate: 75, deliveryCount: 8  }, // Probation → atRisk
  "Delta Coat":     { totalSpend: 5_000,  onTimeRate: 95, deliveryCount: 3  },
  "Epsilon Supply": { totalSpend: 0,      onTimeRate: null, deliveryCount: 0 },
};

describe("buildVendorSummary", () => {
  const s = buildVendorSummary(vendors, vendorStats);

  it("reports correct totals", () => {
    expect(s.total).toBe(5);
    expect(s.active).toBe(2);       // Active status only
    expect(s.preferred).toBe(1);    // Alpha Steel
  });

  it("flags atRisk correctly (Probation/Suspended + expired + onTimeRate<70)", () => {
    // Alpha Steel: expired insurance → atRisk
    // Beta Fab: onTimeRate 60 < 70 → atRisk
    // Gamma Erect: Probation → atRisk
    // Epsilon Supply: Suspended → atRisk
    expect(s.atRisk).toBe(4);
  });

  it("counts expiringSoon (0..30d, not already expired)", () => {
    // Alpha Steel: insurance EXPIRED (not soon) | Beta Fab: cert EXPIRING_SOON → included
    expect(s.expiringSoon).toBe(1); // only Beta Fab has a cert expiring soon (not expired)
  });

  it("computes totalSpend as sum of all stats", () => {
    expect(s.totalSpend).toBe(155_000);
  });

  it("computes avgOnTime as mean of non-null rates", () => {
    // Rates: 90, 60, 75, 95 (null excluded) → (90+60+75+95)/4 = 320/4 = 80
    expect(s.avgOnTime).toBe(80);
  });

  it("builds complianceQueue sorted by earliest expiry asc (most urgent first)", () => {
    // Alpha Steel: insurance expired (-5d) → should be first
    // Beta Fab: cert expiring in 15d → second
    expect(s.complianceQueue.length).toBeGreaterThanOrEqual(2);
    expect(s.complianceQueue[0].company_name).toBe("Alpha Steel");
    expect(s.complianceQueue[1].company_name).toBe("Beta Fab");
  });

  it("builds watchlist from onTimeRate<80 OR Probation, sorted by rate asc", () => {
    // Beta Fab: rate 60 (worst), Gamma Erect: Probation (rate 75), also rate<80
    const names = s.watchlist.map((v) => v.company_name);
    expect(names).toContain("Beta Fab");
    expect(names).toContain("Gamma Erect");
    // worst rate should be first
    expect(s.watchlist[0].company_name).toBe("Beta Fab");
  });

  it("builds topSpenders as up to 5 vendors by spend desc", () => {
    expect(s.topSpenders.length).toBeLessThanOrEqual(5);
    // Gamma Erect has highest spend (80K)
    expect(s.topSpenders[0].company_name).toBe("Gamma Erect");
  });

  it("handles an empty vendor list gracefully", () => {
    const empty = buildVendorSummary([], {});
    expect(empty.total).toBe(0);
    expect(empty.avgOnTime).toBeNull();
    expect(empty.totalSpend).toBe(0);
    expect(empty.complianceQueue).toHaveLength(0);
    expect(empty.watchlist).toHaveLength(0);
    expect(empty.topSpenders).toHaveLength(0);
  });

  it("handles vendors with no stats entry gracefully", () => {
    const partial = buildVendorSummary(
      [{ id: "x", company_name: "NoStats", status: "Active" }],
      {},
    );
    expect(partial.total).toBe(1);
    expect(partial.atRisk).toBe(0);
    expect(partial.totalSpend).toBe(0);
  });
});
