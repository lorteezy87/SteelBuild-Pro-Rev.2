export interface DailyLogRecord {
  id?: string | null;
  is_deleted?: boolean | null;
  date?: string | null;
  created_at?: string | null;
  headcount?: number | null;
  hours_worked?: number | null;
  superintendent?: string | null;
  weather_description?: string | null;
  safety_incidents?: number | null;
  activities?: string | null;
  photos?: unknown[] | null;
}

export interface PhotoRecord {
  id?: string | null;
  is_deleted?: boolean | null;
  taken_date?: string | null;
  created_at?: string | null;
  file_url?: string | null;
  path?: string | null;
  title?: string | null;
  file_name?: string | null;
  category?: string | null;
}

export interface PunchlistRecord {
  id?: string | null;
  is_deleted?: boolean | null;
  status?: string | null;
  created_at?: string | null;
  target_completion_date?: string | null;
  description?: string | null;
  location?: string | null;
  priority?: string | null;
}

export interface InspectionRecord {
  id?: string | null;
  is_deleted?: boolean | null;
  status?: string | null;
  created_at?: string | null;
  inspection_date?: string | null;
  inspection_type?: string | null;
  location?: string | null;
  inspector_name?: string | null;
}

export interface SafetyRecord {
  id?: string | null;
  is_deleted?: boolean | null;
  status?: string | null;
  created_at?: string | null;
  incident_date?: string | null;
  severity?: string | null;
  incident_type?: string | null;
  location?: string | null;
}

export interface QualityControlRecord {
  is_deleted?: boolean | null;
  test_date?: string | null;
}

export interface FieldDeliveryRecord {
  id?: string | null;
  is_deleted?: boolean | null;
  scheduled_date?: string | null;
  required_date?: string | null;
  created_at?: string | null;
  delivery_title?: string | null;
  load_number?: string | null;
  vendor?: string | null;
  receiving_location?: string | null;
  status?: string | null;
  _signals?: {
    risk?: "high" | "medium" | "clear";
    flags?: Array<{ label?: string | null }>;
  } | null;
}

export interface FieldDashboardRecords {
  logs: DailyLogRecord[];
  photos: PhotoRecord[];
  punchlist: PunchlistRecord[];
  inspections: InspectionRecord[];
  safety: SafetyRecord[];
  qualityControl: QualityControlRecord[];
  deliveries: FieldDeliveryRecord[];
}

export interface FieldDashboardDateContext {
  todayIso: string;
  weekStartIso: string;
  monthStartIso: string;
  yearStartIso: string;
  recentDays: Array<{ iso: string; day: string }>;
}

export interface FieldActionItem {
  key: string;
  type: "punch" | "inspection" | "safety" | "delivery";
  date: string | null | undefined;
  title: string;
  sub: string;
  status: string | null | undefined;
  priority?: string | null;
  color: string;
  href: string;
}

export interface FieldDashboardSummary {
  liveLogs: DailyLogRecord[];
  livePhotos: PhotoRecord[];
  livePunchlist: PunchlistRecord[];
  liveInspections: InspectionRecord[];
  liveSafety: SafetyRecord[];
  liveQualityControl: QualityControlRecord[];
  liveDeliveries: FieldDeliveryRecord[];
  todayLog: DailyLogRecord | null;
  photosToday: number;
  photosThisWeek: number;
  openPunch: number;
  openInspections: number;
  openSafety: number;
  safetyYtd: number;
  qualityControlThisMonth: number;
  todayActivityCount: number;
  actionFeed: FieldActionItem[];
  weekDays: Array<{ iso: string; day: string; count: number }>;
  recentLogs: DailyLogRecord[];
  recentPhotos: PhotoRecord[];
}

interface FieldDeliveryMetrics {
  dueToday: unknown[];
  exceptions: FieldDeliveryRecord[];
  openCount: number;
  overdue: unknown[];
}

const PUNCHLIST_TERMINAL = new Set(["Completed", "Cancelled", "Deferred"]);
const INSPECTION_OPEN = new Set(["Scheduled", "In Progress"]);
const SAFETY_TERMINAL = new Set(["Closed", "Completed"]);

function isoDay(value: unknown): string {
  return value ? String(value).slice(0, 10) : "";
}

function liveOnly<T extends { is_deleted?: boolean | null }>(records: T[]): T[] {
  return records.filter((record) => !record.is_deleted);
}

export function buildFieldDashboardDateContext(
  now: Date,
  todayIso: string,
): FieldDashboardDateContext {
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - day + (day === 0 ? -6 : 1));

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const recentDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - index));
    return {
      iso: date.toISOString().slice(0, 10),
      day: date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1),
    };
  });

  return {
    todayIso,
    weekStartIso: weekStart.toISOString().slice(0, 10),
    monthStartIso: monthStart.toISOString().slice(0, 10),
    yearStartIso: yearStart.toISOString().slice(0, 10),
    recentDays,
  };
}

