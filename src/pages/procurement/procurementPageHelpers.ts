import { exportToCSV } from "@/lib/csv";
/**
 * Pure helpers for Procurement page shell (subset filter / enrich / filter-sort).
 * Behavior-preserving extract from Procurement.tsx — do not mix with
 * procurementControlCenter.derive isLate/isOverdue (those use different ship fields).
 */
import { addWeeks } from "./format";
import type { Json } from "@/types/supabase";

const TERMINAL = new Set(["Received", "Cancelled"]);

export type ProcurementRawLike = {
  id?: string;
  is_deleted?: boolean | null;
  procurement_category?: string | null;
  status?: string | null;
  required_date?: string | null;
  scheduled_date?: string | null;
  order_placed_date?: string | null;
  lead_time_weeks?: number | null;
  expected_ship_date?: string | null;
  is_long_lead?: boolean | null;
  description?: string | null;
  vendor?: string | null;
  po_number?: string | null;
  weight_tons?: number | null;
  pieces?: number | null;
  work_package_id?: string | null;
  notes?: string | null;
  metadata?: Json | null;
  [k: string]: unknown;
};

export type EnrichedProcurementItem = ProcurementRawLike & {
  isLate: boolean | null | undefined | "";
  isOverdue: boolean | null | undefined | "";
  daysExposure: number | null;
  computedShipDate: string | null;
  effectiveShipDate: string | null;
  longLeadSlipping: boolean;
};

/** Procurement subset: has category and is not soft-deleted. */
export function filterProcurementSubset<T extends ProcurementRawLike>(rawItems: T[]): T[] {
  return (rawItems || []).filter((r) => !r.is_deleted && r.procurement_category);
}

/** Per-row late / overdue / lead-time derivations shared by list/pipeline/board. */
export function enrichProcurementItem(
  item: ProcurementRawLike,
  today: Date,
): EnrichedProcurementItem {
  const required = item.required_date ? new Date(item.required_date) : null;
  const promised = item.scheduled_date ? new Date(item.scheduled_date) : null;
  const status = item.status ?? "";
  const isLate =
    required &&
    promised &&
    promised > required &&
    !TERMINAL.has(status);
  const isOverdue =
    required && !TERMINAL.has(status) && required < today;
  const diff = required && promised ? +promised - +required : NaN;
  const daysExposure = Number.isFinite(diff) ? Math.ceil(diff / 86400000) : null;

  const computedShipDate =
    item.order_placed_date && item.lead_time_weeks
      ? addWeeks(item.order_placed_date, Number(item.lead_time_weeks))
      : null;
  const effectiveShipDate = item.expected_ship_date || computedShipDate;

  const longLeadSlipping = !!(
    item.is_long_lead &&
    effectiveShipDate &&
    item.required_date &&
    new Date(effectiveShipDate) > new Date(item.required_date) &&
    !TERMINAL.has(status)
  );

  return {
    ...item,
    isLate,
    isOverdue,
    daysExposure,
    computedShipDate,
    effectiveShipDate,
    longLeadSlipping,
  };
}

export function enrichProcurementItems(
  items: ProcurementRawLike[],
  today: Date,
): EnrichedProcurementItem[] {
  return (items || []).map((item) => enrichProcurementItem(item, today));
}

export type ProcurementFilterState = {
  filterCat: string;
  filterStatus: string;
  search: string;
};

/** Filter + overdue/late priority sort used by the page shell. */
export function filterAndSortEnriched(
  enriched: EnrichedProcurementItem[],
  f: ProcurementFilterState,
): EnrichedProcurementItem[] {
  const q = (f.search || "").toLowerCase();
  return (enriched || [])
    .filter((item) => {
      if (f.filterCat !== "all" && item.procurement_category !== f.filterCat) return false;
      if (f.filterStatus !== "all" && item.status !== f.filterStatus) return false;
      if (
        q &&
        !(
          item.description?.toLowerCase().includes(q) ||
          item.vendor?.toLowerCase().includes(q) ||
          item.po_number?.toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isLate && !b.isLate) return -1;
      if (!a.isLate && b.isLate) return 1;
      return 0;
    });
}

export function buildWpById<T extends { id?: string }>(workPackages: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const w of workPackages || []) if (w?.id) m.set(w.id, w);
  return m;
}

/**
 * metadata is jsonb. cost_estimate is only ever stored as a string (see form),
 * but Json also admits object/array — read only when metadata is a plain object.
 */
export function costEstimateFromMetadata(meta: Json | null | undefined): string | number {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const v = (meta as Record<string, unknown>).cost_estimate;
  return typeof v === "string" || typeof v === "number" ? v || "" : "";
}

export type WpLabelLike = {
  wp_number?: string | null;
  name?: string | null;
};

/** CSV row cells for one enriched procurement item (matches prior page export). */
export function buildProcurementCsvRow(
  i: EnrichedProcurementItem,
  wpById: Map<string, WpLabelLike>,
): Array<string | number> {
  return [
    i.description || "",
    i.procurement_category || "",
    i.vendor || "",
    i.po_number || "",
    i.status || "",
    i.required_date || "",
    i.scheduled_date || "",
    i.order_placed_date || "",
    i.expected_ship_date || i.computedShipDate || "",
    i.lead_time_weeks ?? "",
    i.is_long_lead ? "Yes" : "No",
    Number(i.weight_tons || 0) || "",
    Number(i.pieces || 0) || "",
    costEstimateFromMetadata(i.metadata),
    i.work_package_id
      ? wpById.get(i.work_package_id)?.wp_number || wpById.get(i.work_package_id)?.name || ""
      : "",
    i.notes || "",
  ];
}

export const PROCUREMENT_CSV_HEADERS = [
  "Item",
  "Category",
  "Vendor",
  "PO Number",
  "Status",
  "Required Date",
  "Promised Date",
  "Order Placed",
  "Expected Ship",
  "Lead (wk)",
  "Long Lead",
  "Weight (T)",
  "Pieces",
  "Cost Estimate",
  "Work Package",
  "Notes",
] as const;

/** Default procurement CSV filename (project stamp). */
export function procurementCsvFilename(
  projectName?: string | null,
  now: Date = new Date(),
): string {
  const stamp = now.toISOString().slice(0, 10);
  const slug = (projectName || "project").replace(/\W+/g, "-");
  return `procurement-${slug}-${stamp}.csv`;
}

/** Side-effect CSV download for Procurement items. */
export function downloadProcurementCsv(
  items: Array<Record<string, unknown>>,
  wpById: Map<string, { wp_number?: string | null; name?: string | null }>,
  projectName?: string | null,
  filename?: string,
): void {
  exportToCSV({
    filename: filename || procurementCsvFilename(projectName),
    headers: [...PROCUREMENT_CSV_HEADERS],
    rows: (items || []).map((i) => buildProcurementCsvRow(i as never, wpById)),
  });
}

