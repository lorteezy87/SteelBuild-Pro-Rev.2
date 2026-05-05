/**
 * moduleRegistry.js - Central navigation and module configuration
 *
 * Single source of truth for:
 *  - Top-bar tab definitions (PRIMARY_TABS)
 *  - Module catalog (ALL_MODULES)
 *  - Modules dropdown groups (NAV_GROUPS)
 *  - Sidebar groups (SIDEBAR_GROUPS)
 *  - Page display labels (PAGE_LABELS)
 *
 * Shared by Layout shell, ModulesDropdown, SidebarNav, MobileDrawer,
 * Breadcrumbs, and BellDropdown.
 */

// ── Tab definitions ──────────────────────────────────────────────────
export const PRIMARY_TABS = [
  { label: "DASHBOARD",   pages: ["Dashboard", "CommandCenter"] },
  { label: "PCC",         pages: ["ProjectControlCenter"] },
  { label: "PROJECTS",    pages: ["Projects", "ExecutiveView"] },
  { label: "RFIs",        pages: ["RFIs", "RFIHub"] },
  { label: "DRAWINGS",    pages: ["DrawingSubmittalHub", "Drawings", "Submittals", "DrawingAnalysis", "DrawingViewer", "Documents"] },
  { label: "FABRICATION", pages: ["WorkPackages", "Constraints", "FabRelease", "BudgetHours", "Procurement", "LookAheadSchedule"] },
  { label: "DELIVERIES",  pages: ["Deliveries"] },
  { label: "SCHEDULE",    pages: ["Schedule", "GanttChart", "ProjectCalendar"] },
  { label: "FIELD",       pages: ["Field", "DailyLogs", "Photos", "ProductionNotes", "LEMs"] },
  { label: "COST",        pages: ["Financials", "CostDashboard", "ChangeOrders", "SOV", "ContractManagement"] },
  { label: "RESOURCES",   pages: ["ResourceScheduling", "ResourceManagement"] },
  { label: "REPORTS",     pages: ["AIInsights", "JobStatusReport", "AlertsCenter", "Activity", "Mitigations"] },
  { label: "QUALITY",     pages: ["Inspections", "Safety", "Punchlist", "QualityControl"] },
  { label: "CLOSEOUT",    pages: ["ProjectCloseout", "Warranty", "ChangeRequests"] },
];

export const TAB_DEFAULT_PAGE = {
  DASHBOARD:   "Dashboard",
  PCC:         "ProjectControlCenter",
  PROJECTS:    "Projects",
  RFIs:        "RFIs",
  DRAWINGS:    "DrawingSubmittalHub",
  FABRICATION: "WorkPackages",
  DELIVERIES:  "Deliveries",
  SCHEDULE:    "Schedule",
  FIELD:       "Field",
  COST:        "Financials",
  RESOURCES:   "ResourceScheduling",
  REPORTS:     "AIInsights",
  QUALITY:     "Inspections",
  CLOSEOUT:    "ProjectCloseout",
};

