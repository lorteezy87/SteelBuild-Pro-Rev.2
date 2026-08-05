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

export type GlobalSearchResult = {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  status?: unknown;
  projectId?: unknown;
  page: string;
};

export type GlobalSearchCaches = {
  projects: any[];
  rfis: any[];
  drawings: any[];
  workPackages: any[];
  changeOrders: any[];
  contacts: any[];
};

/** Pure in-memory global search over cached entity lists (no network). */
export function runCachedGlobalSearch(args: {
  query: string;
  searchScope: string;
  activeProjectId?: string | null;
  caches: GlobalSearchCaches;
}): GlobalSearchResult[] {
  const { query, searchScope, activeProjectId, caches } = args;
  if (!query || query.length < 2) return [];

  const ql = query.toLowerCase();
  const currentProjectId = activeProjectId;

  // Helper: filter results by project scope
  const scopeFilter = <T extends { project_id?: string; projectId?: string }>(items: T[]): T[] => {
    if (searchScope === "project" && currentProjectId) {
      return items.filter(
        (i) => i.project_id === currentProjectId || i.projectId === currentProjectId,
      );
    }
    return items; // "all" scope returns everything
  };

  const searchResults: GlobalSearchResult[] = [];

  // Contacts-only mode: skip other entities
  if (searchScope === "contacts") {
    caches.contacts
      .filter(
        (c) =>
          c.first_name?.toLowerCase().includes(ql) ||
          c.last_name?.toLowerCase().includes(ql) ||
          c.company?.toLowerCase().includes(ql) ||
          c.email?.toLowerCase().includes(ql),
      )
      .slice(0, 12)
      .forEach((c) =>
        searchResults.push({
          type: "Contact",
          id: c.id,
          title: `${c.first_name} ${c.last_name}`,
          subtitle: [c.company, c.role, c.email].filter(Boolean).join(" · ") || "—",
          status: c.contact_type,
          projectId: c.project_id,
          page: "Contacts",
        }),
      );
    return searchResults;
  }

  // Filter from cached data — no network calls!
  caches.projects
    .filter(
      (p) =>
        p.name?.toLowerCase().includes(ql) || p.project_number?.toLowerCase().includes(ql),
    )
    .filter(
      (p) =>
        searchScope !== "project" || !currentProjectId || p.id === currentProjectId,
    )
    .forEach((p) =>
      searchResults.push({
        type: "Project",
        id: p.id,
        title: p.name,
        subtitle: `${p.project_number} · ${p.phase || "—"}`,
        status: p.health_status,
        projectId: p.id,
        page: "Projects",
      }),
    );

  scopeFilter(caches.rfis)
    .filter(
      (r) =>
        r.rfi_number?.toLowerCase().includes(ql) ||
        r.title?.toLowerCase().includes(ql) ||
        r.description?.toLowerCase().includes(ql),
    )
    .slice(0, 5)
    .forEach((r) =>
      searchResults.push({
        type: "RFI",
        id: r.id,
        title: `${r.rfi_number} · ${r.title}`,
        subtitle:
          searchScope === "all"
            ? `${r.project_name || "—"} · ${r.status}`
            : `${r.project_name} · ${r.status}`,
        status: r.priority,
        projectId: r.project_id,
        page: "RFIs",
      }),
    );

  scopeFilter(caches.drawings)
    .filter(
      (d) =>
        d.sheet_number?.toLowerCase().includes(ql) || d.title?.toLowerCase().includes(ql),
    )
    .slice(0, 5)
    .forEach((d) =>
      searchResults.push({
        type: "Drawing",
        id: d.id,
        title: `${d.sheet_number} · ${d.title}`,
        subtitle:
          searchScope === "all"
            ? `${d.project_name || "—"} · ${d.stage}`
            : `${d.project_name} · ${d.stage}`,
        status: d.stage,
        projectId: d.project_id,
        page: "Documents",
      }),
    );

  scopeFilter(caches.workPackages)
    .filter(
      (w) =>
        w.wp_number?.toLowerCase().includes(ql) || w.name?.toLowerCase().includes(ql),
    )
    .slice(0, 5)
    .forEach((w) =>
      searchResults.push({
        type: "WorkPackage",
        id: w.id,
        title: `${w.wp_number} · ${w.name}`,
        subtitle:
          searchScope === "all"
            ? `${w.project_name || "—"} · ${w.status}`
            : `${w.project_name} · ${w.status}`,
        status: w.status,
        projectId: w.project_id,
        page: "WorkPackages",
      }),
    );

  scopeFilter(caches.changeOrders)
    .filter(
      (c) =>
        c.co_number?.toLowerCase().includes(ql) || c.title?.toLowerCase().includes(ql),
    )
    .slice(0, 5)
    .forEach((c) =>
      searchResults.push({
        type: "ChangeOrder",
        id: c.id,
        title: `${c.co_number} · ${c.title}`,
        subtitle:
          searchScope === "all"
            ? `${c.project_name || "—"} · ${c.status}`
            : `${c.project_name} · ${c.status}`,
        status: c.status,
        projectId: c.project_id,
        page: "ChangeOrders",
      }),
    );

  caches.contacts
    .filter(
      (c) =>
        c.first_name?.toLowerCase().includes(ql) ||
        c.last_name?.toLowerCase().includes(ql) ||
        c.company?.toLowerCase().includes(ql),
    )
    .slice(0, 5)
    .forEach((c) =>
      searchResults.push({
        type: "Contact",
        id: c.id,
        title: `${c.first_name} ${c.last_name}`,
        subtitle: `${c.company || "—"} · ${c.role || "—"}`,
        status: c.contact_type,
        projectId: c.project_id,
        page: "Contacts",
      }),
    );

  return searchResults.slice(0, 12);
}

