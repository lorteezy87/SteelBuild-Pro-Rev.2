/**
 * moduleGating.js — scope-cut configuration.
 *
 * SteelBuild Pro is focused on its core steel workflow (the "moat"):
 * drawings & submittals, drawing analysis (AI), RFIs, work packages,
 * basic schedule, and field progress. Everything else is deprioritized
 * and gated behind a feature flag so it stays out of the way by default
 * without deleting any code.
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
 * Scope note: the flag system is global + per-user-email. It is not
 * per-project. "Turn module X on for project Y only" would need a schema
 * change to feature_flags; that is intentionally out of scope here.
 *
 * This is the single source of truth — adjust the lists below to move a
 * module in or out of the cut.
 */

// flag_key → page keys hidden/blocked unless the flag is enabled.
export const MODULE_GATES = Object.freeze({
  module_3d_viewer:        ["ModelViewer"],
  module_email_inbox:      ["EmailInbox"],
  module_integrations:     ["Integrations", "DataExchange", "BluebeamCallback"],
  module_cost:             ["Financials", "CostDashboard", "ChangeOrders", "SOV", "Expenses", "ContractManagement", "MarginRisk", "BudgetHours"],
  module_quality:          ["Inspections", "Safety", "Punchlist", "QualityControl"],
  module_resources:        ["ResourceManagement", "ResourceScheduling"],
  module_closeout:         ["ProjectCloseout", "Warranty"],
  module_procurement:      ["Procurement", "LookAheadSchedule"],
  module_meetings:         ["Meetings", "ActionItems"],
  module_risk:             ["Mitigations", "ChangeRequests", "DecisionLog"],
  module_advanced_reports: ["AIInsights", "JobStatusReport", "Activity", "Reports", "ExecutiveView", "PortfolioGantt"],
});

// Human-readable labels for the admin catalog / tooling.
export const MODULE_GATE_LABELS = Object.freeze({
  module_3d_viewer:        "3D Model Viewer",
  module_email_inbox:      "Email Inbox",
  module_integrations:     "Integrations (SharePoint / Bluebeam / Data Exchange)",
  module_cost:             "Cost & Financials",
  module_quality:          "Quality & Safety (QC / Inspections / Punchlist)",
  module_resources:        "Resource Scheduling & Management",
  module_closeout:         "Closeout & Warranty",
  module_procurement:      "Procurement & Look-Ahead",
  module_meetings:         "Meetings & Action Items",
  module_risk:             "Risk (Mitigations / Change Requests / Decision Log)",
  module_advanced_reports: "Advanced Reports & Portfolio Views",
});

// page key → flag_key (inverted lookup, built once).
export const PAGE_TO_GATE = Object.freeze(
  Object.entries(MODULE_GATES).reduce((acc, [flag, pages]) => {
    for (const page of pages) acc[page] = flag;
    return acc;
  }, {})
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
