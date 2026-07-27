/**
 * Pure helpers for Crew Scheduling (ResourceScheduling page).
 * No React, no mutations — page stays the orchestrator.
 */
import { wpBudgetHoursForResource, wpActualHoursForResource } from "@/lib/wpHoursForResource";
import { formatLocalDate } from "@/utils/dates";
import { addDays, subDays, isThisWeek } from "./utils";

export type ResourceLike = {
  id: string;
  name?: string;
  capacity?: number | string | null;
  parent_resource_id?: string | null;
  [key: string]: unknown;
};

export type WorkPackageLike = {
  id?: string;
  phase?: string | null;
  status?: string | null;
  crew?: string | null;
  tonnage?: number | string | null;
  shop_hours_budget?: number | string | null;
  shop_hours_actual?: number | string | null;
  field_hours_budget?: number | string | null;
  field_hours_actual?: number | string | null;
  scheduled_start_date?: string | null;
  scheduled_end_date?: string | null;
  released_date?: string | null;
  [key: string]: unknown;
};

export type DisplayResourceEntry = {
  resource: ResourceLike;
  isMember: boolean;
  hasMembers: boolean;
  memberCount: number;
};

export type ResourceFocus = "all" | "personnel" | "equipment" | "available" | "issues" | string;

const ACTIVE_PHASE_STATUSES_EXCLUDED = ["Complete", "On Hold"];

/** Top-level resources (no parent crew). */
export function filterTopLevelResources<T extends ResourceLike>(resources: T[]): T[] {
  return resources.filter((r) => !r.parent_resource_id);
}

/** Map parent resource id → direct member resources. */
export function buildMembersByParentId<T extends ResourceLike>(
  resources: T[],
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of resources) {
    if (r.parent_resource_id) {
      (map[r.parent_resource_id] = map[r.parent_resource_id] || []).push(r);
    }
  }
  return map;
}

/**
 * Effective capacity = own capacity + sum of direct children's capacities.
 */
export function buildEffectiveCapacityById(resources: ResourceLike[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of resources) {
    map[r.id] = Number(r.capacity) || 0;
  }
  for (const r of resources) {
    if (r.parent_resource_id && map[r.parent_resource_id] !== undefined) {
      map[r.parent_resource_id] += Number(r.capacity) || 0;
    }
  }
  return map;
}

/**
 * Flat board rows: top-level resources, plus members when their crew is expanded.
 */
export function buildDisplayResources(
  topLevelResources: ResourceLike[],
  membersByParentId: Record<string, ResourceLike[]>,
  expandedCrews: Set<string>,
): DisplayResourceEntry[] {
  const out: DisplayResourceEntry[] = [];
  for (const r of topLevelResources) {
    const children = membersByParentId[r.id] || [];
    out.push({
      resource: r,
      isMember: false,
      hasMembers: children.length > 0,
      memberCount: children.length,
    });
    if (expandedCrews.has(r.id)) {
      for (const c of children) {
        out.push({ resource: c, isMember: true, hasMembers: false, memberCount: 0 });
      }
    }
  }
  return out;
}

export type CapacitySummary = {
  shopBudget: number;
  shopActual: number;
  shopRemaining: number;
  fieldBudget: number;
  fieldActual: number;
  fieldRemaining: number;
  totalTons: number;
  inFabTons: number;
  byPhase: {
    Detailing: number;
    Fabrication: number;
    Delivery: number;
    Erection: number;
  };
};

/** Aggregate shop/field hours + active WP counts by phase for Capacity view. */
export function computeCapacitySummary(workPackages: WorkPackageLike[]): CapacitySummary {
  const wps = workPackages;
  const shopBudget = wps.reduce((s, w) => s + (Number(w.shop_hours_budget) || 0), 0);
  const shopActual = wps.reduce((s, w) => s + (Number(w.shop_hours_actual) || 0), 0);
  const shopRemaining = shopBudget - shopActual;
  const fieldBudget = wps.reduce((s, w) => s + (Number(w.field_hours_budget) || 0), 0);
  const fieldActual = wps.reduce((s, w) => s + (Number(w.field_hours_actual) || 0), 0);
  const fieldRemaining = fieldBudget - fieldActual;
  const totalTons = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const inFabTons = wps
    .filter((w) => w.phase === "Fabrication" && w.status === "In Progress")
    .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const byPhase = {
    Detailing: wps.filter(
      (w) => w.phase === "Detailing" && !ACTIVE_PHASE_STATUSES_EXCLUDED.includes(w.status as string),
    ).length,
    Fabrication: wps.filter(
      (w) => w.phase === "Fabrication" && !ACTIVE_PHASE_STATUSES_EXCLUDED.includes(w.status as string),
    ).length,
    Delivery: wps.filter(
      (w) => w.phase === "Delivery" && !ACTIVE_PHASE_STATUSES_EXCLUDED.includes(w.status as string),
    ).length,
    Erection: wps.filter(
      (w) => w.phase === "Erection" && !ACTIVE_PHASE_STATUSES_EXCLUDED.includes(w.status as string),
    ).length,
  };
  return {
    shopBudget,
    shopActual,
    shopRemaining,
    fieldBudget,
    fieldActual,
    fieldRemaining,
    totalTons,
    inFabTons,
    byPhase,
  };
}

