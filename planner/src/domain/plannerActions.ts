import type {
  PlannerAction,
  PlannerActionFilters,
  PlannerMyDayRow,
  PlannerScheduleTask,
} from "@planner/data/plannerTypes";

const TERMINAL_STATUSES = new Set(["complete", "cancelled", "resolved", "closed", "deleted", "archived"]);

interface DateOnlyParts {
  year: number;
  month: number;
  day: number;
}

function parseDateOnly(isoDate: string): DateOnlyParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return null;
  }

  const parts = {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
    return null;
  }

  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(parts.year, parts.month - 1, parts.day);

  return date.getFullYear() === parts.year
    && date.getMonth() === parts.month - 1
    && date.getDate() === parts.day
    ? parts
    : null;
}

function toLocalDate(parts: DateOnlyParts): Date {
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(parts.year, parts.month - 1, parts.day);
  return date;
}

export function isValidPlannerDateOnly(value: string | null | undefined): value is string {
  return typeof value === "string" && parseDateOnly(value) !== null;
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addCalendarDays(isoDate: string, days: number): string | null {
  const parts = parseDateOnly(isoDate);
  if (!parts) return null;

  const date = toLocalDate(parts);
  date.setDate(date.getDate() + days);
  return formatDateOnly(date);
}

function requiredDate(row: PlannerAction): string | null {
  return [row.due_date, row.action_date, row.follow_up_date, row.impact_date]
    .find((value): value is string => isValidPlannerDateOnly(value)) ?? null;
}

function comparePlannerActions(left: PlannerAction, right: PlannerAction): number {
  const leftDate = requiredDate(left) ?? "9999-12-31";
  const rightDate = requiredDate(right) ?? "9999-12-31";

  return (
    leftDate.localeCompare(rightDate)
    || priorityRank(right.priority) - priorityRank(left.priority)
    || left.id.localeCompare(right.id)
  );
}

function priorityRank(priority: string | null): number {
  switch (priority) {
    case "Critical":
      return 4;
    case "High":
      return 3;
    case "Medium":
      return 2;
    case "Low":
      return 1;
    default:
      return 0;
  }
}

function isActiveAction(row: PlannerAction): boolean {
  return !row.archived_at && !isPlannerTerminalStatus(row.status);
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function isPlannerTerminalStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.has(normalizeText(status));
}

export type PlannerIdentityTokens = string | readonly string[];

function normalizeIdentityToken(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function identityTokens(value: PlannerIdentityTokens): Set<string> {
  const values = typeof value === "string" ? [value] : value;
  return new Set(values.map(normalizeIdentityToken).filter(Boolean));
}

function splitAssigneeTokens(value: string | null | undefined): string[] {
  return (value ?? "").split(/[;,]/).map(normalizeIdentityToken).filter(Boolean);
}

function matchesIdentity(value: string | null | undefined, identities: Set<string>): boolean {
  return splitAssigneeTokens(value).some((token) => identities.has(token));
}

function isAssignedToUser(row: PlannerAction, identities: PlannerIdentityTokens): boolean {
  const tokens = identityTokens(identities);
  return matchesIdentity(row.assigned_user_id, tokens) || matchesIdentity(row.assigned_to, tokens);
}

function isScheduleAssignedToUser(task: PlannerScheduleTask, identities: PlannerIdentityTokens): boolean {
  const tokens = identityTokens(identities);
  return matchesIdentity(task.assigned_to, tokens) || matchesIdentity(task.resource_names, tokens);
}

function myDayActionRank(row: PlannerAction, todayIso: string): number | null {
  const dueDate = isValidPlannerDateOnly(row.due_date) ? row.due_date : null;
  const actionDate = isValidPlannerDateOnly(row.action_date) ? row.action_date : null;
  const followUpDate = isValidPlannerDateOnly(row.follow_up_date) ? row.follow_up_date : null;

  if (dueDate && dueDate < todayIso) return 0;
  if (actionDate === todayIso) return 1;
  if (dueDate === todayIso) return 2;
  if (followUpDate === todayIso) return 3;
  return null;
}

function myDayScheduleTaskRank(task: PlannerScheduleTask, todayIso: string): number | null {
  if (isPlannerTerminalStatus(task.status)) return null;

  const startDate = isValidPlannerDateOnly(task.start_date) ? task.start_date : null;
  const endDate = isValidPlannerDateOnly(task.end_date) ? task.end_date : null;

  if (endDate && endDate < todayIso) return 4;
  if (startDate && endDate && startDate <= todayIso && todayIso <= endDate) {
    return 5;
  }
  if (startDate === todayIso || endDate === todayIso) return 6;
  return null;
}

function compareMyDayRows(
  left: { row: PlannerMyDayRow; rank: number },
  right: { row: PlannerMyDayRow; rank: number },
): number {
  if (left.rank !== right.rank) return left.rank - right.rank;

  const leftId = left.row.kind === "action" ? left.row.action.id : left.row.scheduleTask.id;
  const rightId = right.row.kind === "action" ? right.row.action.id : right.row.scheduleTask.id;

  return leftId.localeCompare(rightId);
}

export function sortPlannerActions(rows: readonly PlannerAction[]): PlannerAction[] {
  return [...rows].sort(comparePlannerActions);
}

export function deriveMyDayRows(
  input: { actions: readonly PlannerAction[]; scheduleTasks: readonly PlannerScheduleTask[] },
  currentUser: PlannerIdentityTokens,
  todayIso: string,
): PlannerMyDayRow[] {
  if (!isValidPlannerDateOnly(todayIso)) return [];

  const actionRows = input.actions.flatMap((action) => {
    const rank = isActiveAction(action) && isAssignedToUser(action, currentUser)
      ? myDayActionRank(action, todayIso)
      : null;

    return rank === null ? [] : [{ row: { kind: "action" as const, action }, rank }];
  });
  const taskRows = input.scheduleTasks.flatMap((scheduleTask) => {
    const rank = isScheduleAssignedToUser(scheduleTask, currentUser)
      ? myDayScheduleTaskRank(scheduleTask, todayIso)
      : null;

    return rank === null ? [] : [{ row: { kind: "schedule_task" as const, scheduleTask }, rank }];
  });

  return [...actionRows, ...taskRows].sort(compareMyDayRows).map(({ row }) => row);
}

export function deriveWaitingOnRows(rows: readonly PlannerAction[]): PlannerAction[] {
  return rows
    .filter(isActiveAction)
    .filter((row) => normalizeText(row.waiting_on).length > 0)
    .sort(comparePlannerActions);
}

export function filterPlannerActions(
  rows: readonly PlannerAction[],
  filters: PlannerActionFilters,
): PlannerAction[] {
  const search = normalizeText(filters.search);

  return rows.filter((row) => {
    if (!isActiveAction(row)) return false;
    if (filters.projectId && row.project_id !== filters.projectId) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.workstream && row.workstream !== filters.workstream) return false;
    if (filters.ownerId && !isAssignedToUser(row, filters.ownerId)) return false;
    if (filters.waitingOn === true && normalizeText(row.waiting_on).length === 0) return false;
    if (filters.waitingOn === false && normalizeText(row.waiting_on).length > 0) return false;
    if (filters.priority && row.priority !== filters.priority) return false;
    if (!search) return true;

    return [
      row.title,
      row.description,
      row.project_name,
      row.workstream,
      row.waiting_on,
      row.assigned_to,
      row.status,
      row.priority,
    ].some((value) => normalizeText(value).includes(search));
  });
}

export function deriveGateRows(
  rows: readonly PlannerAction[],
  horizonDays: number,
  todayIso: string,
): PlannerAction[] {
  const end = addCalendarDays(todayIso, horizonDays);
  if (!end) return [];

  return sortPlannerActions(rows
    .filter(isActiveAction)
    .filter((row) =>
      [row.due_date, row.follow_up_date, row.impact_date]
        .filter((value): value is string => isValidPlannerDateOnly(value))
        .some((value) => value <= end),
    ));
}
