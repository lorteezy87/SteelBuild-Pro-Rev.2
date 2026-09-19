/**
 * routes.js — single source of truth for the page registry.
 */

import { lazyWithRetry } from "@/lib/lazyRetry";
import { registerRoutePrefetcher } from "@/lib/routePrefetch";
import { NAV_GROUPS, SIDEBAR_GROUPS, PRIMARY_TABS } from "./moduleRegistry";

// Lifecycles a REGISTERED PAGE may declare.
export const ROUTE_LIFECYCLES = Object.freeze(["active", "internal"]);

// Lifecycles a STATIC_ROUTE_METADATA entry may declare. "legacy" belongs here
// and only here: it marks a retired URL kept alive as a redirect, which is a
// valid state for a bare path but never for a page in the registry. Nothing
// validated these at all, so a typo in a static entry was silent.
export const STATIC_ROUTE_LIFECYCLES = Object.freeze(["active", "internal", "legacy"]);

/**
 * The mounted path a redirect target points at, with any query and hash
 * stripped. STATIC_ROUTE_METADATA targets are allowed to carry params so a
 * legacy route can land on a specific tab.
 */
export function redirectTargetPath(target) {
  return String(target).split(/[?#]/)[0];
}

export const STATIC_ROUTE_METADATA = {
  "/": { lifecycle: "active", kind: "entry" },
  "/Landing": { lifecycle: "active", kind: "entry" },
  "/DesktopConnect": { lifecycle: "internal", kind: "entry" },
  "/Schedule": { lifecycle: "legacy", kind: "redirect", target: "/ScheduleHub" },
  "/GanttChart": { lifecycle: "legacy", kind: "redirect", target: "/ScheduleHub" },
  "/RFIHub": { lifecycle: "legacy", kind: "redirect", target: "/RFIs" },
  "/Financials": { lifecycle: "legacy", kind: "redirect", target: "/CostHub" },
  "/CostDashboard": { lifecycle: "legacy", kind: "redirect", target: "/CostHub" },
  "/BudgetControl": { lifecycle: "legacy", kind: "redirect", target: "/CostHub" },
  "/Detailing": { lifecycle: "legacy", kind: "redirect", target: "/DrawingSubmittalHub" },
  // The "full editor". Everything it did — set upload, revision upload, add
  // sheet, bulk edit, rename, titleblock mapping, log import, export packages
  // — now sits on the Drawing Register itself (DrawingRegisterWorkbench), so
  // the page is a second register with no reason to exist. Bookmarks and the
  // dashboard checklist keep working through this redirect.
  "/Drawings": { lifecycle: "legacy", kind: "redirect", target: "/DrawingSubmittalHub?hub_tab=drawings" },
  "/Team": { lifecycle: "legacy", kind: "redirect", target: "/OrgMembers" },
  "/ProjectDetail": { lifecycle: "legacy", kind: "redirect", target: "/Projects" },
  "/ResourceManagement": { lifecycle: "legacy", kind: "redirect", target: "/ResourceHub" },
  "/AIInsights": { lifecycle: "legacy", kind: "redirect", target: "/PortfolioHub" },
  "/MarginRisk": { lifecycle: "legacy", kind: "redirect", target: "/RiskHub" },
};

function r(component, label, opts) {
  return {
    component,
    label,
    lifecycle: opts?.lifecycle || "active",
    projectScoped: opts?.projectScoped === true,
  };
}

const ROUTE_DOMAINS = {
  overview: {
    Dashboard:              r(lazyWithRetry(() => import("@/pages/Dashboard")),             "Dashboard",                 { projectScoped: true }),
    CommandCenter:          r(lazyWithRetry(() => import("@/pages/CommandCenter")),         "Command Center",           { projectScoped: true }),
    ExecutiveView:          r(lazyWithRetry(() => import("@/pages/ExecutiveView")),         "Executive View"),
    Projects:               r(lazyWithRetry(() => import("@/pages/Projects")),              "Projects"),
    ProjectsHub:            r(lazyWithRetry(() => import("@/pages/ProjectsHub")),           "Projects"),
    Onboarding:             r(lazyWithRetry(() => import("@/pages/Onboarding")),            "Onboarding"),
    PortfolioHub:           r(lazyWithRetry(() => import("@/pages/PortfolioHub")),          "Portfolio Overview"),
  },
  communications: {
    RFIs:             r(lazyWithRetry(() => import("@/pages/RFIs")),             "RFIs",                { projectScoped: true }),
    ActionItems:      r(lazyWithRetry(() => import("@/pages/ActionItems")),      "Action Items",        { projectScoped: true }),
    ProductionNotes:  r(lazyWithRetry(() => import("@/pages/ProductionNotes")),  "Production Notes",    { projectScoped: true }),
    EmailInbox:       r(lazyWithRetry(() => import("@/pages/EmailInbox")),       "Email Inbox",         { projectScoped: true }),
  },
  documents: {
    DrawingSubmittalHub: r(lazyWithRetry(() => import("@/pages/DrawingSubmittalHub")), "Detailing Control Center", { projectScoped: true }),
    DrawingViewer:    r(lazyWithRetry(() => import("@/pages/DrawingViewer")),    "Drawing Viewer",      { projectScoped: true }),
    Documents:        r(lazyWithRetry(() => import("@/pages/Documents")),        "Documents",           { projectScoped: true }),
    Submittals:       r(lazyWithRetry(() => import("@/pages/Submittals")),       "Submittal Register",  { projectScoped: true }),
    DocumentControl:  r(lazyWithRetry(() => import("@/pages/DocumentControl")),  "Document Control",    { projectScoped: true }),
    // Incoming, GC-issued documents. Separate from Drawings on purpose: that
    // register is OUR shop drawings and their submittal workflow.
    GcDocuments:      r(lazyWithRetry(() => import("@/pages/GcDocuments")),      "GC Documents",        { projectScoped: true }),
    GcDrawingViewer:  r(lazyWithRetry(() => import("@/pages/GcDrawingViewer")),  "GC Drawing Viewer",   { projectScoped: true }),
  },
  fabrication: {
    WorkPackages:       r(lazyWithRetry(() => import("@/pages/WorkPackages")),       "Work Packages",       { projectScoped: true }),
    Constraints:        r(lazyWithRetry(() => import("@/pages/Constraints")),        "Constraints",         { projectScoped: true }),
    PieceRegister:      r(lazyWithRetry(() => import("@/pages/PieceRegister")),      "Piece Register",      { projectScoped: true }),
    FabRelease:         r(lazyWithRetry(() => import("@/pages/FabRelease")),         "Fab Release",         { projectScoped: true }),
    ProductionStatus:   r(lazyWithRetry(() => import("@/pages/ProductionStatus")),   "Production Status",   { projectScoped: true }),
    RiskHub:            r(lazyWithRetry(() => import("@/pages/RiskHub")),            "Risk",                { projectScoped: true }),
    BudgetHours:        r(lazyWithRetry(() => import("@/pages/BudgetHours")),        "Budget Hours",        { projectScoped: true }),
    Procurement:        r(lazyWithRetry(() => import("@/pages/Procurement")),        "Procurement",         { projectScoped: true }),
    LookAheadSchedule:  r(lazyWithRetry(() => import("@/pages/LookAheadSchedule")),  "Look-Ahead Schedule", { projectScoped: true }),
  },
  scheduling: {
    ScheduleHub:          r(lazyWithRetry(() => import("@/pages/ScheduleHub")),         "Schedule",             { projectScoped: true }),
    ProjectCalendar:      r(lazyWithRetry(() => import("@/pages/ProjectCalendar")),     "Project Calendar",     { projectScoped: true }),
    FieldPlan:            r(lazyWithRetry(() => import("@/pages/FieldPlan")),           "Field Plan",          { projectScoped: true }),
    ResourceHub:          r(lazyWithRetry(() => import("@/pages/ResourceHub")),         "Resources",             { projectScoped: true }),
    ResourceScheduling:   r(lazyWithRetry(() => import("@/pages/ResourceScheduling")),  "Crew Scheduling"),
  },
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
  cost: {
    CostHub:             r(lazyWithRetry(() => import("@/pages/CostHub")),             "Budget Control",       { projectScoped: true }),
    ChangeOrders:        r(lazyWithRetry(() => import("@/pages/ChangeOrders")),        "Change Orders",        { projectScoped: true }),
    Backcharges:        r(lazyWithRetry(() => import("@/pages/Backcharges")),         "Backcharge Defense",   { projectScoped: true }),
    SOV:                 r(lazyWithRetry(() => import("@/pages/SOV")),                 "Schedule of Values",   { projectScoped: true }),
    PayApplications:    r(lazyWithRetry(() => import("@/pages/PayApplications")),     "Pay Applications",     { projectScoped: true }),
    Expenses:            r(lazyWithRetry(() => import("@/pages/Expenses")),            "Expenses",             { projectScoped: true }),
    ContractManagement:  r(lazyWithRetry(() => import("@/pages/ContractManagement")),  "Contract Management", { projectScoped: true }),
  },
  logistics: {
    Deliveries: r(lazyWithRetry(() => import("@/pages/Deliveries")), "Deliveries", { projectScoped: true }),
  },
  risk: {
    ChangeRequests:  r(lazyWithRetry(() => import("@/pages/ChangeRequests")),  "Change Requests",     { projectScoped: true }),
    AlertsCenter:    r(lazyWithRetry(() => import("@/pages/AlertsCenter")),    "Alerts Center"),
  },
  closeout: {
    ProjectCloseout: r(lazyWithRetry(() => import("@/pages/ProjectCloseout")), "Project Closeout",    { projectScoped: true }),
    Warranty:        r(lazyWithRetry(() => import("@/pages/Warranty")),        "Warranty",            { projectScoped: true }),
  },
  admin: {
    ScopeExclusions:  r(lazyWithRetry(() => import("@/pages/ScopeExclusions")),  "Scope & Exclusions"),
    Contacts:         r(lazyWithRetry(() => import("@/pages/Contacts")),         "Contacts"),
    Vendors:          r(lazyWithRetry(() => import("@/pages/Vendors")),          "Vendors"),
    DataExchange:     r(lazyWithRetry(() => import("@/pages/DataExchange")),     "Data Exchange",       { projectScoped: true, lifecycle: "internal" }),
    Integrations:     r(lazyWithRetry(() => import("@/pages/Integrations")),     "Integrations"),
    Settings:         r(lazyWithRetry(() => import("@/pages/Settings")),         "Settings"),
    OrgMembers:       r(lazyWithRetry(() => import("@/pages/OrgMembers")),       "Team"),
    Billing:          r(lazyWithRetry(() => import("@/pages/Billing")),          "Billing"),
    UsersManagement:  r(lazyWithRetry(() => import("@/pages/UsersManagement")),  "User Management",       { lifecycle: "internal" }),
    ProjectMembers:   r(lazyWithRetry(() => import("@/pages/ProjectMembers")),   "Project Members",       { lifecycle: "internal" }),
    FeatureFlagsAdmin: r(lazyWithRetry(() => import("@/pages/FeatureFlagsAdmin")), "Feature Flags",       { lifecycle: "internal" }),
    DesktopConnect:    r(lazyWithRetry(() => import("@/pages/DesktopConnect")),    "Connect Desktop",     { lifecycle: "internal" }),
    Tutorial:         r(lazyWithRetry(() => import("@/pages/Tutorial")),         "Tutorial / Help"),
  },
  tools: {
    CalculatorsHub:             r(lazyWithRetry(() => import("@/pages/CalculatorsHub")),             "Calculators"),
    Calculator:                 r(lazyWithRetry(() => import("@/pages/RegularCalculator")),          "Calculator"),
    FeetInchesCalculator:       r(lazyWithRetry(() => import("@/pages/FeetInchesCalculator")),       "Feet & Inches Calculator"),
    SteelWeightCalculator:      r(lazyWithRetry(() => import("@/pages/SteelWeightCalculator")),      "Steel Weight Calculator"),
    CranePickCalculator:        r(lazyWithRetry(() => import("@/pages/CranePickCalculator")),        "Crane Pick Calculator"),
    DecimalFractionConverter:   r(lazyWithRetry(() => import("@/pages/DecimalFractionConverter")),   "Decimal / Fraction Converter"),
    Notes:                      r(lazyWithRetry(() => import("@/pages/Notes")),                      "Notes"),
  },
  reporting: {
    JobStatusReport: r(lazyWithRetry(() => import("@/pages/JobStatusReport")), "Job Status Report",   { projectScoped: true }),
    ReportsHub:      r(lazyWithRetry(() => import("@/pages/ReportsHub")),      "Reports"),
    Reports:         r(lazyWithRetry(() => import("@/pages/Reports")),         "Reports"),
    Activity:        r(lazyWithRetry(() => import("@/pages/Activity")),        "Activity Log"),
  },
};

const ROUTE_REGISTRY = Object.values(ROUTE_DOMAINS).reduce(
  (acc, domain) => Object.assign(acc, domain),
  /** @type {Record<string, any>} */ ({})
);

registerRoutePrefetcher("Dashboard", () => import("@/pages/Dashboard"));
registerRoutePrefetcher("DrawingSubmittalHub", () => import("@/pages/DrawingSubmittalHub"));
registerRoutePrefetcher("CommandCenter", () => import("@/pages/CommandCenter"));
registerRoutePrefetcher("ScheduleHub", () => import("@/pages/ScheduleHub"));
registerRoutePrefetcher("RFIs", () => import("@/pages/RFIs"));
registerRoutePrefetcher("DrawingViewer", () => import("@/pages/DrawingViewer"));
registerRoutePrefetcher("WorkPackages", () => import("@/pages/WorkPackages"));

export const PAGES = Object.fromEntries(
  Object.entries(ROUTE_REGISTRY).map(([key, entry]) => [key, entry.component])
);

export const PAGE_LABELS = Object.fromEntries(
  Object.entries(ROUTE_REGISTRY).map(([key, entry]) => [key, entry.label])
);

export const PAGE_LIFECYCLES = Object.fromEntries(
  Object.entries(ROUTE_REGISTRY).map(([key, entry]) => [key, entry.lifecycle])
);

export const PROJECT_SCOPED_PAGES = new Set(
  Object.entries(ROUTE_REGISTRY)
    .filter(([, entry]) => entry.projectScoped)
    .map(([key]) => key)
);

export const ALL_ROUTE_PATHS = Array.from(new Set([
  ...Object.keys(STATIC_ROUTE_METADATA),
  ...Object.keys(PAGES).map((p) => `/${p}`),
]));

/**
 * Paths AppRoutes actually mounts, derived the way the router derives them
 * (see src/boot/AppRoutes.jsx).
 *
 * Deliberately NOT ALL_ROUTE_PATHS. That is the union of the registry and
 * STATIC_ROUTE_METADATA's OWN KEYS, so the old check
 * `!ALL_ROUTE_PATHS.includes(path)` compared STATIC_ROUTE_METADATA against a
 * set built from STATIC_ROUTE_METADATA — a tautology that could never fail. A
 * `kind: "entry"` path pointing at no mounted route would 404 in production
 * and the validator would report nothing.
 */
export function mountedRoutePaths() {
  return new Set([
    "/",
    "/Landing",
    "/ProjectDetail",
    "/DesktopConnect",
    ...Object.keys(PAGES).map((p) => `/${p}`),
    ...Object.entries(STATIC_ROUTE_METADATA)
      .filter(([, meta]) => meta.kind === "redirect")
      .map(([path]) => path),
  ]);
}

export function routeLabel(pageName) {
  if (!pageName) return "Page";
  if (PAGE_LABELS[pageName]) return PAGE_LABELS[pageName];
  return String(pageName).replace(/([A-Z])/g, " $1").trim();
}

export async function validateRoutes() {
  const registered = new Set(Object.keys(ROUTE_REGISTRY));
  const referenced = new Set();
  NAV_GROUPS.flatMap((g) => g.items).forEach((item) => referenced.add(item.page));
  SIDEBAR_GROUPS.flatMap((g) => g.items).forEach((item) => referenced.add(item.page));
  PRIMARY_TABS.flatMap((t) => t.pages).forEach((p) => referenced.add(p));
  const issues = [];
  for (const p of referenced) {
    if (!registered.has(p)) issues.push(`Navigation references unregistered page: ${p}`);
  }
  for (const [key, entry] of Object.entries(ROUTE_REGISTRY)) {
    if (!entry.label) issues.push(`Registered page has no label: ${key}`);
    if (!ROUTE_LIFECYCLES.includes(entry.lifecycle)) issues.push(`Unknown lifecycle for registered page ${key}: ${entry.lifecycle}`);
  }
  for (const p of PROJECT_SCOPED_PAGES) {
    if (!registered.has(p)) issues.push(`PROJECT_SCOPED_PAGES references unregistered page: ${p}`);
  }
  const mounted = mountedRoutePaths();
  for (const [path, meta] of Object.entries(STATIC_ROUTE_METADATA)) {
    if (!mounted.has(path)) issues.push(`Static route path not mounted: ${path}`);
    if (meta.kind === "redirect") {
      // A redirect target may carry query or hash (e.g. /Drawings lands on the
      // hub's Drawing Register tab), so compare the PATH only — otherwise a
      // perfectly good target reads as unmounted and the real check, that the
      // path exists, never runs.
      const targetPath = meta.target ? redirectTargetPath(meta.target) : "";
      if (!meta.target) {
        issues.push(`Redirect has no target: ${path}`);
      } else if (!mounted.has(targetPath)) {
        issues.push(`Redirect target not mounted: ${path} -> ${meta.target}`);
      } else if (targetPath === path) {
        // Would send the browser to the URL it is already on, forever.
        issues.push(`Redirect points at itself: ${path}`);
      }
    }
    // STATIC_ROUTE_METADATA lifecycles were never checked at all, so a typo
    // here was invisible. "legacy" is valid HERE (it marks a retired URL kept
    // alive as a redirect) but is deliberately absent from ROUTE_LIFECYCLES,
    // which governs REGISTERED PAGES — a registered page must never be legacy.
    if (!STATIC_ROUTE_LIFECYCLES.includes(meta.lifecycle)) {
      issues.push(`Unknown lifecycle for static route ${path}: ${meta.lifecycle}`);
    }
  }
  if (issues.length > 0 && import.meta.env.DEV) {
    console.error(`[RouteValidator] ${issues.length} drift issue(s):`);
    for (const msg of issues) console.error("  -", msg);
  }
  return issues;
}

if (import.meta.env.DEV) void validateRoutes();

export const ROUTE_DOMAIN_NAMES = Object.keys(ROUTE_DOMAINS);

export function getPageDomain(pageName) {
  for (const [domain, pages] of Object.entries(ROUTE_DOMAINS)) {
    if (pageName in pages) return domain;
  }
  return null;
}

export const pagesConfig = {
  mainPage: "Dashboard",
  Pages: PAGES,
};
