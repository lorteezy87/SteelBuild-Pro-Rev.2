/**
 * Pure finding → zone type and severity weight catalogs for zone proposals.
 */

export const FINDING_TYPE_TO_ZONE_TYPE: Record<string, string> = {
  coordination_conflict: "area",
  callout_issue: "detail",
  aess_concern: "member_group",
  dimension_concern: "detail",
  missing_info: "area",
  revision_delta: "area",
};

export const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 0.95,
  high: 0.9,
  medium: 0.7,
  low: 0.5,
  info: 0.4,
};
