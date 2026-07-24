/**
 * Shared entity predicates — single source of truth for "what counts as
 * Open / Closed / Pending / Complete" across the reports and dashboards.
 *
 * Multiple report pages were inlining slightly different status lists
 * (e.g. "Open RFI" sometimes excluded "Incomplete Response", sometimes
 * included "Open" only). The numbers diverged across reports for the
 * same data. These predicates are the canonical answer — import them
 * everywhere and the totals stay consistent.
 *
 * Status enums are sourced from the live Supabase CHECK constraints:
 *   - rfis.status        ∈ Open / Under Review / Incomplete Response /
 *                         Answered / Closed / Void
 *   - action_items.status∈ Open / In Progress / Complete
 *   - change_orders.statu∈ Draft / Submitted / Under Review / Approved /
 *                         Rejected / Void
 *   - work_packages.statu∈ Not Started / In Progress / Complete / On Hold
 */

export type StatusBearer = { status?: string | null } | null | undefined;

// ── RFIs ──────────────────────────────────────────────────────────
export const RFI_OPEN_STATUSES: ReadonlySet<string> = new Set([
  "Open",
  "Under Review",
  "Incomplete Response",
]);
export const RFI_CLOSED_STATUSES: ReadonlySet<string> = new Set([
  "Answered",
  "Closed",
  "Void",
]);
export const isRfiOpen = (r: StatusBearer): boolean =>
  !RFI_CLOSED_STATUSES.has(r?.status ?? "");
export const isRfiClosed = (r: StatusBearer): boolean =>
  RFI_CLOSED_STATUSES.has(r?.status ?? "");

// ── Action items ──────────────────────────────────────────────────
export const ACTION_ITEM_OPEN_STATUSES: ReadonlySet<string> = new Set([
  "Open",
  "In Progress",
]);
export const ACTION_ITEM_CLOSED_STATUSES: ReadonlySet<string> = new Set([
  "Complete",
  "Closed",
  "Resolved",
  "Cancelled",
]);
export const isActionItemOpen = (a: StatusBearer): boolean =>
  !ACTION_ITEM_CLOSED_STATUSES.has(a?.status ?? "");

// ── Change orders ─────────────────────────────────────────────────
export const CO_PENDING_STATUSES: ReadonlySet<string> = new Set([
  "Submitted",
  "Under Review",
]);
export const CO_APPROVED_STATUSES: ReadonlySet<string> = new Set(["Approved"]);
export const CO_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "Approved",
  "Rejected",
  "Void",
]);
export const isCoPending = (c: StatusBearer): boolean =>
  CO_PENDING_STATUSES.has(c?.status ?? "");
export const isCoApproved = (c: StatusBearer): boolean =>
  CO_APPROVED_STATUSES.has(c?.status ?? "");

// ── Work packages ─────────────────────────────────────────────────
export const WP_COMPLETE_STATUSES: ReadonlySet<string> = new Set(["Complete"]);
export const isWpComplete = (w: StatusBearer): boolean =>
  WP_COMPLETE_STATUSES.has(w?.status ?? "");
