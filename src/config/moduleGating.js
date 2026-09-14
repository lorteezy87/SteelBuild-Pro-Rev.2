/**
 * moduleGating.js — scope-cut configuration.
 *
 * SteelBuild Pro focuses on the core steel workflow (the "moat"):
 * drawings & submittals, RFIs, work packages, schedule, field, piece control.
 * Deprioritized modules are gated behind feature flags so they stay out of
 * the way by default without deleting any code.
 *
 * How the gate works:
 *   - Each deprioritized module maps to a `flag_key`.
 *   - A gated page is HIDDEN from navigation and BLOCKED at the route
 *     (direct-URL access redirects home) unless its flag resolves true.
 *   - Flags are resolved by the Supabase-backed `useFeatureFlag` system.
 *     An absent flag resolves to `false`, so gated modules are OFF by
 *     default with no migration required.
 *   - To re-enable a module, an admin creates/enables its `flag_key` in
 *     /FeatureFlagsAdmin (global, or per-user via user_overrides). Pages
 *     NOT listed here are never gated — core workflow and admin/setup
 *     surfaces always render.
 *
 * Scope note: the flag system is global + per-user-email, not per-project.
 */

// flag_key → page keys hidden/blocked unless the flag is enabled.
// Page keys must match src/config/routes.js / moduleRegistry.js.
export const MODULE_GATES = Object.freeze({
  // 3D lives as a tab inside Detailing Control Center; tab chrome still
  // respects the existing `viewer_3d` flag. No standalone ModelViewer route.
  module_integrations:     ["DataExchange"],
  module_quality:          ["Inspections", "Safety", "Punchlist", "QualityControl"],
  module_resources:        ["ResourceHub", "ResourceScheduling"],
  module_closeout:         ["ProjectCloseout", "Warranty"],
  module_procurement:      ["Procurement", "LookAheadSchedule"],
  module_meetings:         ["ActionItems"], // Meetings page consolidated; AI list remains gated
  module_risk:             ["RiskHub", "ChangeRequests", "Mitigations", "DecisionLog"],
  module_advanced_reports: [
    "JobStatusReport", "Activity", "Reports", "ReportsHub",
    "ExecutiveView", "PortfolioHub", "PortfolioGantt",
  ],
});

export const MODULE_GATE_LABELS = Object.freeze({
  module_integrations:     "Integrations (SharePoint / Bluebeam / Data Exchange)",
  module_quality:          "Quality & Safety (QC / Inspections / Punchlist)",
  module_resources:        "Resource Scheduling & Management",
  module_closeout:         "Closeout & Warranty",
  module_procurement:      "Procurement & Look-Ahead",
  module_meetings:         "Action Items (meetings suite)",
  module_risk:             "Risk (Mitigations / Change Requests / Risk Hub)",
  module_advanced_reports: "Advanced Reports & Portfolio Views",
});

export const PAGE_TO_GATE = Object.freeze(
  Object.entries(MODULE_GATES).reduce((acc, [flag, pages]) => {
    for (const page of pages) acc[page] = flag;
    return acc;
  }, /** @type {Record<string, string>} */ ({})),
);

export const GATE_FLAG_KEYS = Object.freeze(Object.keys(MODULE_GATES));

/** The flag_key gating a page, or null if the page is never gated (core). */
export function gateFlagForPage(page) {
  return PAGE_TO_GATE[page] || null;
}

/** True if a page is part of a deprioritized (gated) module. */
export function isGatedPage(page) {
  return Boolean(PAGE_TO_GATE[page]);
}
