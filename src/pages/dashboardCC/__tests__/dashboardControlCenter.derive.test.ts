/**
 * Tests for buildDashboardSummary — pure derive layer for the Dashboard CC.
 * Mirrors the RFI derive test pattern: no React, no network, no mocks.
 */
import { describe, it, expect } from "vitest";
import { buildDashboardSummary } from "../dashboardControlCenter.derive";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function makeRfi(overrides: Record<string, unknown> = {}) {
  return {
    id: "rfi-1",
    rfi_number: "RFI-001",
    status: "Open",
    date_required: null as string | null,
    submitted_date: TODAY,
    ...overrides,
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Project",
    original_contract_value: 1000000,
    start_date: "2025-01-01",
    target_completion_date: "2026-12-31",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildDashboardSummary", () => {
  it("returns stable shape on empty input", () => {
    const s = buildDashboardSummary({});
    expect(s.projectName).toBe("Project Dashboard");
    expect(s.kpis).toHaveLength(4);
    expect(s.kpis[0].label).toBe("Open RFIs");
    expect(s.kpis[0].value).toBe(0);
    expect(s.summaryRows).toHaveLength(6);
    expect(s.alerts).toHaveLength(0); // no non-zero alerts
    expect(s.recentActivity).toHaveLength(0);
    expect(s.modules).toHaveLength(8);
  });

  it("counts open RFIs correctly (excludes Answered/Closed)", () => {
    const rfis = [
      makeRfi({ status: "Open" }),
      makeRfi({ id: "r2", status: "Answered" }),
      makeRfi({ id: "r3", status: "Closed" }),
    ];
    const s = buildDashboardSummary({ rfis });
    expect(s.openRfis).toBe(1);
    const kpi = s.kpis.find((k) => k.label === "Open RFIs")!;
    expect(kpi.value).toBe(1);
    expect(kpi.tone).toBe("neutral"); // no overdue
  });

  it("marks danger tone when RFIs are overdue", () => {
    const rfis = [
      makeRfi({ status: "Open", date_required: YESTERDAY }),
    ];
    const s = buildDashboardSummary({ rfis });
    expect(s.overdueRfis).toBe(1);
    const kpi = s.kpis.find((k) => k.label === "Open RFIs")!;
    expect(kpi.tone).toBe("danger");
    expect(kpi.sublabel).toContain("overdue");
  });

  it("produces projectName from project.name", () => {
    const s = buildDashboardSummary({ project: makeProject() });
    expect(s.projectName).toBe("Test Project");
  });

  it("shows TBD for cost health when no budget codes", () => {
    const s = buildDashboardSummary({ project: makeProject() });
    const costKpi = s.kpis.find((k) => k.label === "Cost Health")!;
    expect(costKpi.value).toBe("TBD");
    expect(costKpi.tone).toBe("neutral");
  });

  it("shows good cost health when under budget", () => {
    const codes = [{ id: "c1", budget_amount: 500000 }];
    const expenses = [{ id: "e1", amount: 400000, payment_status: "Approved" }];
    const s = buildDashboardSummary({ codes, expenses });
    const costKpi = s.kpis.find((k) => k.label === "Cost Health")!;
    expect(costKpi.tone).toBe("good");
    expect(String(costKpi.sublabel)).toContain("Under Budget");
  });

  it("shows danger cost health when over budget", () => {
    const codes = [{ id: "c1", budget_amount: 400000 }];
    const expenses = [{ id: "e1", amount: 500000, payment_status: "Approved" }];
    const s = buildDashboardSummary({ codes, expenses });
    const costKpi = s.kpis.find((k) => k.label === "Cost Health")!;
    expect(costKpi.tone).toBe("danger");
  });

  it("excludes zero-count alerts", () => {
    const s = buildDashboardSummary({
      rfis: [makeRfi({ status: "Open", date_required: null })], // no overdue
    });
    // drawings alert needs stale drawings; rfis alert needs overdue; etc.
    // With no overdue RFIs and no stale drawings, alerts should be empty.
    expect(s.alerts.find((a) => a.id === "rfis")).toBeUndefined();
  });

  it("surfaces drawing alert when drawings are stale", () => {
    const drawings = [{ id: "d1", is_deleted: false, status: "Rejected" }];
    const s = buildDashboardSummary({ drawings });
    const alert = s.alerts.find((a) => a.id === "drawings")!;
    expect(alert).toBeDefined();
    expect(alert.count).toBe(1);
    expect(alert.priority).toBe("high");
  });

  it("summary rows include project value from contract", () => {
    const project = makeProject({ original_contract_value: 2_500_000 });
    const s = buildDashboardSummary({ project });
    const valueRow = s.summaryRows.find((r) => r.label === "Project Value")!;
    expect(valueRow.value).toBe("$2.5M");
  });

  it("summary row % Complete matches wpProgressPct", () => {
    const wps = [
      { id: "w1", percent_complete: 50 },
      { id: "w2", percent_complete: 100 },
    ];
    const s = buildDashboardSummary({ wps });
    const pctRow = s.summaryRows.find((r) => r.label === "% Complete")!;
    expect(pctRow.value).toBe("75%"); // avg of 50+100 = 75
    expect(s.schedulePct).toBe(75);
  });

  it("produces 8 module tiles", () => {
    const s = buildDashboardSummary({});
    expect(s.modules).toHaveLength(8);
    expect(s.modules.map((m) => m.page)).toContain("RFIs");
    expect(s.modules.map((m) => m.page)).toContain("DrawingSubmittalHub");
  });

  it("pending submittals count excludes terminal statuses", () => {
    const submittals = [
      { id: "s1", status: "Under Review" },
      { id: "s2", status: "Approved" },               // closed
      { id: "s3", status: "Released for Fabrication" }, // closed
      { id: "s4", status: "Draft" },
    ];
    const s = buildDashboardSummary({ submittals });
    const kpi = s.kpis.find((k) => k.label === "Pending Submittals")!;
    expect(kpi.value).toBe(2); // Under Review + Draft
  });
});
