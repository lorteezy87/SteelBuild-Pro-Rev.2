import { describe, expect, it } from "vitest";
import {
  buildFieldDashboardDateContext,
  buildFieldDashboardSummary,
  type FieldDashboardRecords,
} from "../fieldDashboardDerive";

const dates = {
  todayIso: "2026-09-12",
  weekStartIso: "2026-09-07",
  monthStartIso: "2026-09-01",
  yearStartIso: "2026-01-01",
  recentDays: [
    { iso: "2026-09-06", day: "S" },
    { iso: "2026-09-07", day: "M" },
    { iso: "2026-09-08", day: "T" },
    { iso: "2026-09-09", day: "W" },
    { iso: "2026-09-10", day: "T" },
    { iso: "2026-09-11", day: "F" },
    { iso: "2026-09-12", day: "S" },
  ],
};

const records: FieldDashboardRecords = {
  logs: [
    { id: "log-today", date: "2026-09-12", headcount: 8 },
    { id: "log-old", date: "2026-09-11" },
    { id: "log-deleted", date: "2026-09-12", is_deleted: true },
  ],
  photos: [
    { id: "photo-1", taken_date: "2026-09-12" },
    { id: "photo-2", created_at: "2026-09-10T18:00:00Z" },
    { id: "photo-deleted", taken_date: "2026-09-12", is_deleted: true },
  ],
  punchlist: [
    {
      id: "punch-critical",
      status: "Open",
      priority: "Critical",
      description: "Repair weld",
      created_at: "2026-09-12T09:00:00Z",
      target_completion_date: "2026-09-13",
    },
    { id: "punch-complete", status: "Completed", created_at: "2026-09-12" },
    { id: "punch-cancelled", status: "Cancelled", created_at: "2026-09-12" },
    { id: "punch-deferred", status: "Deferred", created_at: "2026-09-12" },
  ],
  inspections: [
    {
      id: "inspection-1",
      status: "Scheduled",
      inspection_date: "2026-09-12",
      inspection_type: "Bolt",
      location: "Grid A",
    },
    { id: "inspection-done", status: "Passed", inspection_date: "2026-09-12" },
  ],
  safety: [
    {
      id: "safety-1",
      status: "Open",
      severity: "High",
      incident_type: "Near Miss",
      incident_date: "2026-09-12",
    },
    { id: "safety-closed", status: "Closed", incident_date: "2026-03-01" },
    { id: "safety-old", status: "Completed", incident_date: "2025-12-31" },
  ],
  qualityControl: [
    { test_date: "2026-09-02" },
    { test_date: "2026-08-31" },
  ],
  deliveries: [
    { id: "delivery-today", scheduled_date: "2026-09-12" },
    { id: "delivery-deleted", scheduled_date: "2026-09-12", is_deleted: true },
  ],
};

const deliveryException = {
  id: "delivery-risk",
  status: "In Transit",
  scheduled_date: "2026-09-11",
  delivery_title: "Load 12",
  _signals: {
    risk: "high" as const,
    flags: [{ key: "late", label: "Late", severity: "high" }],
  },
};

const deliveryMetrics = {
  dueToday: [{ id: "delivery-today" }],
  exceptions: [deliveryException],
  openCount: 2,
  overdue: [deliveryException],
};

describe("buildFieldDashboardSummary", () => {
  it("preserves the route's live-row and status-count semantics", () => {
    const summary = buildFieldDashboardSummary(records, deliveryMetrics, dates);

    expect(summary.liveLogs.map((record) => record.id)).toEqual([
      "log-today",
      "log-old",
    ]);
    expect(summary.todayLog?.id).toBe("log-today");
    expect(summary.photosToday).toBe(1);
    expect(summary.photosThisWeek).toBe(2);
    expect(summary.openPunch).toBe(1);
    expect(summary.openInspections).toBe(1);
    expect(summary.openSafety).toBe(1);
    expect(summary.safetyYtd).toBe(2);
    expect(summary.qualityControlThisMonth).toBe(1);
  });

  it("counts today's activity from the exact six dashboard sources", () => {
    const summary = buildFieldDashboardSummary(records, deliveryMetrics, dates);

    // The headline intentionally counts all records created/dated today,
    // including terminal punch and inspection rows; open status only affects
    // the action feed and open KPIs.
    expect(summary.todayActivityCount).toBe(10);
    expect(summary.weekDays.at(-1)).toEqual({
      iso: "2026-09-12",
      day: "S",
      count: 9,
    });
  });

  it("builds sorted deep-link action rows without embedding navigation callbacks", () => {
    const summary = buildFieldDashboardSummary(records, deliveryMetrics, dates);

    expect(summary.actionFeed.map((item) => [item.type, item.href])).toEqual([
      ["delivery", "/Deliveries?receive=1"],
      ["inspection", "/Inspections?id=inspection-1"],
      ["safety", "/Safety?id=safety-1"],
      ["punch", "/Punchlist?id=punch-critical"],
    ]);
    expect(summary.actionFeed[0].sub).toBe("Late");
    expect(summary.actionFeed[3].color).toBe("var(--status-error)");
  });

  it("keeps missing daily-log evidence distinct from zero crew or zero hours", () => {
    const withoutTodayLog: FieldDashboardRecords = {
      ...records,
      logs: [{ id: "log-old", date: "2026-09-11", headcount: 0, hours_worked: 0 }],
    };
    const summary = buildFieldDashboardSummary(withoutTodayLog, deliveryMetrics, dates);

    expect(summary.todayLog).toBeNull();
  });

  it("keeps recent logs sorted while preserving photo query order", () => {
    const summary = buildFieldDashboardSummary(records, deliveryMetrics, dates);

    expect(summary.recentLogs.map((record) => record.id)).toEqual([
      "log-today",
      "log-old",
    ]);
    expect(summary.recentPhotos.map((record) => record.id)).toEqual([
      "photo-1",
      "photo-2",
    ]);
  });
});

describe("buildFieldDashboardDateContext", () => {
  it("derives the Monday, month, year, and trailing seven-day windows from an injected clock", () => {
    const context = buildFieldDashboardDateContext(
      new Date(2026, 8, 12, 12, 0, 0),
      "2026-09-12",
    );

    expect(context.weekStartIso).toBe("2026-09-07");
    expect(context.monthStartIso).toBe("2026-09-01");
    expect(context.yearStartIso).toBe("2026-01-01");
    expect(context.recentDays).toHaveLength(7);
    expect(context.recentDays.at(-1)?.iso).toBe("2026-09-12");
  });
});
