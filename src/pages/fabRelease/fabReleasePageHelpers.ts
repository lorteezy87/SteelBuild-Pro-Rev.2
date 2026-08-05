/**
 * Pure helpers for Fab Release page shell.
 */

export function groupByWorkPackageId<T extends { work_package_id?: string | null }>(
  rows: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows || []) {
    const wpId = String(row.work_package_id || "");
    if (!wpId) continue;
    if (!map.has(wpId)) map.set(wpId, []);
    map.get(wpId)!.push(row);
  }
  return map;
}

export function groupSubmittalsByDrawingSetId<T extends { drawing_set_ids?: unknown }>(
  submittals: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const sub of submittals || []) {
    const dsIds = Array.isArray(sub.drawing_set_ids) ? sub.drawing_set_ids : [];
    for (const dsId of dsIds) {
      const key = String(dsId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(sub);
    }
  }
  return map;
}

export function groupByLane<T>(
  items: T[],
  lanes: string[],
  laneOf: (item: T) => string,
  fallbackLane: string,
): Record<string, T[]> {
  const groups: Record<string, T[]> = Object.fromEntries(lanes.map((lane) => [lane, [] as T[]]));
  for (const item of items || []) {
    const lane = laneOf(item);
    if (groups[lane]) groups[lane].push(item);
    else groups[fallbackLane].push(item);
  }
  return groups;
}

export function groupByStatusOrder<T extends { _signals?: { status?: string } }>(
  items: T[],
  statusOrder: string[],
  defaultStatus = "Not Started",
): Record<string, T[]> {
  const groups: Record<string, T[]> = Object.fromEntries(statusOrder.map((s) => [s, [] as T[]]));
  for (const item of items || []) {
    const status = statusOrder.includes(item._signals?.status || "")
      ? (item._signals?.status as string)
      : defaultStatus;
    groups[status].push(item);
  }
  return groups;
}

/** Command pill tone for a fab readiness score (0–100). */
export function readinessTone(score: number): "good" | "warn" | "danger" {
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "danger";
}

export type FabSignalFlag = { severity?: string | null; label?: string | null };

/** Highest-severity signal label for a work package (high → medium → dash). */
export function topBlockerLabel(wp: {
  _signals?: { flags?: FabSignalFlag[] } | null;
}): string {
  const flags = wp._signals?.flags || [];
  const high = flags.filter((f) => f.severity === "high");
  if (high.length > 0) return high[0].label || "-";
  const med = flags.filter((f) => f.severity === "medium");
  if (med.length > 0) return med[0].label || "-";
  return "-";
}

/** Format tonnage for fab release KPI/table cells. */
export function formatFabTons(n: number | string | undefined): string {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `${v.toFixed(1)}T` : "-";
}

