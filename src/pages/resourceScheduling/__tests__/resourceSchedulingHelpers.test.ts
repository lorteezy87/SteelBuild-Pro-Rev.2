import { describe, expect, it } from "vitest";
import {
  filterTopLevelResources,
  buildMembersByParentId,
  buildEffectiveCapacityById,
  buildDisplayResources,
  computeCapacitySummary,
  computeTimelineWindow,
  getBarStyle,
  buildTimelineHeaders,
  buildMonthBanners,
  filterWorkPackagesByPhase,
  isWorkPackageScheduled,
  partitionScheduledWorkPackages,
  filterFocusedDisplayResources,
  computeScheduleStats,
  computeTodayOffset,
  isShopWorkPackage,
  toIsoDate,
  buildScheduleSummaryCards,
  buildResourceSidebarGroups,
} from "../resourceSchedulingHelpers";

describe("filterTopLevelResources / buildMembersByParentId / buildEffectiveCapacityById", () => {
  const resources: Array<{
    id: string;
    name: string;
    capacity: number | string;
    parent_resource_id: string | null;
  }> = [
    { id: "crew-a", name: "Crew A", capacity: 40, parent_resource_id: null },
    { id: "m1", name: "Member 1", capacity: 10, parent_resource_id: "crew-a" },
    { id: "m2", name: "Member 2", capacity: 15, parent_resource_id: "crew-a" },
    { id: "solo", name: "Solo", capacity: "8", parent_resource_id: null },
  ];

  it("keeps only resources without a parent", () => {
    expect(filterTopLevelResources(resources).map((r) => r.id)).toEqual(["crew-a", "solo"]);
  });

  it("groups members under their parent", () => {
    const map = buildMembersByParentId(resources);
    expect(map["crew-a"].map((r) => r.id)).toEqual(["m1", "m2"]);
    expect(map.solo).toBeUndefined();
  });

  it("rolls member capacity into the parent", () => {
    const caps = buildEffectiveCapacityById(resources);
    expect(caps["crew-a"]).toBe(65); // 40 + 10 + 15
    expect(caps.m1).toBe(10);
    expect(caps.solo).toBe(8);
  });

  it("treats missing capacity as 0", () => {
    expect(buildEffectiveCapacityById([{ id: "x" } as any]).x).toBe(0);
  });
});

describe("buildDisplayResources", () => {
  const crew = { id: "crew-a", name: "Crew A" };
  const m1 = { id: "m1", name: "M1", parent_resource_id: "crew-a" };
  const solo = { id: "solo", name: "Solo" };
  const membersByParentId = { "crew-a": [m1] };

  it("hides members when the crew is collapsed", () => {
    const rows = buildDisplayResources([crew, solo], membersByParentId, new Set());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      resource: crew,
      isMember: false,
      hasMembers: true,
      memberCount: 1,
    });
    expect(rows[1].resource).toBe(solo);
  });

  it("inserts members under an expanded crew", () => {
    const rows = buildDisplayResources([crew, solo], membersByParentId, new Set(["crew-a"]));
    expect(rows.map((r) => r.resource.id)).toEqual(["crew-a", "m1", "solo"]);
    expect(rows[1]).toMatchObject({ isMember: true, hasMembers: false, memberCount: 0 });
  });
});

describe("computeCapacitySummary", () => {
  it("aggregates shop/field hours, tons, and active phase counts", () => {
    const summary = computeCapacitySummary([
      {
        phase: "Fabrication",
        status: "In Progress",
        shop_hours_budget: 100,
        shop_hours_actual: 40,
        field_hours_budget: 0,
        field_hours_actual: 0,
        tonnage: 12,
      },
      {
        phase: "Erection",
        status: "Not Started",
        shop_hours_budget: 0,
        shop_hours_actual: 0,
        field_hours_budget: 50,
        field_hours_actual: 10,
        tonnage: 5,
      },
      {
        phase: "Detailing",
        status: "Complete",
        shop_hours_budget: 20,
        shop_hours_actual: 20,
        tonnage: 1,
      },
      {
        phase: "Delivery",
        status: "On Hold",
        tonnage: 2,
      },
    ]);

    expect(summary.shopBudget).toBe(120);
    expect(summary.shopActual).toBe(60);
    expect(summary.shopRemaining).toBe(60);
    expect(summary.fieldBudget).toBe(50);
    expect(summary.fieldActual).toBe(10);
    expect(summary.fieldRemaining).toBe(40);
    expect(summary.totalTons).toBe(20);
    expect(summary.inFabTons).toBe(12);
    expect(summary.byPhase).toEqual({
      Detailing: 0, // Complete excluded
      Fabrication: 1,
      Delivery: 0, // On Hold excluded
      Erection: 1,
    });
  });

  it("returns zeros for an empty list", () => {
    expect(computeCapacitySummary([])).toEqual({
      shopBudget: 0,
      shopActual: 0,
      shopRemaining: 0,
      fieldBudget: 0,
      fieldActual: 0,
      fieldRemaining: 0,
      totalTons: 0,
      inFabTons: 0,
      byPhase: { Detailing: 0, Fabrication: 0, Delivery: 0, Erection: 0 },
    });
  });
});

