/** Pure empty form + style tokens for PunchlistFormModal. */

export const EMPTY_PUNCHLIST_FORM = {
  project_id: "",
  description: "",
  category: "Other",
  location: "",
  assigned_to: "",
  priority: "Medium",
  status: "Open",
  target_completion_date: "",
  percent_complete: "0",
  notes: "",
  photos: [] as unknown[],
  drawing_id: "",
  inspection_id: "",
};

export const PUNCHLIST_INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

export const PUNCHLIST_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};
