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

export const RESPONSE_OPTIONS = [
  "No Exception",
  "Approved as Noted",
  "Revise and Resubmit",
  "Rejected",
  "See Comments",
] as const;

export const RESPONSE_COLORS: Record<string, { color: string; bg: string }> = {
  "No Exception": { color: "var(--status-success)", bg: "var(--success-muted)" },
  "Approved as Noted": {
    color: "var(--status-success-bright)",
    bg: "color-mix(in srgb, var(--status-success-bright) 15%, transparent)",
  },
  "Revise and Resubmit": {
    color: "var(--status-review)",
    bg: "var(--status-review-muted)",
  },
  Rejected: { color: "var(--status-error)", bg: "var(--danger-muted)" },
  "See Comments": { color: "var(--status-info)", bg: "var(--info-muted)" },
};

export const thStyle: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  padding: "8px 10px",
  textAlign: "left",
  borderBottom: "1px solid var(--divider)",
  background: "var(--bg-surface-low)",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

export const tdStyle: Record<string, string | number> = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--divider)",
  verticalAlign: "middle",
};
