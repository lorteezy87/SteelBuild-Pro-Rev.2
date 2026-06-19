import { describe, it, expect } from "vitest";
import {
  computeCoExposure, computeTotalTons, computeFabricatedTonnage,
  computeDeliveriesStats, computeRfiTurnaround,
  computeDataIssues, computeFinancials, computeProductionData,
  computeProjectMap, computeProjectMetrics, enrichProjectMetrics, computeBudgetChartData,
  computePortfolioKPIs, computePccData,
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

describe("computeDataIssues", () => {
  it("flags per-project gaps and portfolio-wide RFI/CO gaps", () => {
    const issues = computeDataIssues(
      [
        { id: "p1", name: "A", hasBudgetData: false, original_contract_value: 100, phase: "Detailing" }, // budget gap
        { id: "p2", name: "B", hasBudgetData: true, original_contract_value: 0, phase: null },           // contract + phase gaps
      ],
      [{ status: "Open", due_date: null }],                  // RFI missing due date
      [{ status: "Submitted", co_amount: 0 }],               // CO missing value
    );
    expect(issues.some((i) => i.issue === "No budget / cost codes set up" && i.projectId === "p1")).toBe(true);
    expect(issues.some((i) => i.issue === "Missing contract value" && i.projectId === "p2")).toBe(true);
    expect(issues.some((i) => i.issue === "No phase assigned" && i.projectId === "p2")).toBe(true);
    expect(issues.some((i) => i.issue === "RFIs missing due dates")).toBe(true);
    expect(issues.some((i) => i.issue === "COs missing dollar values")).toBe(true);
  });
  it("clean data yields no issues; handles empty input", () => {
    expect(computeDataIssues([{ id: "p", name: "P", hasBudgetData: true, original_contract_value: 1, phase: "Detailing" }], [], [])).toEqual([]);
    expect(computeDataIssues()).toEqual([]);
  });
});

describe("computeFinancials", () => {
  it("buckets the CO pipeline and computes remaining + margin at risk", () => {
    const f = computeFinancials(
      [
        { status: "Approved", co_amount: 1000 },
        { status: "Submitted", co_amount: 400 },
        { status: "Under Review", co_amount: 100 },
        { status: "Rejected", co_amount: 50 },
      ],
      { totalBudget: 10000, totalSpend: 6000 },
    );
    expect(f.approvedCOs).toBe(1);
    expect(f.pendingCOs).toBe(2);
    expect(f.pendingValue).toBe(500);
    expect(f.remaining).toBe(4000);
    expect(f.marginAtRisk).toBe(500); // pending 500, no overspend
  });
  it("adds overspend to margin at risk", () => {
    const f = computeFinancials([{ status: "Submitted", co_amount: 200 }], { totalBudget: 1000, totalSpend: 1300 });
    expect(f.marginAtRisk).toBe(500); // 200 pending + 300 overspend
  });
});

describe("computeProductionData", () => {
  it("computes fab % and erection-ready, and lists constraints", () => {
    const out = computeProductionData(
      [{ id: "p1", name: "A", overdueRFIs: 0, lateDeliveries: 0 }],
      [
        { project_id: "p1", phase: "Fabrication", status: "Complete", tonnage: 60 },
        { project_id: "p1", phase: "Detailing", status: "In Progress", tonnage: 40 }, // pre-fab → not fab tonnage
      ],
    );
    expect(out[0].totalTon).toBe(100);
    expect(out[0].fabTon).toBe(60);
    expect(out[0].fabPct).toBe(60);
    expect(out[0].erectionReady).toBe(true);
    expect(out[0].constraints).toEqual([]);
  });
  it("surfaces on-hold / overdue-RFI / late-delivery constraints and blocks erection-ready", () => {
    const out = computeProductionData(
      [{ id: "p1", name: "A", overdueRFIs: 2, lateDeliveries: 1 }],
      [{ project_id: "p1", phase: "Fabrication", status: "On Hold", tonnage: 10 }],
    );
    expect(out[0].onHoldCount).toBe(1);
    expect(out[0].erectionReady).toBe(false);
    expect(out[0].constraints).toEqual(["1 WP on hold", "2 overdue RFIs blocking scope", "1 late delivery — material gap"]);
  });
});

describe("computeProjectMap", () => {
  it("maps id → name (falls back to project_name)", () => {
    expect(computeProjectMap([{ id: "a", name: "Alpha" }, { id: "b", project_name: "Beta" }])).toEqual({ a: "Alpha", b: "Beta" });
    expect(computeProjectMap()).toEqual({});
  });
});

describe("computeProjectMetrics", () => {
  it("rolls up budget/actual/RFIs/CO/margin per project", () => {
    const m = computeProjectMetrics(
      [{ id: "p1", name: "P1", original_contract_value: 100000, health_status: "On Track" }],
      [{ project_id: "p1", status: "Open" }, { project_id: "p1", status: "Answered" }], // 1 open
      [{ project_id: "p1", status: "Submitted", co_amount: 5000 }],                     // pending CO
      [{ project_id: "p1", budget_amount: 60000 }],
      [{ project_id: "p1", percent_complete: 50, tonnage: 10, status: "In Progress" }],
      [],
      [{ project_id: "p1", payment_status: "Paid", amount: 20000 }],
    )[0];
    expect(m.budget).toBe(60000);
    expect(m.actual).toBe(20000);
    expect(m.openRFIs).toBe(1);
    expect(m.pendingCOValue).toBe(5000);
    expect(m.tonnage).toBe(10);
    // estimatedCost = max(60000, 20000+5000) = 60000 → margin = 100000 - 60000
    expect(m.estimatedCostAtCompletion).toBe(60000);
    expect(m.projectedMargin).toBe(40000);
  });
  it("handles empty input", () => {
    expect(computeProjectMetrics()).toEqual([]);
  });
});

describe("enrichProjectMetrics", () => {
  it("adds weighted-health fields", () => {
    const out = enrichProjectMetrics([{ id: "p1", name: "P1", health_status: "On Track" }]);
    expect(out[0]).toHaveProperty("healthScore");
    expect(out[0]).toHaveProperty("autoHealth");
    expect(out[0]).toHaveProperty("effectiveHealth");
  });

  it("a STALE PSR snapshot does not drag effectiveHealth down — live auto-health wins (ASM Garage)", () => {
    // Clean live metrics → auto-health "On Track"; the manual column "At Risk" is a
    // long-stale PSR snapshot still matching the column (driftRisk) → demoted.
    const [p] = enrichProjectMetrics([{
      id: "asm", name: "ASM Garage", health_status: "At Risk",
      overdueRFIs: 0, openRFIs: 0, lateDeliveries: 0, stalledWPs: 0, pendingCOs: [],
      metadata: { psr: { last_imported_at: "2020-01-01T00:00:00Z", latest: { proposed_health_status: "At Risk" } } },
    }]);
    expect(p.autoHealth).toBe("On Track");
    expect(p.psrProvenance.driftRisk).toBe(true);
    expect(p.effectiveHealth).toBe("On Track"); // NOT "At Risk" — stale snapshot demoted
  });

  it("keeps the conservative worst-of when the manual health is NOT a stale snapshot", () => {
    // Same clean live metrics + manual "At Risk" but no PSR snapshot → driftRisk
    // false → worst-of("On Track" auto, "At Risk" manual) = "At Risk".
    const [p] = enrichProjectMetrics([{
      id: "x", name: "Manual At Risk", health_status: "At Risk",
      overdueRFIs: 0, openRFIs: 0, lateDeliveries: 0, stalledWPs: 0, pendingCOs: [],
    }]);
    expect(p.autoHealth).toBe("On Track");
    expect(p.psrProvenance.driftRisk).toBe(false);
    expect(p.effectiveHealth).toBe("At Risk");
  });
});

describe("computePortfolioKPIs", () => {
  it("rolls up value/budget/spend/counts and forecast", () => {
    const k = computePortfolioKPIs(
      [{ original_contract_value: 100000 }],
      [{ status: "Open", due_date: null }],
      [{ status: "Approved", co_amount: 5000 }, { status: "Submitted", co_amount: 2000 }],
      [{ budget_amount: 50000 }],
      [{ status: "In Progress" }],
      [{ payment_status: "Paid", amount: 30000 }],
      [],
      [{ effectiveHealth: "At Risk", estimatedCostAtCompletion: 60000 }],
    );
    expect(k.portfolioValue).toBe(105000); // contract + approved CO
    expect(k.totalBudget).toBe(50000);
    expect(k.totalSpend).toBe(30000);
    expect(k.openRFIs).toBe(1);
    expect(k.pendingCOs).toBe(1);
    expect(k.activeWPs).toBe(1);
    expect(k.atRisk).toBe(1);
    expect(k.pendingCOValue).toBe(2000);
    expect(k.forecastAtCompletion).toBe(60000);
    expect(k.forecastVariance).toBe(10000); // FAC - budget
  });
  it("handles empty input", () => {
    const k = computePortfolioKPIs();
    expect(k.portfolioValue).toBe(0);
    expect(k.atRisk).toBe(0);
    expect(k.staleRFIs30).toEqual([]);
  });
});

describe("computePccData", () => {
  const pastIso = (() => { const d = new Date(); d.setDate(d.getDate() - 10); return d.toISOString().slice(0, 10); })();
  it("ranks priorities, lists waiting-on, builds the risk watch", () => {
    const out = computePccData(
      [{ rfi_number: "RFI-1", title: "Q", status: "Open", due_date: pastIso, project_id: "p1" }],
      [],
      [{ delivery_id: "D1", status: "In Transit", scheduled_date: pastIso, project_id: "p1" }],
      [],
      { p1: "Project One" },
      [{ id: "p1", name: "Project One", effectiveHealth: "At Risk", healthScore: 40, healthReasons: ["Low margin"] }],
    );
    expect(out.priorities.some((x) => x.type === "RFI" && x.id === "RFI-1")).toBe(true);
    expect(out.waitingOn.some((x) => x.type === "RFI")).toBe(true);  // open RFI
    expect(out.waitingOn.some((x) => x.type === "DEL")).toBe(true);  // in-transit delivery
    expect(out.riskWatch[0]).toMatchObject({ projectId: "p1", status: "At Risk", topReason: "Low margin" });
  });
  it("handles empty input", () => {
    expect(computePccData()).toEqual({ priorities: [], waitingOn: [], riskWatch: [] });
  });
});

describe("computeBudgetChartData", () => {
  it("flags not-started / accounting-delayed / over-budget and caps at 8 rows", () => {
    const rows = computeBudgetChartData([
      { project_number: "A", name: "Alpha", avgProgress: 0, actual: 0, budget: 100 },
      { project_number: "B", name: "Beta", avgProgress: 40, actual: 0, budget: 100 },
      { project_number: "C", name: "Gamma", avgProgress: 50, actual: 150, budget: 100 },
    ]);
    expect(rows[0].notStarted).toBe(true);
    expect(rows[1].accountingDelayed).toBe(true);
    expect(rows[2].overBudget).toBe(true);
    const many = Array.from({ length: 12 }, (_, i) => ({ project_number: `P${i}`, avgProgress: 0, actual: 0, budget: 0 }));
    expect(computeBudgetChartData(many)).toHaveLength(8);
  });
});
