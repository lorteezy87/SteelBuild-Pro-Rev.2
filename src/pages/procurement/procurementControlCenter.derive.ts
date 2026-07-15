/**
 * Pure derivations for the Procurement Control Center (canonical presentation redesign).
 * No React, no network. Works over the procurement-subset of the `deliveries`
 * table (rows where procurement_category IS NOT NULL and is_deleted = false).
 *
 * Real column inventory (from types/supabase.ts → deliveries.Row):
 *   id, project_id, status, procurement_category, vendor, po_number,
 *   description, required_date, scheduled_date, order_placed_date,
 *   expected_ship_date, lead_time_weeks, is_long_lead, weight_tons,
 *   pieces, work_package_id, notes, metadata (jsonb), priority,
 *   is_deleted, deleted_at
 *
 * NOTE: There is NO cost/dollar-value column on deliveries.
 * `metadata.cost_estimate` is the only cost field (jsonb, user-entered
 * string in the form). We surface it as a raw string; no money formatting.
 * Mark any KPI that would need a true numeric cost as MISSING below.
 */

export interface ProcurementItem {
  id: string;
  project_id?: string | null;
  status?: string | null;
  procurement_category?: string | null;
  vendor?: string | null;
  po_number?: string | null;
  description?: string | null;
  required_date?: string | null;       // need-by date
  scheduled_date?: string | null;      // promised delivery date
  order_placed_date?: string | null;
  expected_ship_date?: string | null;
  lead_time_weeks?: number | null;
  is_long_lead?: boolean | null;
  weight_tons?: number | null;
  pieces?: number | null;
  work_package_id?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  priority?: string | null;
  [key: string]: unknown;
}

// The procurement pipeline order.
const TERMINAL_STATUSES = new Set(["Received", "Cancelled"]);
const OPEN_STATUSES = new Set([
  "Identified", "Quoted", "PO Issued", "Confirmed", "In Production", "Shipped",
]);

/** Days from today until `isoDate`; negative = past, null = missing/invalid. */
export function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

/** True when the item has a need-by date that has already passed and isn't terminal. */
export function isOverdue(item: ProcurementItem): boolean {
  if (!item.required_date) return false;
  if (TERMINAL_STATUSES.has(item.status ?? "")) return false;
  const diff = daysUntil(item.required_date);
  return diff !== null && diff < 0;
}

/** True when the promised/expected ship date slips past the need-by date. */
export function isLate(item: ProcurementItem): boolean {
  if (!item.required_date) return false;
  if (TERMINAL_STATUSES.has(item.status ?? "")) return false;
  const effectiveShip = item.expected_ship_date || computedShipDate(item);
  if (!effectiveShip) return false;
  const reqDiff = daysUntil(item.required_date);
  const shipDiff = daysUntil(effectiveShip);
  if (reqDiff === null || shipDiff === null) return false;
  return shipDiff > reqDiff; // ship after need-by
}

/** Implied ship date from order_placed + lead_time_weeks, or null. */
export function computedShipDate(item: ProcurementItem): string | null {
  if (!item.order_placed_date || !item.lead_time_weeks) return null;
  const d = new Date(`${item.order_placed_date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Math.round(Number(item.lead_time_weeks) * 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Risk score — higher = needs more attention. Analogous to the RFI riskScore.
 * Drives the "Needs Attention" panel queue ordering.
 */
export function riskScore(item: ProcurementItem): number {
  let score = 0;
  const diff = daysUntil(item.required_date);
  if (isOverdue(item)) score += 800;
  if (isLate(item)) score += 400;
  if (item.is_long_lead) score += 200;
  if (diff !== null && diff >= 0 && diff <= 7) score += 150;
  if (item.status === "Identified") score += 60;  // not yet quoted = at risk
  if (item.priority === "High") score += 80;
  // Age contribution: days since order_placed (or rough count from created).
  return score;
}

export interface VendorSummaryRow {
  vendor: string;
  count: number;
  overdueCount: number;
  pendingCount: number;
}

/** Group OPEN items by vendor → count, overdue count, pending (not shipped) count. */
export function vendorSummary(items: ProcurementItem[]): VendorSummaryRow[] {
  const groups = new Map<string, ProcurementItem[]>();
  for (const item of items) {
    if (TERMINAL_STATUSES.has(item.status ?? "")) continue;
    const v = item.vendor || "Unassigned";
    const bucket = groups.get(v);
    if (bucket) bucket.push(item);
    else groups.set(v, [item]);
  }
  const rows: VendorSummaryRow[] = [];
  for (const [vendor, members] of groups) {
    rows.push({
      vendor,
      count: members.length,
      overdueCount: members.filter(isOverdue).length,
      pendingCount: members.filter((m) => OPEN_STATUSES.has(m.status ?? "")).length,
    });
  }
  return rows.sort((a, b) => b.count - a.count);
}

export interface ProcurementSummary {
  total: number;
  open: number;
  partiallyReceived: number;   // Shipped (en route, not yet confirmed received)
  overdue: number;
  longLead: number;
  longLeadSlipping: number;
  totalWeightTons: number;
  // Panel queues
  attentionQueue: ProcurementItem[];  // open items sorted by riskScore desc
  awaitingDelivery: ProcurementItem[];  // Shipped items
  vendorSummary: VendorSummaryRow[];
}

/**
 * All KPIs + panel queues for the Procurement Control Center.
 * Input: the already-filtered, non-deleted procurement items from the page.
 */
export function buildProcurementSummary(items: ProcurementItem[]): ProcurementSummary {
  const open = items.filter((i) => !TERMINAL_STATUSES.has(i.status ?? ""));
  const overdue = open.filter(isOverdue);
  const shipped = items.filter((i) => i.status === "Shipped");
  const longLead = items.filter((i) => i.is_long_lead === true);
  const longLeadSlipping = longLead.filter(isLate);
  const totalWeightTons = items.reduce((sum, i) => sum + (Number(i.weight_tons) || 0), 0);

  const byRisk = [...open].sort((a, b) => riskScore(b) - riskScore(a));

  return {
    total: items.length,
    open: open.length,
    partiallyReceived: shipped.length,
    overdue: overdue.length,
    longLead: longLead.length,
    longLeadSlipping: longLeadSlipping.length,
    totalWeightTons,
    attentionQueue: byRisk.slice(0, 6),
    awaitingDelivery: shipped.slice(0, 6),
    vendorSummary: vendorSummary(items),
  };
}
