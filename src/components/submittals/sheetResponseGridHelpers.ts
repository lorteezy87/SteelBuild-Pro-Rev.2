/**
 * Pure initial rows for SheetResponseGrid.
 */

export function buildSheetResponseInitialRows<
  D extends {
    id?: string | null;
    sheet_number?: string | null;
    drawing_number?: string | null;
    title?: string | null;
    drawing_title?: string | null;
    discipline?: string | null;
  },
  R extends {
    id?: string | null;
    drawing_id?: string | null;
    response_status?: string | null;
    reviewer_comment?: string | null;
  },
>(drawings: D[] | null | undefined, existingResponses: R[] | null | undefined) {
  const existingMap = new Map<string, R>();
  for (const r of existingResponses || []) {
    if (r.drawing_id) existingMap.set(String(r.drawing_id), r);
  }

  return (drawings || []).map((d) => {
    const existing = d.id ? existingMap.get(String(d.id)) : undefined;
    return {
      id: existing?.id,
      drawing_id: d.id,
      sheet_number: d.sheet_number || d.drawing_number || "",
      title: d.title || d.drawing_title || "",
      discipline: d.discipline || "",
      response_status: existing?.response_status || "No Exception",
      reviewer_comment: existing?.reviewer_comment || "",
    };
  });
}
