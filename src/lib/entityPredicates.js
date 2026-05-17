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

// ── RFIs ──────────────────────────────────────────────────────────
// "Open" in the report sense = the RFI is still consuming attention.
// Void/Answered/Closed are terminal; everything else is open.
export const RFI_OPEN_STATUSES   = new Set(["Open", "Under Review", "Incomplete Response"]);
export const RFI_CLOSED_STATUSES = new Set(["Answered", "Closed", "Void"]);
export const isRfiOpen   = (r) => !RFI_CLOSED_STATUSES.has(r?.status);
export const isRfiClosed = (r) => RFI_CLOSED_STATUSES.has(r?.status);

// ── Action items ──────────────────────────────────────────────────
// Live action_items only carries Open / In Progress / Complete. We also
// guard against legacy "Closed" / "Resolved" / "Cancelled" values that
// some imports produced — those are still treated as terminal.
export const ACTION_ITEM_OPEN_STATUSES   = new Set(["Open", "In Progress"]);
export const ACTION_ITEM_CLOSED_STATUSES = new Set(["Complete", "Closed", "Resolved", "Cancelled"]);
export const isActionItemOpen = (a) => !ACTION_ITEM_CLOSED_STATUSES.has(a?.status);

// ── Change orders ─────────────────────────────────────────────────
// "Pending" in plain English = awaiting decision. The change_orders
// CHECK constraint has no literal "Pending" status — Submitted and
// Under Review are the two awaiting-decision values.
export const CO_PENDING_STATUSES  = new Set(["Submitted", "Under Review"]);
export const CO_APPROVED_STATUSES = new Set(["Approved"]);
export const CO_TERMINAL_STATUSES = new Set(["Approved", "Rejected", "Void"]);
export const isCoPending  = (c) => CO_PENDING_STATUSES.has(c?.status);
export const isCoApproved = (c) => CO_APPROVED_STATUSES.has(c?.status);

// ── Work packages ─────────────────────────────────────────────────
// "Complete" is the single terminal state. There is no "Shipped" status
// in the live work_packages CHECK constraint — anything that read
// `status === "Shipped"` was always returning 0.
export const WP_COMPLETE_STATUSES = new Set(["Complete"]);
export const isWpComplete = (w) => WP_COMPLETE_STATUSES.has(w?.status);
