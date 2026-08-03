import type { PlannerAction } from "../../data/plannerTypes";

export type ActionRegisterColumnKey =
  | "priority"
  | "project"
  | "action"
  | "workstream"
  | "actionDate"
  | "followUp"
  | "required"
  | "impact"
  | "waitingOn"
  | "status";

export type ActionRegisterColumn = {
  key: ActionRegisterColumnKey;
  label: string;
  minWidth: number;
};

export type PlannerActionRowTone = "standard" | "watch" | "risk" | "inactive";

export const ACTION_REGISTER_COLUMNS = [
  { key: "priority", label: "Priority", minWidth: 104 },
  { key: "project", label: "Project", minWidth: 170 },
  { key: "action", label: "Action", minWidth: 360 },
  { key: "workstream", label: "Workstream", minWidth: 140 },
  { key: "actionDate", label: "Action Date", minWidth: 120 },
  { key: "followUp", label: "Follow-Up", minWidth: 120 },
  { key: "required", label: "Required", minWidth: 120 },
  { key: "impact", label: "Impact", minWidth: 120 },
  { key: "waitingOn", label: "Waiting On", minWidth: 150 },
  { key: "status", label: "Status", minWidth: 130 },
] as const satisfies readonly ActionRegisterColumn[];

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "—";
}

export function getPlannerActionRowTone(action: PlannerAction): PlannerActionRowTone {
  if (action.archived_at || isTerminalActionStatus(action.status)) return "inactive";
  if (action.priority === "Critical") return "risk";
  if (action.priority === "High") return "watch";
  return "standard";
}

export function isTerminalActionStatus(status: string | null | undefined): boolean {
  return ["complete", "cancelled", "resolved", "closed"].includes(status?.trim().toLocaleLowerCase() ?? "");
}

export function getActionRegisterValue(
  action: PlannerAction,
  column: ActionRegisterColumnKey,
): string {
  switch (column) {
    case "priority":
      return displayValue(action.priority);
    case "project":
      return displayValue(action.project_name);
    case "action":
      return displayValue(action.title);
    case "workstream":
      return displayValue(action.workstream);
    case "actionDate":
      return displayValue(action.action_date);
    case "followUp":
      return displayValue(action.follow_up_date);
    case "required":
      return displayValue(action.due_date);
    case "impact":
      return displayValue(action.impact_date);
    case "waitingOn":
      return displayValue(action.waiting_on);
    case "status":
      return displayValue(action.status);
  }
}
