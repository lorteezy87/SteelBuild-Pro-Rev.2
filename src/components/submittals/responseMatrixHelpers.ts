/** Pure response tone/abbr maps for ResponseMatrix. */

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
