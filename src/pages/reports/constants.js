/**
 * Style tokens and lookup maps for the Portfolio Reports page.
 * Grouped here so feature components can import directly without
 * pulling from the page shell.
 */

export const mono = { fontFamily: "var(--font-mono)" };
export const body = { fontFamily: "var(--font-body)" };

export const CARD = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  padding: "18px 20px",
  boxShadow: "var(--shadow-card)",
};

export const CARD_TITLE = {
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  marginBottom: 16,
};

export const LABEL = {
  ...mono,
  fontSize: 8,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

export const HEALTH_COLORS = {
  good:    "var(--status-success)",
  watch:   "var(--status-warning)",
  risk:    "var(--status-error)",
  neutral: "var(--text-muted)",
};

export const PHASE_COLORS = {
  Detailing:       "var(--phase-detailing)",
  Fabrication:     "var(--phase-fab)",
  Delivery:        "var(--phase-delivery)",
  Erection:        "var(--phase-erection)",
  Closeout:        "var(--phase-closeout)",
  Bidding:         "var(--status-info)",
  Preconstruction: "var(--accent)",
};

export const DATE_RANGES = [
  { key: "month",   label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "ytd",     label: "YTD" },
  { key: "all",     label: "All Time" },
];
