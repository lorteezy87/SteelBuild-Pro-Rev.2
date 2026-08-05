
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