export type TimelineWindow = {
  timelineStart: Date;
  timelineEnd: Date;
  totalDays: number;
};

/**
 * Timeline window from WP schedule dates (±14 day padding).
 * Falls back to [now−14, now+60] when no dates exist.
 */
export function computeTimelineWindow(
  workPackages: WorkPackageLike[],
  now: Date = new Date(),
): TimelineWindow {
  const starts = workPackages
    .filter((wp) => wp.scheduled_start_date || wp.released_date)
    .map((wp) => new Date((wp.scheduled_start_date || wp.released_date) as string).getTime())
    .filter((t) => !isNaN(t));
  const ends = workPackages
    .filter((wp) => wp.scheduled_end_date)
    .map((wp) => new Date(wp.scheduled_end_date as string).getTime())
    .filter((t) => !isNaN(t));

  const tStart =
    starts.length > 0
      ? subDays(new Date(Math.min.apply(null, starts)), 14)
      : subDays(now, 14);
  const tEnd =
    ends.length > 0
      ? addDays(new Date(Math.max.apply(null, ends)), 14)
      : addDays(now, 60);

  const days = Math.ceil((+tEnd - +tStart) / 86400000);

  return {
    timelineStart: tStart,
    timelineEnd: tEnd,
    totalDays: days,
  };
}

export type BarStyle = { left: number; width: number; duration: number };

/** Pixel position + width for a scheduled WP bar on the timeline. */
export function getBarStyle(
  wp: WorkPackageLike,
  timelineStart: Date,
  pxPerDay: number,
): BarStyle | null {
  const rawStart = wp.scheduled_start_date || wp.released_date;
  if (!rawStart || !wp.scheduled_end_date) return null;

  const start = new Date(rawStart);
  const end = new Date(wp.scheduled_end_date);
  const left = Math.round(((+start - +timelineStart) / 86400000) * pxPerDay);
  const width = Math.max(
    Math.round(((+end - +start) / 86400000) * pxPerDay),
    pxPerDay * 2,
  );
  const duration = Math.round((+end - +start) / 86400000);

  return { left, width, duration };
}

export type TimelineHeader = {
  label: string;
  subLabel?: string;
  width: number;
  isToday: boolean;
  date: Date;
  month?: number;
};

export function buildTimelineHeaders(opts: {
  zoomMode: string;
  timelineStart: Date;
  timelineEnd: Date;
  pxPerDay: number;
}): TimelineHeader[] {
  const { zoomMode, timelineStart, timelineEnd, pxPerDay } = opts;
  const headers: TimelineHeader[] = [];
  let cursor = new Date(timelineStart);
  cursor.setHours(0, 0, 0, 0);

  if (zoomMode === "week") {
    while (cursor < timelineEnd) {
      headers.push({
        label: cursor.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        subLabel: cursor.toLocaleDateString("en-US", {
          weekday: "short",
        }),
        width: pxPerDay * 7,
        isToday: isThisWeek(cursor),
        date: new Date(cursor),
      });
      cursor = addDays(cursor, 7);
    }
  } else if (zoomMode === "month") {
    while (cursor < timelineEnd) {
      headers.push({
        label: cursor.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        subLabel: cursor.toLocaleDateString("en-US", {
          year: "numeric",
        }),
        width: pxPerDay * 7,
        isToday: isThisWeek(cursor),
        month: cursor.getMonth(),
        date: new Date(cursor),
      });
      cursor = addDays(cursor, 7);
    }
  } else if (zoomMode === "quarter") {
    while (cursor < timelineEnd) {
      headers.push({
        label: cursor.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        width: pxPerDay * 14,
        isToday: false,
        date: new Date(cursor),
      });
      cursor = addDays(cursor, 14);
    }
  }

  return headers;
}

