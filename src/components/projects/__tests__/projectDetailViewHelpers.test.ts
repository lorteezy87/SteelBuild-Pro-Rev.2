import { describe, expect, it } from "vitest";
import {
  buildOverviewMetrics,
  buildWorkPackageTabMetrics,
  groupScheduleTasksByPhase,
  buildCommercialMetrics,
  costCodeSpendPct,
  PHASE_CONFIG,
  HEALTH_CONFIG,
} from "../projectDetailViewHelpers";

describe("buildOverviewMetrics", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");
  it("rolls WP/RFI/CO/delivery counts and days left", () => {
    const m = buildOverviewMetrics({
      workPackages: [{ status: "Complete" }, { status: "In Progress" }],
      rfis: [
        { status: "Open", due_date: "2026-07-01" },
        { status: "Closed", due_date: "2026-07-01" },
      ],
      changeOrders: [
        { status: "Approved", co_amount: 100 },
        { status: "Submitted", co_amount: 50 },
      ],
      deliveries: [{ status: "Scheduled" }, { status: "Delivered" }],
      project: { target_completion_date: "2026-08-11" },
      now,
    });
    expect(m.completeWPs).toBe(1);
    expect(m.wpPct).toBe(50);
    expect(m.openRFIs).toBe(1);
    expect(m.overdueRFIs).toBe(1);
    expect(m.pendingCOs).toBe(1);
    expect(m.approvedCOVal).toBe(100);
    expect(m.pendingDeliveries).toBe(1);
    expect(m.daysLeft).toBe(10);
  });
});

describe("buildWorkPackageTabMetrics / groupScheduleTasksByPhase", () => {
  it("counts WP status and tonnage", () => {
    expect(
      buildWorkPackageTabMetrics([
        { status: "Complete", tonnage: 1.5 },
        { status: "In Progress", tonnage: 2 },
      ]),
    ).toEqual({ done: 1, inProg: 1, totalTonnage: 3.5 });
  });
  it("groups schedule tasks by phase", () => {
    const g = groupScheduleTasksByPhase([
      { id: 1, phase: "Fab" },
      { id: 2, phase: null },
    ]);
    expect(Object.keys(g).sort()).toEqual(["Fab", "General"]);
  });
});

describe("buildCommercialMetrics", () => {
  it("sums budgets and CO values", () => {
    const m = buildCommercialMetrics({
      project: { original_contract_value: 1000 },
      changeOrders: [
        { status: "Approved", co_amount: 100 },
        { status: "Under Review", co_amount: 40 },
      ],
      costCodes: [
        { budget_amount: 500, actual_cost: 200, committed_cost: 300 },
      ],
    });
    expect(m.totalBudget).toBe(500);
    expect(m.totalActual).toBe(200);
    expect(m.approvedCOVal).toBe(100);
    expect(m.pendingCOVal).toBe(40);
    expect(m.revisedContract).toBe(1100);
    expect(costCodeSpendPct(100, 50)).toBe(50);
    expect(costCodeSpendPct(0, 50)).toBe(0);
  });
});

import {
  buildDrawingsTabMetrics,
  isDrawingOverdue,
  buildRfisTabMetrics,
  isRfiOverdue,
  buildDeliveriesTabMetrics,
} from "../projectDetailViewHelpers";

describe("drawings / rfis / deliveries tab metrics", () => {
  const now = new Date("2026-08-01T00:00:00.000Z");
  it("drawing overdue and stage rolls", () => {
    const drawings = [
      { stage: "Released", due_date: "2026-07-01" },
      { stage: "IFA", due_date: "2026-07-01" },
      { stage: "OFS", due_date: "2026-09-01" },
    ];
    expect(buildDrawingsTabMetrics(drawings, now)).toEqual({
      overdue: 1,
      released: 1,
      inReview: 2,
    });
    expect(isDrawingOverdue(drawings[0], now)).toBe(false);
  });
  it("rfi metrics", () => {
    const rfis = [
      { status: "Open", due_date: "2026-07-01" },
      { status: "Answered", due_date: "2026-07-01" },
    ];
    expect(buildRfisTabMetrics(rfis, now)).toEqual({ open: 1, overdue: 1, answered: 1 });
    expect(isRfiOverdue(rfis[1], now)).toBe(false);
  });
  it("delivery metrics", () => {
    expect(
      buildDeliveriesTabMetrics([
        { status: "Scheduled" },
        { status: "Delivered" },
        { status: "Rejected" },
      ]),
    ).toEqual({ open: 1, delivered: 1 });
  });
});

describe("project detail chrome configs", () => {
  it("phase and health", () => {
    expect(PHASE_CONFIG.Erection.color).toBe("var(--status-success)");
    expect(HEALTH_CONFIG["At Risk"].dot).toBe("#EF4444");
  });
});
