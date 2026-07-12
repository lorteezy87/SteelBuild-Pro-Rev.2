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
  { label: "PROJECTS",    pages: ["ProjectsHub", "Projects", "ScopeExclusions", "Contacts", "ProjectMembers", "ExecutiveView"] },
  { label: "RFIs",        pages: ["RFIs", "EmailInbox"] },
  { label: "DRAWINGS",    pages: ["DrawingSubmittalHub", "Drawings", "Submittals", "DrawingViewer", "Documents"] },
  // Consolidation (Phase 1): RESOURCES folded into FABRICATION and QUALITY
  // folded into FIELD — fewer logical groups, and every page stays reachable
  // (these arrays drive route-reachability + tab mapping, not a visible tab bar).
  // FieldPlan added here so it's no longer orphaned from the registry.
  { label: "FABRICATION", pages: ["WorkPackages", "RiskHub", "Constraints", "FabRelease", "ProductionStatus", "MarginRisk", "BudgetHours", "Procurement", "ResourceHub", "ResourceScheduling"] },
  { label: "DELIVERIES",  pages: ["Deliveries"] },
  { label: "SCHEDULE",    pages: ["ScheduleHub", "Schedule", "ProjectCalendar", "LookAheadSchedule"] },
  { label: "FIELD",       pages: ["FieldToday", "FieldHub", "Field", "DailyLogs", "Photos", "ProductionNotes", "LEMs", "FieldPlan", "Inspections", "Safety", "Punchlist", "QualityControl"] },
  { label: "COST",        pages: ["CostHub", "ChangeOrders", "Backcharges", "SOV", "PayApplications", "ContractManagement"] },
  { label: "REPORTS",     pages: ["PortfolioHub", "ReportsHub", "AIInsights", "JobStatusReport", "DecisionLog", "Reports", "AlertsCenter", "Activity"] },
  { label: "CLOSEOUT",    pages: ["ProjectCloseout", "Warranty", "ChangeRequests"] },
];

export const TAB_DEFAULT_PAGE = {
  DASHBOARD:   "Dashboard",
  PROJECTS:    "Projects",
  RFIs:        "RFIs",
  DRAWINGS:    "DrawingSubmittalHub",
  FABRICATION: "WorkPackages",
  DELIVERIES:  "Deliveries",
  SCHEDULE:    "ScheduleHub",
  FIELD:       "FieldHub",
  COST:        "CostHub",
  REPORTS:     "PortfolioHub",
  CLOSEOUT:    "ProjectCloseout",
};