export type MonthBanner = { label: string; width: number };

export function buildMonthBanners(
  zoomMode: string,
  headers: TimelineHeader[],
): MonthBanner[] {
  if (zoomMode !== "month") return [];

  const banners: MonthBanner[] = [];
  let currentMonth = -1;
  let currentWidth = 0;
  let currentLabel = "";

  headers.forEach((h) => {
    if (h.month !== currentMonth) {
      if (currentMonth !== -1) {
        banners.push({ label: currentLabel, width: currentWidth });
      }
      currentMonth = h.month as number;
      currentLabel = formatLocalDate(h.date, "en-US", {
        month: "long",
        year: "numeric",
      });
      currentWidth = h.width;
    } else {
      currentWidth += h.width;
    }
  });

  if (currentLabel) {
    banners.push({ label: currentLabel, width: currentWidth });
  }

  return banners;
}

export function filterWorkPackagesByPhase(
  workPackages: WorkPackageLike[],
  filterPhase: string,
): WorkPackageLike[] {
  return workPackages.filter((wp) => {
    const phaseMatch = filterPhase === "all" || wp.phase === filterPhase;
    return phaseMatch;
  });
}

export function isWorkPackageScheduled(wp: WorkPackageLike): boolean {
  return !!(wp.scheduled_start_date || wp.released_date) && !!wp.scheduled_end_date;
}

export function partitionScheduledWorkPackages(filteredWorkPackages: WorkPackageLike[]): {
  scheduled: WorkPackageLike[];
  unscheduled: WorkPackageLike[];
} {
  const scheduled = filteredWorkPackages.filter(isWorkPackageScheduled);
  const unscheduled = filteredWorkPackages.filter((wp) => !isWorkPackageScheduled(wp));
  return { scheduled, unscheduled };
}

type GuruRow = {
  isPersonnel?: boolean;
  isEquipment?: boolean;
  unavailable?: boolean;
  remainingHours?: number;
  overAllocated?: boolean;
  nearCapacity?: boolean;
};

export function filterFocusedDisplayResources(
  displayResources: DisplayResourceEntry[],
  resourceFocus: ResourceFocus,
  rowById: Map<string, GuruRow>,
): DisplayResourceEntry[] {
  if (resourceFocus === "all") return displayResources;
  return displayResources.filter((entry) => {
    const row = rowById.get(entry.resource.id);
    if (!row) return resourceFocus === "all";
    if (resourceFocus === "personnel") return !!row.isPersonnel;
    if (resourceFocus === "equipment") return !!row.isEquipment;
    if (resourceFocus === "available") return !row.unavailable && (row.remainingHours ?? 0) > 0;
    if (resourceFocus === "issues") {
      return !!(row.overAllocated || row.unavailable || row.nearCapacity);
    }
    return true;
  });
}

export type ScheduleStats = {
  totalBudgetHrs: number;
  totalActualHrs: number;
  totalShopBudget: number;
  totalShopActual: number;
  totalFieldBudget: number;
  totalFieldActual: number;
  assignedWPCount: number;
  unassignedCount: number;
  overAllocatedResources: number;
};