// ── Full module catalog (used for grid dropdown + page label lookup) ─
export const ALL_MODULES = [
  { icon: "\u25C8", name: "Dashboard",               group: "Overview",      page: "Dashboard" },
  { icon: "\u2318", name: "Command Center",          group: "Overview",      page: "CommandCenter" },
  { icon: "\u2295", name: "Project Control Center",   group: "Overview",      page: "ProjectControlCenter" },
  { icon: "\u25C9", name: "Executive View",           group: "Overview",      page: "ExecutiveView" },
  { icon: "\u25A4", name: "Projects",                 group: "Overview",      page: "Projects" },
  { icon: "\u2261", name: "Scope & Exclusions",       group: "Setup",         page: "ScopeExclusions" },
  { icon: "\u2630", name: "Contacts",                 group: "Setup",         page: "Contacts" },
  { icon: "\uD83D\uDD14", name: "Alerts",             group: "Setup",         page: "AlertsCenter" },
  { icon: "\u25A6", name: "Drawings & Submittals",    group: "Detailing",     page: "DrawingSubmittalHub" },
  { icon: "\u25C8", name: "Drawing Analysis (AI)",    group: "Detailing",     page: "DrawingAnalysis" },
  { icon: "\u25B3", name: "3D Model Viewer",          group: "Detailing",     page: "ModelViewer" },
  { icon: "\u2691", name: "RFI Hub",                  group: "Comms",         page: "RFIs" },
  { icon: "\uD83D\uDCDD", name: "Production Notes",   group: "Comms",         page: "ProductionNotes" },
  { icon: "\uD83D\uDC65", name: "Meetings",           group: "Comms",         page: "Meetings" },
  { icon: "\u2713", name: "Action Items",             group: "Comms",         page: "ActionItems" },
  { icon: "\u25A6", name: "Work Packages",            group: "Fab",           page: "WorkPackages" },
  { icon: "\uD83D\uDEA7", name: "Constraints",        group: "Fab",           page: "Constraints" },
  { icon: "\uD83C\uDFED", name: "Fab Release",        group: "Fabrication",   page: "FabRelease" },
  { icon: "⏱", name: "Budget Hours",            group: "Fabrication",   page: "BudgetHours" },
  { icon: "\uD83D\uDCE6", name: "Procurement",        group: "Fabrication",   page: "Procurement" },
  { icon: "\uD83D\uDC41", name: "Look-Ahead",         group: "Fab",           page: "LookAheadSchedule" },
  { icon: "\u25A5", name: "Gantt Chart",              group: "Fab",           page: "GanttChart" },
  { icon: "📅", name: "Project Calendar",         group: "Field",         page: "ProjectCalendar" },
  { icon: "\ud83c\udfd7", name: "Field Hub",                    group: "Field",         page: "Field" },
  { icon: "\u2699", name: "LEMs",                     group: "Field",         page: "LEMs" },
  { icon: "\uD83D\uDCCB", name: "Contract Management", group: "Cost",         page: "ContractManagement" },
  { icon: "\uD83D\uDCE6", name: "Deliveries",         group: "Logistics",     page: "Deliveries" },
  { icon: "\u25A5", name: "Schedule",                 group: "Field",         page: "Schedule" },
  { icon: "\uD83D\uDCCB", name: "Daily Logs",         group: "Field",         page: "DailyLogs" },
  { icon: "\uD83D\uDCF7", name: "Photos",             group: "Field",         page: "Photos" },
  { icon: "\u25CE", name: "Budget Control",           group: "Cost",          page: "Financials" },
  { icon: "\uD83D\uDCB0", name: "Cost Dashboard",     group: "Cost",          page: "CostDashboard" },
  { icon: "\uD83D\uDCCA", name: "SOV",                group: "Cost",          page: "SOV" },
  { icon: "$",  name: "Change Orders",               group: "Cost",          page: "ChangeOrders" },
  { icon: "\uD83D\uDC65", name: "Resources",          group: "Resources",     page: "ResourceManagement" },
  { icon: "\u25A8", name: "Crew Scheduling",          group: "Resources",     page: "ResourceScheduling" },
  { icon: "\uD83D\uDCCB", name: "Job Status Report",  group: "Reporting",     page: "JobStatusReport" },
  { icon: "\u2728", name: "Portfolio Overview",       group: "Reporting",     page: "AIInsights" },
  { icon: "\uD83D\uDCCA", name: "Activity Log",       group: "Reporting",     page: "Activity" },
  { icon: "\uD83D\uDD0D", name: "Inspections",        group: "Quality",       page: "Inspections" },
  { icon: "\u26A0", name: "Safety",                   group: "Quality",       page: "Safety" },
  { icon: "\u2713", name: "Punchlist",                group: "Quality",       page: "Punchlist" },
  { icon: "\uD83E\uDDEA", name: "Quality Control",    group: "Quality",       page: "QualityControl" },
  { icon: "\uD83C\uDFC1", name: "Project Closeout",   group: "Closeout",      page: "ProjectCloseout" },
  { icon: "\uD83D\uDEE1", name: "Warranty",           group: "Closeout",      page: "Warranty" },
  { icon: "\uD83D\uDCDD", name: "Change Requests",    group: "Closeout",      page: "ChangeRequests" },
  { icon: "\uD83C\uDFE2", name: "Vendors",            group: "Setup",         page: "Vendors" },
  { icon: "\uD83D\uDCD0", name: "Calculator",                group: "Tools", page: "Calculator" }, // 🧮 calculator
  { icon: "📘", name: "Tutorial / Help",           group: "Setup", page: "Tutorial" },
  { icon: "📐", name: "Ft/In Calculator",          group: "Tools", page: "FeetInchesCalculator" },
  { icon: "\u2696",       name: "Steel Weight Calculator",   group: "Tools", page: "SteelWeightCalculator" },
  { icon: "\uD83C\uDFD7", name: "Crane Pick Calculator",     group: "Tools", page: "CranePickCalculator" },
  { icon: "\u2194",       name: "Decimal / Fraction Converter", group: "Tools", page: "DecimalFractionConverter" },
];

