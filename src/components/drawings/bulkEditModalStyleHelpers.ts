/**
 * Pure form chrome for drawings BulkEditModal.
 */

export const labelStyle: Record<string, string | number> = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  marginBottom: 4,
};

export const BULK_EDIT_INITIAL = {
  revision_number: "",
  submitted_date: "",
  due_date: "",
  return_date: "",
  reviewer: "",
  discipline: "",
  stage: "",
  spec_section: "",
  priority_flag: false,
  notes: "",
};

/** Merge PhoenixModal inputStyle with select cursor. */
export function bulkEditSelectStyle(
  inputStyle: Record<string, unknown>,
): Record<string, unknown> {
  return { ...inputStyle, cursor: "pointer" };
}
