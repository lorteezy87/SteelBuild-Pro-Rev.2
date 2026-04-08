/**
 * navigationConfig.js — Single source of truth for navigation structure.
 *
 * Extracted from Layout.jsx. All module definitions, tab mappings,
 * page labels, and column assignments live here.
 *
 * Layout.jsx, Breadcrumbs, and GlobalSearch all consume this config.
 */

// ─── Module groups ──────────────────────────────────────────────────────

export const MODULE_GROUPS = {
  OVERVIEW: [
    { label: "Dashboard",              page: "Dashboard" },
    { label: "Executive Dashboard",    page: "ExecutiveDashboard" },
    { label: "Project Control Center", page: "ProjectControlCenter" },
    { label: "AI Insights",            page: "AIInsights" },
  ],
  "JOB SETUP": [
    { label: "Projects",              page: "Projects" },
    { label: "Contacts",              page: "Contacts" },
    { label: "Scope & Exclusions",    page: "ScopeExclusions" },
  ],
  "DOCUMENTS & DRAWINGS": [
    { label: "Drawings",              page: "Drawings" },
    { label: "Drawing Viewer",        page: "DrawingViewer" },
    { label: "Document Control",      page: "DocumentControl" },
    { label: "RFIs",                  page: "RFIs" },
    { label: "Submittals",            page: "Submittals" },
  ],
  COMMUNICATIONS: [
    { label: "Transmittals",          page: "Transmittals" },
    { label: "Meetings",              page: "Meetings" },
    { label: "Daily Reports",         page: "DailyReports" },
    { label: "Production Notes",      page: "ProductionNotes" },
    { label: "Action Items",          page: "ActionItems" },
  ],
  FABRICATION: [
    { label: "Work Packages",         page: "WorkPackages" },
    { label: "CNC / Tekla",           page: "CNCTekla" },
    { label: "BOM Generator",         page: "BOMGenerator" },
    { label: "Cutting Lists",         page: "CuttingLists" },
    { label: "Weld Maps",             page: "WeldMaps" },
  ],
  "FIELD & LOGISTICS": [
    { label: "Deliveries",            page: "Deliveries" },
    { label: "Field Ops",             page: "FieldOps" },
    { label: "Inspections",           page: "Inspections" },
    { label: "Punch List",            page: "PunchList" },
    { label: "Safety / JHA",          page: "Safety" },
    { label: "Photos",                page: "Photos" },
  ],
  SCHEDULING: [
    { label: "Schedule",              page: "Schedule" },
    { label: "Gantt Chart",           page: "GanttChart" },
    { label: "Resource Mgmt",         page: "ResourceManagement" },
    { label: "Lookahead",             page: "Lookahead" },
  ],
  "COST CONTROL": [
    { label: "Financials",            page: "Financials" },
    { label: "Expenses / AP",         page: "Expenses" },
    { label: "Schedule of Values",    page: "SOV" },
    { label: "Change Orders",         page: "ChangeOrders" },
    { label: "Change Requests",       page: "ChangeRequests" },
    { label: "Procurement",           page: "Procurement" },
    { label: "Vendors",               page: "Vendors" },
  ],
  REPORTING: [
    { label: "Reports",               page: "Reports" },
    { label: "Decision Log",          page: "DecisionLog" },
    { label: "Lessons Learned",       page: "LessonsLearned" },
  ],
  QUALITY: [
    { label: "QC Dashboard",          page: "QCDashboard" },
  ],
  CLOSEOUT: [
    { label: "Closeout",              page: "Closeout" },
    { label: "Warranty Tracker",      page: "WarrantyTracker" },
    { label: "As-Builts",             page: "AsBuilts" },
  ],
  USER: [
    { label: "Users & Roles",         page: "Users", adminOnly: true },
    { label: "Settings",              page: "Settings" },
    { label: "Alerts Center",         page: "Alerts" },
  ],
};

// ─── Flat list of all modules ───────────────────────────────────────────

export const ALL_MODULES = Object.entries(MODULE_GROUPS).flatMap(([group, modules]) =>
  modules.map((m) => ({ ...m, group }))
);

// ─── Page label map (page key → display label) ─────────────────────────

export const PAGE_LABELS = Object.fromEntries(ALL_MODULES.map((m) => [m.page, m.label]));

// ─── Tab structure ──────────────────────────────────────────────────────

export const PRIMARY_TABS = [
  { label: "Overview",     pages: ["Dashboard", "ExecutiveDashboard", "ProjectControlCenter", "AIInsights"] },
  { label: "Documents",    pages: ["Drawings", "DrawingViewer", "DocumentControl", "RFIs", "Submittals"] },
  { label: "Fabrication",  pages: ["WorkPackages", "CNCTekla", "BOMGenerator", "CuttingLists", "WeldMaps"] },
  { label: "Field",        pages: ["Deliveries", "FieldOps", "Inspections", "PunchList", "Safety", "Photos"] },
  { label: "Schedule",     pages: ["Schedule", "GanttChart", "ResourceManagement", "Lookahead"] },
  { label: "Cost",         pages: ["Financials", "Expenses", "SOV", "ChangeOrders", "ChangeRequests", "Procurement", "Vendors"] },
  { label: "Quality",      pages: ["QCDashboard", "Inspections"] },
  { label: "Reports",      pages: ["Reports", "DecisionLog", "LessonsLearned"] },
];

export const TAB_DEFAULT_PAGE = {
  Overview:     "Dashboard",
  Documents:    "Drawings",
  Fabrication:  "WorkPackages",
  Field:        "Deliveries",
  Schedule:     "Schedule",
  Cost:         "Financials",
  Quality:      "QCDashboard",
  Reports:      "Reports",
};

// ─── Multi-column layout grouping (desktop nav dropdown) ────────────────

export const COLUMN_1_GROUPS = ["OVERVIEW", "JOB SETUP", "DOCUMENTS & DRAWINGS", "COMMUNICATIONS"];
export const COLUMN_2_GROUPS = ["FABRICATION", "FIELD & LOGISTICS", "SCHEDULING"];
export const COLUMN_3_GROUPS = ["COST CONTROL", "REPORTING", "QUALITY", "CLOSEOUT", "USER"];

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Find which group a page belongs to.
 */
export function getPageGroup(pageName) {
  const mod = ALL_MODULES.find((m) => m.page === pageName);
  return mod?.group || null;
}

/**
 * Find which tab a page belongs to.
 */
export function getPageTab(pageName) {
  const tab = PRIMARY_TABS.find((t) => t.pages.includes(pageName));
  return tab?.label || null;
}

/**
 * Check if a page requires admin access.
 */
export function isAdminOnly(pageName) {
  const mod = ALL_MODULES.find((m) => m.page === pageName);
  return mod?.adminOnly === true;
}
