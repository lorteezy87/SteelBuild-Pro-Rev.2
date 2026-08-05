/**
 * Pure helpers for Deliveries page shell (filter / lane grouping / maps).
 */
import { LANE_ORDER } from "./format";

export function buildIdNameMap(
  rows: Array<{ id?: string; name?: string | null; project_name?: string | null }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows || []) {
    if (!row?.id) continue;
    map[row.id] = row.name || row.project_name || "";
  }
  return map;
}

export function buildIdRecordMap(
  rows: Array<{ id?: string; [k: string]: unknown }>,
): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (const row of rows || []) {
    if (!row?.id) continue;
    map[row.id] = row;
  }
  return map;
}

export function buildWpLabelMap(
  workPackages: Array<{ id?: string; wp_number?: string | null; name?: string | null }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const wp of workPackages || []) {
    if (!wp?.id) continue;
    map[wp.id] = wp.wp_number || wp.name || "";
  }
  return map;
}

export function filterActiveDeliveries<T extends { is_deleted?: boolean | null }>(
  deliveries: T[],
): T[] {
  return (deliveries || []).filter((d) => !d?.is_deleted);
}

type Signals = {
  status?: string;
  risk?: string;
  overdue?: boolean;
  dueToday?: boolean;
  dueNext7?: boolean;
  unscheduled?: boolean;
  longLead?: boolean;
};

export type EnrichedDelivery = {
  id?: string;
  work_package_id?: string;
  project_id?: string;
  delivery_number?: string | null;
  delivery_title?: string | null;
  description?: string | null;
  vendor?: string | null;
  po_number?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  truck_number?: string | null;
  load_number?: string | null;
  load_category?: string | null;
  procurement_category?: string | null;
  receiving_location?: string | null;
  _signals?: Signals;
  [k: string]: unknown;
};

export function filterDeliveries(
  enriched: EnrichedDelivery[],
  opts: {
    statusFilter: string;
    riskFilter: string;
    scheduleFilter: string;
    search: string;
    seqFilter: unknown;
    readyToReceive: Array<{ id?: string }>;
    projectMap: Record<string, string>;
    workPackageMap: Record<string, Record<string, unknown>>;
    matchesSequenceFilter: (d: EnrichedDelivery, seq: unknown) => boolean;
    sortFn: (a: EnrichedDelivery, b: EnrichedDelivery) => number;
  },
): EnrichedDelivery[] {
  const q = opts.search.trim().toLowerCase();
  const readyIds = new Set((opts.readyToReceive || []).map((d) => d.id));
  return (enriched || [])
    .filter((delivery) => {
      const signals = delivery._signals || {};
      if (opts.statusFilter !== "all" && signals.status !== opts.statusFilter) return false;
      if (opts.riskFilter !== "all" && signals.risk !== opts.riskFilter) return false;
      if (opts.scheduleFilter === "late" && !signals.overdue) return false;
      if (opts.scheduleFilter === "today" && !signals.dueToday) return false;
      if (opts.scheduleFilter === "week" && !signals.dueNext7) return false;
      if (opts.scheduleFilter === "ready" && !readyIds.has(delivery.id)) return false;
      if (opts.scheduleFilter === "unscheduled" && !signals.unscheduled) return false;
      if (opts.scheduleFilter === "longLead" && !signals.longLead) return false;
      if (!opts.matchesSequenceFilter(delivery, opts.seqFilter)) return false;
      if (!q) return true;
      const wp = opts.workPackageMap[delivery.work_package_id as string];
      const haystack = [
        delivery.delivery_number,
        delivery.delivery_title,
        delivery.description,
        delivery.vendor,
        delivery.po_number,
        delivery.carrier,
        delivery.tracking_number,
        delivery.truck_number,
        delivery.load_number,
        delivery.load_category,
        delivery.procurement_category,
        delivery.receiving_location,
        opts.projectMap[delivery.project_id as string],
        wp?.wp_number,
        wp?.name,
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    })
    .sort(opts.sortFn);
}

export function groupDeliveriesByLane(
  filtered: EnrichedDelivery[],
  deliveryLane: (d: EnrichedDelivery) => string,
): Record<string, EnrichedDelivery[]> {
  const groups: Record<string, EnrichedDelivery[]> = Object.fromEntries(
    LANE_ORDER.map((lane) => [lane, [] as EnrichedDelivery[]]),
  );
  for (const delivery of filtered || []) {
    const lane = deliveryLane(delivery);
    if (!groups[lane]) groups.Exceptions.push(delivery);
    else groups[lane].push(delivery);
  }
  return groups;
}

export function nextSelectedIdsToggle(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function collectIds(
  rows: Array<{ id?: string | null }>,
): string[] {
  return (rows || [])
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));
}

export function selectionFromFiltered(
  rows: Array<{ id?: string | null }>,
): Set<string> {
  return new Set(collectIds(rows));
}

export function pruneSelectionToVisible(
  previous: Set<string>,
  rows: Array<{ id?: string | null }>,
): Set<string> {
  const visibleIds = new Set(collectIds(rows));
  const next = new Set([...previous].filter((id) => visibleIds.has(id)));
  return next.size === previous.size ? previous : next;
}

export function selectDeliveriesByIds<T extends { id?: string | null }>(
  rows: T[],
  selectedIds: Set<string>,
): T[] {
  return (rows || []).filter((d) => d?.id && selectedIds.has(d.id as string));
}

export function filterBlockedDeliveredIds(
  ids: string[],
  activeDeliveries: Array<{ id?: string | null; work_package_id?: string | null }>,
  isFabComplete: (delivery: any, workPackages: any[]) => boolean,
  workPackages: any[],
): string[] {
  return (ids || []).filter((id) => {
    const delivery = activeDeliveries.find((item) => item.id === id);
    return Boolean(delivery && !isFabComplete(delivery, workPackages));
  });
}

