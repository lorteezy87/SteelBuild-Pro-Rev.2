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
  Fabrication: "#B8741A",
  Delivery:    "#4DB384",
  Erection:    "#4FA9BA",
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
  Contractor:    "var(--accent)",
  Subcontractor: "var(--status-info)",
  Detailer:      "var(--secondary)",
  GC:            "var(--status-info)",
  EOR:           "var(--status-warning)",
  AOR:           "var(--status-review)",
  Architect:     "var(--status-success)",
  Owner:         "var(--status-error)",
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
  { id: "IFA",         key: "IFA",         label: "IFA",         color: "#6F9AD6", bg: "rgba(96,165,250,0.16)"  }, // sky
  { id: "OFA",         key: "OFA",         label: "OFA",         color: "#2563EB", bg: "rgba(37,99,235,0.18)"   }, // blue
  { id: "BFA",         key: "BFA",         label: "BFA",         color: "#E4B04A", bg: "rgba(228,176,74,0.16)"  }, // amber
  { id: "OFS",         key: "OFS",         label: "OFS — Out for Scrub", color: "#CC4E17", bg: "rgba(204,78,23,0.18)"  }, // orange
  { id: "IFC",         key: "IFC",         label: "IFC",         color: "#4DB384", bg: "rgba(52,211,153,0.16)"  }, // mint
  { id: "Released",    key: "Released",    label: "RELEASED",    color: "#2F8F6A", bg: "rgba(47,143,106,0.18)"  }, // emerald
];

/** Derived workflow-only stage; never written to `drawings.stage`. */
export const DRAWING_RR_STAGE = {
  id: "R&R",
  key: "R&R",
  label: "R&R",
  color: "#D99A2B",
  bg: "rgba(217,154,43,0.16)",
};

/** Small utility: convert #RRGGBB → rgb triplet. */
export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 200, g: 155, b: 32 };
}
