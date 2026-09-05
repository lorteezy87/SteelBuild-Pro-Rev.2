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
  it("caps project health when overdue RFIs contradict a Good score", () => {
    const s = buildDashboardSummary({
      project: { id: "p1", health_status: "On Track" },
      rfis: [{ project_id: "p1", status: "Open", date_required: YESTERDAY }],
      scheduleTasks: [],
      todayIso: new Date().toISOString().slice(0, 10),
      rfiEvidenceLoaded: true,
      scheduleEvidenceLoaded: true,
    });
    expect(s.operationalHealth.label).toBe("Watch");
    expect(s.healthScore).toBeLessThanOrEqual(84);
    expect(s.healthReasons).toContain("1 overdue RFI");
  });

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

  it("surfaces drawing alert when drawings are rejected (set_approval_status)", () => {
    const drawings = [
      { id: "d1", is_deleted: false, set_approval_status: "rejected" },
      { id: "d2", is_deleted: false, set_approval_status: "Rejected" }, // legacy casing
      { id: "d3", is_deleted: false, set_approval_status: "approved" },
      { id: "d4", is_deleted: false, set_approval_status: "pending_review", stage: "IFA" },
      { id: "d5", is_deleted: true, set_approval_status: "rejected" }, // soft-deleted
      { id: "d6", is_deleted: false, status: "Rejected" }, // no such column on drawings
    ];
    const s = buildDashboardSummary({ drawings });
    const alert = s.alerts.find((a) => a.id === "drawings")!;
    expect(alert).toBeDefined();
    expect(alert.count).toBe(2);
    expect(alert.priority).toBe("high");
  });

  it("treats Delivered / Received / Cancelled deliveries as closed regardless of casing", () => {
    const deliveries = [
      { id: "a", scheduled_date: YESTERDAY, status: "Scheduled" },   // late + open
      { id: "b", scheduled_date: YESTERDAY, status: "delivered" },   // closed (lowercase)
      { id: "c", scheduled_date: YESTERDAY, status: "Received" },    // closed (procurement terminal)
      { id: "d", scheduled_date: YESTERDAY, status: "Cancelled" },   // closed
      { id: "e", scheduled_date: YESTERDAY, status: "In Transit" },  // late + open
    ];
    const s = buildDashboardSummary({ deliveries });
    const alert = s.alerts.find((a) => a.id === "delivery")!;
    expect(alert).toBeDefined();
    expect(alert.count).toBe(2);
  });

  it("counts only Submitted / Under Review / Draft COs as active (Approved / Rejected / Void are terminal)", () => {
    const cos = [
      { id: "c1", status: "Draft" },
      { id: "c2", status: "Submitted" },
      { id: "c3", status: "Under Review" },
      { id: "c4", status: "Approved" },
      { id: "c5", status: "Rejected" },
      { id: "c6", status: "Void" },
    ];
    const s = buildDashboardSummary({ cos });
    const alert = s.alerts.find((a) => a.id === "delivery")!;
    expect(alert.count).toBe(3);
  });

  it("summary rows include project value from contract", () => {
    const project = makeProject({ original_contract_value: 2_500_000 });
    const s = buildDashboardSummary({ project });
    const valueRow = s.summaryRows.find((r) => r.label === "Project Value")!;
    expect(valueRow.value).toBe("$2.5M");
  });

  it("uses the same actionable schedule-task progress as Schedule Command", () => {
    const wps = [
      { id: "w1", percent_complete: 50 },
      { id: "w2", percent_complete: 100 },
    ];
    const scheduleTasks = [
      { id: "summary", _hasChildren: true, percent_complete: 90 },
      { id: "t1", percent_complete: 0 },
      { id: "t2", percent_complete: 25 },
    ];
    const s = buildDashboardSummary({ wps, scheduleTasks });
    const pctRow = s.summaryRows.find((r) => r.label === "% Complete")!;
    expect(pctRow.value).toBe("13%");
    expect(s.schedulePct).toBe(13);
    const scheduleKpi = s.kpis.find((k) => k.label === "Schedule Progress")!;
    expect(scheduleKpi.value).toBe("13%");
  });

  it("renders unavailable schedule evidence as TBD instead of real 0% progress", () => {
    const s = buildDashboardSummary({
      project: makeProject(),
      scheduleTasks: [],
      scheduleEvidenceLoaded: false,
    });
    expect(s.schedulePct).toBeNull();
    expect(s.kpis.find((k) => k.label === "Schedule Progress")).toMatchObject({
      value: "TBD",
      sublabel: "Schedule unavailable",
      tone: "neutral",
    });
    expect(s.summaryRows.find((r) => r.label === "% Complete")?.value).toBe("TBD");
    expect(s.modules.find((m) => m.page === "ScheduleHub")?.metric).toBe("Schedule unavailable");
  });

  it("does not count closed safety or quality records as Field Hub issues", () => {
    const s = buildDashboardSummary({
      punchlistItems: [],
      safetyIncidents: [{ id: "s1", status: "Closed" }],
      qualityRecords: [{ id: "q1", status: "Passed" }],
      actionItems: [{ id: "a1", status: "Open", due_date: YESTERDAY }],
    });
    expect(s.alerts.find((a) => a.id === "field")).toBeUndefined();
  });

  it("matches Field Hub for every terminal punchlist status", () => {
    const punchlistItems = ["Closed", "Complete", "Completed", "Done", "Resolved"].map((status, index) => ({
      id: `terminal-${index}`,
      status,
    }));
    const s = buildDashboardSummary({ punchlistItems });
    expect(s.alerts.find((a) => a.id === "field")).toBeUndefined();
    expect(s.modules.find((m) => m.page === "FieldHub")?.metric).toBe("0 Issues");
  });

  it("shows cost health as pending until actual or committed cost is posted", () => {
    const s = buildDashboardSummary({
      codes: [{ id: "c1", budget_amount: 1_333_615, committed_cost: 0, actual_cost: 0 }],
      expenses: [],
      sovItems: [{ id: "s1", scheduled_value: 1_333_615, total_completed_stored: 0 }],
    });
    const costKpi = s.kpis.find((k) => k.label === "Cost Health")!;
    expect(costKpi.value).toBe("TBD");
    expect(costKpi.sublabel).toBe("No costs posted");
    expect(costKpi.tone).toBe("neutral");
  });

  it("uses actual cost as cost evidence when committed cost is zero", () => {
    const s = buildDashboardSummary({
      codes: [{ id: "c1", budget_amount: 1000, committed_cost: 0, actual_cost: 400 }],
      expenses: [],
    });
    const costKpi = s.kpis.find((k) => k.label === "Cost Health")!;
    expect(costKpi.value).toBe("+60.0%");
    expect(costKpi.sublabel).toBe("Under Budget");
  });

  it("does not award perfect budget-health credit before costs are posted", () => {
    const project = {
      id: "p1",
      start_date: "2020-01-01",
      target_completion_date: "2021-01-01",
    };
    const scheduleTasks = [{ id: "t1", status: "In Progress", percent_complete: 40 }];
    const withoutCostEvidence = buildDashboardSummary({ project, scheduleTasks });
    const withUnspentBudget = buildDashboardSummary({
      project,
      scheduleTasks,
      codes: [{ id: "c1", budget_amount: 1000, committed_cost: 0, actual_cost: 0 }],
    });
    expect(withUnspentBudget.healthScore).toBe(withoutCostEvidence.healthScore);
    expect(withUnspentBudget.healthScore).toBe(80);
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

  // Every module tile must navigate to its OWN destination. The Reports tile
  // carried target "schedule", so "Open Reports" opened the Schedule page.
  it("gives each module tile a distinct navigation target", () => {
    const s = buildDashboardSummary({ project: makeProject() });
    const reports = s.modules.find((m) => m.page === "ReportsHub")!;
    expect(reports.target).toBe("reports");

    const schedule = s.modules.find((m) => m.page === "ScheduleHub")!;
    expect(schedule.target).toBe("schedule");
    expect(reports.target).not.toBe(schedule.target);

    // No two tiles may share a target (that's how the Reports bug hid).
    const targets = s.modules.map((m) => m.target).filter(Boolean);
    const shared = targets.filter((t, i) => targets.indexOf(t) !== i);
    expect(shared).toEqual([]);
  });
});
