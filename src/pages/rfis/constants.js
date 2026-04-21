/**
 * Shared constants for the RFI Hub (palette, priority/status configs,
 * workflow column order, mono style object).
 *
 * Pulled out of RFIs.jsx so feature components can import them without
 * reaching back into the page shell.
 */

export const mono = { fontFamily: "var(--font-mono)" };

export const BIC_COLORS = {
  Contractor: { bg: "rgba(0,229,255,0.15)",   text: "var(--accent)" },
  GC:         { bg: "rgba(68,226,205,0.18)",  text: "var(--secondary)" },
  Engineer:   { bg: "rgba(255,185,95,0.15)",  text: "var(--status-warning)" },
  Architect:  { bg: "rgba(168,240,203,0.18)", text: "var(--status-success)" },
  Owner:      { bg: "rgba(255,180,171,0.18)", text: "var(--status-error)" },
};

export const PRIORITY_CFG = {
  Critical: { color: "var(--status-error)",   bg: "var(--danger-muted)"  },
  High:     { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  Medium:   { color: "var(--accent)",         bg: "var(--accent-muted)"  },
  Low:      { color: "var(--text-muted)",     bg: "var(--hover-bg)"      },
};

export const STATUS_CFG = {
  Open:            { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  "Under Review":  { color: "var(--status-info)",    bg: "var(--info-muted)"    },
  Answered:        { color: "var(--status-success)", bg: "var(--success-muted)" },
  Closed:          { color: "var(--text-muted)",     bg: "var(--hover-bg)"      },
};

export const statusColumns = ["Open", "Under Review", "Answered", "Closed"];

export const RFI_NUMBER_PATTERN = /^RFI #(\d+)$/i;

export const KPI_ACCENT_MAP = {
  "var(--status-success)": "rgba(34,197,94,0.10)",
  "var(--status-warning)": "rgba(245,158,11,0.10)",
  "var(--status-error)":   "rgba(239,68,68,0.10)",
  "var(--status-info)":    "rgba(96,165,250,0.10)",
  "var(--accent)":         "rgba(200,155,32,0.08)",
};

export const BIC_PARTIES = ["Contractor", "GC", "Engineer", "Architect", "Owner"];
export const PRIORITIES  = ["Critical", "High", "Medium", "Low"];
