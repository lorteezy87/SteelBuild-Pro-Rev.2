/**
 * Shared inline-style tokens for the Drawing Analysis module.
 *
 * All colors flow through CSS custom properties so themes can swap them.
 * Safety Orange is used for critical/high severity and destructive
 * actions. Electric Cyan is the AI-layer accent — borders, icons, and
 * headings that mark AI-generated content.
 */

export const mono     = { fontFamily: "var(--font-mono)" };
export const display  = { fontFamily: "'Space Grotesk', var(--font-display)" };

export const AI_ACCENT       = "var(--ai-accent, #22D3EE)";        // Electric Cyan
export const CRITICAL_ACCENT = "var(--safety-orange, #F97316)";    // Safety Orange

export const SEVERITY_COLORS = {
  critical: "var(--safety-orange, #F97316)",
  high:     "var(--safety-orange, #F97316)",
  medium:   "var(--status-warning, #EAB308)",
  low:      "var(--status-info, #38BDF8)",
  info:     "var(--text-muted, #64748B)",
};

export const STATUS_COLORS = {
  pending:    "var(--text-muted)",
  processing: AI_ACCENT,
  complete:   "var(--status-success)",
  error:      "var(--status-error)",
};

// Aligned with the STAGES palette in drawingsConfig.js so badges in
// the analysis card match the rest of the Drawings UI. Each stage
// gets a distinct hue (no two collapse to the same colour the way
// the previous AI_ACCENT-spammed map did).
export const STAGE_ACCENT = {
  "Not Started": "#64748B", // slate
  IFA:           "#60A5FA", // sky
  OFA:           "#2563EB", // blue
  BFA:           "#F97316", // orange
  OFS:           "#0D9488", // teal
  IFC:           "#34D399", // mint
  Released:      "#10B981", // emerald
  // Auxiliary states still seen in some legacy analysis rows:
  Shop:          "var(--accent)",
  Revision:      "#F97316",
};

export const surface = {
  background:   "var(--bg-surface)",
  border:       "1px solid var(--border-default)",
  borderRadius: 4,
};

export const pill = (color) => ({
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color,
  padding: "2px 8px",
  border: `1px solid ${color}`,
  borderRadius: 2,
  background: "transparent",
  display: "inline-block",
});

export const FINDING_TYPE_LABEL = {
  missing_info:          "MISSING INFO",
  coordination_conflict: "COORD. CONFLICT",
  callout_issue:         "CALLOUT",
  revision_delta:        "REVISION",
  dimension_concern:     "DIMENSION",
  aess_concern:          "AESS",
};

export const DELTA_TYPE_LABEL = {
  sheet_added:       "SHEET ADDED",
  sheet_removed:     "SHEET REMOVED",
  grid_shift:        "GRID SHIFT",
  connection_change: "CONNECTION",
  dimension_change:  "DIMENSION",
  detail_revised:    "DETAIL REV.",
  callout_added:     "CALLOUT +",
  callout_removed:   "CALLOUT \u2212",
  material_change:   "MATERIAL",
  elevation_change:  "ELEVATION",
  other:             "OTHER",
};
