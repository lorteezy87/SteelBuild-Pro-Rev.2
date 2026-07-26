/**
 * Pure helpers for optimistic React Query list caches.
 * Keep toast / network / hook wiring out of this module so rollback
 * behavior can be unit-tested without mounting hooks.
 */

/** Patch a single row in a cached entity list by id. */
export function applyOptimisticRowPatch<T extends { id?: string | null }>(
  list: T[] | undefined,
  id: string,
  patch: Partial<T>,
): T[] {
  return (list || []).map((row) =>
    row.id === id ? { ...row, ...patch } : row,
  );
}

/** Patch many rows that match an id set (e.g. bulk stage update). */
export function applyOptimisticBulkPatch<T extends { id?: string | null }>(
  list: T[] | undefined,
  ids: Iterable<string>,
  patch: Partial<T>,
): T[] {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  return (list || []).map((row) =>
    row?.id && idSet.has(row.id) ? { ...row, ...patch } : row,
  );
}

/**
 * Decide whether an onError handler should restore a previous snapshot.
 * Missing / undefined previous means there was nothing to roll back.
 */
export function shouldRollbackOptimistic<T>(
  previous: T[] | undefined | null,
): previous is T[] {
  return Array.isArray(previous);
}
