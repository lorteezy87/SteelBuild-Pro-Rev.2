/**
 * Shared Set-based selection mutators for register/list shells.
 */

/** Toggle one id in a selection set (immutable). */
export function toggleSelectionId(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Replace selection with all ids or empty. */
export function selectAllOrNone(checked: boolean, ids: string[]): Set<string> {
  return checked ? new Set(ids) : new Set();
}

/** Drop selected ids that are no longer allowed/visible. */
export function pruneSelectionToAllowed(
  previous: Set<string>,
  allowedIds: Set<string>,
): Set<string> {
  const next = new Set([...previous].filter((id) => allowedIds.has(id)));
  return next.size === previous.size ? previous : next;
}

/** Selection set from rows that have ids. */
export function selectionFromIds(
  rows: Array<{ id?: string | null }>,
): Set<string> {
  return new Set(
    (rows || []).map((r) => r.id).filter((id): id is string => Boolean(id)),
  );
}

/** Remove one id if present (identity when missing). */
export function removeIdFromSelection(prev: Set<string>, id: string): Set<string> {
  if (!prev.has(id)) return prev;
  const next = new Set(prev);
  next.delete(id);
  return next;
}

/** Toggle id in a string[] list (punchlist-style). */
export function toggleIdInList(prev: string[], id: string): string[] {
  return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
}

/** Force-include or force-exclude one id (checkbox-driven). */
export function applySelectionChecked(
  prev: Set<string>,
  id: string,
  checked: boolean,
): Set<string> {
  const next = new Set(prev);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

/**
 * If every visible id is already selected, clear selection entirely;
 * otherwise add all visible ids (preserving any already selected).
 * Matches register bulk-select-all toggles on Submittals etc.
 */
export function toggleSelectAllVisible(
  prev: Set<string>,
  visibleIds: string[],
): Set<string> {
  const ids = (visibleIds || []).filter(Boolean);
  if (ids.length > 0 && ids.every((id) => prev.has(id))) {
    return new Set();
  }
  const next = new Set(prev);
  for (const id of ids) next.add(id);
  return next;
}

