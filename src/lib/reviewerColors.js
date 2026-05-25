/**
 * reviewerColors.js — Pure role-to-color mapping for markup attribution.
 *
 * Used by ZonePanel/ActivityTab and any future comment / annotation
 * displays that want a consistent color cue for "who said this".
 *
 * The mapping covers two role taxonomies that show up in this app:
 *
 *   1. Trade roles — descriptive labels for project stakeholders.
 *      EOR, GC, Architect, Owner, Detailer, Fabricator. These typically
 *      come from a free-text "ball_in_court" or company-role field.
 *
 *   2. App-permission roles — admin, pm, field, viewer (the canonical
 *      `user_projects.role` tiers, sourced server-side via the DB role
 *      helpers). We give them their own colors so a chip is still useful
 *      where trade-role data isn't populated yet.
 *
 * Anything else falls back to grey. The fallback is deliberate — it's
 * better to render a neutral chip than to surface a misleading color.
 */

export const REVIEWER_COLORS = Object.freeze({
  // Trade roles
  EOR:         "#3b82f6", // blue
  GC:          "#10b981", // green
  Architect:   "#a855f7", // purple
  Owner:       "#f97316", // orange
  Detailer:    "#f59e0b", // amber
  Fabricator:  "#f59e0b", // amber (shared bucket per spec)

  // App-permission roles (from useAppSecurity)
  admin:  "#a855f7", // purple — high authority
  pm:     "#3b82f6", // blue — project lead
  field:  "#10b981", // green — execution
  viewer: "#6b7280", // grey

  // Explicit "unknown / other"
  Other:  "#6b7280", // grey
});

export const REVIEWER_COLOR_FALLBACK = "#6b7280";

// Lower-cased lookup for case-insensitive matching. Built once at
// module load so consumers don't pay the cost on every render.
const LOWER_LOOKUP = Object.freeze(
  Object.fromEntries(
    Object.entries(REVIEWER_COLORS).map(([k, v]) => [k.toLowerCase(), v]),
  ),
);

/**
 * Resolve a role label (trade or app-permission) to a hex color.
 * Returns the grey fallback for null / unknown / empty input.
 *
 * Matching is case-insensitive: "eor", "EOR", and "Eor" all return
 * the EOR color.
 */
export function getReviewerColor(role) {
  if (!role || typeof role !== "string") return REVIEWER_COLOR_FALLBACK;
  const hit = LOWER_LOOKUP[role.toLowerCase()];
  return hit || REVIEWER_COLOR_FALLBACK;
}

/**
 * Best-effort role inference for an actor when only an email or a
 * free-text label is available. Order of resolution:
 *
 *   1. If `roleLabel` is provided and matches a known role → use it.
 *   2. Otherwise fall back to the grey "Other" bucket.
 *
 * We deliberately do NOT try to infer trade roles from email domains —
 * domain heuristics are too noisy in steel-fabrication land where the
 * same vendor wears multiple hats. Callers that have authoritative
 * role data (e.g. from a project_members table) should pass it in
 * directly via `roleLabel`.
 */
export function inferReviewerColor({ roleLabel } = {}) {
  return getReviewerColor(roleLabel);
}

/** Stable list of all known role labels. Useful for legend rendering. */
export const KNOWN_REVIEWER_ROLES = Object.freeze(
  Object.keys(REVIEWER_COLORS).filter((k) => k !== "Other"),
);
