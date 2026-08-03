import type { PlannerAction, PlannerActionFilters } from "../../data/plannerTypes";
import { ACTION_REGISTER_COLUMNS, type ActionRegisterColumnKey } from "../../components/register/registerColumns";

function neutralizeSpreadsheetFormula(value: string): string {
  const firstMeaningfulIndex = value.search(/[^\s\r\n]/);
  if (firstMeaningfulIndex === -1) return value;
  const firstMeaningful = value[firstMeaningfulIndex];
  return ["=", "+", "-", "@"].includes(firstMeaningful) ? `'${value}` : value;
}

function escapeCsvCell(value: string): string {
  const neutralized = neutralizeSpreadsheetFormula(value);
  return /[",\r\n]/.test(neutralized) ? `"${neutralized.replaceAll('"', '""')}"` : neutralized;
}

/** Produces the visible register fields only; IDs and immutable audit data never leave this export. */
export function buildActionsCsv(actions: readonly PlannerAction[]): string {
  const header = ACTION_REGISTER_COLUMNS.map((column) => escapeCsvCell(column.label)).join(",");
  const rows = actions.map((action) => (
    ACTION_REGISTER_COLUMNS.map((column) => escapeCsvCell(rawActionRegisterValue(action, column.key))).join(",")
  ));
  return [header, ...rows].join("\r\n");
}

function rawNullable(value: string | null | undefined): string { return value ?? ""; }
function rawActionRegisterValue(action: PlannerAction, column: ActionRegisterColumnKey): string {
  switch (column) {
    case "priority": return rawNullable(action.priority);
    case "project": return rawNullable(action.project_name);
    case "action": return rawNullable(action.title);
    case "workstream": return rawNullable(action.workstream);
    case "actionDate": return rawNullable(action.action_date);
    case "followUp": return rawNullable(action.follow_up_date);
    case "required": return rawNullable(action.due_date);
    case "impact": return rawNullable(action.impact_date);
    case "waitingOn": return rawNullable(action.waiting_on);
    case "status": return rawNullable(action.status);
  }
}

/** Shared key shape keeps an org change from reusing another workspace's register cache. */
export function plannerActionsQueryKey(orgId: string, filters: PlannerActionFilters) {
  return ["planner-actions", orgId, filters] as const;
}

export function downloadActionsCsv(actions: readonly PlannerAction[], filename = "steelbuild-planner-actions.csv"): void {
  const blob = new Blob([buildActionsCsv(actions)], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
