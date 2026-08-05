/**
 * Shared pure chrome for full-page auth forms (MFA, update password).
 */

export const AUTH_FORM_WRAP_STYLE: Record<string, string | number> = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "var(--bg-page)",
};

export function authFormCardStyle(maxWidth = 400): Record<string, string | number> {
  return {
    width: "100%",
    maxWidth,
    padding: 32,
    borderRadius: 18,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    boxShadow: "var(--shadow-lg)",
  };
}

export function authFormTitleStyle(fontSize = 22): Record<string, string | number> {
  return {
    color: "var(--text-primary)",
    margin: "0 0 6px",
    fontSize,
    fontWeight: 800,
    letterSpacing: "-.02em",
  };
}

export const AUTH_FORM_BODY_STYLE: Record<string, string | number> = {
  color: "var(--text-muted)",
  margin: 0,
  fontSize: 14,
  lineHeight: 1.5,
};

export const AUTH_FORM_LABEL_STYLE: Record<string, string | number> = {
  display: "block",
  marginBottom: 6,
  color: "var(--text-secondary)",
  fontSize: 13,
  fontWeight: 600,
};

export const AUTH_FORM_INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
};

export const AUTH_FORM_ERROR_BOX_STYLE: Record<string, string | number> = {
  padding: "10px 13px",
  background: "var(--danger-muted)",
  border: "1px solid var(--danger-border)",
  borderRadius: 10,
  color: "var(--status-error)",
  fontSize: 13,
};

export const AUTH_FORM_PRIMARY_BTN_STYLE: Record<string, string | number> = {
  width: "100%",
  padding: "11px 16px",
  borderRadius: 10,
  border: 0,
  background: "var(--accent)",
  color: "var(--on-accent)",
  fontWeight: 800,
  fontSize: 15,
};

export const AUTH_FORM_GHOST_BTN_STYLE: Record<string, string | number> = {
  width: "100%",
  padding: "9px 16px",
  borderRadius: 10,
  border: "1px solid var(--border-default)",
  background: "transparent",
  color: "var(--text-muted)",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};
