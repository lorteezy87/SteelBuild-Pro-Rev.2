/**
 * Shared constants for the Work Packages page — lifecycle stages,
 * phase/status colors, drawing pipeline stages, view options.
 *
 * `PHASE_HEX` holds raw hex values (no CSS var indirection) so we can
 * build rgba() shadows/glows at runtime; `PHASE_COLORS` holds the
 * token-driven versions used for all normal styling.
 */

export const LIFECYCLE_STAGES = [
  { key: "Detailing",   label: "DETAIL", color: "var(--phase-detailing)" },
  { key: "Fabrication", label: "FAB",    color: "var(--phase-fab)"       },
  { key: "Delivery",    label: "SHIP",   color: "var(--phase-delivery)"  },
  { key: "Erection",    label: "ERECT",  color: "var(--phase-erection)"  },
];

export const PHASE_COLORS = {
  Detailing:   "var(--phase-detailing)",
  Fabrication: "var(--phase-fab)",
  Delivery:    "var(--phase-delivery)",
  Erection:    "var(--phase-erection)",
};

/** Raw hex values — only for building rgba() shadows/glows at runtime. */
export const PHASE_HEX = {
  Detailing:   "#2EA8FF",
  Fabrication: "#D97706",
  Delivery:    "#34D399",
  Erection:    "#22D3EE",
};

export const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete:      "var(--status-success)",
  "On Hold":     "var(--status-error)",
};

export const STATUS_COLUMNS = ["Not Started", "In Progress", "Complete", "On Hold"];

// Corrected 7-stage flow (migration 077): Not Started → IFA → OFA →
// BFA → OFS → IFC → Released.
export const DRAWING_STAGES = [
  { id: "Not Started", label: "NOT STARTED", color: "var(--text-muted)"     },
  { id: "IFA",         label: "IFA",         color: "var(--status-info)"    },
  { id: "OFA",         label: "OFA",         color: "var(--status-info)"    },
  { id: "BFA",         label: "BFA",         color: "var(--status-warning)" },
  { id: "OFS",         label: "OFS",         color: "var(--secondary)"      },
  { id: "IFC",         label: "IFC",         color: "var(--status-success)" },
  { id: "Released",    label: "RELEASED",    color: "var(--status-success)" },
];

export const STAGE_STYLES = {
  "Not Started": { bg: "rgba(144,144,149,0.12)", color: "var(--text-muted)"     },
  IFA:           { bg: "rgba(96,165,250,0.12)",  color: "var(--status-info)"    },
  OFA:           { bg: "rgba(0,229,255,0.12)",   color: "var(--status-info)"    },
  BFA:           { bg: "rgba(255,185,95,0.12)",  color: "var(--status-warning)" },
  OFS:           { bg: "rgba(68,226,205,0.12)",  color: "var(--secondary)"      },
  IFC:           { bg: "rgba(52,211,153,0.15)",  color: "var(--status-success)" },
  Released:      { bg: "rgba(168,240,203,0.12)", color: "var(--status-success)" },
};

export const VIEW_OPTIONS = [
  { id: "list",     label: "List"     },
  { id: "board",    label: "Board"    },
  { id: "drawings", label: "Drawings" },
];

export const PHASES = ["Detailing", "Fabrication", "Delivery", "Erection"];
