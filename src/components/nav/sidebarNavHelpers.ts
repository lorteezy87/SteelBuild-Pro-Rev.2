/** Pure favorite/recent resolution for SidebarNav. */

export type SidebarItem = { page: string; [key: string]: unknown };
export type SidebarGroup = { label: string; items: SidebarItem[] };

export function filterVisibleSidebarGroups(
  groups: SidebarGroup[],
  isPageVisible: (page: string) => boolean,
): SidebarGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => isPageVisible(it.page)) }))
    .filter((g) => g.items.length > 0);
}

export function flattenSidebarItems(visibleGroups: SidebarGroup[]) {
  return visibleGroups.flatMap((g) =>
    g.items.map((it) => ({ ...it, _group: g.label })),
  );
}

export function resolveFavoriteItems(
  visibleGroups: SidebarGroup[],
  favorites: string[],
  pinned_modules: string[] | null | undefined,
) {
  const flat = flattenSidebarItems(visibleGroups);
  const merged = [
    ...favorites,
    ...(pinned_modules || []).filter((p) => !favorites.includes(p)),
  ];
  return merged.map((p) => flat.find((it) => it.page === p)).filter(Boolean);
}

export function resolveRecentItems(
  visibleGroups: SidebarGroup[],
  recents: string[],
  currentPageName: string | null | undefined,
  limit = 3,
) {
  const flat = flattenSidebarItems(visibleGroups);
  return recents
    .map((p) => flat.find((it) => it.page === p))
    .filter(Boolean)
    .filter((it: any) => it.page !== currentPageName)
    .slice(0, limit);
}
