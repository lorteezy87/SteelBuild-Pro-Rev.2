/** Pure response tone/abbr maps + chrome for ResponseMatrix. */

export const RESPONSE_COLORS: Record<string, { color: string; bg: string }> = {
  "No Exception": { color: "var(--status-success)", bg: "var(--success-muted)" },
  "Approved as Noted": {
    color: "var(--status-success-bright)",
    bg: "color-mix(in srgb, var(--status-success-bright) 15%, transparent)",
  },
  "Revise and Resubmit": {
    color: "var(--status-review)",
    bg: "var(--status-review-muted)",
  },
  Rejected: { color: "var(--status-error)", bg: "var(--danger-muted)" },
  "See Comments": { color: "var(--status-info)", bg: "var(--info-muted)" },
};

export const RESPONSE_ABBR: Record<string, string> = {
  "No Exception": "NE",
  "Approved as Noted": "AAN",
  "Revise and Resubmit": "R&R",
  Rejected: "REJ",
  "See Comments": "SC",
};

export const DEFAULT_RESPONSE_COLOR = {
  color: "var(--text-muted)",
  bg: "var(--bg-surface-low)",
};

export const RESPONSE_MATRIX_EMPTY_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--text-muted)",
  fontStyle: "italic",
  padding: "6px 0",
};

export const RESPONSE_MATRIX_TH_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8.5,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "6px 8px",
  borderBottom: "1px solid var(--divider)",
  background: "var(--bg-surface-low)",
  whiteSpace: "nowrap",
};

export const RESPONSE_MATRIX_TD_STYLE: Record<string, string | number> = {
  padding: "5px 8px",
  borderBottom: "1px solid var(--divider)",
  verticalAlign: "middle",
};

export const RESPONSE_MATRIX_WRAP_STYLE: Record<string, string | number> = {
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  overflow: "auto",
  maxHeight: 320,
};

export const RESPONSE_MATRIX_TABLE_STYLE: Record<string, string | number> = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "var(--font-body)",
  fontSize: 11,
};