export function computeScheduleStats(opts: {
  filteredWorkPackages: WorkPackageLike[];
  scheduledWps: WorkPackageLike[];
  topLevelResources: ResourceLike[];
  effectiveCapacityById: Record<string, number>;
}): ScheduleStats {
  const { filteredWorkPackages, scheduledWps, topLevelResources, effectiveCapacityById } = opts;
  const totalBudgetHrs = filteredWorkPackages.reduce(
    (s, wp) => s + wpBudgetHoursForResource(wp),
    0,
  );
  const totalActualHrs = filteredWorkPackages.reduce(
    (s, wp) => s + wpActualHoursForResource(wp),
    0,
  );
  const totalShopBudget = filteredWorkPackages.reduce(
    (s, wp) => s + (Number(wp.shop_hours_budget) || 0),
    0,
  );
  const totalShopActual = filteredWorkPackages.reduce(
    (s, wp) => s + (Number(wp.shop_hours_actual) || 0),
    0,
  );
  const totalFieldBudget = filteredWorkPackages.reduce(
    (s, wp) => s + (Number(wp.field_hours_budget) || 0),
    0,
  );
  const totalFieldActual = filteredWorkPackages.reduce(
    (s, wp) => s + (Number(wp.field_hours_actual) || 0),
    0,
  );
  const assignedWPCount = scheduledWps.filter((wp) => wp.crew).length;
  const unassignedCount = filteredWorkPackages.filter((wp) => !wp.crew).length;
  const overAllocatedResources = topLevelResources.filter((res) => {
    const resWPs = scheduledWps.filter((wp) => wp.crew === res.name);
    const resBudget = resWPs.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
    const effCap = effectiveCapacityById[res.id] || 0;
    return effCap > 0 && resBudget > effCap;
  }).length;

  return {
    totalBudgetHrs,
    totalActualHrs,
    totalShopBudget,
    totalShopActual,
    totalFieldBudget,
    totalFieldActual,
    assignedWPCount,
    unassignedCount,
    overAllocatedResources,
  };
}

/** Pixel offset of "today" on the timeline (midnight-normalized). */
export function computeTodayOffset(
  timelineStart: Date,
  pxPerDay: number,
  now: Date = new Date(),
): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tStart = new Date(timelineStart);
  tStart.setHours(0, 0, 0, 0);
  return Math.round(((+today - +tStart) / 86400000) * pxPerDay);
}

/** Shop vs field heuristic used when auto-distributing hours on drop. */
export function isShopWorkPackage(wp: WorkPackageLike | null | undefined): boolean {
  if (!wp) return false;
  return (
    (wp as { location?: string }).location === "Shop" ||
    wp.phase === "Fabrication" ||
    wp.phase === "Detailing"
  );
}

export function toIsoDate(dt: Date): string {
  return dt.toISOString().split("T")[0];
}

export type ScheduleSummaryCard = {
  label: string;
  value: string | number;
  color: string;
};

/** Hours / assignment strip cards for the Resource Scheduling header. */
export function buildScheduleSummaryCards(opts: {
  filteredWorkPackages: WorkPackageLike[];
  scheduledWps: WorkPackageLike[];
  topLevelResources: ResourceLike[];
  effectiveCapacityById: Record<string, number>;
}): ScheduleSummaryCard[] {
  const {
    filteredWorkPackages,
    scheduledWps,
    topLevelResources,
    effectiveCapacityById,
  } = opts;
  // Phase-aware totals: each WP contributes only its phase-relevant
  // hours bucket, so shop + field WPs don't double-count at the
  // portfolio stat.
  const totalBudgetHrs = filteredWorkPackages.reduce(
    (s, wp) => s + wpBudgetHoursForResource(wp),
    0,
  );
  const totalActualHrs = filteredWorkPackages.reduce(
    (s, wp) => s + wpActualHoursForResource(wp),
    0,
  );
  const totalShopBudget = filteredWorkPackages.reduce(
    (s, wp) => s + (Number(wp.shop_hours_budget) || 0),
    0,
  );
  const totalShopActual = filteredWorkPackages.reduce(
    (s, wp) => s + (Number(wp.shop_hours_actual) || 0),
    0,
  );
  const totalFieldBudget = filteredWorkPackages.reduce(
    (s, wp) => s + (Number(wp.field_hours_budget) || 0),
    0,
  );
  const totalFieldActual = filteredWorkPackages.reduce(
    (s, wp) => s + (Number(wp.field_hours_actual) || 0),
    0,
  );
  const assignedWPCount = scheduledWps.filter((wp) => wp.crew).length;
  const unassignedCount = filteredWorkPackages.filter((wp) => !wp.crew).length;
  // Count how many top-level resources are over-allocated. Over-
  // alloc = assigned WP budget > effective capacity (rollup from
  // crew members when applicable). Uses phase-aware hour bucketing
  // so a field crew isn't charged for a WP's shop hours and vice
  // versa.
  const overAllocatedResources = topLevelResources.filter((res) => {
    const resWPs = scheduledWps.filter((wp) => wp.crew === res.name);
    const resBudget = resWPs.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
    const effCap = effectiveCapacityById[res.id] || 0;
    return effCap > 0 && resBudget > effCap;
  }).length;

  return [
    {
      label: "TOTAL ESTIMATED",
      value: `${totalBudgetHrs.toLocaleString()}h`,
      color: "var(--accent)",
    },
    {
      label: "TOTAL ACTUAL",
      value: `${totalActualHrs.toLocaleString()}h`,
      color:
        totalActualHrs > totalBudgetHrs
          ? "var(--status-error)"
          : "var(--status-success)",
    },
    {
      label: "SHOP HRS",
      value: `${totalShopActual.toLocaleString()} / ${totalShopBudget.toLocaleString()}`,
      color:
        totalShopActual > totalShopBudget
          ? "var(--status-error)"
          : "var(--text-secondary)",
    },
    {
      label: "FIELD HRS",
      value: `${totalFieldActual.toLocaleString()} / ${totalFieldBudget.toLocaleString()}`,
      color:
        totalFieldActual > totalFieldBudget
          ? "var(--status-error)"
          : "var(--text-secondary)",
    },
    {
      label: "ASSIGNED / TOTAL",
      value: `${assignedWPCount} / ${filteredWorkPackages.length} WPs`,
      color: unassignedCount > 0 ? "var(--status-warning)" : "var(--status-success)",
    },
    {
      label: "OVER-ALLOCATED",
      value: overAllocatedResources,
      color:
        overAllocatedResources > 0 ? "var(--status-error)" : "var(--status-success)",
    },
  ];
}