describe("computeTimelineWindow", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("pads min start / max end by 14 days", () => {
    const { timelineStart, timelineEnd, totalDays } = computeTimelineWindow(
      [
        {
          scheduled_start_date: "2026-06-01",
          scheduled_end_date: "2026-06-10",
        },
        {
          released_date: "2026-05-20",
          scheduled_end_date: "2026-06-20",
        },
      ],
      now,
    );
    expect(timelineStart.toISOString().slice(0, 10)).toBe("2026-05-06"); // May 20 - 14
    expect(timelineEnd.toISOString().slice(0, 10)).toBe("2026-07-04"); // Jun 20 + 14
    expect(totalDays).toBeGreaterThan(40);
  });

  it("falls back to now−14 / now+60 when no dates", () => {
    const { timelineStart, timelineEnd } = computeTimelineWindow([], now);
    expect(timelineStart.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(timelineEnd.toISOString().slice(0, 10)).toBe("2026-08-14");
  });
});

describe("getBarStyle", () => {
  const timelineStart = new Date("2026-06-01T00:00:00");
  const pxPerDay = 10;

  it("returns null when start or end is missing", () => {
    expect(getBarStyle({ scheduled_start_date: "2026-06-05" }, timelineStart, pxPerDay)).toBeNull();
    expect(getBarStyle({ scheduled_end_date: "2026-06-10" }, timelineStart, pxPerDay)).toBeNull();
  });

  it("positions a bar from scheduled dates with a minimum width of 2 days", () => {
    const style = getBarStyle(
      { scheduled_start_date: "2026-06-05", scheduled_end_date: "2026-06-06" },
      timelineStart,
      pxPerDay,
    );
    expect(style).toEqual({ left: 40, width: 20, duration: 1 });
  });

  it("falls back to released_date as start", () => {
    const style = getBarStyle(
      { released_date: "2026-06-03", scheduled_end_date: "2026-06-13" },
      timelineStart,
      pxPerDay,
    );
    expect(style?.left).toBe(20);
    expect(style?.duration).toBe(10);
    expect(style?.width).toBe(100);
  });
});

describe("buildTimelineHeaders / buildMonthBanners", () => {
  it("emits weekly headers at week zoom", () => {
    const headers = buildTimelineHeaders({
      zoomMode: "week",
      timelineStart: new Date("2026-06-01T00:00:00"),
      timelineEnd: new Date("2026-06-22T00:00:00"),
      pxPerDay: 28,
    });
    expect(headers.length).toBe(3);
    expect(headers[0].width).toBe(28 * 7);
    expect(headers[0].subLabel).toBeTruthy();
  });

  it("builds month banners only in month zoom", () => {
    const headers = buildTimelineHeaders({
      zoomMode: "month",
      timelineStart: new Date("2026-05-25T00:00:00"),
      timelineEnd: new Date("2026-06-22T00:00:00"),
      pxPerDay: 10,
    });
    expect(buildMonthBanners("week", headers)).toEqual([]);
    const banners = buildMonthBanners("month", headers);
    expect(banners.length).toBeGreaterThanOrEqual(1);
    expect(banners.every((b) => b.label && b.width > 0)).toBe(true);
  });

  it("uses 14-day steps in quarter zoom", () => {
    const headers = buildTimelineHeaders({
      zoomMode: "quarter",
      timelineStart: new Date("2026-06-01T00:00:00"),
      timelineEnd: new Date("2026-07-01T00:00:00"),
      pxPerDay: 5,
    });
    expect(headers[0].width).toBe(5 * 14);
    expect(headers[0].isToday).toBe(false);
  });
});

