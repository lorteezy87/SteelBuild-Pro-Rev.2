/**
 * Pure table cell styles for ContractManagementUi.
 */

export const thStyle: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "1px solid var(--divider)",
  whiteSpace: "nowrap",
};

export const tdStyle: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-primary)",
  padding: "10px 12px",
  borderBottom: "1px solid var(--divider)",
  whiteSpace: "nowrap",
};

export const tdBodyStyle: Record<string, string | number> = {
  ...tdStyle,
  fontFamily: "var(--font-body)",
  whiteSpace: "normal",
  maxWidth: 260,
};

export const tdRightStyle: Record<string, string | number> = {
  ...tdStyle,
  textAlign: "right",
};

export const totalsStyle: Record<string, string | number> = {
  ...tdStyle,
  fontWeight: 800,
  borderTop: "2px solid var(--accent)",
  borderBottom: "none",
};

export const CO_STATUS_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  Draft: {
    bg: "rgba(128,128,128,0.15)",
    border: "rgba(128,128,128,0.3)",
    text: "var(--text-muted)",
  },
  Submitted: {
    bg: "rgba(59,130,246,0.12)",
    border: "rgba(59,130,246,0.3)",
    text: "var(--status-info)",
  },
  "Under Review": {
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.3)",
    text: "var(--status-warning)",
  },
  Approved: {
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.3)",
    text: "var(--status-success)",
  },
  Rejected: {
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.3)",
    text: "var(--status-error)",
  },
  Certified: {
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.3)",
    text: "var(--status-success)",
  },
  Paid: {
    bg: "rgba(59,130,246,0.12)",
    border: "rgba(59,130,246,0.3)",
    text: "var(--status-info)",
  },
};
