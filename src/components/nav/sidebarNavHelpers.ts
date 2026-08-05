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

export const RAIL_LS_KEY = "sbp-sidebar-rail";
export const RECENTS_LS_KEY = "sbp-sidebar-recents";
export const MAX_RECENTS = 4;
export const FAVORITES_LS_KEY = "sbp-sidebar-favorites";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function storage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadRailState(): boolean {
  try {
    return storage()?.getItem(RAIL_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveRailState(v: boolean): void {
  try {
    storage()?.setItem(RAIL_LS_KEY, v ? "1" : "0");
  } catch {
    /* noop */
  }
}

export function loadRecents(): string[] {
  try {
    const raw = storage()?.getItem(RECENTS_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecents(pages: string[]): void {
  try {
    storage()?.setItem(RECENTS_LS_KEY, JSON.stringify(pages));
  } catch {
    /* noop */
  }
}

export function loadFavorites(): string[] {
  try {
    const raw = storage()?.getItem(FAVORITES_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(pages: string[]): void {
  try {
    storage()?.setItem(FAVORITES_LS_KEY, JSON.stringify(pages));
  } catch {
    /* noop */
  }
}