describe("filter / partition work packages", () => {
  const wps = [
    { id: "1", phase: "Fabrication", scheduled_start_date: "2026-06-01", scheduled_end_date: "2026-06-05" },
    { id: "2", phase: "Erection", released_date: "2026-06-01" }, // missing end → unscheduled
    { id: "3", phase: "Fabrication" }, // no dates
    { id: "4", phase: "Detailing", scheduled_start_date: "2026-06-02", scheduled_end_date: "2026-06-03" },
  ];

  it("filters by phase or returns all", () => {
    expect(filterWorkPackagesByPhase(wps, "all")).toHaveLength(4);
    expect(filterWorkPackagesByPhase(wps, "Fabrication").map((w) => w.id)).toEqual(["1", "3"]);
  });

  it("detects scheduled vs unscheduled", () => {
    expect(isWorkPackageScheduled(wps[0])).toBe(true);
    expect(isWorkPackageScheduled(wps[1])).toBe(false);
    expect(isWorkPackageScheduled(wps[2])).toBe(false);
  });

  it("partitions without dropping rows", () => {
    const { scheduled, unscheduled } = partitionScheduledWorkPackages(wps);
    expect(scheduled.map((w) => w.id)).toEqual(["1", "4"]);
    expect(unscheduled.map((w) => w.id)).toEqual(["2", "3"]);
  });
});

describe("filterFocusedDisplayResources", () => {
  const display = [
    { resource: { id: "p1" }, isMember: false, hasMembers: false, memberCount: 0 },
    { resource: { id: "e1" }, isMember: false, hasMembers: false, memberCount: 0 },
    { resource: { id: "busy" }, isMember: false, hasMembers: false, memberCount: 0 },
    { resource: { id: "missing" }, isMember: false, hasMembers: false, memberCount: 0 },
  ];
  const rowById = new Map([
    ["p1", { isPersonnel: true, isEquipment: false, remainingHours: 10, unavailable: false }],
    ["e1", { isPersonnel: false, isEquipment: true, remainingHours: 0, unavailable: false }],
    ["busy", { isPersonnel: true, overAllocated: true, remainingHours: -5, unavailable: false, nearCapacity: false }],
  ]);

  it("returns all when focus is all", () => {
    expect(filterFocusedDisplayResources(display, "all", rowById)).toBe(display);
  });

  it("filters personnel / equipment / available / issues", () => {
    expect(filterFocusedDisplayResources(display, "personnel", rowById).map((e) => e.resource.id)).toEqual([
      "p1",
      "busy",
    ]);
    expect(filterFocusedDisplayResources(display, "equipment", rowById).map((e) => e.resource.id)).toEqual([
      "e1",
    ]);
    expect(filterFocusedDisplayResources(display, "available", rowById).map((e) => e.resource.id)).toEqual([
      "p1",
    ]);
    expect(filterFocusedDisplayResources(display, "issues", rowById).map((e) => e.resource.id)).toEqual([
      "busy",
    ]);
  });

  it("drops rows with no guru entry when focus is not all", () => {
    expect(
      filterFocusedDisplayResources(display, "personnel", rowById).some((e) => e.resource.id === "missing"),
    ).toBe(false);
  });
});

describe("computeScheduleStats", () => {
  it("sums hours and counts assignment / over-allocation", () => {
    const stats = computeScheduleStats({
      filteredWorkPackages: [
        { phase: "Fabrication", shop_hours_budget: 50, shop_hours_actual: 10, crew: "Crew A" },
        { phase: "Erection", field_hours_budget: 30, field_hours_actual: 5, crew: null },
        { phase: "Fabrication", shop_hours_budget: 40, shop_hours_actual: 0, crew: "Crew A" },
      ],
      scheduledWps: [
        { phase: "Fabrication", shop_hours_budget: 50, crew: "Crew A" },
        { phase: "Fabrication", shop_hours_budget: 40, crew: "Crew A" },
      ],
      topLevelResources: [{ id: "r1", name: "Crew A", capacity: 80 }],
      effectiveCapacityById: { r1: 80 },
    });

    expect(stats.totalBudgetHrs).toBe(120); // 50 + 30 + 40 (phase-aware)
    expect(stats.totalActualHrs).toBe(15);
    expect(stats.totalShopBudget).toBe(90);
    expect(stats.totalFieldBudget).toBe(30);
    expect(stats.assignedWPCount).toBe(2);
    expect(stats.unassignedCount).toBe(1);
    expect(stats.overAllocatedResources).toBe(1); // 90 > 80
  });

  it("does not flag over-allocation when capacity is 0", () => {
    const stats = computeScheduleStats({
      filteredWorkPackages: [{ phase: "Fabrication", shop_hours_budget: 10, crew: "X" }],
      scheduledWps: [{ phase: "Fabrication", shop_hours_budget: 10, crew: "X" }],
      topLevelResources: [{ id: "r1", name: "X" }],
      effectiveCapacityById: { r1: 0 },
    });
    expect(stats.overAllocatedResources).toBe(0);
  });
});

