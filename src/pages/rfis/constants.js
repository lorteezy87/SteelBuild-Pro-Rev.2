/**
 * Shared constants for the RFI Hub (palette, priority/status configs,
 * workflow column order, mono style object).
 *
 * Pulled out of RFIs.jsx so feature components can import them without
 * reaching back into the page shell.
 */

export const mono = { fontFamily: "var(--font-mono)" };

export const BIC_COLORS = {
  Contractor: { bg: "var(--info-muted)",   text: "var(--accent)" },
  GC:         { bg: "var(--accent-muted)",  text: "var(--secondary)" },
  Engineer:   { bg: "var(--warning-muted)",  text: "var(--status-warning)" },
  Architect:  { bg: "var(--success-muted)", text: "var(--status-success)" },
  Owner:      { bg: "var(--danger-muted)", text: "var(--status-error)" },
};

export const PRIORITY_CFG = {
  Critical: { color: "var(--status-error)",   bg: "var(--danger-muted)"  },
  High:     { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  Medium:   { color: "var(--accent)",         bg: "var(--accent-muted)"  },
  Low:      { color: "var(--text-muted)",     bg: "var(--hover-bg)"      },
};

export const STATUS_CFG = {
  Open:                  { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  "Under Review":        { color: "var(--status-info)",    bg: "var(--info-muted)"    },
  // "Incomplete Response" — GC replied but the response doesn't fully address
  // the question; another round is required. Treated as still-open (not in
  // ["Answered","Closed"]). Uses the danger palette to flag "needs another
  // round" without overlapping the in-progress amber of Open.
  "Incomplete Response": { color: "var(--status-error)",   bg: "var(--danger-muted)"  },
  Answered:              { color: "var(--status-success)", bg: "var(--success-muted)" },
  Closed:                { color: "var(--text-muted)",     bg: "var(--hover-bg)"      },
};

export const statusColumns = ["Open", "Under Review", "Incomplete Response", "Answered", "Closed"];

// RFI numbers arrive from several paths: app-created values use "RFI 001",
// older imports may store "001", and vendor logs often use "RFI-001".
// Sorting should treat all of those as the same numeric sequence.
export const RFI_NUMBER_PATTERN = /(\d+)/;

export const KPI_ACCENT_MAP = {
  "var(--status-success)": "var(--success-muted)",
  "var(--status-warning)": "var(--warning-muted)",
  "var(--status-error)":   "var(--danger-muted)",
  "var(--status-info)":    "var(--info-muted)",
  "var(--accent)":         "var(--accent-muted)",
};

export const BIC_PARTIES = ["Contractor", "GC", "Engineer", "Architect", "Owner"];
export const PRIORITIES  = ["Critical", "High", "Medium", "Low"];

// Discipline filter chips used by the canonical RFI control center.
export const DISCIPLINES = ["All", "Structural", "Connections", "Misc Metals", "Anchor Bolts"];

// Density presets persist in localStorage. "Compact" tightens the row
// height + drops the submitter sub-line; "Comfortable" gives the row
// 50px of breathing room. Density mutates the CSS variable that
// RfiRow reads for its row height.
export const DENSITY_LS_KEY = "sbp-rfi-density";
export const DENSITY_PRESETS = {
  compact:     { rowHeight: 56, label: "COMPACT" },
  normal:      { rowHeight: 72, label: "NORMAL" },
  comfortable: { rowHeight: 88, label: "COMFORTABLE" },
};

export const INSIGHTS_LS_KEY = "sbp-rfi-insights-collapsed";
