import type {
  PlannerAction,
  PlannerCalendarEvent,
  PlannerScheduleTask,
} from "@planner/data/plannerTypes";

const TERMINAL_STATUSES = new Set(["complete", "cancelled", "resolved", "closed"]);

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toLocaleLowerCase() ?? "";
}

function isPlannerTerminalStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.has(normalizeStatus(status));
}

function isValidPlannerDateOnly(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isActiveAction(action: PlannerAction): boolean {
  return !action.archived_at && !isPlannerTerminalStatus(action.status);
}

function isActiveScheduleTask(task: PlannerScheduleTask): boolean {
  return !isPlannerTerminalStatus(task.status);
}

function mapAction(action: PlannerAction): PlannerCalendarEvent | null {
  const start = isValidPlannerDateOnly(action.action_date)
    ? action.action_date
    : isValidPlannerDateOnly(action.due_date)
      ? action.due_date
      : null;
  if (!start) return null;

  return {
    id: `action:${action.id}`,
    kind: "action",
    title: action.title?.trim() || "Untitled action",
    start,
    end: start,
    projectId: action.project_id,
    sourceId: action.id,
  };
}

function mapScheduleTask(task: PlannerScheduleTask): PlannerCalendarEvent | null {
  const start = isValidPlannerDateOnly(task.start_date) ? task.start_date : null;
  if (!start) return null;

  const isMilestone = task.is_milestone === true || task.milestone === true;
  const end = isValidPlannerDateOnly(task.end_date) && task.end_date >= start
    ? task.end_date
    : start;
  const event: PlannerCalendarEvent = {
    id: `schedule_task:${task.id}`,
    kind: "schedule_task",
    title: task.task_name?.trim() || "Untitled schedule task",
    start,
    end: isMilestone ? start : end,
    projectId: task.project_id,
    sourceId: task.id,
  };

  if (isMilestone) event.isMilestone = true;

  return event;
}

function compareCalendarEvents(left: PlannerCalendarEvent, right: PlannerCalendarEvent): number {
  return (
    left.start.localeCompare(right.start)
    || left.end.localeCompare(right.end)
    || left.kind.localeCompare(right.kind)
    || left.sourceId.localeCompare(right.sourceId)
  );
}

export function buildPlannerCalendarEvents(input: {
  actions: readonly PlannerAction[];
  scheduleTasks: readonly PlannerScheduleTask[];
}): PlannerCalendarEvent[] {
  const actionEvents = input.actions
    .filter(isActiveAction)
    .map(mapAction)
    .filter((event): event is PlannerCalendarEvent => event !== null);
  const scheduleEvents = input.scheduleTasks
    .filter(isActiveScheduleTask)
    .map(mapScheduleTask)
    .filter((event): event is PlannerCalendarEvent => event !== null);

  return [...actionEvents, ...scheduleEvents].sort(compareCalendarEvents);
}
