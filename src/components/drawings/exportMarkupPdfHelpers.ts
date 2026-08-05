
/** Pure sheet scope selection for ExportMarkupPDFModal. */

export type DrawingSheet = {
  id?: string;
  drawing_set_name?: string | null;
  [key: string]: unknown;
};

export function selectExportSheets(
  scope: string,
  activeDrawing: DrawingSheet | null | undefined,
  drawings: DrawingSheet[] | null | undefined,
): DrawingSheet[] {
  if (!activeDrawing) return [];
  if (scope === "drawing") return [activeDrawing];
  const setName = activeDrawing.drawing_set_name;
  if (!setName) return [activeDrawing];
  return (drawings || []).filter((d) => d.drawing_set_name === setName);
}

export const MARKUP_PDF_MONO = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
} as const;

export const MARKUP_PDF_LABEL_STYLE = {
  ...MARKUP_PDF_MONO,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.15em",
  color: "var(--text-muted)",
  display: "block" as const,
  marginBottom: 6,
};

export const MARKUP_PDF_BTN_BASE = {
  ...MARKUP_PDF_MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  padding: "8px 16px",
  borderRadius: 2,
  border: "1px solid var(--border-default)",
  cursor: "pointer" as const,
  textTransform: "uppercase" as const,
};

