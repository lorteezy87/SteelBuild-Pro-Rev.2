/**
 * launcherConfig — desktop launcher + dock configuration.
 *
 * The launcher follows the compact operational sidebar hierarchy. Deep pages
 * remain reachable from their local hubs without making the launcher a second
 * full navigation tree.
 */
import { SIDEBAR_GROUPS } from "@/config/moduleRegistry";

/** Flat list: { page, label, category } in sidebar order. */
export const LAUNCHER_MODULES = SIDEBAR_GROUPS.flatMap((g) =>
  g.items.map((it) => ({ page: it.page, label: it.label, category: g.label })),
);

/** Rail categories: ALL + each sidebar group, in order. */
export const LAUNCHER_CATEGORIES = ["ALL", ...SIDEBAR_GROUPS.map((g) => g.label)];

/** Default dock pages — high-frequency destinations represented in the compact nav. */
export const DOCK_DEFAULT_PAGES = [
  "Dashboard",
  "DrawingSubmittalHub",
  "RFIs",
  "WorkPackages",
  "FabRelease",
  "Deliveries",
  "CostHub",
  "FieldToday",
];

export const PHOTO_ASSETS = {
  Dashboard: "/photos/desktop/Dashboard.webp",
  CommandCenter: "/photos/desktop/CommandCenter.webp",
  PortfolioHub: "/photos/desktop/PortfolioHub.webp",
  ProjectsHub: "/photos/desktop/ProjectsHub.webp",
  DrawingSubmittalHub: "/photos/desktop/DrawingSubmittalHub.webp",
  ScheduleHub: "/photos/desktop/ScheduleHub.webp",
  RFIs: "/photos/desktop/RFIs.webp",
  ActionItems: "/photos/desktop/ActionItems.webp",
  WorkPackages: "/photos/desktop/WorkPackages.webp",
  FabRelease: "/photos/desktop/FabRelease.webp",
  ProductionStatus: "/photos/desktop/ProductionStatus.webp",
  Procurement: "/photos/desktop/Procurement.webp",
  BudgetHours: "/photos/desktop/BudgetHours.webp",
  RiskHub: "/photos/desktop/RiskHub.webp",
  ResourceHub: "/photos/desktop/ResourceHub.webp",
  Deliveries: "/photos/desktop/Deliveries.webp",
  FieldToday: "/photos/desktop/FieldToday.webp",
  FieldHub: "/photos/desktop/FieldHub.webp",
  CostHub: "/photos/desktop/CostHub.webp",
  ChangeOrders: "/photos/desktop/ChangeOrders.webp",
  SOV: "/photos/desktop/SOV.webp",
  PayApplications: "/photos/desktop/PayApplications.webp",
  Backcharges: "/photos/desktop/Backcharges.webp",
  Expenses: "/photos/desktop/Expenses.webp",
  Documents: "/photos/desktop/Documents.webp",
  ReportsHub: "/photos/desktop/ReportsHub.webp",
  OrgMembers: "/photos/desktop/OrgMembers.webp",
  Billing: "/photos/desktop/Billing.webp",
  Vendors: "/photos/desktop/Vendors.webp",
  Settings: "/photos/desktop/Settings.webp",
  CalculatorsHub: "/photos/desktop/CalculatorsHub.webp",
};

export function photoFor(page) {
  return PHOTO_ASSETS[page] || null;
}

export function modulesForCategory(category) {
  if (!category || category === "ALL") return LAUNCHER_MODULES;
  return LAUNCHER_MODULES.filter((m) => m.category === category);
}

export function searchModules(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return LAUNCHER_MODULES;
  return LAUNCHER_MODULES.filter(
    (m) => m.label.toLowerCase().includes(q) || m.page.toLowerCase().includes(q),
  );
}

export function dockModules(pages = DOCK_DEFAULT_PAGES) {
  return pages
    .map((p) => LAUNCHER_MODULES.find((m) => m.page === p))
    .filter(Boolean);
}
