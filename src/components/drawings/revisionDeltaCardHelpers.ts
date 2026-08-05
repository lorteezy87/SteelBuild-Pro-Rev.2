/** Pure severity/delta labels for RevisionDeltaCard. */

export const SEV_COLOR: Record<string, string> = {
  critical: "#F85149",
  high: "#F0883E",
  medium: "#D29922",
  low: "#3FB950",
  info: "#8B949E",
};

export const DELTA_LABEL: Record<string, string> = {
  grid_shift: "Grid shift",
  connection_change: "Connection",
  dimension_change: "Dimension",
  detail_revised: "Detail",
  callout_added: "Callout +",
  callout_removed: "Callout −",
  material_change: "Material",
  elevation_change: "Elevation",
  sheet_added: "Sheet +",
  sheet_removed: "Sheet −",
  other: "Other",
};

export const REVISION_DELTA_MONO = "var(--font-mono)";
