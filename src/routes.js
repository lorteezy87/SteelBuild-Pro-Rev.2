/**
 * routes.js — single source of truth for route metadata.
 *
 * `pages.config.js` is auto-generated and only knows about page COMPONENTS.
 * This file adds the user-facing labels, document titles, and groupings that
 * Layout breadcrumbs, the sidebar, and `useDocumentTitle` all need to share.
 *
 * Editing the label for a page in one place updates the breadcrumb, the
 * browser tab title, and any analytics events tagged with `routeLabel(name)`.
 *
 * IMPORTANT: this module must stay a pure data export — no side-effectful
 * imports — so it can be loaded by tests under a plain Node environment.
 * `pages.config.js` transitively imports every page (and therefore three.js,
 * @thatopen, etc.), so we do NOT pull from it here.
 */

/**
 * Human-readable label for each page key. Falls back to a spaced-PascalCase
 * version of the page name when an entry is missing, so newly auto-registered
 * pages still render something sensible.
 */
export const PAGE_LABELS = {
  Dashboard:             "Dashboard",
  ProjectControlCenter:  "Project Control Center",
  ExecutiveView:         "Executive View",
  Projects:              "Projects",
  ProjectDetail:         "Project Detail",
  RFIs:                  "RFIs",
  RFIHub:                "RFI Command Center",
  Drawings:              "Drawings",
  DrawingAnalysis:       "Drawing Analysis",
  DrawingViewer:         "Drawing Viewer",
  Documents:             "Documents",
  ModelViewer:           "3D Model Viewer",
  WorkPackages:          "Work Packages",
  Constraints:           "Constraints",
  FabRelease:            "Fab Release",
  Procurement:           "Procurement",
  LookAheadSchedule:     "Look-Ahead Schedule",
  GanttChart:            "Gantt Chart",
  Schedule:              "Schedule",
  Deliveries:            "Deliveries",
  DailyLogs:             "Daily Logs",
  Photos:                "Photos",
  ProductionNotes:       "Production Notes",
  Meetings:              "Meetings",
  ActionItems:           "Action Items",
  Activity:              "Activity Log",
  Financials:            "Budget Control",
  CostDashboard:         "Cost Dashboard",
  ChangeOrders:          "Change Orders",
  ChangeRequests:        "Change Requests",
  SOV:                   "Schedule of Values",
  Expenses:              "Expenses",
  ResourceScheduling:    "Crew Scheduling",
  ResourceManagement:    "Resource Management",
  Reports:               "Reports",
  JobStatusReport:       "Job Status Report",
  AlertsCenter:          "Alerts Center",
  Alerts:                "Alerts",
  AIInsights:            "Portfolio Overview",
  AgentMemory:           "Agent Memory",
  Inspections:           "Inspections",
  Safety:                "Safety",
  Punchlist:             "Punchlist",
  QualityControl:        "Quality Control",
  ProjectCloseout:       "Project Closeout",
  Warranty:              "Warranty",
  DecisionLog:           "Decision Log",
  Contacts:              "Contacts",
  Vendors:               "Vendors",
  ScopeExclusions:       "Scope & Exclusions",
  Settings:              "Settings",
  UsersManagement:       "User Management",
  Financials_Detail:     "Financials Detail",
};

/**
 * Resolve a page key to a display label. Unknown keys get a best-effort
 * spaced version (e.g. "FabRelease" → "Fab Release") so new pages don't
 * crash the breadcrumb.
 */
export function routeLabel(pageName) {
  if (!pageName) return "Page";
  if (PAGE_LABELS[pageName]) return PAGE_LABELS[pageName];
  return String(pageName).replace(/([A-Z])/g, " $1").trim();
}

/**
 * The list of route paths the app actually serves, derived from the labels
 * registered in this file plus the static "/", "/Landing" and "/RFIHub"
 * mounts in App.jsx. Used by tests and preloaders to enumerate known
 * routes without importing the page components themselves.
 *
 * Keeping this list manual (synced with PAGE_LABELS) is intentional:
 * importing `PAGES` from pages.config.js would pull every page into the
 * test runner, which dies on three.js / @thatopen / web-ifc.
 */
export const ALL_ROUTE_PATHS = Array.from(new Set([
  "/",
  "/Landing",
  "/RFIHub",
  ...Object.keys(PAGE_LABELS).map((p) => `/${p}`),
]));

/**
 * Pages that warrant a tab-title with a project name when one is active.
 * Other pages (Settings, etc.) stay context-free.
 */
export const PROJECT_SCOPED_PAGES = new Set([
  "Dashboard", "ProjectControlCenter", "Drawings", "DrawingAnalysis", "DrawingViewer", "ModelViewer",
  "Schedule", "GanttChart", "Financials", "CostDashboard", "RFIs", "Deliveries",
  "DailyLogs", "Photos", "Inspections", "Punchlist", "Safety", "QualityControl",
  "WorkPackages", "Constraints", "FabRelease", "Procurement", "JobStatusReport",
  "ChangeOrders", "SOV", "Expenses", "Meetings", "ActionItems", "ProductionNotes",
]);
