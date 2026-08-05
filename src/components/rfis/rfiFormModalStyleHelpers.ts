/**
 * Pure style objects for RFIFormModal chrome (inputs, dark selects, attachments).
 */

export const iStyle: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

export const labelStyle: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

export const darkSelectButtonStyle: Record<string, string | number> = {
  ...iStyle,
  minHeight: 37,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textAlign: "left",
  cursor: "pointer",
  background: "var(--bg-input)",
  borderRadius: 8,
};

export const darkSelectMenuStyle: Record<string, string | number> = {
  position: "absolute",
  zIndex: 4000,
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  maxHeight: 220,
  overflowY: "auto",
  padding: 4,
  background: "var(--bg-surface-secondary)",
  border: "1px solid color-mix(in srgb, var(--accent) 32%, var(--border-default))",
  borderRadius: 10,
  boxShadow:
    "0 18px 46px color-mix(in srgb, var(--bg-base) 74%, transparent), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 6%, transparent)",
};

export function darkSelectOptionStyle(
  active: boolean,
): Record<string, string | number> {
  return {
    width: "100%",
    border: "1px solid transparent",
    borderRadius: 7,
    background: active ? "var(--accent-muted)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-primary)",
    padding: "8px 10px",
    textAlign: "left",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontWeight: active ? 800 : 600,
    cursor: "pointer",
  };
}

export const attachmentDropStyle: Record<string, string | number> = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  padding: 14,
  border: "1px dashed color-mix(in srgb, var(--accent) 45%, var(--border-default))",
  borderRadius: 12,
  background: "linear-gradient(135deg, var(--info-muted), var(--bg-surface-low))",
};

export const uploadButtonStyle: Record<string, string | number> = {
  border: "1px solid var(--accent-border)",
  borderRadius: 8,
  background: "var(--accent-muted)",
  color: "var(--accent)",
  padding: "8px 13px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const attachmentRowStyle: Record<string, string | number> = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
  padding: "9px 10px",
  border: "1px solid var(--border-default)",
  borderRadius: 9,
  background: "var(--hover-bg)",
};

export const attachmentActionStyle: Record<string, string | number> = {
  border: "1px solid var(--border-default)",
  borderRadius: 7,
  background: "var(--bg-hover)",
  color: "var(--accent)",
  padding: "5px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textDecoration: "none",
  cursor: "pointer",
};

/** Quick-status pill chrome for RFIFormModal. */
export function rfiStatusBtnStyle(
  status: string,
  activeStatus: string | null | undefined,
): Record<string, string | number> {
  const active = formStatusMatch(status, activeStatus);
  return {
    background: active ? "var(--accent)" : "var(--bg-surface)",
    color: active ? "var(--on-accent)" : "var(--text-muted)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
    borderRadius: 6,
    padding: "4px 10px",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.15s",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };
}

function formStatusMatch(status: string, activeStatus: string | null | undefined): boolean {
  return activeStatus === status;
}
