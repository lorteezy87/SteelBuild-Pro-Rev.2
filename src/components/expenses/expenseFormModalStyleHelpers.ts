/**
 * Pure form chrome styles for ExpenseFormModal.
 */

export const iStyle: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "7px 11px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s",
};

export const labelStyle: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  letterSpacing: "0.14em",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  marginBottom: 5,
  display: "block",
};

export const sectionLabel: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.16em",
  color: "var(--accent)",
  textTransform: "uppercase",
  marginBottom: 12,
  paddingBottom: 6,
  borderBottom: "1px solid var(--divider)",
};

export const triggerStyle: Record<string, string | number> = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  color: "var(--text-primary)",
  height: 34,
};

export const EXPENSE_TYPES = [
  "Labor",
  "Materials",
  "Equipment",
  "Subcontractor",
  "Misc.",
  "Overhead",
] as const;

export const PAYMENT_STATUSES = [
  "Unpaid",
  "Paid",
  "Pending Approval",
  "Disputed",
  "Voided",
] as const;

export const UNITS = ["LS", "HR", "EA", "TON", "LF", "SF", "Day"] as const;

/** Module-load empty form; expense_date freezes to load-day like the original. */
export const EMPTY_EXPENSE_FORM = {
  project_id: "",
  project_name: "",
  description: "",
  expense_type: "Materials",
  cost_code: "",
  cost_code_name: "",
  amount: 0,
  quantity: 1,
  unit_cost: 0,
  unit: "EA",
  vendor: "",
  invoice_number: "",
  invoice_date: null,
  payment_status: "Unpaid",
  payment_date: null,
  work_package_id: "",
  work_package_name: "",
  sov_line_item_id: "",
  sov_line_item_name: "",
  expense_date: new Date().toISOString().split("T")[0],
  submitted_by: "",
  approved_by: "",
  approved_date: null,
  notes: "",
  receipt_url: "",
  tags: "",
};
