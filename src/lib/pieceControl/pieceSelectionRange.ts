/**
 * Ordered multi-select helpers for piece assignment checkboxes.
 * Shift-click selects the inclusive range between the anchor and target.
 */

export function selectIdRange(
  orderedIds: string[],
  anchorId: string,
  targetId: string,
): string[] {
  const from = orderedIds.indexOf(anchorId);
  const to = orderedIds.indexOf(targetId);
  if (from < 0 && to < 0) return [];
  if (from < 0) return [targetId];
  if (to < 0) return [anchorId];
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return orderedIds.slice(start, end + 1);
}

/** Add every id in `rangeIds` to the current selection set. */
export function addIdsToSelection(
  current: Iterable<string>,
  rangeIds: Iterable<string>,
): Set<string> {
  const next = new Set(current);
  for (const id of rangeIds) next.add(id);
  return next;
}