export type ResourceSidebarRow = {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  skills: string[];
  budgetHours: number;
  actualHours: number;
  burnPct: number;
  isOverBudget: boolean;
  isOverAllocated: boolean;
  capacityHours: number;
  assignedWpCount: number;
  tonnage: number;
  heatBg: string;
};

export type ResourceSidebarGroup = {
  type: string;
  resources: ResourceSidebarRow[];
};

const RESOURCE_SIDEBAR_TYPES = [
  "Person",
  "Crew",
  "Labor",
  "Equipment",
  "Subcontractor",
  "Material",
  "Bay",
] as const;

/** Capacity-stack rows for the left Resource Scheduling sidebar. */
export function buildResourceSidebarGroups(opts: {
  topLevelResources: ResourceLike[];
  scheduledWps: WorkPackageLike[];
  membersByParentId: Record<string, ResourceLike[]>;
  effectiveCapacityById: Record<string, number>;
  extractSkills: (resource: ResourceLike) => string[];
  getRowCapacityBg: (burnPct: number, isOverAllocated: boolean) => string;
}): ResourceSidebarGroup[] {
  const {
    topLevelResources,
    scheduledWps,
    membersByParentId,
    effectiveCapacityById,
    extractSkills,
    getRowCapacityBg,
  } = opts;

  return RESOURCE_SIDEBAR_TYPES.map((type) => {
    const typeResources = topLevelResources.filter(
      (r) => (r.resource_type || "Person") === type,
    );
    if (typeResources.length === 0) return null;

    const resources = typeResources.map((res) => {
      const assignedWPs = scheduledWps.filter((wp) => wp.crew === res.name);
      const resBudgetHrs = assignedWPs.reduce(
        (s, wp) => s + wpBudgetHoursForResource(wp),
        0,
      );
      const resActualHrs = assignedWPs.reduce(
        (s, wp) => s + wpActualHoursForResource(wp),
        0,
      );
      const resBurnPct =
        resBudgetHrs > 0 ? Math.round((resActualHrs / resBudgetHrs) * 100) : 0;
      const isOverBudget = resActualHrs > resBudgetHrs && resBudgetHrs > 0;
      const resBudgetFromEntity = effectiveCapacityById[res.id] || 0;
      const isOverAllocated =
        resBudgetFromEntity > 0 && resBudgetHrs > resBudgetFromEntity;
      return {
        id: res.id,
        name: String(res.name || ""),
        role: String(res.role || "\u2014"),
        memberCount: (membersByParentId[res.id] || []).length,
        skills: extractSkills(res),
        budgetHours: resBudgetHrs,
        actualHours: resActualHrs,
        burnPct: resBurnPct,
        isOverBudget,
        isOverAllocated,
        capacityHours: resBudgetFromEntity,
        assignedWpCount: assignedWPs.length,
        tonnage: assignedWPs.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0),
        heatBg: getRowCapacityBg(resBurnPct, isOverAllocated),
      };
    });

    return { type, resources };
  }).filter((group): group is ResourceSidebarGroup => Boolean(group));
}
