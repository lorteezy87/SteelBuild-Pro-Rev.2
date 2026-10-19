/**
 * Shared constants for the Documents page — batch-set-status options
 * and the small `batchBtnStyle` helper used by the bulk action bar.
 */

export const BATCH_STATUS_OPTIONS = [
  "Draft", "Under Review", "Approved", "Approved with Comments",
  "Revise & Resubmit", "Rejected", "Issued", "Superseded", "Archived", "Void",
];

export function batchBtnStyle(bg, border, color) {
  return {
    padding: "5px 10px",
    background: bg,
    border: `1px solid ${border}`,
    color,
    borderRadius: 5,
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.04em",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };
}