// ── Full module catalog (used for grid dropdown + page label lookup) ─
export const ALL_MODULES = [
  { icon: "\u25C8", name: "Dashboard",               group: "Overview",      page: "Dashboard" },
  { icon: "\u2318", name: "Command Center",          group: "Overview",      page: "CommandCenter" },
  { icon: "\u2726", name: "Portfolio Overview",       group: "Overview",      page: "PortfolioHub" },
  { icon: "\u25C9", name: "Executive View",           group: "Overview",      page: "ExecutiveView" },
  { icon: "\u25A4", name: "Projects",                 group: "Projects",      page: "Projects" },
  { icon: "\u2261", name: "Scope & Exclusions",       group: "Projects",      page: "ScopeExclusions" },
  { icon: "\u2630", name: "Contacts",                 group: "Projects",      page: "Contacts" },
  { icon: "\uD83D\uDC65", name: "Project Members",          group: "Projects",      page: "ProjectMembers" },
  { icon: "\uD83D\uDD14", name: "Alerts",             group: "Setup",         page: "AlertsCenter" },
  { icon: "\u25A6", name: "Detailing Control Center",    group: "Detailing",     page: "DrawingSubmittalHub" },
  { icon: "\u2691", name: "RFI Hub",                  group: "Comms",         page: "RFIs" },
  { icon: "\uD83D\uDCDD", name: "Production Notes",   group: "Comms",         page: "ProductionNotes" },
  { icon: "\u2713", name: "Action Items",             group: "Comms",         page: "ActionItems" },
  { icon: "\u2709", name: "Email Inbox",              group: "Comms",         page: "EmailInbox" },
  { icon: "\u25A6", name: "Work Packages",            group: "Fab",           page: "WorkPackages" },
  { icon: "\u26A0", name: "Risk",                 group: "Fabrication",   page: "RiskHub" },
  { icon: "\uD83D\uDEA7", name: "Constraints",        group: "Fab",           page: "Constraints" },
  { icon: "\uD83C\uDFED", name: "Fab Release",        group: "Fabrication",   page: "FabRelease" },
  { icon: "\uD83D\uDEE0", name: "Production Status",   group: "Fabrication",   page: "ProductionStatus" },
  { icon: "\u26A0", name: "Margin Risk",        group: "Fabrication",   page: "MarginRisk" },
  { icon: "⏱", name: "Budget Hours",            group: "Fabrication",   page: "BudgetHours" },
  { icon: "\uD83D\uDCE6", name: "Procurement",        group: "Fabrication",   page: "Procurement" },
  { icon: "\uD83D\uDC41", name: "Look-Ahead",         group: "Fab",           page: "LookAheadSchedule" },
  { icon: "📅", name: "Project Calendar",         group: "Field",         page: "ProjectCalendar" },
  { icon: "\ud83d\udcf2", name: "Field Today",                  group: "Field",         page: "FieldToday" },
  { icon: "\ud83c\udfd7", name: "Field Hub",                    group: "Field",         page: "FieldHub" },
  { icon: "\ud83c\udfd7", name: "Field Overview",               group: "Field",         page: "Field" },
  { icon: "\u2699", name: "LEMs",                     group: "Field",         page: "LEMs" },
  { icon: "\uD83D\uDCCB", name: "Contract Management", group: "Cost",         page: "ContractManagement" },
  { icon: "\uD83D\uDCE6", name: "Deliveries",         group: "Logistics",     page: "Deliveries" },
  { icon: "\u25A5", name: "Schedule",                 group: "Field",         page: "ScheduleHub" },
  { icon: "\u25A5", name: "Schedule Board",           group: "Field",         page: "Schedule" },
  { icon: "\uD83D\uDCCB", name: "Daily Logs",         group: "Field",         page: "DailyLogs" },
  { icon: "\uD83D\uDCF7", name: "Photos",             group: "Field",         page: "Photos" },
  { icon: "\u25CE", name: "Budget Control",           group: "Cost",          page: "CostHub" },
  { icon: "\uD83D\uDCCA", name: "SOV",                group: "Cost",          page: "SOV" },
  { icon: "$",  name: "Change Orders",               group: "Cost",          page: "ChangeOrders" },
  { icon: "⚖", name: "Backcharge Defense",      group: "Cost",          page: "Backcharges" },
  { icon: "🧾", name: "Pay Applications",   group: "Cost",          page: "PayApplications" },
  { icon: "\uD83D\uDC65", name: "Resources",          group: "Fabrication",   page: "ResourceHub" },
  { icon: "\u25A8", name: "Crew Scheduling",          group: "Resources",     page: "ResourceScheduling" },
  { icon: "\uD83D\uDCCB", name: "Reports",            group: "Reporting",     page: "ReportsHub" },
  { icon: "\uD83D\uDCCB", name: "Job Status Report",  group: "Reporting",     page: "JobStatusReport" },
  { icon: "\u2728", name: "Portfolio Analytics",      group: "Reporting",     page: "AIInsights" },
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
      { label: "Dashboard",          icon: "◈", page: "Dashboard" },
      { label: "Command Center",     icon: "⌘", page: "CommandCenter" },
      { label: "Portfolio Overview", icon: "✦", page: "PortfolioHub" },
      { label: "Alerts",             icon: "🔔", page: "AlertsCenter", badgeKey: "unread" },
    ],
  },
  {
    label: "PROJECTS",
    items: [
      { label: "Projects", icon: "⊟", page: "ProjectsHub" },
    ],
  },
  {
    label: "DETAILING",
    items: [
      { label: "Detailing Control Center", icon: "▦", page: "DrawingSubmittalHub" },
      { label: "Document Repository",      icon: "📁", page: "Documents" },
    ],
  },
  {
    label: "PROJECT MANAGEMENT",
    items: [
      { label: "Schedule",     icon: "▥", page: "ScheduleHub" },
      { label: "RFIs",         icon: "⚑", page: "RFIs", badgeKey: "rfi" },
      { label: "Action Items", icon: "☑", page: "ActionItems" },
      { label: "Production Notes", icon: "📝", page: "ProductionNotes" },
    ],
  },
  {
    label: "PRODUCTION",
    items: [
      { label: "Work Packages",     icon: "▦", page: "WorkPackages" },
      { label: "Fab Release",       icon: "🏭", page: "FabRelease" },
      { label: "Production Status", icon: "🛠", page: "ProductionStatus" },
      { label: "Procurement",       icon: "📦", page: "Procurement" },
      { label: "Budget Hours",      icon: "⏱", page: "BudgetHours" },
      { label: "Risk",              icon: "⚠", page: "RiskHub" },
      { label: "Resources",         icon: "👥", page: "ResourceHub" },
      { label: "Deliveries",        icon: "📦", page: "Deliveries" },
    ],
  },
  {
    label: "FIELD",
    items: [
      { label: "Field Today", icon: "📲", page: "FieldToday" },
      { label: "Field Hub",   icon: "🏗", page: "FieldHub" },
    ],
  },
  {
    label: "COST",
    items: [
      { label: "Budget Control",     icon: "◎", page: "CostHub" },
      { label: "Change Orders",      icon: "$", page: "ChangeOrders", badgeKey: "co" },
      { label: "Schedule of Values", icon: "📊", page: "SOV" },
      { label: "Pay Applications",   icon: "🧾", page: "PayApplications" },
      { label: "Backcharge Defense", icon: "⚖", page: "Backcharges" },
      { label: "Expenses",           icon: "💰", page: "Expenses" },
    ],
  },
  {
    label: "DOCUMENTS & REPORTS",
    items: [
      { label: "Documents", icon: "📁", page: "Documents" },
      { label: "Reports",   icon: "📋", page: "ReportsHub" },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { label: "Team",     icon: "👥", page: "OrgMembers" },
      { label: "Billing",  icon: "💳", page: "Billing" },
      { label: "Vendors",  icon: "🏢", page: "Vendors" },
      { label: "Settings", icon: "⚙", page: "Settings" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { label: "Calculators", icon: "🧮", page: "CalculatorsHub" },
    ],
  },
];

