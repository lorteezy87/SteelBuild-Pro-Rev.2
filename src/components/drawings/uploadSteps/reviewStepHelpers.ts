/**
 * Pure meta-field chrome styles for drawings upload ReviewStep.
 */

export const REVIEW_META_FIELD_STYLE: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--bg-surface-high)",
  borderRadius: 6,
  padding: "5px 8px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  boxSizing: "border-box",
};

export const REVIEW_META_LABEL_STYLE: Record<string, string | number> = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  letterSpacing: "0.12em",
  color: "var(--text-muted)",
  marginBottom: 3,
  textTransform: "uppercase",
};
