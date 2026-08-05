/** Pure empty form for ContactFormModal. */

export const INITIAL_CONTACT_FORM = {
  first_name: "",
  last_name: "",
  company: "",
  role: "",
  contact_type: "GC",
  email: "",
  phone: "",
  notes: "",
} as const;

export const CONTACT_INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

export const CONTACT_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};