// ── Modules dropdown nav groups (3-column layout) ────────────────────
export const NAV_GROUPS = [
  {
    label: "OVERVIEW",
    items: [
      { label: "Dashboard",       icon: "\u25C8", page: "Dashboard" },
      { label: "Command Center", icon: "\u2318", page: "CommandCenter" },
      { label: "Executive View", icon: "\u25A4", page: "ExecutiveView" },
    ],
  },
  {
    label: "USER",
    items: [
      { label: "Settings",        icon: "\u2699", page: "Settings" },
      { label: "Tutorial / Help", icon: "\ud83d\udcd8", page: "Tutorial" },
    ],
  },
  {
    label: "JOB SETUP",
    items: [
      { label: "Projects",           icon: "\u229F", page: "Projects" },
      { label: "Scope & Exclusions", icon: "\u2261", page: "ScopeExclusions" },
      { label: "Contacts",           icon: "\uD83D\uDC64", page: "Contacts" },
      { label: "Alerts",             icon: "\uD83D\uDD14", page: "AlertsCenter", badgeKey: "unread" },
      { label: "User Management",    icon: "\uD83D\uDC65", page: "UsersManagement" },
      { label: "Feature Flags",      icon: "\u2691",       page: "FeatureFlagsAdmin" },
    ],
  },
  {
    label: "DOCUMENTS & DRAWINGS",
    items: [
      { label: "Drawings & Submittals", icon: "\u25A6", page: "DrawingSubmittalHub" },
      { label: "Drawing Analysis (AI)", icon: "\u25C8", page: "DrawingAnalysis" },
      { label: "Document Repository",   icon: "\uD83D\uDCC1", page: "Documents" },
      { label: "3D Model Viewer",       icon: "\u25B3", page: "ModelViewer" },
    ],
  },
  {
    label: "COMMUNICATIONS",
    items: [
      { label: "RFI Hub",          icon: "\u2691", page: "RFIs", badgeKey: "rfi" },
      { label: "Meetings",         icon: "\uD83D\uDC65", page: "Meetings" },
      { label: "Action Items",     icon: "\u2611", page: "ActionItems" },
      { label: "Production Notes", icon: "\uD83D\uDCDD", page: "ProductionNotes" },
    ],
  },
  {
    label: "FABRICATION",
    items: [
      { label: "Work Packages", icon: "\u25A6", page: "WorkPackages" },
      { label: "Constraints",   icon: "\uD83D\uDEA7", page: "Constraints" },
      { label: "Fab Release",   icon: "\uD83C\uDFED", page: "FabRelease" },
      { label: "Budget Hours",  icon: "\u23F1", page: "BudgetHours" },
      { label: "Procurement",   icon: "\uD83D\uDCE6", page: "Procurement" },
      { label: "Look-Ahead",    icon: "\uD83D\uDC41", page: "LookAheadSchedule" },
    ],
  },
  {
    label: "DELIVERIES",
    items: [
      { label: "Deliveries", icon: "\uD83D\uDE9B", page: "Deliveries" },
    ],
  },
  {
    label: "FIELD",
    items: [
      { label: "Field Hub",  icon: "\uD83C\uDFD7", page: "Field" },
      { label: "Daily Logs", icon: "\uD83D\uDCCB", page: "DailyLogs" },
      { label: "LEMs",       icon: "\u2699", page: "LEMs" },
      { label: "Photos",     icon: "\uD83D\uDCF7", page: "Photos" },
      { label: "Punchlist",  icon: "\u2713", page: "Punchlist" },
    ],
  },
  {
    label: "SCHEDULING",
    items: [
      { label: "Project Calendar", icon: "📅", page: "ProjectCalendar" },
      { label: "Gantt Schedule",  icon: "\u25A5", page: "Schedule" },
      { label: "Resource Board",  icon: "\uD83D\uDC65", page: "ResourceManagement" },
    ],
  },
  {
    label: "COST CONTROL",
    items: [
      { label: "Budget Control",      icon: "\u25CE", page: "Financials" },
      { label: "Contract Management",  icon: "\uD83D\uDCCB", page: "ContractManagement" },
      { label: "Schedule of Values",   icon: "\uD83D\uDCCA", page: "SOV" },
      { label: "Change Orders",        icon: "$",  page: "ChangeOrders", badgeKey: "co" },
      { label: "Expenses",             icon: "\uD83D\uDCB0", page: "Expenses" },
    ],
  },
  {
    label: "REPORTING",
    items: [
      { label: "Job Status Report",  icon: "\uD83D\uDCCB", page: "JobStatusReport" },
      { label: "Decision Log",       icon: "\uD83D\uDCCB", page: "DecisionLog" },
      { label: "Portfolio Overview",  icon: "\u2726", page: "AIInsights" },
      { label: "Mitigations",        icon: "\u2696", page: "Mitigations" },
      { label: "Activity Log",       icon: "\uD83D\uDCCA", page: "Activity" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { label: "Calculator",                   icon: "🧮", page: "Calculator" },
      { label: "Ft/In Calculator",             icon: "\uD83D\uDCD0", page: "FeetInchesCalculator" },
      { label: "Steel Weight Calculator",      icon: "\u2696",       page: "SteelWeightCalculator" },
      { label: "Crane Pick Calculator",        icon: "\uD83C\uDFD7", page: "CranePickCalculator" },
      { label: "Decimal / Fraction Converter", icon: "\u2194",       page: "DecimalFractionConverter" },
    ],
  },
];

// Column assignment for the 3-column modules dropdown
const COLUMN_1_GROUPS = ["OVERVIEW", "JOB SETUP", "DOCUMENTS & DRAWINGS", "COMMUNICATIONS"];
const COLUMN_2_GROUPS = ["FABRICATION", "DELIVERIES", "FIELD", "SCHEDULING"];
const COLUMN_3_GROUPS = ["COST CONTROL", "REPORTING", "TOOLS"];

export function getDropdownColumn(groupLabel) {
  if (COLUMN_1_GROUPS.includes(groupLabel)) return 0;
  if (COLUMN_2_GROUPS.includes(groupLabel)) return 1;
  return 2;
}

// ── Sidebar groups (desktop + mobile drawer) ─────────────────────────
export const SIDEBAR_GROUPS = [
  {
    label: "OVERVIEW",
    collapsible: false,
    items: [
      { label: "Dashboard",          icon: "\u25C8", page: "Dashboard" },
      { label: "Command Center",    icon: "\u2318", page: "CommandCenter" },
      { label: "Portfolio Overview",  icon: "\u2726", page: "AIInsights" },
    ],
  },
  {
    label: "PROJECT MANAGEMENT",
    collapsible: true,
    items: [
      { label: "Project Calendar", icon: "📅", page: "ProjectCalendar" },
      { label: "Schedule",       icon: "\u25A5", page: "Schedule" },
      { label: "Action Items",   icon: "\u2611", page: "ActionItems" },
      { label: "RFIs",                icon: "\u2691", page: "RFIs" },
      { label: "Change Orders",  icon: "$",  page: "ChangeOrders" },
      { label: "Mitigations",    icon: "\u2696", page: "Mitigations" },
      { label: "Meetings",       icon: "\uD83D\uDC65", page: "Meetings" },
    ],
  },
  {
    label: "DESIGN & DRAWINGS",
    collapsible: true,
    items: [
      { label: "Drawings & Submittals", icon: "\u25A6", page: "DrawingSubmittalHub" },
      { label: "Drawing Analysis (AI)", icon: "\u25C8", page: "DrawingAnalysis" },
      { label: "Drawing Viewer",       icon: "\u25A6", page: "DrawingViewer" },
      { label: "3D Model Viewer",      icon: "\u25B3", page: "ModelViewer" },
    ],
  },
  {
    label: "PRODUCTION",
    collapsible: true,
    items: [
      { label: "Work Packages",        icon: "\u25A6", page: "WorkPackages" },
      { label: "Fab Release",          icon: "🏭", page: "FabRelease" },
      { label: "Budget Hours",         icon: "⏱",  page: "BudgetHours" },
      { label: "Constraints",          icon: "🚧", page: "Constraints" },
      { label: "Procurement",          icon: "📦", page: "Procurement" },
      { label: "Look-Ahead Schedule",  icon: "👁", page: "LookAheadSchedule" },
      { label: "Crew Scheduling",      icon: "\u25A8", page: "ResourceScheduling" },
      { label: "Resource Management",   icon: "\uD83D\uDC65", page: "ResourceManagement" },
      { label: "Deliveries",           icon: "\uD83D\uDCE6", page: "Deliveries" },
    ],
  },
  {
    label: "FINANCIALS",
    collapsible: true,
    items: [
      { label: "Budget Control",       icon: "\u25CE", page: "Financials" },
      { label: "Schedule of Values",   icon: "\uD83D\uDCCA", page: "SOV" },
      { label: "Expenses",             icon: "\uD83D\uDCB0", page: "Expenses" },
    ],
  },
  {
    label: "DOCUMENTS & REPORTS",
    collapsible: true,
    items: [
      { label: "Documents",     icon: "\uD83D\uDCC1", page: "Documents" },
      { label: "Reports",       icon: "\uD83D\uDCCB", page: "Reports" },
      { label: "Activity Log",  icon: "\uD83D\uDCCA", page: "Activity" },
    ],
  },
  {
    label: "FIELD",
    collapsible: true,
    items: [
      { label: "Field Hub",        icon: "\uD83C\uDFD7", page: "Field" },
      { label: "Daily Logs",       icon: "\uD83D\uDCCB", page: "DailyLogs" },
      { label: "Photos",           icon: "\uD83D\uDCF7", page: "Photos" },
      { label: "Inspections",      icon: "\uD83D\uDD0D", page: "Inspections" },
      { label: "Safety",           icon: "\u26A0", page: "Safety" },
      { label: "Quality Control",  icon: "\uD83E\uDDEA", page: "QualityControl" },
      { label: "Punchlist",        icon: "\u2713", page: "Punchlist" },
      { label: "LEMs",             icon: "\u2699", page: "LEMs" },
    ],
  },
  {
    label: "ADMINISTRATION",
    collapsible: true,
    items: [
      { label: "Contacts",         icon: "\uD83D\uDC64", page: "Contacts" },
      { label: "Vendors",          icon: "\uD83C\uDFE2", page: "Vendors" },
      { label: "User Management",  icon: "\uD83D\uDC65", page: "UsersManagement" },
      { label: "Feature Flags",    icon: "\u2691",       page: "FeatureFlagsAdmin" },
      { label: "Settings",         icon: "\u2699", page: "Settings" },
      { label: "Tutorial / Help",  icon: "\uD83D\uDCD8", page: "Tutorial" },
    ],
  },
  {
    label: "TOOLS",
    collapsible: true,
    items: [
      { label: "Calculator",                   icon: "🧮", page: "Calculator" },
      { label: "Ft/In Calculator",             icon: "\uD83D\uDCD0", page: "FeetInchesCalculator" },
      { label: "Steel Weight Calculator",      icon: "\u2696",       page: "SteelWeightCalculator" },
      { label: "Crane Pick Calculator",        icon: "\uD83C\uDFD7", page: "CranePickCalculator" },
      { label: "Decimal / Fraction Converter", icon: "\u2194",       page: "DecimalFractionConverter" },
    ],
  },
];

// ── Page display labels (built from ALL_MODULES + overrides) ─────────
export const PAGE_LABELS = (() => {
  const labels = {};
  ALL_MODULES.forEach((mod) => { labels[mod.page] = mod.name; });
  // Add pages not covered by ALL_MODULES
  Object.assign(labels, {
    Dashboard:       "Dashboard",
    CommandCenter:   "Command Center",
    Settings:        "Settings",
    UsersManagement: "User Management",
    FeatureFlagsAdmin: "Feature Flags",
    Expenses:        "Expenses",
  });
  return labels;
})();

// ── Severity colors (used by nav alert badges) ──────────────────────
export const SEVERITY_COLOR = {
  Critical: "var(--status-error)",
  High:     "var(--status-warning)",
  Medium:   "var(--status-warning)",
  Low:      "var(--text-muted)",
};

// ── Sidebar collapse persistence ─────────────────────────────────────
const SIDEBAR_LS_KEY = "sbp-nav-groups";

export function loadSidebarState() {
  try {
    const raw = localStorage.getItem(SIDEBAR_LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export function saveSidebarState(state) {
  try {
    localStorage.setItem(SIDEBAR_LS_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

// ── Helpers ──────────────────────────────────────────────────────────
export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Dev-time schema validation ───────────────────────────────────────
if (import.meta.env.DEV) {
  import("./schemas").then(({ validateNavConfig }) => {
    validateNavConfig({
      primaryTabs: PRIMARY_TABS,
      navGroups: NAV_GROUPS,
      sidebarGroups: SIDEBAR_GROUPS,
      allModules: ALL_MODULES,
      tabDefaultPage: TAB_DEFAULT_PAGE,
    });
  });
}
