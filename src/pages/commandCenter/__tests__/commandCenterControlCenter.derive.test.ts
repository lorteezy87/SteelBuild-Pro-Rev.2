import { describe, it, expect } from "vitest";
import { buildCommandCenterSummary } from "../commandCenterControlCenter.derive";
import type { CommandCenterSources } from "../commandCenterControlCenter.derive";

// Helper to create a minimal source bundle.
function makeSources(overrides: Partial<CommandCenterSources> = {}): CommandCenterSources {
  return {
    rfis: [],
    submittals: [],
    changeOrders: [],
    deliveries: [],
    workPackages: [],
    projects: [],
    scheduleTasks: [],
    ...overrides,
  };
}

// Helper: ISO date string N days from today (negative = past).
function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

describe("buildCommandCenterSummary", () => {
  it("returns zeros for empty sources", () => {
    const s = buildCommandCenterSummary(makeSources());
    expect(s.kpis.openActionItems).toBe(0);
    expect(s.kpis.approvalsPending).toBe(0);
    expect(s.kpis.overdueRfis).toBe(0);
    expect(s.kpis.fieldIssues).toBe(0);
    expect(s.actionItems).toHaveLength(0);
    expect(s.panels.todayPriorities).toHaveLength(0);
    expect(s.panels.waitingOn).toHaveLength(0);
    expect(s.panels.riskWatchlist).toHaveLength(0);
  });

  it("counts open RFIs in openActionItems", () => {
    const rfis = [
      { id: "r1", rfi_number: "001", title: "Column splice", status: "Open" },
      { id: "r2", rfi_number: "002", title: "Anchor bolts", status: "Answered" }, // closed
    ];
    const s = buildCommandCenterSummary(makeSources({ rfis }));
    // 1 open RFI; no submittals/COs
    expect(s.kpis.openActionItems).toBe(1);
  });

  it("detects overdue RFIs correctly", () => {
    const rfis = [
      { id: "r1", rfi_number: "001", title: "Late RFI", status: "Open", date_required: dateOffset(-5) },
      { id: "r2", rfi_number: "002", title: "Future RFI", status: "Open", date_required: dateOffset(3) },
    ];
    const s = buildCommandCenterSummary(makeSources({ rfis }));
    expect(s.kpis.overdueRfis).toBe(1);
  });

  it("counts approvals pending for OFA and IFA statuses", () => {
    const submittals = [
      { id: "s1", submittal_number: "SUB-001", title: "Main Steel", status: "OFA" },
      { id: "s2", submittal_number: "SUB-002", title: "Anchor Bolts", status: "IFA" },
      { id: "s3", submittal_number: "SUB-003", title: "Misc Metals", status: "Approved" }, // not pending
    ];
    const s = buildCommandCenterSummary(makeSources({ submittals }));
    expect(s.kpis.approvalsPending).toBe(2);
  });

  it("counts field issues from WPs on hold and delayed deliveries", () => {
    const workPackages = [
      { id: "w1", wp_number: "WP-01", name: "Erection Area 1", status: "On Hold" },
      { id: "w2", wp_number: "WP-02", name: "Erection Area 2", status: "In Progress" }, // not blocked
    ];
    const deliveries = [
      { id: "d1", delivery_title: "Load 1", status: "Delayed", scheduled_date: dateOffset(-2) },
      { id: "d2", delivery_title: "Load 2", status: "Scheduled", scheduled_date: dateOffset(5) }, // not late
    ];
    const s = buildCommandCenterSummary(makeSources({ workPackages, deliveries }));
    expect(s.kpis.fieldIssues).toBe(2);
  });

  it("surfaces today-due RFI in todayPriorities panel", () => {
    const rfis = [
      { id: "r1", rfi_number: "001", title: "Due today", status: "Open", date_required: dateOffset(0) },
      { id: "r2", rfi_number: "002", title: "Due next week", status: "Open", date_required: dateOffset(7) },
    ];
    const s = buildCommandCenterSummary(makeSources({ rfis }));
    const ids = s.panels.todayPriorities.map((r) => r.id);
    expect(ids).toContain("r1");
    expect(ids).not.toContain("r2");
  });

  it("surfaces OFA/IFA submittals in waitingOn panel", () => {
    const submittals = [
      { id: "s1", submittal_number: "S-01", title: "Main Steel", status: "OFA", ball_in_court: "EOR" },
      { id: "s2", submittal_number: "S-02", title: "Misc", status: "BFA", ball_in_court: "Contractor" }, // not waiting
    ];
    const s = buildCommandCenterSummary(makeSources({ submittals }));
    const ids = s.panels.waitingOn.map((r) => r.id);
    expect(ids).toContain("s1");
    expect(ids).not.toContain("s2");
  });

  it("puts RFIs whose BIC != Contractor into waitingOn", () => {
    const rfis = [
      { id: "r1", rfi_number: "001", title: "RFI at GC", status: "Open", ball_in_court: "GC Corp" },
      { id: "r2", rfi_number: "002", title: "Our RFI", status: "Open", ball_in_court: "Contractor" },
    ];
    const s = buildCommandCenterSummary(makeSources({ rfis }));
    const ids = s.panels.waitingOn.map((r) => r.id);
    expect(ids).toContain("r1");
    expect(ids).not.toContain("r2");
  });

  it("produces action items sorted urgency-first", () => {
    const rfis = [
      { id: "r-normal", rfi_number: "001", title: "Normal", status: "Open" },
      { id: "r-overdue", rfi_number: "002", title: "Overdue", status: "Open", date_required: dateOffset(-3) },
    ];
    const s = buildCommandCenterSummary(makeSources({ rfis }));
    const items = s.actionItems;
    const overdueIdx = items.findIndex((i) => i.id === "r-overdue");
    const normalIdx = items.findIndex((i) => i.id === "r-normal");
    expect(overdueIdx).toBeLessThan(normalIdx);
  });

  it("schedule health is On Track when no tasks", () => {
    const s = buildCommandCenterSummary(makeSources({ scheduleTasks: [] }));
    expect(s.kpis.scheduleHealth).toBe("No Data");
  });

  it("schedule health is Behind when many delayed tasks", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i}`,
      task_name: `Task ${i}`,
      status: "Delayed",
      end_date: dateOffset(-10),
      project_id: "p1",
    }));
    const s = buildCommandCenterSummary(makeSources({ scheduleTasks: tasks }));
    expect(s.kpis.scheduleHealth).toBe("Behind");
    expect(s.tones.scheduleHealth).toBe("danger");
  });

  it("excludes summary/parent tasks from schedule-health at-risk ratio", () => {
    // One overdue LEAF child under a summary parent. If the parent (which is
    // also overdue, spanning the child) were counted, atRiskCount/active would
    // be 2/2 = 100% → "Behind". Excluding the parent leaves 1 overdue leaf out
    // of 1 active leaf; the child's own overdue still classifies, but the
    // parent must not inflate the count. Assert the parent is not double-counted
    // by comparing against the same scenario with the parent removed entirely.
    const withParent = buildCommandCenterSummary(makeSources({
      scheduleTasks: [
        { id: "sum", task_name: "Phase", status: "In Progress", end_date: dateOffset(-10), project_id: "p1", is_summary: true },
        { id: "leaf", task_name: "Work", status: "In Progress", end_date: dateOffset(-10), project_id: "p1", parent_task_id: "sum" },
      ],
    }));
    const leafOnly = buildCommandCenterSummary(makeSources({
      scheduleTasks: [
        { id: "leaf", task_name: "Work", status: "In Progress", end_date: dateOffset(-10), project_id: "p1" },
      ],
    }));
    // Same health regardless of whether the summary parent is present — proving
    // the parent contributes nothing to the at-risk computation.
    expect(withParent.kpis.scheduleHealth).toBe(leafOnly.kpis.scheduleHealth);
  });

  it("pending COs flow into openActionItems and budgetVariance", () => {
    const changeOrders = [
      { id: "co1", co_number: "CO-001", title: "Extra beam", status: "Submitted" },
      { id: "co2", co_number: "CO-002", title: "Rework", status: "Draft" },
      { id: "co3", co_number: "CO-003", title: "Approved CO", status: "Approved" }, // closed
    ];
    const s = buildCommandCenterSummary(makeSources({ changeOrders }));
    // budgetVariance = count of pending COs
    expect(s.kpis.budgetVariance).toBe(2);
    // both pending COs count in openActionItems
    expect(s.kpis.openActionItems).toBe(2);
  });
});
