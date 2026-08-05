/**
 * Pure severity RGB + delta labels for revision impact PDF.
 * Labels mirror RevisionDeltaCard / rfiFromDelta catalogs.
 */

export const REVISION_IMPACT_SEV_ORDER = ["critical", "high", "medium", "low", "info"] as const;

export const REVISION_IMPACT_SEV_RGB: Record<string, readonly [number, number, number]> = {
  critical: [248, 81, 73],
  high: [240, 136, 62],
  medium: [210, 153, 34],
  low: [63, 185, 80],
  info: [139, 148, 158],
};

export const REVISION_IMPACT_DELTA_LABEL: Record<string, string> = {
  grid_shift: "Grid shift",
  connection_change: "Connection",
  dimension_change: "Dimension",
  detail_revised: "Detail",
  callout_added: "Callout +",
  callout_removed: "Callout -",
  material_change: "Material",
  elevation_change: "Elevation",
  sheet_added: "Sheet +",
  sheet_removed: "Sheet -",
  other: "Other",
};
