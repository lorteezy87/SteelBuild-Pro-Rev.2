/**
 * Shared constants for the Expenses page.
 */

export const EXPENSE_TYPES    = ["Labor", "Materials", "Equipment", "Subcontractor", "Misc.", "Overhead"];
export const PAYMENT_STATUSES = ["Unpaid", "Paid", "Pending Approval", "Disputed", "Voided"];

export const PAYMENT_STATUS_COLOR = {
  Unpaid:             "var(--status-warning)",
  Paid:               "var(--status-success)",
  "Pending Approval": "var(--status-warning)",
  Disputed:           "var(--status-error)",
  Voided:             "var(--text-muted)",
};

/** Sticky table-header cell style — shared between the main table and any sub-tables. */
export const thStyle = {
  padding: "10px 14px",
  textAlign: "left",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  letterSpacing: "0.12em",
  color: "var(--text-muted)",
  fontWeight: 700,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--divider)",
  background: "var(--bg-sidebar)",
  position: "sticky",
  top: 0,
  zIndex: 10,
};
