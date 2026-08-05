import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  startOfWeekISO,
  startOfMonthISO,
  startOfYearISO,
  safeArray,
  fmtShortDate,
  filterLiveRecords,
  findTodayLog,
  countPhotosOnDate,
  countPhotosSince,
  countOpenPunch,
  countOpenInspections,
  countSafetyYtd,
  countQcSince,
  countOpenSafety,
  countTodayActivity,
  buildActionFeed,
  buildWeekDays,
  selectRecentLogs,
  selectRecentPhotos,
} from "../fieldPageHelpers";

describe("field date anchors", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wednesday 2026-07-15
    vi.setSystemTime(new Date("2026-07-15T15:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes week / month / year starts", () => {
    expect(startOfWeekISO()).toBe("2026-07-13"); // Monday
    expect(startOfMonthISO()).toBe("2026-07-01");
    expect(startOfYearISO()).toBe("2026-01-01");
  });
});

describe("safeArray / fmtShortDate", () => {
  it("returns arrays only", () => {
    expect(safeArray([1, 2])).toEqual([1, 2]);
    expect(safeArray(null)).toEqual([]);
    expect(safeArray(undefined)).toEqual([]);
    expect(safeArray("x")).toEqual([]);
  });

  it("formats short dates and blanks", () => {
    expect(fmtShortDate(null)).toBe("—");
    expect(fmtShortDate("2026-07-15")).toMatch(/Jul/);
  });
});

describe("live filters and KPI counts", () => {
  it("drops soft-deleted rows", () => {
    expect(
      filterLiveRecords([
        { id: "a", is_deleted: false },
        { id: "b", is_deleted: true },
        { id: "c" },
      ]).map((r) => r.id),
    ).toEqual(["a", "c"]);
  });

  it("finds today's log", () => {
    const logs = [
      { id: "1", date: "2026-07-14" },
      { id: "2", date: "2026-07-15T08:00:00Z" },
    ];
    expect(findTodayLog(logs, "2026-07-15")?.id).toBe("2");
    expect(findTodayLog(logs, "2026-07-16")).toBeNull();
  });

  it("counts photos on date / since week start", () => {
    const photos = [
      { taken_date: "2026-07-15" },
      { created_at: "2026-07-15T12:00:00Z" },
      { taken_date: "2026-07-10" },
    ];
    expect(countPhotosOnDate(photos, "2026-07-15")).toBe(2);
    expect(countPhotosSince(photos, "2026-07-13")).toBe(2);
  });

  it("counts open punch / inspections / safety / qc", () => {
    expect(
      countOpenPunch([
        { status: "Open" },
        { status: "Completed" },
        { status: "Cancelled" },
        { status: "Deferred" },
      ]),
    ).toBe(1);
    expect(
      countOpenInspections([
        { status: "Scheduled" },
        { status: "In Progress" },
        { status: "Complete" },
      ]),
    ).toBe(2);
    expect(
      countSafetyYtd(
        [{ incident_date: "2026-02-01" }, { incident_date: "2025-12-31" }],
        "2026-01-01",
      ),
    ).toBe(1);
    expect(
      countQcSince([{ test_date: "2026-07-02" }, { test_date: "2026-06-01" }], "2026-07-01"),
    ).toBe(1);
    expect(countOpenSafety([{ status: "Open" }, { status: "Closed" }, { status: "Completed" }])).toBe(
      1,
    );
  });

  it("aggregates today's activity headline", () => {
    expect(
      countTodayActivity({
        todayLog: { id: "1" },
        photosToday: 2,
        livePunchlist: [{ created_at: "2026-07-15" }, { created_at: "2026-07-14" }],
        liveInspections: [{ inspection_date: "2026-07-15" }],
        liveSafety: [{ incident_date: "2026-07-15" }],
        todayIso: "2026-07-15",
        deliveryDueTodayCount: 3,
      }),
    ).toBe(1 + 2 + 1 + 1 + 1 + 3);
  });
});

describe("buildActionFeed", () => {
  it("includes open punch/inspections/safety/delivery exceptions and sorts by date", () => {
    const items = buildActionFeed({
      livePunchlist: [
        {
          id: "p1",
          status: "Open",
          description: "Fix clip",
          location: "B4",
          priority: "High",
          target_completion_date: "2026-07-20",
        },
        { id: "p2", status: "Completed", description: "done" },
      ],
      liveInspections: [
        {
          id: "i1",
          status: "Scheduled",
          inspection_type: "Weld",
          location: "Grid A",
          inspector_name: "Sam",
          inspection_date: "2026-07-18",
        },
      ],
      liveSafety: [
        {
          id: "s1",
          status: "Open",
          severity: "Critical",
          incident_type: "Near miss",
          location: "Yard",
          incident_date: "2026-07-10",
        },
      ],
      deliveryExceptions: [
        {
          id: "d1",
          delivery_title: "Load 9",
          scheduled_date: "2026-07-16",
          _signals: { risk: "high", flags: [{ label: "Late" }] },
        },
      ],
    });

    expect(items.map((i) => i.key)).toEqual(["safety-s1", "delivery-d1", "insp-i1", "punch-p1"]);
    expect(items.find((i) => i.key === "punch-p1")).toMatchObject({
      path: "/Punchlist?id=p1",
      color: "var(--status-warning)",
    });
    expect(items.find((i) => i.key === "delivery-d1")?.path).toBe("/Deliveries?receive=1");
  });
});

describe("buildWeekDays / recent selectors", () => {
  it("builds 7 day activity buckets", () => {
    const now = new Date("2026-07-15T12:00:00.000Z");
    const days = buildWeekDays({
      liveLogs: [{ date: "2026-07-15" }, { date: "2026-07-15" }],
      livePhotos: [{ taken_date: "2026-07-14" }],
      livePunchlist: [{ created_at: "2026-07-13T00:00:00Z" }],
      liveInspections: [{ inspection_date: "2026-07-15" }],
      liveDeliveries: [{ scheduled_date: "2026-07-15" }],
      now,
    });
    expect(days).toHaveLength(7);
    expect(days[days.length - 1].iso).toBe("2026-07-15");
    expect(days[days.length - 1].count).toBe(2 + 1 + 1); // 2 logs + 1 insp + 1 delivery
    expect(days.find((d) => d.iso === "2026-07-14")?.count).toBe(1);
  });

  it("selects recent logs and photos", () => {
    const logs = [
      { id: "a", date: "2026-07-10" },
      { id: "b", date: "2026-07-15" },
      { id: "c", date: "2026-07-12" },
    ];
    expect(selectRecentLogs(logs, 2).map((l) => l.id)).toEqual(["b", "c"]);
    expect(selectRecentPhotos([{ id: 1 }, { id: 2 }, { id: 3 }], 2)).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