describe("computeTodayOffset / isShopWorkPackage / toIsoDate", () => {
  it("computes midnight-normalized pixel offset", () => {
    const offset = computeTodayOffset(
      new Date("2026-06-01T00:00:00"),
      10,
      new Date("2026-06-11T15:30:00"),
    );
    expect(offset).toBe(100);
  });

  it("classifies shop vs field WPs", () => {
    expect(isShopWorkPackage({ phase: "Fabrication" })).toBe(true);
    expect(isShopWorkPackage({ phase: "Detailing" })).toBe(true);
    expect(isShopWorkPackage({ location: "Shop", phase: "Erection" })).toBe(true);
    expect(isShopWorkPackage({ phase: "Erection" })).toBe(false);
    expect(isShopWorkPackage(null)).toBe(false);
  });

  it("formats ISO dates as YYYY-MM-DD", () => {
    expect(toIsoDate(new Date("2026-06-15T12:00:00.000Z"))).toBe("2026-06-15");
  });
});

describe("buildScheduleSummaryCards / buildResourceSidebarGroups", () => {
  it("builds phase-aware summary cards and over-allocation count", () => {
    const cards = buildScheduleSummaryCards({
      filteredWorkPackages: [
        {
          id: "wp1",
          crew: "Crew A",
          phase: "Fabrication",
          shop_hours_budget: 40,
          shop_hours_actual: 20,
          field_hours_budget: 0,
          field_hours_actual: 0,
        },
        {
          id: "wp2",
          crew: null,
          phase: "Erection",
          shop_hours_budget: 0,
          shop_hours_actual: 0,
          field_hours_budget: 30,
          field_hours_actual: 10,
        },
      ],
      scheduledWps: [
        {
          id: "wp1",
          crew: "Crew A",
          phase: "Fabrication",
          shop_hours_budget: 40,
          shop_hours_actual: 20,
        },
      ],
      topLevelResources: [{ id: "r1", name: "Crew A", capacity: 10 }],
      effectiveCapacityById: { r1: 10 },
    });

    expect(cards.find((c) => c.label === "TOTAL ESTIMATED")?.value).toBe("70h");
    expect(cards.find((c) => c.label === "ASSIGNED / TOTAL")?.value).toBe("1 / 2 WPs");
    expect(cards.find((c) => c.label === "OVER-ALLOCATED")?.value).toBe(1);
  });

  it("groups sidebar resources with burn and capacity signals", () => {
    const groups = buildResourceSidebarGroups({
      topLevelResources: [
        { id: "r1", name: "Crew A", resource_type: "Crew", role: "Shop", capacity: 40 },
      ],
      scheduledWps: [
        {
          id: "wp1",
          crew: "Crew A",
          phase: "Fabrication",
          tonnage: 12,
          shop_hours_budget: 50,
          shop_hours_actual: 25,
        },
      ],
      membersByParentId: { r1: [{ id: "m1", name: "Welder" }] },
      effectiveCapacityById: { r1: 40 },
      extractSkills: () => ["fit"],
      getRowCapacityBg: () => "rgba(0,0,0,0.05)",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("Crew");
    expect(groups[0].resources[0]).toMatchObject({
      name: "Crew A",
      memberCount: 1,
      budgetHours: 50,
      actualHours: 25,
      burnPct: 50,
      isOverAllocated: true,
      assignedWpCount: 1,
      tonnage: 12,
      skills: ["fit"],
    });
  });
});
