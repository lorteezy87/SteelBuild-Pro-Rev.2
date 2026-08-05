/**
 * Pure grid chrome styles for BulkAddTaskModal.
 */

export const CELL: Record<string, string | number> = {
  padding: "0 7px",
  height: "100%",
  display: "flex",
  alignItems: "center",
  minWidth: 0,
};

export const INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  minWidth: 0,
  height: 34,
  boxSizing: "border-box",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  outline: "none",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: "18px",
  padding: "7px 9px",
};

export const SELECT_STYLE: Record<string, string | number> = {
  width: "100%",
  minWidth: 0,
  height: 34,
  boxSizing: "border-box",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  lineHeight: "16px",
  padding: "0 8px",
  cursor: "pointer",
  outline: "none",
};

export const COL_WIDTHS =
  "40px minmax(200px, 1.4fr) 94px 126px 158px 60px 158px 112px 92px 124px 132px 50px";
export const GRID_MIN_WIDTH = 1346;
export const ROW_BG = "var(--bg-surface)";
export const ROW_ALT_BG = "var(--bg-surface-low)";
export const ROW_ERROR_BG = "var(--danger-muted)";
export const PANEL_BG = "var(--bg-surface-secondary)";

export const TASK_TYPES = [
  "Task",
  "Fabrication",
  "Delivery",
  "Install",
  "Submittal",
  "RFI",
  "Milestone",
] as const;

export const BULK_STATUSES = [
  "Not Started",
  "In Progress",
  "Complete",
  "On Hold",
  "Cancelled",
] as const;

export const BULK_PRIORITIES = ["Low", "Normal", "High", "Critical"] as const;
