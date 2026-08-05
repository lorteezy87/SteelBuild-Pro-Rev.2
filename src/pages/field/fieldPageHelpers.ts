/**
 * Pure helpers for the Field hub page (Field.jsx).
 * No React, no network — page stays the orchestrator.
 */

export type SoftDeletable = { is_deleted?: boolean | null; [key: string]: unknown };

export function startOfWeekISO(now: Date = new Date()): string {
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10);
}

export function startOfMonthISO(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export function startOfYearISO(now: Date = new Date()): string {
  return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

export function safeArray<T>(v: T[] | null | undefined | unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return String(iso);
  }
}

export function filterLiveRecords<T extends SoftDeletable>(rows: T[]): T[] {
  return rows.filter((r) => !r.is_deleted);
}

export function findTodayLog<T extends { date?: string | null }>(
  logs: T[],
  todayIso: string,
): T | null {
  return logs.find((l) => String(l.date || "").slice(0, 10) === todayIso) || null;
}

export function countPhotosOnDate<T extends { taken_date?: string | null; created_at?: string | null }>(
  photos: T[],
  todayIso: string,
): number {
  return photos.filter(
    (p) => String(p.taken_date || p.created_at || "").slice(0, 10) === todayIso,
  ).length;
}

export function countPhotosSince<T extends { taken_date?: string | null; created_at?: string | null }>(
  photos: T[],
  weekStart: string,
): number {
  return photos.filter(
    (p) => String(p.taken_date || p.created_at || "").slice(0, 10) >= weekStart,
  ).length;
}

export function countOpenPunch<T extends { status?: string | null }>(punchlist: T[]): number {
  return punchlist.filter(
    (p) => p.status !== "Completed" && p.status !== "Cancelled" && p.status !== "Deferred",
  ).length;
}

export function countOpenInspections<T extends { status?: string | null }>(inspections: T[]): number {
  return inspections.filter((i) => i.status === "Scheduled" || i.status === "In Progress").length;
}

export function countSafetyYtd<T extends { incident_date?: string | null }>(
  safety: T[],
  yearStart: string,
): number {
  return safety.filter((i) => String(i.incident_date || "").slice(0, 10) >= yearStart).length;
}

export function countQcSince<T extends { test_date?: string | null }>(
  qc: T[],
  monthStart: string,
): number {
  return qc.filter((r) => String(r.test_date || "").slice(0, 10) >= monthStart).length;
}

export function countOpenSafety<T extends { status?: string | null }>(safety: T[]): number {
  return safety.filter((s) => s.status !== "Closed" && s.status !== "Completed").length;
}

export function countTodayActivity(opts: {
  todayLog: unknown;
  photosToday: number;
  livePunchlist: Array<{ created_at?: string | null }>;
  liveInspections: Array<{ inspection_date?: string | null }>;
  liveSafety: Array<{ incident_date?: string | null }>;
  todayIso: string;
  deliveryDueTodayCount: number;
}): number {
  let n = 0;
  n += opts.todayLog ? 1 : 0;
  n += opts.photosToday;
  n += opts.livePunchlist.filter(
    (p) => String(p.created_at || "").slice(0, 10) === opts.todayIso,
  ).length;
  n += opts.liveInspections.filter(
    (i) => String(i.inspection_date || "").slice(0, 10) === opts.todayIso,
  ).length;
  n += opts.liveSafety.filter(
    (s) => String(s.incident_date || "").slice(0, 10) === opts.todayIso,
  ).length;
  n += opts.deliveryDueTodayCount;
  return n;
}

export type FieldActionFeedItem = {
  key: string;
  type: string;
  date: string | null | undefined;
  title: string;
  sub: string;
  status?: string | null;
  priority?: string | null;
  color: string;
  path: string;
};

type PunchLike = {
  id: string;
  status?: string | null;
  target_completion_date?: string | null;
  created_at?: string | null;
  description?: string | null;
  location?: string | null;
  priority?: string | null;
};

type InspectionLike = {
  id: string;
  status?: string | null;
  inspection_date?: string | null;
  created_at?: string | null;
  inspection_type?: string | null;
  location?: string | null;
  inspector_name?: string | null;
};

type SafetyLike = {
  id: string;
  status?: string | null;
  incident_date?: string | null;
  created_at?: string | null;
  severity?: string | null;
  incident_type?: string | null;
  location?: string | null;
};

type DeliveryExceptionLike = {
  id: string;
  scheduled_date?: string | null;
  required_date?: string | null;
  created_at?: string | null;
  delivery_title?: string | null;
  load_number?: string | null;
  vendor?: string | null;
  receiving_location?: string | null;
  status?: string | null;
  _signals?: { flags?: Array<{ label?: string }>; risk?: string } | null;
};

/**
 * Build sorted action feed rows. Navigation is a path string so the page
 * can attach onClick without embedding React Router in the helper.
 */
export function buildActionFeed(opts: {
  livePunchlist: PunchLike[];
  liveInspections: InspectionLike[];
  liveSafety: SafetyLike[];
  deliveryExceptions: DeliveryExceptionLike[];
}): FieldActionFeedItem[] {
  const items: FieldActionFeedItem[] = [];
  for (const p of opts.livePunchlist) {
    if (p.status === "Completed" || p.status === "Cancelled" || p.status === "Deferred") continue;
    items.push({
      key: `punch-${p.id}`,
      type: "punch",
      date: p.target_completion_date || p.created_at,
      title: p.description || "(no description)",
      sub: p.location || "",
      status: p.status,
      priority: p.priority,
      color:
        p.priority === "Critical"
          ? "var(--status-error)"
          : p.priority === "High"
            ? "var(--status-warning)"
            : "var(--accent)",
      path: `/Punchlist?id=${p.id}`,
    });
  }
  for (const i of opts.liveInspections) {
    if (i.status !== "Scheduled" && i.status !== "In Progress") continue;
    items.push({
      key: `insp-${i.id}`,
      type: "inspection",
      date: i.inspection_date || i.created_at,
      title: `${i.inspection_type || "Inspection"}${i.location ? ` · ${i.location}` : ""}`,
      sub: i.inspector_name || "",
      status: i.status,
      color: "var(--status-info)",
      path: `/Inspections?id=${i.id}`,
    });
  }
  for (const s of opts.liveSafety) {
    if (s.status === "Closed" || s.status === "Completed") continue;
    items.push({
      key: `safety-${s.id}`,
      type: "safety",
      date: s.incident_date || s.created_at,
      title: `${s.severity || ""} ${s.incident_type || "Incident"}`.trim(),
      sub: s.location || "",
      status: s.status,
      color:
        s.severity === "Critical"
          ? "var(--status-error)"
          : s.severity === "High"
            ? "var(--status-warning)"
            : "var(--status-info)",
      path: `/Safety?id=${s.id}`,
    });
  }
  for (const d of opts.deliveryExceptions.slice(0, 8)) {
    items.push({
      key: `delivery-${d.id}`,
      type: "delivery",
      date: d.scheduled_date || d.required_date || d.created_at,
      title: d.delivery_title || d.load_number || d.vendor || "Delivery exception",
      sub: d._signals?.flags?.[0]?.label || d.receiving_location || "",
      status: d.status,
      color:
        d._signals?.risk === "high"
          ? "var(--status-error)"
          : d._signals?.risk === "medium"
            ? "var(--status-warning)"
            : "var(--phase-delivery)",
      path: "/Deliveries?receive=1",
    });
  }
  items.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  return items;
}

export type WeekDayActivity = { iso: string; day: string; count: number };

export function buildWeekDays(opts: {
  liveLogs: Array<{ date?: string | null }>;
  livePhotos: Array<{ taken_date?: string | null }>;
  livePunchlist: Array<{ created_at?: string | null }>;
  liveInspections: Array<{ inspection_date?: string | null }>;
  liveDeliveries: Array<{ scheduled_date?: string | null }>;
  now?: Date;
}): WeekDayActivity[] {
  const now = opts.now ?? new Date();
  const days: WeekDayActivity[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const dayOfWeek = d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1);
    let count = 0;
    count += opts.liveLogs.filter((l) => String(l.date || "").slice(0, 10) === iso).length;
    count += opts.livePhotos.filter((p) => String(p.taken_date || "").slice(0, 10) === iso).length;
    count += opts.livePunchlist.filter((p) => String(p.created_at || "").slice(0, 10) === iso).length;
    count += opts.liveInspections.filter(
      (i) => String(i.inspection_date || "").slice(0, 10) === iso,
    ).length;
    count += opts.liveDeliveries.filter(
      (delivery) => String(delivery.scheduled_date || "").slice(0, 10) === iso,
    ).length;
    days.push({ iso, day: dayOfWeek, count });
  }
  return days;
}

export function selectRecentLogs<T extends { date?: string | null }>(logs: T[], limit = 4): T[] {
  return [...logs]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, limit);
}

export function selectRecentPhotos<T>(photos: T[], limit = 12): T[] {
  return photos.slice(0, limit);
}
