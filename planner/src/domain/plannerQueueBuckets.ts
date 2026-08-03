import type { PlannerAction } from "@planner/data/plannerTypes";
import { deriveWaitingOnRows, filterPlannerActions, isValidPlannerDateOnly } from "@planner/domain/plannerActions";

export type PlannerMetricFilter = "all" | "overdue" | "due-today" | "next-48" | "waiting-on";

export type PlannerCommandBuckets = {
  overdue: PlannerAction[];
  dueToday: PlannerAction[];
  next48: PlannerAction[];
  waitingOn: PlannerAction[];
};

function addCalendarDays(isoDate: string, days: number): string | null {
  if (!isValidPlannerDateOnly(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Uses one explicit control date so action metrics cannot double-count a row. */
export function getActionDecisionDate(action: PlannerAction): string | null {
  return [action.due_date, action.follow_up_date, action.impact_date]
    .find(isValidPlannerDateOnly) ?? null;
}

export function derivePlannerCommandBuckets(
  actions: readonly PlannerAction[],
  todayIso: string,
): PlannerCommandBuckets {
  const next48End = addCalendarDays(todayIso, 2);
  const buckets: PlannerCommandBuckets = { overdue: [], dueToday: [], next48: [], waitingOn: deriveWaitingOnRows(actions) };
  if (!next48End) return buckets;

  for (const action of filterPlannerActions(actions, {})) {
    const decisionDate = getActionDecisionDate(action);
    if (!decisionDate) continue;
    if (decisionDate < todayIso) buckets.overdue.push(action);
    else if (decisionDate === todayIso) buckets.dueToday.push(action);
    else if (decisionDate <= next48End) buckets.next48.push(action);
  }
  return buckets;
}

export function filterActionsForPlannerMetric(
  actions: readonly PlannerAction[],
  metric: PlannerMetricFilter,
  todayIso: string,
): PlannerAction[] {
  const buckets = derivePlannerCommandBuckets(actions, todayIso);
  switch (metric) {
    case "overdue": return buckets.overdue;
    case "due-today": return buckets.dueToday;
    case "next-48": return buckets.next48;
    case "waiting-on": return buckets.waitingOn;
    case "all": return [...actions];
  }
}
