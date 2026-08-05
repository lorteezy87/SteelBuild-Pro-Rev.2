/**
 * Pure file-type hint catalog for documents EmptyState (icons stay local).
 */

export const EMPTY_STATE_FILE_HINTS = [
  { key: "pdf", label: "PDF", color: "var(--status-error)" },
  { key: "dwg", label: "DWG", color: "var(--status-info)" },
  { key: "ifc", label: "IFC", color: "var(--accent)" },
  { key: "img", label: "IMG", color: "var(--accent)" },
  { key: "zip", label: "ZIP", color: "var(--status-warning)" },
] as const;
