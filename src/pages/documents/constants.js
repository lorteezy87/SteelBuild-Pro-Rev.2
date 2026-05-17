/**
 * Shared constants for the Documents page — status tabs, sort
 * options, batch-set-status options, and the small `batchBtnStyle`
 * helper used by the bulk action bar.
 */

export const STATUS_TABS = [
  { key: "all",                label: "All" },
  { key: "Approved",           label: "Approved" },
  { key: "Under Review",       label: "Under Review" },
  { key: "Approved as Noted",  label: "As Noted" },
  { key: "Revise & Resubmit",  label: "Revise & Resubmit" },
  { key: "Rejected",           label: "Rejected" },
];

export const SORT_OPTIONS = [
  { key: "name-asc",   label: "Name A-Z",       fn: (a, b) => (a.displayName || "").localeCompare(b.displayName || "") },
  { key: "name-desc",  label: "Name Z-A",       fn: (a, b) => (b.displayName || "").localeCompare(a.displayName || "") },
  { key: "date-desc",  label: "Newest First",   fn: (a, b) => new Date(b.uploadedDate || b.created_at || 0) - new Date(a.uploadedDate || a.created_at || 0) },
  { key: "date-asc",   label: "Oldest First",   fn: (a, b) => new Date(a.uploadedDate || a.created_at || 0) - new Date(b.uploadedDate || b.created_at || 0) },
  { key: "status",     label: "Status",         fn: (a, b) => (a.status || "").localeCompare(b.status || "") },
  { key: "size-desc",  label: "Largest First",  fn: (a, b) => (Number(b.fileSizeKb) || 0) - (Number(a.fileSizeKb) || 0) },
  { key: "size-asc",   label: "Smallest First", fn: (a, b) => (Number(a.fileSizeKb) || 0) - (Number(b.fileSizeKb) || 0) },
  { key: "doc-num",    label: "Document #",     fn: (a, b) => (a.documentNumber || "").localeCompare(b.documentNumber || "", undefined, { numeric: true }) },
];

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
