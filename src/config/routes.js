/**
 * routes.js — single source of truth for the page registry.
 *
 * Every page registered here gets:
 *   - a lazy component (with stale-chunk retry via lazyWithRetry)
 *   - a user-facing label (breadcrumbs, document title, sidebar)
 *   - a `projectScoped` flag (does this page need an active project?)
 *
 * Derived exports (PAGES, PAGE_LABELS, PROJECT_SCOPED_PAGES, ALL_ROUTE_PATHS)
 * are computed from this one registry, so adding a page means editing ONE
 * place. The previous split between this file and src/routes.js is gone —
 * src/routes.js is now a re-export shim for backward compatibility with the
 * existing import paths.
 *
 * To add a new page:
 *   1. Create src/pages/MyPage.jsx with a default export.
 *   2. Add an entry to the appropriate ROUTE_DOMAINS group below.
 *   3. (If it shows up in nav) add it to src/config/moduleRegistry.js.
 *      The validation block at the bottom of this file catches step (3)
 *      if you forget.
 */

import { lazyWithRetry } from "@/lib/lazyRetry";
import { registerRoutePrefetcher } from "@/lib/routePrefetch";

// ── Helper: build a registry entry ───────────────────────────────────
/**
 * @typedef {Object} RouteEntry
 * @property {React.LazyExoticComponent<any>} component  Lazy page component.
 * @property {string} label                              Breadcrumb / tab label.
 * @property {boolean} [projectScoped]                   True if page genuinely
 *                                                       depends on an active
 *                                                       project; defaults false.
 */

/**
 * Sugar so a page row stays one line:
 *
 *   r(lazyWithRetry(() => import("@/pages/Dashboard")), "Dashboard", { projectScoped: true })
 *
 * Caller passes the lazy component explicitly (instead of a name string)
 * so the import path stays grep-friendly and Vite's bundle analyzer sees
 * each page individually.
 */
function r(component, label, opts) {
  return {
    component,
    label,
    projectScoped: opts?.projectScoped === true,
  };
}