export const ICON_MAP: Record<string, string> = {
  Project: "▤",
  RFI: "⚑",
  Drawing: "▦",
  WorkPackage: "☰",
  ChangeOrder: "$",
  Contact: "👤",
  Module: "◈",
};

export const COLOR_MAP: Record<string, string> = {
  Project: "var(--accent)",
  RFI: "var(--status-warning-bright)",
  Drawing: "#0EA5E9",
  WorkPackage: "var(--status-review)",
  ChangeOrder: "var(--status-review)",
  Contact: "#0D9488",
  Module: "var(--accent)",
};

export type QuickNavItem = {
  icon: string;
  name: string;
  page: string;
  group: string;
};

export const QUICK_NAV: QuickNavItem[] = [
  { icon: "◈", name: "Dashboard", page: "Dashboard", group: "Navigate" },
  { icon: "⚑", name: "RFI Hub", page: "RFIs", group: "Navigate" },
  { icon: "▦", name: "Detailing", page: "DrawingSubmittalHub", group: "Navigate" },
  { icon: "☰", name: "Work Packages", page: "WorkPackages", group: "Navigate" },
  { icon: "📦", name: "Deliveries", page: "Deliveries", group: "Navigate" },
  { icon: "◎", name: "Budget Control", page: "CostHub", group: "Navigate" },
  { icon: "▣", name: "Piece Register", page: "PieceRegister", group: "Navigate" },
  { icon: "📑", name: "Contracts", page: "ContractManagement", group: "Navigate" },
  { icon: "$", name: "Change Orders", page: "ChangeOrders", group: "Navigate" },
  { icon: "📁", name: "Documents", page: "Documents", group: "Navigate" },
  { icon: "✨", name: "Portfolio", page: "PortfolioHub", group: "Navigate" },
];

export const SCOPE_OPTIONS = [
  { key: "project", label: "This Project" },
  { key: "all", label: "All Projects" },
  { key: "contacts", label: "Contacts" },
] as const;
