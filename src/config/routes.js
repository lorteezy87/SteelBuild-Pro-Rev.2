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

// ── Retry wrapper for lazy imports ──────────────────────────────────
// After a Vercel deployment, old chunk filenames no longer exist on the
// CDN.  Browsers that cached the previous index.html will request stale
// chunk URLs and get 404s, causing "Failed to fetch dynamically imported
// module" errors.  This wrapper catches those failures and reloads the
// page once to fetch fresh chunk URLs from the new index.html.
const SESSION_RELOAD_KEY = "__steelbuild_chunk_reload";

function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch((err) => {
      // Only auto-reload once per session to avoid infinite reload loops
      const hasReloaded = sessionStorage.getItem(SESSION_RELOAD_KEY);
      if (!hasReloaded) {
        sessionStorage.setItem(SESSION_RELOAD_KEY, "1");
        console.warn("[lazyWithRetry] Chunk load failed, reloading page for fresh assets:", err?.message);
        window.location.reload();
        // Return a never-resolving promise so React doesn't render an error
        // while the page reloads
        return new Promise(() => {});
      }
      // Already reloaded once — throw so the error boundary catches it
      throw err;
    })
  );
}

// Clear the reload flag on successful page load so future deploys
// can trigger a fresh reload
sessionStorage.removeItem(SESSION_RELOAD_KEY);

// ── Domain-grouped lazy page imports ─────────────────────────────────
const ROUTE_DOMAINS = {
  // ── Overview & Portfolio ──
  overview: {
    Dashboard:              lazyWithRetry(() => import("@/pages/Dashboard")),
    CommandCenter:          lazyWithRetry(() => import("@/pages/CommandCenter")),
    ProjectControlCenter:   lazyWithRetry(() => import("@/pages/ProjectControlCenter")),
    ExecutiveView:          lazyWithRetry(() => import("@/pages/ExecutiveView")),
    Projects:               lazyWithRetry(() => import("@/pages/Projects")),
    ProjectDetail:          lazyWithRetry(() => import("@/pages/ProjectDetail")),
    AIInsights:             lazyWithRetry(() => import("@/pages/AIInsights")),
  },

  // ── Communications ──
  communications: {
    RFIs:             lazyWithRetry(() => import("@/pages/RFIs")),
    RFIHub:           lazyWithRetry(() => import("@/pages/RFIHub")),
    Meetings:         lazyWithRetry(() => import("@/pages/Meetings")),
    ActionItems:      lazyWithRetry(() => import("@/pages/ActionItems")),
    ProductionNotes:  lazyWithRetry(() => import("@/pages/ProductionNotes")),
  },

  // ── Design & Documents ──
  documents: {
    Drawings:         lazyWithRetry(() => import("@/pages/Drawings")),
    DrawingAnalysis:  lazyWithRetry(() => import("@/pages/DrawingAnalysis")),
    DrawingViewer:    lazyWithRetry(() => import("@/pages/DrawingViewer")),
    Documents:        lazyWithRetry(() => import("@/pages/Documents")),
    ModelViewer:      lazyWithRetry(() => import("@/pages/ModelViewer")),
  },

  // ── Fabrication & Production ──
  fabrication: {
    WorkPackages:       lazyWithRetry(() => import("@/pages/WorkPackages")),
    Constraints:        lazyWithRetry(() => import("@/pages/Constraints")),
    FabRelease:         lazyWithRetry(() => import("@/pages/FabRelease")),
    Procurement:        lazyWithRetry(() => import("@/pages/Procurement")),
    LookAheadSchedule:  lazyWithRetry(() => import("@/pages/LookAheadSchedule")),
  },

  // ── Scheduling & Resources ──
  scheduling: {
    Schedule:             lazyWithRetry(() => import("@/pages/Schedule")),
    GanttChart:           lazyWithRetry(() => import("@/pages/GanttChart")),
    ResourceManagement:   lazyWithRetry(() => import("@/pages/ResourceManagement")),
    ResourceScheduling:   lazyWithRetry(() => import("@/pages/ResourceScheduling")),
  },

  // ── Field Operations ──
  field: {
    DailyLogs:       lazyWithRetry(() => import("@/pages/DailyLogs")),
    Photos:          lazyWithRetry(() => import("@/pages/Photos")),
    LEMs:            lazyWithRetry(() => import("@/pages/LEMs")),
    Inspections:     lazyWithRetry(() => import("@/pages/Inspections")),
    Safety:          lazyWithRetry(() => import("@/pages/Safety")),
    Punchlist:       lazyWithRetry(() => import("@/pages/Punchlist")),
    QualityControl:  lazyWithRetry(() => import("@/pages/QualityControl")),
  },

  // ── Cost & Finance ──
  cost: {
    Financials:          lazyWithRetry(() => import("@/pages/Financials")),
    CostDashboard:       lazyWithRetry(() => import("@/pages/CostDashboard")),
    ChangeOrders:        lazyWithRetry(() => import("@/pages/ChangeOrders")),
    SOV:                 lazyWithRetry(() => import("@/pages/SOV")),
    Expenses:            lazyWithRetry(() => import("@/pages/Expenses")),
    ContractManagement:  lazyWithRetry(() => import("@/pages/ContractManagement")),
  },

  // ── Logistics ──
  logistics: {
    Deliveries: lazyWithRetry(() => import("@/pages/Deliveries")),
  },

  // ── Risk & Compliance ──
  risk: {
    Mitigations:     lazyWithRetry(() => import("@/pages/Mitigations")),
    ChangeRequests:  lazyWithRetry(() => import("@/pages/ChangeRequests")),
    DecisionLog:     lazyWithRetry(() => import("@/pages/DecisionLog")),
    Alerts:          lazyWithRetry(() => import("@/pages/Alerts")),
    AlertsCenter:    lazyWithRetry(() => import("@/pages/AlertsCenter")),
  },

  // ── Closeout ──
  closeout: {
    ProjectCloseout: lazyWithRetry(() => import("@/pages/ProjectCloseout")),
    Warranty:        lazyWithRetry(() => import("@/pages/Warranty")),
  },

  // ── Admin & Setup ──
  admin: {
    ScopeExclusions:  lazyWithRetry(() => import("@/pages/ScopeExclusions")),
    Contacts:         lazyWithRetry(() => import("@/pages/Contacts")),
    Vendors:          lazyWithRetry(() => import("@/pages/Vendors")),
    Settings:         lazyWithRetry(() => import("@/pages/Settings")),
    UsersManagement:  lazyWithRetry(() => import("@/pages/UsersManagement")),
    AgentMemory:      lazyWithRetry(() => import("@/pages/AgentMemory")),
  },

  // ── Tools ──
  tools: {
    FeetInchesCalculator:   lazyWithRetry(() => import("@/pages/FeetInchesCalculator")),
    SteelWeightCalculator:  lazyWithRetry(() => import("@/pages/SteelWeightCalculator")),
    CranePickCalculator:    lazyWithRetry(() => import("@/pages/CranePickCalculator")),
  },

  // ── Reporting ──
  reporting: {
    JobStatusReport: lazyWithRetry(() => import("@/pages/JobStatusReport")),
    Reports:         lazyWithRetry(() => import("@/pages/Reports")),
    Activity:        lazyWithRetry(() => import("@/pages/Activity")),
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
