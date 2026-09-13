export interface SidebarNavItem {
  label: string;
  page: string;
  icon?: string;
  badgeKey?: string;
}

export interface SidebarNavGroup {
  label: string;
  collapsible: boolean;
  items: SidebarNavItem[];
}

export interface GroupedSidebarNavItem extends SidebarNavItem {
  _group: string;
}

export type SidebarCollapseState = Record<string, boolean>;

export function filterVisibleSidebarGroups(
  groups: SidebarNavGroup[],
  isPageVisible: (page: string) => boolean,
): SidebarNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isPageVisible(item.page)),
    }))
    .filter((group) => group.items.length > 0);
}

export function flattenSidebarGroups(groups: SidebarNavGroup[]): GroupedSidebarNavItem[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({ ...item, _group: group.label })),
  );
}

export function deriveFavoriteItems(
  groups: SidebarNavGroup[],
  favorites: string[],
): GroupedSidebarNavItem[] {
  const itemsByPage = new Map(
    flattenSidebarGroups(groups).map((item) => [item.page, item]),
  );
  return favorites
    .map((page) => itemsByPage.get(page))
    .filter((item): item is GroupedSidebarNavItem => item !== undefined);
}

export function deriveRecentItems(
  groups: SidebarNavGroup[],
  recents: string[],
  currentPageName: string | undefined,
  limit = 3,
): GroupedSidebarNavItem[] {
  const itemsByPage = new Map(
    flattenSidebarGroups(groups).map((item) => [item.page, item]),
  );
  return recents
    .map((page) => itemsByPage.get(page))
    .filter((item): item is GroupedSidebarNavItem => item !== undefined)
    .filter((item) => item.page !== currentPageName)
    .slice(0, limit);
}

export function findActiveSidebarGroup(
  groups: SidebarNavGroup[],
  currentPageName: string | undefined,
): SidebarNavGroup | undefined {
  return groups.find((group) =>
    group.items.some((item) => item.page === currentPageName),
  );
}

export function createInitialCollapseState(
  groups: SidebarNavGroup[],
  collapseGroups: boolean,
): SidebarCollapseState {
  return Object.fromEntries(
    groups
      .filter((group) => group.collapsible)
      .map((group) => [group.label, collapseGroups]),
  );
}

export function collapseAroundActivePage(
  groups: SidebarNavGroup[],
  currentPageName: string | undefined,
  previous: SidebarCollapseState,
): SidebarCollapseState {
  const activeGroup = findActiveSidebarGroup(groups, currentPageName);
  if (!activeGroup) return previous;

  const next = createInitialCollapseState(groups, true);
  if (activeGroup.collapsible) next[activeGroup.label] = false;
  return Object.keys(next).some((label) => next[label] !== Boolean(previous[label]))
    ? next
    : previous;
}

export function hasExpandedCollapsibleGroup(
  groups: SidebarNavGroup[],
  collapsed: SidebarCollapseState,
): boolean {
  return groups.some((group) => group.collapsible && !collapsed[group.label]);
}

export function createToggleAllCollapseState(
  groups: SidebarNavGroup[],
  collapsed: SidebarCollapseState,
): SidebarCollapseState {
  return createInitialCollapseState(
    groups,
    hasExpandedCollapsibleGroup(groups, collapsed),
  );
}

const DASHBOARD_ROUTE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  DrawingSubmittalHub: ["Drawings", "Submittals"],
};

export function isDashboardSidebarItemActive(
  itemPage: string,
  currentPageName: string | undefined,
): boolean {
  return itemPage === currentPageName
    || DASHBOARD_ROUTE_ALIASES[itemPage]?.includes(currentPageName ?? "") === true;
}