// Column assignment for the 3-column modules dropdown
const COLUMN_1_GROUPS = ["OVERVIEW", "PROJECTS", "DETAILING", "PROJECT MANAGEMENT"];
const COLUMN_2_GROUPS = ["PRODUCTION", "FIELD", "DOCUMENTS & REPORTS"];
const COLUMN_3_GROUPS = ["COST", "ADMINISTRATION", "TOOLS"];

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
      { label: "Dashboard",          icon: "◈", page: "Dashboard" },
      { label: "Command Center",    icon: "⌘", page: "CommandCenter" },
      { label: "Portfolio Overview",  icon: "✦", page: "PortfolioHub" },
    ],
  },
  {
    // Projects hub: the project record + Scope / Contacts / Members as tabs.
    label: "PROJECTS",
    collapsible: true,
    items: [
      { label: "Projects",           icon: "⊟", page: "ProjectsHub" },
    ],
  },
  {
    // The moat. Drawings / Submittals / Doc Control / 3D model are tabs inside.
    label: "DETAILING",
    collapsible: true,
    items: [
      { label: "Detailing Control Center", icon: "▦", page: "DrawingSubmittalHub" },
    ],
  },
  {
    label: "PROJECT MANAGEMENT",
    collapsible: true,
    items: [
      { label: "Schedule",       icon: "▥", page: "ScheduleHub" },
      { label: "RFIs",           icon: "⚑", page: "RFIs", badgeKey: "rfi" },
      { label: "Action Items",   icon: "☑", page: "ActionItems" },
    ],
  },
  {
    label: "PRODUCTION",
    collapsible: true,
    items: [
      { label: "Work Packages",        icon: "▦", page: "WorkPackages" },
      { label: "Fab Release",          icon: "🏭", page: "FabRelease" },
      { label: "Production Status",    icon: "🛠", page: "ProductionStatus" },
      { label: "Procurement",          icon: "📦", page: "Procurement" },
      { label: "Budget Hours",         icon: "⏱",  page: "BudgetHours" },
      { label: "Risk",                 icon: "⚠", page: "RiskHub" },
      { label: "Resources",            icon: "👥", page: "ResourceHub" },
      { label: "Deliveries",           icon: "📦", page: "Deliveries" },
    ],
  },
  {
    label: "FIELD",
    collapsible: true,
    items: [
      { label: "Field Today",      icon: "📲", page: "FieldToday" },
      { label: "Field Hub",        icon: "🏗", page: "FieldHub" },
    ],
  },
  {
    // One money home: Budget Control hubs Budget Detail + Cost Dashboard.
    label: "COST",
    collapsible: true,
    items: [
      { label: "Budget Control",       icon: "◎", page: "CostHub" },
      { label: "Change Orders",        icon: "$",  page: "ChangeOrders", badgeKey: "co" },
      { label: "Schedule of Values",   icon: "📊", page: "SOV" },
      { label: "Pay Applications",     icon: "🧾", page: "PayApplications" },
      { label: "Backcharge Defense",   icon: "⚖", page: "Backcharges" },
      { label: "Expenses",             icon: "💰", page: "Expenses" },
    ],
  },
  {
    label: "DOCUMENTS & REPORTS",
    collapsible: true,
    items: [
      { label: "Documents",     icon: "📁", page: "Documents" },
      { label: "Reports",       icon: "📋", page: "ReportsHub" },
    ],
  },
  {
    label: "ADMINISTRATION",
    collapsible: true,
    items: [
      { label: "Team",             icon: "👥", page: "OrgMembers" },
      { label: "Billing",          icon: "💳", page: "Billing" },
      { label: "Vendors",          icon: "🏢", page: "Vendors" },
      { label: "Settings",         icon: "⚙", page: "Settings" },
    ],
  },
  {
    // The five steel calculators, collapsed into one Tools hub (tabs).
    label: "TOOLS",
    collapsible: true,
    items: [
      { label: "Calculators",                  icon: "🧮", page: "CalculatorsHub" },
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
    ProjectMembers:  "Project Members",
    FeatureFlagsAdmin: "Feature Flags",
    Expenses:        "Expenses",
    EmailInbox:      "Email Inbox",
    // Moved out of the nav into Settings → Setup & Admin, but still routable, so
    // keep their display labels for breadcrumbs / document title.
    Onboarding:      "Onboarding",
    DataExchange:    "Data Exchange",
    Integrations:    "Integrations",
    Tutorial:        "Tutorial / Help",
    // Consolidation hubs (leaner-nav 2026-06-13).
    ProjectsHub:     "Projects",
    CalculatorsHub:  "Calculators",
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
