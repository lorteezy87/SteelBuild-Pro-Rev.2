/**
 * Unit tests for buildFieldHubSummary pure derivation.
 * No React, no network — pure function.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildFieldHubSummary } from "../fieldHubControlCenter.derive";
import type { DailyLogRecord, InspectionRecord, SafetyIncidentRecord, PunchlistItemRecord } from "../fieldHubControlCenter.derive";

// Pin today to a known date so date-sensitive KPIs are deterministic.
const FROZEN_TODAY = "2026-06-28";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${FROZEN_TODAY}T08:00:00`));
});

afterAll(() => {
  vi.useRealTimers();
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const logs: DailyLogRecord[] = [
  { id: "l1", date: FROZEN_TODAY, headcount: 4, hours_worked: 32, safety_incidents: 0, equipment_used: "Crane, Forklift", superintendent: "J. Rivera", crew_name: "Crew A" },
  { id: "l2", date: FROZEN_TODAY, headcount: 2, hours_worked: 16, safety_incidents: 0, equipment_used: "", superintendent: "K. Singh", crew_name: "Crew B" },
  { id: "l3", date: "2026-06-27", headcount: 6, hours_worked: 48, safety_incidents: 1, equipment_used: "Boom lift", superintendent: "M. Patel", crew_name: "Crew A" },
];

const inspections: InspectionRecord[] = [
  { id: "i1", inspection_date: FROZEN_TODAY, inspection_type: "Welds", status: "Scheduled", inspector_name: "QC Team", location: "Level 2", deficiencies_count: 2, sign_off_status: null },
  { id: "i2", inspection_date: "2026-06-30", inspection_type: "Connections", status: "Scheduled", inspector_name: "EOR Rep", location: "Roof", deficiencies_count: 0, sign_off_status: null },
  { id: "i3", inspection_date: "2026-06-25", inspection_type: "Coating", status: "Completed", inspector_name: "Paint Insp", location: "Shop", deficiencies_count: 1, sign_off_status: "Approved" },
  { id: "i4", inspection_date: "2026-06-29", inspection_type: "Steel Fabrication", status: "In Progress", inspector_name: "Fab QC", location: "Shop", deficiencies_count: 3, sign_off_status: null },
];

const incidents: SafetyIncidentRecord[] = [
  { id: "s1", incident_date: "2026-06-27", incident_type: "Near Miss", severity: "High", status: "Open", location: "Beam line 3", reported_by: "T. Adams", investigation_completed: false },
  { id: "s2", incident_date: "2026-06-20", incident_type: "First Aid", severity: "Low", status: "Closed", location: "Shop", reported_by: "B. Cruz" },
];

const punchlistItems: PunchlistItemRecord[] = [
  { id: "p1", status: "Open", priority: "Critical", category: "Weld repair", location: "Col C-12", assigned_to: "J. Rivera", target_completion_date: "2026-06-27", description: "Repair undercut weld" },
  { id: "p2", status: "Open", priority: "High", category: "Touch-up paint", location: "Level 3", assigned_to: "Crew B", target_completion_date: "2026-07-01", description: "Touch-up primer" },
  { id: "p3", status: "Closed", priority: "Medium", category: "Cleanup", location: "Site", assigned_to: "All", target_completion_date: "2026-06-26", description: "Clean debris" },
  { id: "p4", status: "Open", priority: "Low", category: "Bolt torque", location: "Roof", assigned_to: "K. Singh", target_completion_date: "2026-07-05", description: "Final torque check" },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildFieldHubSummary", () => {
  const result = buildFieldHubSummary(logs, inspections, incidents, punchlistItems);

  it("counts today's headcount only", () => {
    // l1=4, l2=2 for today; l3 is yesterday
    expect(result.workforceToday).toBe(6);
  });

  it("counts equipment logs only from today with non-empty equipment_used", () => {
    // l1 has equipment, l2 is empty, l3 is yesterday
    expect(result.equipmentLogsToday).toBe(1);
  });

  it("counts open punchlist items (non-closed)", () => {
    // p1 Open, p2 Open, p4 Open → 3; p3 Closed excluded
    expect(result.openFieldIssues).toBe(3);
  });

  it("counts scheduled inspections due (including today)", () => {
    // i1 Scheduled today, i2 Scheduled future → 2; i3 Completed excluded; i4 In Progress not Scheduled
    expect(result.inspectionsDue).toBe(2);
  });

  it("counts open (non-closed) safety incidents", () => {
    // s1 Open → 1; s2 Closed excluded
    expect(result.openSafetyObs).toBe(1);
  });

  it("sums deficiencies from active inspections only", () => {
    // i1 Scheduled=2, i2 Scheduled=0, i4 InProgress=3 → 5; i3 Completed excluded
    expect(result.totalDeficiencies).toBe(5);
  });

  it("today queue contains only open punchlist items, sorted critical first", () => {
    expect(result.todayQueue.length).toBeGreaterThan(0);
    expect(result.todayQueue[0].priority).toBe("Critical");
    expect(result.todayQueue.every((r) => r.type === "punchlist")).toBe(true);
  });

  it("inspection queue contains only Scheduled/In Progress inspections", () => {
    const statuses = result.inspectionQueue.map((r) => r.status);
    expect(statuses.every((s) => ["Scheduled", "In Progress"].includes(s))).toBe(true);
  });

  it("coordination queue includes open safety incident", () => {
    const types = result.coordinationQueue.map((r) => r.type);
    expect(types).toContain("safety");
  });

  it("coordination queue includes overdue punchlist (p1 due yesterday)", () => {
    const labels = result.coordinationQueue.map((r) => r.label);
    expect(labels.some((l) => l.includes("undercut weld") || l.includes("Weld repair") || l.includes("Repair"))).toBe(true);
  });

  it("activityRows includes all non-empty source rows", () => {
    // 3 logs + 4 inspections + 2 incidents + 4 punchlist = 13 rows
    expect(result.activityRows.length).toBe(13);
  });

  it("activityRows are sorted newest date first", () => {
    const dates = result.activityRows.map((r) => r.time).filter((t) => t !== "—");
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1] >= dates[i]).toBe(true);
    }
  });

  it("returns zeros when given empty arrays", () => {
    const empty = buildFieldHubSummary([], [], [], []);
    expect(empty.workforceToday).toBe(0);
    expect(empty.openFieldIssues).toBe(0);
    expect(empty.inspectionsDue).toBe(0);
    expect(empty.openSafetyObs).toBe(0);
    expect(empty.activityRows.length).toBe(0);
    expect(empty.todayQueue.length).toBe(0);
    expect(empty.inspectionQueue.length).toBe(0);
    expect(empty.coordinationQueue.length).toBe(0);
  });
});