export function buildFieldDashboardSummary(
  records: FieldDashboardRecords,
  deliveryMetrics: FieldDeliveryMetrics,
  dates: FieldDashboardDateContext,
): FieldDashboardSummary {
  const liveLogs = liveOnly(records.logs);
  const livePhotos = liveOnly(records.photos);
  const livePunchlist = liveOnly(records.punchlist);
  const liveInspections = liveOnly(records.inspections);
  const liveSafety = liveOnly(records.safety);
  const liveQualityControl = liveOnly(records.qualityControl);
  const liveDeliveries = liveOnly(records.deliveries);

  const todayLog =
    liveLogs.find((log) => isoDay(log.date) === dates.todayIso) ?? null;
  const photosToday = livePhotos.filter(
    (photo) => isoDay(photo.taken_date || photo.created_at) === dates.todayIso,
  ).length;
  const photosThisWeek = livePhotos.filter(
    (photo) => isoDay(photo.taken_date || photo.created_at) >= dates.weekStartIso,
  ).length;
  const openPunch = livePunchlist.filter(
    (item) => !PUNCHLIST_TERMINAL.has(item.status || ""),
  ).length;
  const openInspections = liveInspections.filter((inspection) =>
    INSPECTION_OPEN.has(inspection.status || ""),
  ).length;
  const openSafety = liveSafety.filter(
    (incident) => !SAFETY_TERMINAL.has(incident.status || ""),
  ).length;
  const safetyYtd = liveSafety.filter(
    (incident) => isoDay(incident.incident_date) >= dates.yearStartIso,
  ).length;
  const qualityControlThisMonth = liveQualityControl.filter(
    (record) => isoDay(record.test_date) >= dates.monthStartIso,
  ).length;

  const todayActivityCount =
    (todayLog ? 1 : 0) +
    photosToday +
    livePunchlist.filter((item) => isoDay(item.created_at) === dates.todayIso).length +
    liveInspections.filter(
      (inspection) => isoDay(inspection.inspection_date) === dates.todayIso,
    ).length +
    liveSafety.filter(
      (incident) => isoDay(incident.incident_date) === dates.todayIso,
    ).length +
    deliveryMetrics.dueToday.length;

  const actionFeed: FieldActionItem[] = [];
  for (const item of livePunchlist) {
    if (PUNCHLIST_TERMINAL.has(item.status || "")) continue;
    actionFeed.push({
      key: `punch-${item.id}`,
      type: "punch",
      date: item.target_completion_date || item.created_at,
      title: item.description || "(no description)",
      sub: item.location || "",
      status: item.status,
      priority: item.priority,
      color:
        item.priority === "Critical"
          ? "var(--status-error)"
          : item.priority === "High"
            ? "var(--status-warning)"
            : "var(--accent)",
      href: `/Punchlist?id=${item.id}`,
    });
  }
  for (const inspection of liveInspections) {
    if (!INSPECTION_OPEN.has(inspection.status || "")) continue;
    actionFeed.push({
      key: `insp-${inspection.id}`,
      type: "inspection",
      date: inspection.inspection_date || inspection.created_at,
      title: `${inspection.inspection_type || "Inspection"}${
        inspection.location ? ` · ${inspection.location}` : ""
      }`,
      sub: inspection.inspector_name || "",
      status: inspection.status,
      color: "var(--status-info)",
      href: `/Inspections?id=${inspection.id}`,
    });
  }
  for (const incident of liveSafety) {
    if (SAFETY_TERMINAL.has(incident.status || "")) continue;
    actionFeed.push({
      key: `safety-${incident.id}`,
      type: "safety",
      date: incident.incident_date || incident.created_at,
      title: `${incident.severity || ""} ${incident.incident_type || "Incident"}`.trim(),
      sub: incident.location || "",
      status: incident.status,
      color:
        incident.severity === "Critical"
          ? "var(--status-error)"
          : incident.severity === "High"
            ? "var(--status-warning)"
            : "var(--status-info)",
      href: `/Safety?id=${incident.id}`,
    });
  }
  for (const delivery of deliveryMetrics.exceptions.slice(0, 8)) {
    const fieldDelivery = delivery;
    actionFeed.push({
      key: `delivery-${fieldDelivery.id}`,
      type: "delivery",
      date:
        fieldDelivery.scheduled_date ||
        fieldDelivery.required_date ||
        fieldDelivery.created_at,
      title:
        fieldDelivery.delivery_title ||
        fieldDelivery.load_number ||
        fieldDelivery.vendor ||
        "Delivery exception",
      sub:
        fieldDelivery._signals?.flags?.[0]?.label ||
        fieldDelivery.receiving_location ||
        "",
      status: fieldDelivery.status,
      color:
        fieldDelivery._signals?.risk === "high"
          ? "var(--status-error)"
          : fieldDelivery._signals?.risk === "medium"
            ? "var(--status-warning)"
            : "var(--phase-delivery)",
      href: "/Deliveries?receive=1",
    });
  }
  actionFeed.sort((left, right) =>
    String(left.date || "").localeCompare(String(right.date || "")),
  );

  const weekDays = dates.recentDays.map((day) => ({
    ...day,
    count:
      liveLogs.filter((log) => isoDay(log.date) === day.iso).length +
      livePhotos.filter(
        (photo) => isoDay(photo.taken_date || photo.created_at) === day.iso,
      ).length +
      livePunchlist.filter((item) => isoDay(item.created_at) === day.iso).length +
      liveInspections.filter(
        (inspection) => isoDay(inspection.inspection_date) === day.iso,
      ).length +
      liveDeliveries.filter(
        (delivery) => isoDay(delivery.scheduled_date) === day.iso,
      ).length,
  }));

  return {
    liveLogs,
    livePhotos,
    livePunchlist,
    liveInspections,
    liveSafety,
    liveQualityControl,
    liveDeliveries,
    todayLog,
    photosToday,
    photosThisWeek,
    openPunch,
    openInspections,
    openSafety,
    safetyYtd,
    qualityControlThisMonth,
    todayActivityCount,
    actionFeed,
    weekDays,
    recentLogs: [...liveLogs]
      .sort((left, right) =>
        String(right.date || "").localeCompare(String(left.date || "")),
      )
      .slice(0, 4),
    recentPhotos: livePhotos.slice(0, 12),
  };
}