// ── Domain-grouped registry ──────────────────────────────────────────
const ROUTE_DOMAINS = {
  // ── Overview & Portfolio ──
  overview: {
    Dashboard:              r(lazyWithRetry(() => import("@/pages/Dashboard")),             "Dashboard",                 { projectScoped: true }),
    CommandCenter:          r(lazyWithRetry(() => import("@/pages/CommandCenter")),         "Command Center"),
    ExecutiveView:          r(lazyWithRetry(() => import("@/pages/ExecutiveView")),         "Executive View"),
    Projects:               r(lazyWithRetry(() => import("@/pages/Projects")),              "Projects"),
    ProjectsHub:            r(lazyWithRetry(() => import("@/pages/ProjectsHub")),           "Projects"),
    Onboarding:             r(lazyWithRetry(() => import("@/pages/Onboarding")),            "Onboarding"),
    ProjectDetail:          r(lazyWithRetry(() => import("@/pages/ProjectDetail")),         "Project Detail"),
    PortfolioHub:           r(lazyWithRetry(() => import("@/pages/PortfolioHub")),          "Portfolio Overview"),
    AIInsights:             r(lazyWithRetry(() => import("@/pages/AIInsights")),            "Portfolio Overview"),
  },

  // ── Communications ──
  communications: {
    RFIs:             r(lazyWithRetry(() => import("@/pages/RFIs")),             "RFIs",                { projectScoped: true }),
    ActionItems:      r(lazyWithRetry(() => import("@/pages/ActionItems")),      "Action Items",        { projectScoped: true }),
    ProductionNotes:  r(lazyWithRetry(() => import("@/pages/ProductionNotes")),  "Production Notes",    { projectScoped: true }),
    EmailInbox:       r(lazyWithRetry(() => import("@/pages/EmailInbox")),       "Email Inbox",         { projectScoped: true }),
  },

  // ── Design & Documents ──
  documents: {
    DrawingSubmittalHub: r(lazyWithRetry(() => import("@/pages/DrawingSubmittalHub")), "Detailing Control Center", { projectScoped: true }),
    Drawings:         r(lazyWithRetry(() => import("@/pages/Drawings")),         "Drawings",            { projectScoped: true }),
    DrawingViewer:    r(lazyWithRetry(() => import("@/pages/DrawingViewer")),    "Drawing Viewer",      { projectScoped: true }),
    Documents:        r(lazyWithRetry(() => import("@/pages/Documents")),        "Documents",           { projectScoped: true }),
    Submittals:       r(lazyWithRetry(() => import("@/pages/Submittals")),       "Submittal Register",  { projectScoped: true }),
  },

  // ── Fabrication & Production ──
  fabrication: {
    WorkPackages:       r(lazyWithRetry(() => import("@/pages/WorkPackages")),       "Work Packages",       { projectScoped: true }),
    Constraints:        r(lazyWithRetry(() => import("@/pages/Constraints")),        "Constraints",         { projectScoped: true }),
    FabRelease:         r(lazyWithRetry(() => import("@/pages/FabRelease")),         "Fab Release",         { projectScoped: true }),
    ProductionStatus:   r(lazyWithRetry(() => import("@/pages/ProductionStatus")),   "Production Status",   { projectScoped: true }),
    RiskHub:            r(lazyWithRetry(() => import("@/pages/RiskHub")),            "Risk",                { projectScoped: true }),
    MarginRisk:         r(lazyWithRetry(() => import("@/pages/MarginRisk")),         "Margin Risk",         { projectScoped: true }),
    BudgetHours:        r(lazyWithRetry(() => import("@/pages/BudgetHours")),        "Budget Hours",        { projectScoped: true }),
    Procurement:        r(lazyWithRetry(() => import("@/pages/Procurement")),        "Procurement",         { projectScoped: true }),
    LookAheadSchedule:  r(lazyWithRetry(() => import("@/pages/LookAheadSchedule")),  "Look-Ahead Schedule", { projectScoped: true }),
  },

  // ── Scheduling & Resources ──
  scheduling: {
    ScheduleHub:          r(lazyWithRetry(() => import("@/pages/ScheduleHub")),         "Schedule",             { projectScoped: true }),
    Schedule:             r(lazyWithRetry(() => import("@/pages/Schedule")),            "Schedule",             { projectScoped: true }),
    GanttChart:           r(lazyWithRetry(() => import("@/pages/GanttChart")),          "Gantt Chart",          { projectScoped: true }),
    ProjectCalendar:      r(lazyWithRetry(() => import("@/pages/ProjectCalendar")),     "Project Calendar",     { projectScoped: true }),
    FieldPlan:            r(lazyWithRetry(() => import("@/pages/FieldPlan")),           "Field Plan",          { projectScoped: true }),
    ResourceHub:          r(lazyWithRetry(() => import("@/pages/ResourceHub")),         "Resources"),
    ResourceManagement:   r(lazyWithRetry(() => import("@/pages/ResourceManagement")),  "Resource Management"),
    ResourceScheduling:   r(lazyWithRetry(() => import("@/pages/ResourceScheduling")),  "Crew Scheduling"),
  },

  // ── Field Operations ──
  field: {
    FieldToday:      r(lazyWithRetry(() => import("@/pages/FieldToday")),      "Field Today",         { projectScoped: true }),
    FieldHub:        r(lazyWithRetry(() => import("@/pages/FieldHub")),        "Field",               { projectScoped: true }),
    Field:           r(lazyWithRetry(() => import("@/pages/Field")),           "Field",               { projectScoped: true }),
    DailyLogs:       r(lazyWithRetry(() => import("@/pages/DailyLogs")),       "Daily Logs",          { projectScoped: true }),
    Photos:          r(lazyWithRetry(() => import("@/pages/Photos")),          "Photos",              { projectScoped: true }),
    LEMs:            r(lazyWithRetry(() => import("@/pages/LEMs")),            "LEMs",                { projectScoped: true }),
    Inspections:     r(lazyWithRetry(() => import("@/pages/Inspections")),     "Inspections",         { projectScoped: true }),
    Safety:          r(lazyWithRetry(() => import("@/pages/Safety")),          "Safety",              { projectScoped: true }),
    Punchlist:       r(lazyWithRetry(() => import("@/pages/Punchlist")),       "Punchlist",           { projectScoped: true }),
    QualityControl:  r(lazyWithRetry(() => import("@/pages/QualityControl")),  "Quality Control",     { projectScoped: true }),
  },

  // ── Cost & Finance ──
  cost: {
    CostHub:             r(lazyWithRetry(() => import("@/pages/CostHub")),             "Budget Control",       { projectScoped: true }),
    Financials:          r(lazyWithRetry(() => import("@/pages/Financials")),          "Budget Control",       { projectScoped: true }),
    CostDashboard:       r(lazyWithRetry(() => import("@/pages/CostDashboard")),       "Cost Dashboard",       { projectScoped: true }),
    ChangeOrders:        r(lazyWithRetry(() => import("@/pages/ChangeOrders")),        "Change Orders",        { projectScoped: true }),
    Backcharges:        r(lazyWithRetry(() => import("@/pages/Backcharges")),         "Backcharge Defense",   { projectScoped: true }),
    SOV:                 r(lazyWithRetry(() => import("@/pages/SOV")),                 "Schedule of Values",   { projectScoped: true }),
    PayApplications:    r(lazyWithRetry(() => import("@/pages/PayApplications")),     "Pay Applications",     { projectScoped: true }),
    Expenses:            r(lazyWithRetry(() => import("@/pages/Expenses")),            "Expenses",             { projectScoped: true }),
    ContractManagement:  r(lazyWithRetry(() => import("@/pages/ContractManagement")),  "Contract Management", { projectScoped: true }),
  },

  // ── Logistics ──
  logistics: {
    Deliveries: r(lazyWithRetry(() => import("@/pages/Deliveries")), "Deliveries", { projectScoped: true }),
  },

  // ── Risk & Compliance ──
  risk: {
    ChangeRequests:  r(lazyWithRetry(() => import("@/pages/ChangeRequests")),  "Change Requests",     { projectScoped: true }),
    DecisionLog:     r(lazyWithRetry(() => import("@/pages/DecisionLog")),     "Decision Log"),
    AlertsCenter:    r(lazyWithRetry(() => import("@/pages/AlertsCenter")),    "Alerts Center"),
  },

  // ── Closeout ──
  closeout: {
    ProjectCloseout: r(lazyWithRetry(() => import("@/pages/ProjectCloseout")), "Project Closeout",    { projectScoped: true }),
    Warranty:        r(lazyWithRetry(() => import("@/pages/Warranty")),        "Warranty",            { projectScoped: true }),
  },

  // ── Admin & Setup ──
  admin: {
    ScopeExclusions:  r(lazyWithRetry(() => import("@/pages/ScopeExclusions")),  "Scope & Exclusions"),
    Contacts:         r(lazyWithRetry(() => import("@/pages/Contacts")),         "Contacts"),
    Vendors:          r(lazyWithRetry(() => import("@/pages/Vendors")),          "Vendors"),
    DataExchange:     r(lazyWithRetry(() => import("@/pages/DataExchange")),     "Data Exchange",       { projectScoped: true }),
    Integrations:     r(lazyWithRetry(() => import("@/pages/Integrations")),     "Integrations"),
    Settings:         r(lazyWithRetry(() => import("@/pages/Settings")),         "Settings"),
    OrgMembers:       r(lazyWithRetry(() => import("@/pages/OrgMembers")),       "Team"),
    Billing:          r(lazyWithRetry(() => import("@/pages/Billing")),          "Billing"),
    UsersManagement:  r(lazyWithRetry(() => import("@/pages/UsersManagement")),  "User Management"),
    ProjectMembers:   r(lazyWithRetry(() => import("@/pages/ProjectMembers")),   "Project Members"),
    FeatureFlagsAdmin: r(lazyWithRetry(() => import("@/pages/FeatureFlagsAdmin")), "Feature Flags"),
    AgentMemory:      r(lazyWithRetry(() => import("@/pages/AgentMemory")),      "Agent Memory"),
    Tutorial:         r(lazyWithRetry(() => import("@/pages/Tutorial")),         "Tutorial / Help"),
  },

  // ── Tools ──
  tools: {
    CalculatorsHub:             r(lazyWithRetry(() => import("@/pages/CalculatorsHub")),             "Calculators"),
    Calculator:                 r(lazyWithRetry(() => import("@/pages/RegularCalculator")),          "Calculator"),
    FeetInchesCalculator:       r(lazyWithRetry(() => import("@/pages/FeetInchesCalculator")),       "Feet & Inches Calculator"),
    SteelWeightCalculator:      r(lazyWithRetry(() => import("@/pages/SteelWeightCalculator")),      "Steel Weight Calculator"),
    CranePickCalculator:        r(lazyWithRetry(() => import("@/pages/CranePickCalculator")),        "Crane Pick Calculator"),
    DecimalFractionConverter:   r(lazyWithRetry(() => import("@/pages/DecimalFractionConverter")),   "Decimal / Fraction Converter"),
  },

  // ── Reporting ──
  reporting: {
    JobStatusReport: r(lazyWithRetry(() => import("@/pages/JobStatusReport")), "Job Status Report",   { projectScoped: true }),
    ReportsHub:      r(lazyWithRetry(() => import("@/pages/ReportsHub")),      "Reports"),
    Reports:         r(lazyWithRetry(() => import("@/pages/Reports")),         "Reports"),
    Activity:        r(lazyWithRetry(() => import("@/pages/Activity")),        "Activity Log"),
  },
};

