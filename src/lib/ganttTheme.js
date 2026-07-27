export const GANTT_PHASE_HEX = {
  "Pre-Construction": "#64748B",
  Detailing: "#2EA8FF",
  Procurement: "#F59E0B",
  Fabrication: "#D97706",
  Delivery: "#34D399",
  Erection: "#22D3EE",
  Installation: "#22D3EE",
  Closeout: "#64748B",
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

export const GANTT_GRADIENT = {
  Detailing: "linear-gradient(90deg, #2EA8FF 0%, #56B0FF 100%)",
  Procurement: "linear-gradient(90deg, #F59E0B 0%, #FBBF24 100%)",
  Fabrication: "linear-gradient(90deg, #D97706 0%, #F97316 100%)",
  Delivery: "linear-gradient(90deg, #34D399 0%, #10B981 100%)",
  Erection: "linear-gradient(90deg, #22D3EE 0%, #06B6D4 100%)",
  Installation: "linear-gradient(90deg, #22D3EE 0%, #06B6D4 100%)",
  Closeout: "linear-gradient(90deg, #64748B 0%, #475569 100%)",
  default: "linear-gradient(90deg, #64748B 0%, #334155 100%)",
};
