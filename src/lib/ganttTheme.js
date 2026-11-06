export const GANTT_PHASE_HEX = {
  "Pre-Construction": "#7A848F",
  Detailing: "#2F5E9E",
  Procurement: "#9A6A12",
  Fabrication: "#A63C12",
  Delivery: "#1F7584",
  Erection: "#23744A",
  Installation: "#23744A",
  Closeout: "#5F6974",
};

export const GANTT_PHASE_VAR = {
  "Pre-Construction": "var(--sbd-gantt-preconstruction)",
  Detailing: "var(--sbd-gantt-detailing)",
  Procurement: "var(--sbd-gantt-procurement)",
  Fabrication: "var(--sbd-gantt-fabrication)",
  Delivery: "var(--sbd-gantt-delivery)",
  Erection: "var(--sbd-gantt-installation)",
  Installation: "var(--sbd-gantt-installation)",
  Closeout: "var(--sbd-gantt-closeout)",
};

export const GANTT_BG_VAR = "var(--sbd-gantt-bg)";
export const GANTT_PANEL_VAR = "var(--sbd-gantt-panel)";
export const GANTT_PANEL_STRONG_VAR = "var(--sbd-gantt-panel-strong)";
export const GANTT_HEADER_VAR = "var(--sbd-gantt-header)";
export const GANTT_LEFT_VAR = "var(--sbd-gantt-left)";
export const GANTT_ROW_VAR = "var(--sbd-gantt-row)";
export const GANTT_ROW_ALT_VAR = "var(--sbd-gantt-row-alt)";
export const GANTT_ROW_HOVER_VAR = "var(--sbd-gantt-row-hover)";
export const GANTT_GRID_VAR = "var(--sbd-gantt-grid)";
export const GANTT_GRID_STRONG_VAR = "var(--sbd-gantt-grid-strong)";
export const GANTT_WEEKEND_VAR = "var(--sbd-gantt-weekend)";
export const GANTT_TODAY_VAR = "var(--sbd-gantt-today)";
export const GANTT_TODAY_SOFT_VAR = "var(--sbd-gantt-today-soft)";
export const GANTT_BASELINE_VAR = GANTT_PHASE_VAR["Pre-Construction"];
export const GANTT_DEPENDENCY_VAR = GANTT_GRID_STRONG_VAR;

export const GANTT_STATUS_HEX = {
  complete: GANTT_PHASE_VAR.Delivery,
  inProgress: GANTT_PHASE_VAR.Detailing,
  delayed: "var(--status-error)",
  onHold: "var(--accent)",
  notStarted: GANTT_BASELINE_VAR,
};

export const GANTT_TODAY_HEX = GANTT_TODAY_VAR;

// Flat fills. The bars carry phase by hue alone; a gradient adds noise, not
// information. Kept as `linear-gradient(...)` strings so existing consumers
// that write them to `background` keep working.
const flat = (hex) => `linear-gradient(90deg, ${hex} 0%, ${hex} 100%)`;
export const GANTT_GRADIENT = {
  Detailing: flat(GANTT_PHASE_HEX.Detailing),
  Procurement: flat(GANTT_PHASE_HEX.Procurement),
  Fabrication: flat(GANTT_PHASE_HEX.Fabrication),
  Delivery: flat(GANTT_PHASE_HEX.Delivery),
  Erection: flat(GANTT_PHASE_HEX.Erection),
  Installation: flat(GANTT_PHASE_HEX.Installation),
  Closeout: flat(GANTT_PHASE_HEX.Closeout),
  default: flat(GANTT_PHASE_HEX["Pre-Construction"]),
};
