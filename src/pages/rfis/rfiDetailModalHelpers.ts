/** Pure stage catalogs for RfiDetailModal. */

export const RFI_STAGE_INDEX: Record<string, number> = {
  Open: 0,
  "Under Review": 1,
  "Incomplete Response": 2,
  Answered: 3,
  Closed: 4,
};

export const RFI_DETAIL_STAGES = [
  { id: "open", label: "OPEN", color: "var(--status-warning)" },
  { id: "rev", label: "REVIEW", color: "var(--status-review)" },
  { id: "incmp", label: "INCOMPLETE", color: "var(--status-error)" },
  { id: "ans", label: "ANSWERED", color: "var(--status-success)" },
  { id: "cls", label: "CLOSED", color: "var(--text-muted)" },
] as const;
