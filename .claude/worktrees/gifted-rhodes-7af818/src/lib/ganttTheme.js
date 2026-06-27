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

export const GANTT_STATUS_HEX = {
  complete: "#34D399",
  inProgress: "#2EA8FF",
  delayed: "#EF4444",
  onHold: "#DDB7FF",
  notStarted: "#64748B",
};

export const GANTT_TODAY_HEX = "#FF6B00";

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
