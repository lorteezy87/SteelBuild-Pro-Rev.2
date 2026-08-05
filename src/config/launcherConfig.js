/**
 * launcherConfig — desktop launcher + dock configuration.
 *
 * Additive layer over moduleRegistry: derives a flat module list (with a
 * category per the existing SIDEBAR_GROUPS), the dock default set, and the
 * launcher tile background-photo resolver. moduleRegistry shape is left
 * untouched so its dev-time schema validator keeps passing.
 *
 * photoFor returns null until the construction-photo pack ships — ModuleTile
 * then renders its dark-gradient fallback. The pack fills PHOTO_ASSETS later
 * (public/photos/desktop/<page>.webp).
 */
import { SIDEBAR_GROUPS } from "@/config/moduleRegistry";

/** Flat list: { page, label, category } in sidebar order. */
export const LAUNCHER_MODULES = SIDEBAR_GROUPS.flatMap((g) =>
  g.items.map((it) => ({ page: it.page, label: it.label, category: g.label })),
);

/** Rail categories: ALL + each sidebar group, in order. */
export const LAUNCHER_CATEGORIES = ["ALL", ...SIDEBAR_GROUPS.map((g) => g.label)];

/** Default dock pages — the moat + the most-used destinations. */
export const DOCK_DEFAULT_PAGES = [
  "Dashboard",
  "DrawingSubmittalHub",
  "RFIs",
  "ScheduleHub",
  "FabRelease",
  "Deliveries",
  "CostHub",
  "FieldToday",
];

/**
 * Background photos by page key, served from public/photos/desktop/.
 * A tile whose file is missing falls back to the gradient (ModuleTile onError).
 */
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

/** Background photo path for a launcher tile, or null to use the gradient fallback. */
export function photoFor(page) {
  return PHOTO_ASSETS[page] || null;
}

/** Modules in a category; "ALL" returns the full list. */
export function modulesForCategory(category) {
  if (!category || category === "ALL") return LAUNCHER_MODULES;
  return LAUNCHER_MODULES.filter((m) => m.category === category);
}

/** Case-insensitive label/page search; empty query returns everything. */
export function searchModules(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return LAUNCHER_MODULES;
  return LAUNCHER_MODULES.filter(
    (m) => m.label.toLowerCase().includes(q) || m.page.toLowerCase().includes(q),
  );
}

/** Dock module objects (resolved + filtered to known pages). */
export function dockModules(pages = DOCK_DEFAULT_PAGES) {
  return pages
    .map((p) => LAUNCHER_MODULES.find((m) => m.page === p))
    .filter(Boolean);
}
