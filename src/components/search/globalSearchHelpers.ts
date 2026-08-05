/**
 * Pure module filter / display merge for GlobalSearchModal.
 */

export type QuickNavModule = {
  name: string;
  page: string;
  group?: string;
  icon?: unknown;
  [key: string]: unknown;
};

export function filterQuickNavModules<T extends QuickNavModule>(
  modules: T[],
  query: string,
): T[] {
  if (query.length >= 2) return [];
  if (query.length === 0) return modules;
  const ql = query.toLowerCase();
  return modules.filter((m) => m.name.toLowerCase().includes(ql));
}

export function buildSearchDisplayItems<
  R,
  M extends QuickNavModule,
>(
  results: R[],
  filteredModules: M[],
): R[] | Array<{
  type: string;
  id: string;
  title: string;
  subtitle: string | undefined;
  page: string;
  icon: unknown;
}> {
  if (results.length > 0) return results;
  return filteredModules.map((m) => ({
    type: "Module",
    id: m.page,
    title: m.name,
    subtitle: m.group,
    page: m.page,
    icon: m.icon,
  }));
}
