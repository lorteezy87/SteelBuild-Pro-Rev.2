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

/**
 * Read a row's status for bucketing. Statuses are TRIMMED because real rows
 * carry whitespace padding (imports, the MCP server, hand edits). The money
 * helpers in services/costRollup.ts have always trimmed — `computeRevisedCon-
 * tractValue` counts " Approved " toward the contract — so leaving the padding
 * in here made the CO *count* beside those dollars disagree with them. Trimming
 * can only move a padded status into the bucket it was already meant for.
 */
const statusOf = (row: StatusBearer): string => String(row?.status ?? "").trim();

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
  !RFI_CLOSED_STATUSES.has(statusOf(r));
export const isRfiClosed = (r: StatusBearer): boolean =>
  RFI_CLOSED_STATUSES.has(statusOf(r));

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
  !ACTION_ITEM_CLOSED_STATUSES.has(statusOf(a));

// ── Punchlist ─────────────────────────────────────────────────────
export const PUNCHLIST_CLOSED_STATUSES: ReadonlySet<string> = new Set([
  "Closed",
  "Complete",
  "Completed",
  "Done",
  "Resolved",
]);
export const isPunchlistOpen = (item: StatusBearer): boolean =>
  !PUNCHLIST_CLOSED_STATUSES.has(statusOf(item));

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
  CO_PENDING_STATUSES.has(statusOf(c));
export const isCoApproved = (c: StatusBearer): boolean =>
  CO_APPROVED_STATUSES.has(statusOf(c));
export const CO_REJECTED_STATUSES: ReadonlySet<string> = new Set(["Rejected", "Void"]);
/** Dead COs — neither in the contract nor in the pipeline. */
export const isCoRejected = (c: StatusBearer): boolean =>
  CO_REJECTED_STATUSES.has(statusOf(c));

// ── Work packages ─────────────────────────────────────────────────
export const WP_COMPLETE_STATUSES: ReadonlySet<string> = new Set(["Complete"]);
export const isWpComplete = (w: StatusBearer): boolean =>
  WP_COMPLETE_STATUSES.has(statusOf(w));
