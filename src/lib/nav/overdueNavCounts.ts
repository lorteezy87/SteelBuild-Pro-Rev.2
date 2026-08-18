/**
 * Slim nav-badge overdue queries.
 *
 * Layout chrome only needs an overdue count. Fetching every RFI / drawing /
 * delivery row (all columns + project embed) just to count a handful of late
 * items is the hottest unused payload on every project-scoped page once the
 * modules menu opens. These helpers keep the same overdue predicates as
 * useLayoutNavData while pushing date + status filters to PostgREST and
 * requesting only the count columns.
 */

export const NAV_RFI_COLUMNS = "id,date_required,status";
export const NAV_DRAWING_COLUMNS = "id,due_date,stage";
export const NAV_DELIVERY_COLUMNS = "id,scheduled_date,status";

export const CLOSED_RFI_STATUSES = ["Answered", "Closed"] as const;

export function navOverdueCutoffIso(now: Date = new Date()): string {
  return now.toISOString();
}

export function rfiNavOverdueConditions(projectId: string, nowIso: string) {
  return {
    project_id: projectId,
    "date_required.lt": nowIso,
    "status.nin": [...CLOSED_RFI_STATUSES],
  };
}

export function drawingNavOverdueConditions(projectId: string, nowIso: string) {
  return {
    project_id: projectId,
    "due_date.lt": nowIso,
    "stage.neq": "Released",
  };
}

export function deliveryNavOverdueConditions(projectId: string, nowIso: string) {
  return {
    project_id: projectId,
    "scheduled_date.lt": nowIso,
    "status.neq": "Delivered",
  };
}

type RfiLike = { date_required?: string | null; status?: string | null };
type DrawingLike = { due_date?: string | null; stage?: string | null };
type DeliveryLike = { scheduled_date?: string | null; status?: string | null };

/** Same predicate the chrome used before the slim fetch. Safety net after server filters. */
export function countOverdueRfis(rows: readonly RfiLike[], nowMs: number): number {
  return rows.filter((row) =>
    Boolean(row.date_required)
    && new Date(row.date_required as string).getTime() < nowMs
    && !CLOSED_RFI_STATUSES.includes(row.status as (typeof CLOSED_RFI_STATUSES)[number]),
  ).length;
}

export function countOverdueDrawings(rows: readonly DrawingLike[], nowMs: number): number {
  return rows.filter((row) =>
    Boolean(row.due_date)
    && new Date(row.due_date as string).getTime() < nowMs
    && row.stage !== "Released",
  ).length;
}

export function countOverdueDeliveries(rows: readonly DeliveryLike[], nowMs: number): number {
  return rows.filter((row) =>
    Boolean(row.scheduled_date)
    && new Date(row.scheduled_date as string).getTime() < nowMs
    && row.status !== "Delivered",
  ).length;
}
