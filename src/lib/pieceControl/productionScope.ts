/** Sentinel for Production board WP filter (not a real package id). */
export const UNASSIGNED_WP_FILTER = "__unassigned__";

/**
 * Resolve the Production board work-package scope for snapshot fetch.
 * - `undefined`: all lots
 * - `null`: unassigned lots
 * - uuid: one work package
 */
export function resolveProductionWorkPackageScope(
  lockedWorkPackageId: string | undefined,
  boardFilter: string,
): string | null | undefined {
  if (lockedWorkPackageId) return lockedWorkPackageId;
  if (boardFilter === UNASSIGNED_WP_FILTER) return null;
  if (boardFilter) return boardFilter;
  return undefined;
}

export function productionScopeQueryKey(
  scope: string | null | undefined,
): string {
  if (scope === null) return "unassigned";
  return scope ?? "all";
}

export function productionScopeFetchArg(
  scopeKey: string,
): string | null | undefined {
  if (scopeKey === "all") return undefined;
  if (scopeKey === "unassigned") return null;
  return scopeKey;
}
