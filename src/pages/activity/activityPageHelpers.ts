import { downloadTextFile } from "@/lib/exports/fabRelease";
/** Pure helpers for Activity page shell. */

export type ActivityLike = {
  project_id?: string | null;
  projectId?: string | null;
  performed_by?: string | null;
  userName?: string | null;
  entity_type?: string | null;
  entityType?: string | null;
  entity_name?: string | null;
  entityName?: string | null;
  project_name?: string | null;
  projectName?: string | null;
  timestamp?: string | null;
  created_at?: string | null;
  action?: string | null;
  description?: string | null;
};

export type ActivityFilterOpts = {
  filterProject: string;
  filterUser: string;
  filterEntity: string;
  dateRange: string;
};

/** Date cutoff for feed range filters. Injectable `now` for tests. */
export function getDateCutoff(range: string, now: Date = new Date()): Date | null {
  if (range === "all") return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "today") return today;
  const days = parseInt(range, 10);
  if (Number.isNaN(days)) return null;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export function uniqueActivityUsers(activities: ActivityLike[]): string[] {
  return [...new Set((activities || []).map((a) => a.performed_by ?? a.userName).filter(Boolean))] as string[];
}

export function uniqueActivityEntities(activities: ActivityLike[]): string[] {
  return [...new Set((activities || []).map((a) => a.entity_type ?? a.entityType).filter(Boolean))] as string[];
}

export function filterActivities(
  activities: ActivityLike[],
  opts: ActivityFilterOpts,
  now: Date = new Date(),
): ActivityLike[] {
  const dateCutoff = getDateCutoff(opts.dateRange, now);
  return (activities || []).filter((a) => {
    const pid = a.project_id ?? a.projectId;
    const user = a.performed_by ?? a.userName;
    const ent = a.entity_type ?? a.entityType;
    const ts = a.timestamp ?? a.created_at;
    const projectMatch = opts.filterProject === "all" || pid === opts.filterProject;
    const userMatch = opts.filterUser === "all" || user === opts.filterUser;
    const entityMatch = opts.filterEntity === "all" || ent === opts.filterEntity;
    const dateMatch = !dateCutoff || (ts && new Date(ts) >= dateCutoff);
    return projectMatch && userMatch && entityMatch && dateMatch;
  });
}

export function activityHasActiveFilters(opts: ActivityFilterOpts): boolean {
  return (
    opts.filterProject !== "all" ||
    opts.filterUser !== "all" ||
    opts.filterEntity !== "all" ||
    opts.dateRange !== "all"
  );
}

export const ACTIVITY_CSV_HEADERS = [
  "Timestamp",
  "User",
  "Action",
  "Entity Type",
  "Entity",
  "Project",
  "Description",
] as const;

export function buildActivityCsvRows(
  activities: ActivityLike[],
  formatTimestamp: (iso: string | null | undefined) => string = (iso) =>
    iso ? new Date(iso).toLocaleString() : "",
): Array<Array<string>> {
  return (activities || []).map((a) => [
    formatTimestamp(a.timestamp ?? a.created_at),
    a.performed_by ?? a.userName ?? "",
    a.action ?? "",
    a.entity_type ?? a.entityType ?? "",
    a.entity_name ?? a.entityName ?? "",
    a.project_name ?? a.projectName ?? "—",
    a.description ?? "—",
  ]);
}

export function buildActivityCsvString(
  rows: ReturnType<typeof buildActivityCsvRows>,
): string {
  return [[...ACTIVITY_CSV_HEADERS], ...rows]
    .map((r) => r.map((cell) => `"${cell}"`).join(","))
    .join("\n");
}

export function activityCsvFilename(now: Date = new Date()): string {
  return `activity-audit-${now.toISOString().split("T")[0]}.csv`;
}

export const ACTIVITY_DATE_RANGES = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
] as const;

/** Side-effect CSV download for Activity feed export. */
export function downloadActivityCsv(
  activities: ActivityLike[],
  filename?: string,
): void {
  downloadTextFile(
    buildActivityCsvString(buildActivityCsvRows(activities)),
    filename || activityCsvFilename(),
    "text/csv;charset=utf-8",
  );
}


export function createEmptyActivityFilters(): ActivityFilterOpts {
  return {
    filterProject: "all",
    filterUser: "all",
    filterEntity: "all",
    dateRange: "all",
  };
}
