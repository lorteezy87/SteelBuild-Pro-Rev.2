/**
 * Pure chrome styles for SheetFormModal.
 */
import { mono } from "./drawingsConfig";

export const SHEET_FORM_LABEL_STYLE: Record<string, string | number> = {
  ...mono,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 5,
};

export const SHEET_FORM_INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-page)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  boxSizing: "border-box",
};

export const SHEET_FORM_SELECT_STYLE: Record<string, string | number> = {
  ...SHEET_FORM_INPUT_STYLE,
};
