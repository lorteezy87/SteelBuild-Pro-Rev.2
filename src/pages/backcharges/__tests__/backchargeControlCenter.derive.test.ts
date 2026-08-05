import { describe, it, expect } from "vitest";
import { vendorSummary, buildBackchargeSummary, filterBackcharges } from "../backchargeControlCenter.derive";
import type { Backcharge } from "../backchargeControlCenter.derive";

function bc(overrides: Partial<Backcharge> & { id: string; title: string; status: Backcharge["status"] }): Backcharge {
  return {
    project_id: "proj-1",
    amount: 0,
    is_deleted: false,
    notice_date: null,
    responsible_party: null,
    ...overrides,
  } as Backcharge;
}

const SAMPLE: Backcharge[] = [
  bc({ id: "1", title: "Cleanup after Acme", status: "pending",  amount: 12000, responsible_party: "Acme Erectors", notice_date: "2026-05-01" }),
  bc({ id: "2", title: "Rework of bolt pattern", status: "disputed", amount: 8500, responsible_party: "Acme Erectors" }),
  bc({ id: "3", title: "Delay damages",         status: "draft",    amount: 4000, responsible_party: "XYZ Steel" }),
  bc({ id: "4", title: "Material damage",        status: "collected", amount: 6000, responsible_party: "XYZ Steel", notice_date: "2026-03-10" }),
  bc({ id: "5", title: "GC cleanup",             status: "notice_sent", amount: 3500, responsible_party: null, notice_date: "2026-04-15" }),
  bc({ id: "6", title: "Deleted backcharge",      status: "void",   amount: 9999, is_deleted: true }),
];

describe("vendorSummary", () => {
  const rows = vendorSummary(SAMPLE);

  it("excludes soft-deleted rows", () => {
    expect(rows.every((r) => r.vendor !== "void-vendor")).toBe(true);
    // Total items across all vendor rows = 5 (SAMPLE has 6, 1 deleted)
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(5);
  });

  it("groups by responsible_party, falling back to 'Unknown'", () => {
    const acme = rows.find((r) => r.vendor === "Acme Erectors");
    expect(acme?.count).toBe(2);
    const unknown = rows.find((r) => r.vendor === "Unknown");
    expect(unknown).toBeDefined();
    expect(unknown?.count).toBe(1);
  });

  it("computes correct totalAmount per vendor", () => {
    const acme = rows.find((r) => r.vendor === "Acme Erectors")!;
    expect(acme.totalAmount).toBeCloseTo(20500);
  });

  it("computes openAmount from OPEN_BACKCHARGE_STATUSES only", () => {
    // Acme: "pending" (open) + "disputed" (open) → 12000 + 8500 = 20500
    const acme = rows.find((r) => r.vendor === "Acme Erectors")!;
    expect(acme.openAmount).toBeCloseTo(20500);
    // XYZ: "draft" (open) + "collected" (not open) → only 4000 open
    const xyz = rows.find((r) => r.vendor === "XYZ Steel")!;
    expect(xyz.openAmount).toBeCloseTo(4000);
  });

  it("sorts by totalAmount descending", () => {
    expect(rows[0].totalAmount).toBeGreaterThanOrEqual(rows[1].totalAmount);
  });
});

describe("buildBackchargeSummary", () => {
  const s = buildBackchargeSummary(SAMPLE);

  it("excludes deleted rows from all metrics", () => {
    expect(s.total).toBe(5); // 6 in SAMPLE, 1 deleted
  });

  it("counts open (OPEN statuses) correctly", () => {
    // pending, disputed, draft, notice_sent are OPEN → 4 of 5
    expect(s.open).toBe(4);
  });

  it("sums openAmount from OPEN statuses only", () => {
    // pending 12000 + disputed 8500 + draft 4000 + notice_sent 3500 = 28000
    expect(s.openAmount).toBeCloseTo(28000);
  });

  it("sums totalAmount of all live backcharges", () => {
    // 12000 + 8500 + 4000 + 6000 + 3500 = 34000
    expect(s.totalAmount).toBeCloseTo(34000);
  });

  it("reports collected (recovered) amount", () => {
    expect(s.recoveredAmount).toBeCloseTo(6000);
    expect(s.collected).toBeCloseTo(6000);
  });

  it("counts disputed backcharges", () => {
    expect(s.disputed).toBe(1); // only "2" has status "disputed"
  });

  it("counts defense-ready (has notice_date)", () => {
    // id 1, 4, 5 have notice_date → 3
    expect(s.defenseReady).toBe(3);
    expect(s.noticeRate).toBe(60); // 3/5 = 60%
  });

  it("openTone is 'warn' for > $0 open exposure", () => {
    expect(["warn", "danger"]).toContain(s.openTone);
  });

  it("openQueue contains the highest-amount open items first", () => {
    expect(s.openQueue.length).toBeGreaterThan(0);
    for (let i = 0; i < s.openQueue.length - 1; i++) {
      expect(Number(s.openQueue[i].amount)).toBeGreaterThanOrEqual(Number(s.openQueue[i + 1].amount));
    }
  });

  it("disputedQueue includes only disputed items", () => {
    expect(s.disputedQueue.every((d) => d.status === "disputed")).toBe(true);
  });

  it("byVendor groups match vendorSummary output", () => {
    expect(s.byVendor.length).toBeGreaterThan(0);
    const acme = s.byVendor.find((r) => r.vendor === "Acme Erectors");
    expect(acme).toBeDefined();
  });

  it("returns zero KPIs gracefully on empty input", () => {
    const empty = buildBackchargeSummary([]);
    expect(empty.total).toBe(0);
    expect(empty.open).toBe(0);
    expect(empty.openAmount).toBe(0);
    expect(empty.noticeRate).toBe(0);
    expect(empty.openTone).toBe("neutral");
    expect(empty.openQueue).toHaveLength(0);
    expect(empty.disputedQueue).toHaveLength(0);
    expect(empty.byVendor).toHaveLength(0);
  });
});

describe("filterBackcharges", () => {
  it("treats open as every canonical open status", () => {
    const filtered = filterBackcharges(SAMPLE, "", "open");
    expect(filtered.map((b) => b.status)).toEqual(["pending", "disputed", "draft", "notice_sent"]);
  });

  it("keeps all statuses for all and exact matching for other filters", () => {
    expect(filterBackcharges(SAMPLE, "", "all")).toHaveLength(SAMPLE.length);
    expect(filterBackcharges(SAMPLE, "", "collected").map((b) => b.id)).toEqual(["4"]);
  });
});
