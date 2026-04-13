/**
 * routes.js - Validated, domain-grouped route registry with lazy loading
 *
 * Replaces the auto-generated pages.config.js with:
 *  - React.lazy() for every page (code-splitting)
 *  - Domain grouping for maintainability
 *  - Build-time validation that nav references match registered routes
 *
 * To add a new page:
 *   1. Create src/pages/MyPage.jsx with a default export
 *   2. Add it to the appropriate ROUTE_DOMAINS group below
 *   3. Add navigation entries in src/config/moduleRegistry.js
 */

import { lazy } from "react";
import { NAV_GROUPS, SIDEBAR_GROUPS, PRIMARY_TABS } from "./moduleRegistry";

// ── Domain-grouped lazy page imports ─────────────────────────────────
const ROUTE_DOMAINS = {
  // ── Overview & Portfolio ──
  overview: {
    Dashboard:              lazy(() => import("@/pages/Dashboard")),
    ProjectControlCenter:   lazy(() => import("@/pages/ProjectControlCenter")),
    ExecutiveView:          lazy(() => import("@/pages/ExecutiveView")),
    Projects:               lazy(() => import("@/pages/Projects")),
    ProjectDetail:          lazy(() => import("@/pages/ProjectDetail")),
    AIInsights:             lazy(() => import("@/pages/AIInsights")),
  },

  // ── Communications ──
  communications: {
    RFIs:             lazy(() => import("@/pages/RFIs")),
    RFIHub:           lazy(() => import("@/pages/RFIHub")),
    Meetings:         lazy(() => import("@/pages/Meetings")),
    ActionItems:      lazy(() => import("@/pages/ActionItems")),
    ProductionNotes:  lazy(() => import("@/pages/ProductionNotes")),
  },

  // ── Design & Documents ──
  documents: {
    Drawings:       lazy(() => import("@/pages/Drawings")),
    DrawingViewer:  lazy(() => import("@/pages/DrawingViewer")),
    Documents:      lazy(() => import("@/pages/Documents")),
    ModelViewer:    lazy(() => import("@/pages/ModelViewer")),
  },

  // ── Fabrication & Production ──
  fabrication: {
    WorkPackages:       lazy(() => import("@/pages/WorkPackages")),
    Constraints:        lazy(() => import("@/pages/Constraints")),
    FabRelease:         lazy(() => import("@/pages/FabRelease")),
    Procurement:        lazy(() => import("@/pages/Procurement")),
    LookAheadSchedule:  lazy(() => import("@/pages/LookAheadSchedule")),
  },

  // ── Scheduling & Resources ──
  scheduling: {
    Schedule:             lazy(() => import("@/pages/Schedule")),
    GanttChart:           lazy(() => import("@/pages/GanttChart")),
    ResourceManagement:   lazy(() => import("@/pages/ResourceManagement")),
    ResourceScheduling:   lazy(() => import("@/pages/ResourceScheduling")),
  },

  // ── Field Operations ──
  field: {
    DailyLogs:       lazy(() => import("@/pages/DailyLogs")),
    Photos:          lazy(() => import("@/pages/Photos")),
    LEMs:            lazy(() => import("@/pages/LEMs")),
    Inspections:     lazy(() => import("@/pages/Inspections")),
    Safety:          lazy(() => import("@/pages/Safety")),
    Punchlist:       lazy(() => import("@/pages/Punchlist")),
    QualityControl:  lazy(() => import("@/pages/QualityControl")),
  },

  // ── Cost & Finance ──
  cost: {
    Financials:          lazy(() => import("@/pages/Financials")),
    CostDashboard:       lazy(() => import("@/pages/CostDashboard")),
    ChangeOrders:        lazy(() => import("@/pages/ChangeOrders")),
    SOV:                 lazy(() => import("@/pages/SOV")),
    Expenses:            lazy(() => import("@/pages/Expenses")),
    ContractManagement:  lazy(() => import("@/pages/ContractManagement")),
  },

  // ── Logistics ──
  logistics: {
    Deliveries: lazy(() => import("@/pages/Deliveries")),
  },

  // ── Risk & Compliance ──
  risk: {
    Mitigations:     lazy(() => import("@/pages/Mitigations")),
    ChangeRequests:  lazy(() => import("@/pages/ChangeRequests")),
    DecisionLog:     lazy(() => import("@/pages/DecisionLog")),
    Alerts:          lazy(() => import("@/pages/Alerts")),
    AlertsCenter:    lazy(() => import("@/pages/AlertsCenter")),
  },

  // ── Closeout ──
  closeout: {
    ProjectCloseout: lazy(() => import("@/pages/ProjectCloseout")),
    Warranty:        lazy(() => import("@/pages/Warranty")),
  },

  // ── Admin & Setup ──
  admin: {
    ScopeExclusions:  lazy(() => import("@/pages/ScopeExclusions")),
    Contacts:         lazy(() => import("@/pages/Contacts")),
    Vendors:          lazy(() => import("@/pages/Vendors")),
    Settings:         lazy(() => import("@/pages/Settings")),
    UsersManagement:  lazy(() => import("@/pages/UsersManagement")),
    AgentMemory:      lazy(() => import("@/pages/AgentMemory")),
  },

  // ── Reporting ──
  reporting: {
    JobStatusReport: lazy(() => import("@/pages/JobStatusReport")),
    Reports:         lazy(() => import("@/pages/Reports")),
    Activity:        lazy(() => import("@/pages/Activity")),
  },
};

// ── Flat page map for router consumption ─────────────────────────────
export const PAGES = Object.values(ROUTE_DOMAINS).reduce(
  (acc, domain) => ({ ...acc, ...domain }),
  {}
);

// ── Route validation ─────────────────────────────────────────────────
/**
 * Validates that every page referenced in navigation configs is registered
 * in ROUTE_DOMAINS. Logs warnings in development; silent in production.
 *
 * @returns {string[]} Array of unregistered page names (empty = all valid)
 */
export function validateRoutes() {
  const registered = new Set(Object.keys(PAGES));
  const referenced = new Set();

  // Collect all page references from navigation configs
  NAV_GROUPS.flatMap((g) => g.items).forEach((item) => referenced.add(item.page));
  SIDEBAR_GROUPS.flatMap((g) => g.items).forEach((item) => referenced.add(item.page));
  PRIMARY_TABS.flatMap((t) => t.pages).forEach((page) => referenced.add(page));

  const missing = [...referenced].filter((page) => !registered.has(page));

  if (missing.length > 0 && import.meta.env.DEV) {
    console.error(
      `[RouteValidator] ${missing.length} page(s) referenced in navigation but not registered in routes.js:`,
      missing
    );
  }

  return missing;
}

// Run validation at module load in dev
if (import.meta.env.DEV) {
  validateRoutes();
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