// ── Flat registry: { [pageName]: RouteEntry } ────────────────────────
const ROUTE_REGISTRY = Object.values(ROUTE_DOMAINS).reduce(
  (acc, domain) => Object.assign(acc, domain),
  /** @type {Record<string, RouteEntry>} */ ({})
);

// Intent-based route warming for the heaviest and highest-traffic pages.
// Sidebar/modules hover and keyboard focus can warm these chunks, but app boot
// no longer idle-prefetches them for users who never open the route.
registerRoutePrefetcher("Dashboard", () => import("@/pages/Dashboard"));
registerRoutePrefetcher("Schedule", () => import("@/pages/Schedule"));
registerRoutePrefetcher("RFIs", () => import("@/pages/RFIs"));
registerRoutePrefetcher("Drawings", () => import("@/pages/Drawings"));
registerRoutePrefetcher("DrawingViewer", () => import("@/pages/DrawingViewer"));
registerRoutePrefetcher("WorkPackages", () => import("@/pages/WorkPackages"));
registerRoutePrefetcher("Financials", () => import("@/pages/Financials"));

// ── Derived: page → component map (legacy router contract) ───────────
export const PAGES = Object.fromEntries(
  Object.entries(ROUTE_REGISTRY).map(([key, entry]) => [key, entry.component])
);

