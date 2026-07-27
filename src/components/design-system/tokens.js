/**
 * Design-system runtime token maps.
 *
 * These mirror the CSS custom properties in `src/styles/tokens.css` for
 * cases where JS needs the token value at runtime (rgba math, inline
 * conditional styles, chart fills). All normal styling should consume
 * the CSS variables directly.
 *
 * Keep this file in sync with `tokens.css` when values change.
 */

/** Phase colors — CSS-variable aliases used for most styling. */
export const PHASE_COLOR = {
  Detailing:   "var(--phase-detailing)",
  Fabrication: "var(--phase-fab)",
  Delivery:    "var(--phase-delivery)",
  Erection:    "var(--phase-erection)",
};

/**
 * Raw hex values — only for `rgba()` glow / shadow math at runtime.
 * Keep synchronized with the dark-theme block of `tokens.css`.
 */
export const PHASE_HEX = {
  Detailing:   "#2EA8FF",
  Fabrication: "#D97706",
  Delivery:    "#34D399",
  Erection:    "#22D3EE",
};

/**
 * Semantic status color map — covers every status value across RFIs,
 * WPs, Drawings, Deliveries, Change Orders, Expenses.
 */
export const STATUS_COLOR = {
  // Work package + generic
  "Not Started":         "var(--text-muted)",
  "In Progress":         "var(--status-warning)",
  Complete:              "var(--status-success)",
  "On Hold":             "var(--status-error)",

  // RFI lifecycle
  Open:                  "var(--status-warning)",
  "Under Review":        "var(--status-review)",
  "Revise & Resubmit":   "var(--status-review)",
  "Pending Approval":    "var(--status-review)",
  Answered:              "var(--status-success)",
  Closed:                "var(--text-muted)",

  // Delivery lifecycle
  Scheduled:             "var(--status-info)",
  Loading:               "var(--status-warning)",
  "In Transit":          "var(--phase-delivery)",
  Delivered:             "var(--status-success)",
  Partial:               "var(--status-review)",
  Rejected:              "var(--status-error)",

  // Generic alert
  Overdue:               "var(--status-error)",
  Critical:              "#FF6B35",
};

/**
 * Ball-in-Court colors.
 *
 * contrast-check: semantic identity hues only; consumers render them on
 * tokenized surfaces, not as chrome colors. // semantic stage — allowlisted
 */
export const BIC_COLOR = {
  Contractor: "#C89B20",
  GC:         "#3B82F6",
  Engineer:   "#14B8A6",
  Architect:  "#0EA5A4",
  Owner:      "#22C55E",
};

/**
 * Drawing-stage ordering + per-stage tint. Corrected 7-stage flow
 * (migration 077): Not Started → IFA → OFA → BFA → OFS → IFC → Released.
 *
 * contrast-check: semantic workflow hues only; keep centralized here so color
 * audits can allowlist this one map. // semantic stage — allowlisted
 */
export const DRAWING_STAGES = [
  { id: "Not Started", key: "Not Started", label: "NOT STARTED", color: "var(--text-muted)", bg: "rgba(100,116,139,0.16)" },
  { id: "IFA",         key: "IFA",         label: "IFA",         color: "#60A5FA", bg: "rgba(96,165,250,0.16)"  }, // sky
  { id: "OFA",         key: "OFA",         label: "OFA",         color: "#2563EB", bg: "rgba(37,99,235,0.18)"   }, // blue
  { id: "BFA",         key: "BFA",         label: "BFA",         color: "#FBBF24", bg: "rgba(251,191,36,0.16)"  }, // amber
  { id: "OFS",         key: "OFS",         label: "OFS — Out for Scrub", color: "#F97316", bg: "rgba(249,115,22,0.18)"  }, // orange
  { id: "IFC",         key: "IFC",         label: "IFC",         color: "#34D399", bg: "rgba(52,211,153,0.16)"  }, // mint
  { id: "Released",    key: "Released",    label: "RELEASED",    color: "#10B981", bg: "rgba(16,185,129,0.18)"  }, // emerald
];

/** Derived workflow-only stage; never written to `drawings.stage`. */
export const DRAWING_RR_STAGE = {
  id: "R&R",
  key: "R&R",
  label: "R&R",
  color: "#F59E0B",
  bg: "rgba(245,158,11,0.16)",
};

/** Small utility: convert #RRGGBB → rgb triplet. */
export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 200, g: 155, b: 32 };
}
