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
  Detailing:   "#C89B20",
  Fabrication: "#3B82F6",
  Delivery:    "#14B8A6",
  Erection:    "#22C55E",
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

/** Ball-in-Court colors. */
export const BIC_COLOR = {
  Contractor: "#C89B20",
  GC:         "#3B82F6",
  Engineer:   "#14B8A6",
  Architect:  "#0EA5A4",
  Owner:      "#22C55E",
};

/** Drawing-stage ordering + per-stage tint. */
export const DRAWING_STAGES = [
  { id: "Not Started", label: "NOT STARTED", color: "var(--text-muted)"     },
  { id: "OFA",         label: "OFA",         color: "#58A6FF"               },
  { id: "BFA",         label: "BFA",         color: "#3B82F6"               },
  { id: "OFS",         label: "OFS",         color: "#E3B341"               },
  { id: "BFS",         label: "BFS",         color: "#FF8C42"               },
  { id: "FFF",         label: "FFF",         color: "#22C55E"               },
  { id: "Released",    label: "RELEASED",    color: "var(--status-success)" },
];

/** Small utility: convert #RRGGBB → rgb triplet. */
export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 200, g: 155, b: 32 };
}
