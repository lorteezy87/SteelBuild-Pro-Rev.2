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
  Detailing:   "#C89B20",
  Fabrication: "#3B82F6",
  Delivery:    "#0D9488",
  Erection:    "#22C55E",
};

export const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete:      "var(--status-success)",
  "On Hold":     "var(--status-error)",
};

export const STATUS_COLUMNS = ["Not Started", "In Progress", "Complete", "On Hold"];

export const DRAWING_STAGES = [
  { id: "Not Started", label: "NOT STARTED", color: "var(--text-muted)"     },
  { id: "OFA",         label: "OFA",         color: "var(--status-info)"    },
  { id: "BFA",         label: "BFA",         color: "var(--status-warning)" },
  { id: "OFS",         label: "OFS",         color: "var(--secondary)"      },
  { id: "BFS",         label: "BFS",         color: "var(--secondary)"      },
  { id: "FFF",         label: "FFF",         color: "var(--tertiary)"       },
  { id: "Released",    label: "RELEASED",    color: "var(--status-success)" },
];

export const STAGE_STYLES = {
  "Not Started": { bg: "rgba(144,144,149,0.12)", color: "var(--text-muted)"     },
  OFA:           { bg: "rgba(0,229,255,0.12)",   color: "var(--status-info)"    },
  BFA:           { bg: "rgba(255,185,95,0.12)",  color: "var(--status-warning)" },
  OFS:           { bg: "rgba(68,226,205,0.12)",  color: "var(--secondary)"      },
  BFS:           { bg: "rgba(68,226,205,0.12)",  color: "var(--secondary)"      },
  FFF:           { bg: "rgba(255,185,95,0.15)",  color: "var(--tertiary)"       },
  Released:      { bg: "rgba(168,240,203,0.12)", color: "var(--status-success)" },
};

export const VIEW_OPTIONS = [
  { id: "list",     label: "List"     },
  { id: "board",    label: "Board"    },
  { id: "drawings", label: "Drawings" },
];

export const PHASES = ["Detailing", "Fabrication", "Delivery", "Erection"];
