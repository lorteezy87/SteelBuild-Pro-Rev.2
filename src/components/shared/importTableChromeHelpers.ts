/**
 * Shared import-preview table header/cell chrome used across shipping,
 * drawing-log, model-element, and production import modals.
 */

export const IMPORT_TABLE_TH_STYLE: Record<string, string | number> = {
  textAlign: "left",
  padding: "8px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--divider)",
};

export const IMPORT_TABLE_TD_STYLE: Record<string, string | number> = {
  padding: "7px 10px",
  borderBottom: "1px solid var(--divider)",
  color: "var(--text-secondary)",
};