// ── Derived: page → label map ────────────────────────────────────────
export const PAGE_LABELS = Object.fromEntries(
  Object.entries(ROUTE_REGISTRY).map(([key, entry]) => [key, entry.label])
);

// ── Derived: pages whose UI depends on an active project ─────────────
export const PROJECT_SCOPED_PAGES = new Set(
  Object.entries(ROUTE_REGISTRY)
    .filter(([, entry]) => entry.projectScoped)
    .map(([key]) => key)
);

// ── Derived: full set of route paths the app actually serves ─────────
// "/", "/Landing", "/RFIHub" are static mounts in App.jsx, not in the
// registry, so they get spliced in explicitly.
export const ALL_ROUTE_PATHS = Array.from(new Set([
  "/",
  "/Landing",
  "/RFIHub",
  ...Object.keys(PAGES).map((p) => `/${p}`),
]));

/**
 * Resolve a page key to a display label. Unknown keys get a best-effort
 * spaced version (e.g. "FabRelease" → "Fab Release") so newly-introduced
 * pages don't crash the breadcrumb before they're registered.
 */
export function routeLabel(pageName) {
  if (!pageName) return "Page";
  if (PAGE_LABELS[pageName]) return PAGE_LABELS[pageName];
  return String(pageName).replace(/([A-Z])/g, " $1").trim();
}

// ── Validation ───────────────────────────────────────────────────────
/**
 * Validate the registry against the navigation configs. Catches three
 * drift classes:
 *
 *   1. Navigation references a page that isn't in the registry.
 *   2. A registry entry has no label (defensive — `r()` enforces this,
 *      but a hand-edited entry might bypass it).
 *   3. PROJECT_SCOPED_PAGES references a page that isn't registered.
 *
 * In dev, logs each issue. Returns the list so tests / CI can assert
 * an empty result.
 */
export async function validateRoutes() {
  const { NAV_GROUPS, SIDEBAR_GROUPS, PRIMARY_TABS } = await import("./moduleRegistry");
  const registered = new Set(Object.keys(ROUTE_REGISTRY));
  const referenced = new Set();

  NAV_GROUPS.flatMap((g) => g.items).forEach((item) => referenced.add(item.page));
  SIDEBAR_GROUPS.flatMap((g) => g.items).forEach((item) => referenced.add(item.page));
  PRIMARY_TABS.flatMap((t) => t.pages).forEach((p) => referenced.add(p));

  const issues = [];

  for (const p of referenced) {
    if (!registered.has(p)) {
      issues.push(`Navigation references unregistered page: ${p}`);
    }
  }
  for (const [key, entry] of Object.entries(ROUTE_REGISTRY)) {
    if (!entry.label) {
      issues.push(`Registered page has no label: ${key}`);
    }
  }
  for (const p of PROJECT_SCOPED_PAGES) {
    if (!registered.has(p)) {
      issues.push(`PROJECT_SCOPED_PAGES references unregistered page: ${p}`);
    }
  }

  if (issues.length > 0 && import.meta.env.DEV) {
    console.error(`[RouteValidator] ${issues.length} drift issue(s):`);
    for (const msg of issues) console.error("  -", msg);
  }

  return issues;
}

// Run validation at module load in dev so drift surfaces on first refresh.
if (import.meta.env.DEV) {
  void validateRoutes();
}

// ── Domain metadata (for tooling, route grouping, etc.) ──────────────
export const ROUTE_DOMAIN_NAMES = Object.keys(ROUTE_DOMAINS);

export function getPageDomain(pageName) {
  for (const [domain, pages] of Object.entries(ROUTE_DOMAINS)) {
    if (pageName in pages) return domain;
  }
  return null;
}

// ── Backward-compatible pagesConfig export ───────────────────────────
export const pagesConfig = {
  mainPage: "Dashboard",
  Pages: PAGES,
  // Layout is imported directly by App.jsx (no longer bundled here)
};
