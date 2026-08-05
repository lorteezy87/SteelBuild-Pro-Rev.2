/** Pure filter/selection mutators for Documents page shell. */

export function nextActiveFilters(
  prev: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return { ...(prev || {}), [key]: value };
}

export function nextCategoryFilters(
  prev: Record<string, unknown>,
  value: string,
): Record<string, unknown> {
  return {
    ...(prev || {}),
    category: value === "All" ? [] : [value],
  };
}

export function categoryFilterFromActive(
  activeFilters: { category?: string[] | null } | null | undefined,
): string {
  return activeFilters?.category?.[0] || "All";
}

export function pruneSelectionToAllowed(
  previous: Set<string>,
  allowedIds: Set<string>,
): Set<string> {
  const next = new Set([...previous].filter((id) => allowedIds.has(id)));
  return next.size === previous.size ? previous : next;
}

export function toggleSelectionId(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectionFromDocs(docs: Array<{ id?: string }>): Set<string> {
  return new Set((docs || []).map((d) => d.id).filter(Boolean) as string[]);
}

export function removeIdFromSelection(prev: Set<string>, id: string): Set<string> {
  if (!prev.has(id)) return prev;
  const next = new Set(prev);
  next.delete(id);
  return next;
}

/** Selected document rows from full list (order preserved). */
export function selectDocsByIds<T extends { id?: string | null }>(
  docs: T[],
  selectedIds: Set<string>,
): T[] {
  return (docs || []).filter((d) => d?.id && selectedIds.has(d.id as string));
}

/** Count live documents for a status tab key ("all" or concrete status). */
export function countDocsForStatusTab<T extends { status?: string | null }>(
  docs: T[],
  tabKey: string,
): number {
  if (tabKey === "all") return (docs || []).length;
  return (docs || []).filter((d) => d.status === tabKey).length;
}

