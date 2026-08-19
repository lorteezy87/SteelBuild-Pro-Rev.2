/**
 * Shared list/filter bound helpers.
 *
 * `list()` used to ignore a numeric second argument, so call sites such as
 * `DrawingActivity.list("-created_at", 50)` silently fetched LIST_ROW_CAP rows.
 */

export const LIST_ROW_CAP = 2000;

export function resolveListLimit(limit?: number): number {
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return Math.min(Math.floor(limit), 100_000);
  }
  return LIST_ROW_CAP;
}

/**
 * `list(sortBy, limit)` and `list(sortBy, columns)` are both accepted so a
 * mistaken listAll-style column string does not become `limit=NaN`.
 */
export function resolveListReadArgs(
  limitOrColumns?: number | string,
  columns?: string,
): { limit: number; columns?: string } {
  if (typeof limitOrColumns === "string") {
    return { limit: LIST_ROW_CAP, columns: limitOrColumns };
  }
  return { limit: resolveListLimit(limitOrColumns), columns };
}
