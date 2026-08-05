import { parseUTCDate } from "@/components/shared/formatters";

export type HealthLevel = "On Track" | "Watch" | "At Risk";

type ISODate = string | null | undefined;

interface BaseRecord {
  status?: string | null;
}

export interface PortfolioScoringInputs {
  originalContractValue?: number | null;
  rfis: Array<BaseRecord & {
    date_required?: ISODate;
    due_date?: ISODate;
    priority?: string | null;
    project_id?: string;
  }>;
  deliveries: Array<BaseRecord & {
    scheduled_date?: ISODate;
    delivery_date?: ISODate;
  }>;
  actionItems: Array<BaseRecord & {
    due_date?: ISODate;
  }>;
  scheduleTasks: Array<BaseRecord>;
  budget: number;
  committed: number;
}

export interface PortfolioHealthScoringResult {
  score: number;
  health: HealthLevel;
  reasons: string[];
  openRfis: number;
  overdueRfis: number;
  criticalRfis: number;
  lateDeliveries: number;
  overdueActions: number;
  delayedTasks: number;
}

const CLOSED_RFI_STATUSES = new Set(["answered", "closed", "void"]);
const CLOSED_ACTION_STATUSES = new Set(["complete", "cancelled", "closed"]);
const DEFAULT_HEALTH_THRESHOLDS = { onTrack: 76, watch: 52 };

function n(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeStatus(status: unknown): string {
  return String(status || "").trim().toLowerCase();
}

function parseDate(value: ISODate): Date | null {
  if (!value) return null;
  const date = parseUTCDate(String(value));
  if (!date) return null;
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateValue(value: ISODate): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOverdue(dueDate: ISODate, status: unknown, closedStatuses: Set<string>): boolean {
  if (!dueDate || closedStatuses.has(normalizeStatus(status))) return false;
  const due = parseDate(dueDate);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function isClosed(status: unknown, closedStatuses: Set<string>): boolean {
  return closedStatuses.has(normalizeStatus(status));
}

export function computePortfolioProjectHealth(inputs: PortfolioScoringInputs): PortfolioHealthScoringResult {
  const {
    originalContractValue = 0,
    rfis,
    deliveries,
    actionItems,
    scheduleTasks,
    budget,
    committed,
  } = inputs;

  const openRfis = rfis.filter((rfi) => !isClosed(rfi.status, CLOSED_RFI_STATUSES));
  const overdueRfis = openRfis.filter((rfi) => isOverdue(rfi.due_date || rfi.date_required, rfi.status, CLOSED_RFI_STATUSES));
  const criticalRfis = openRfis.filter((rfi) => ["Critical", "High"].includes(rfi.priority || ""));

  const lateDeliveries = deliveries.filter((delivery) => {
    const scheduled = parseDateValue(delivery.scheduled_date || delivery.delivery_date);
    return !normalizeStatus(delivery.status).includes("delivered") && scheduled !== null && scheduled < new Date();
  });

  const overdueActions = actionItems.filter(
    (action) => !isClosed(action.status, CLOSED_ACTION_STATUSES) && isOverdue(action.due_date, action.status, CLOSED_ACTION_STATUSES),
  );

  const delayedTasks = scheduleTasks.filter((task) => normalizeStatus(task.status).includes("delay"));

  let score = 100;
  const reasons: string[] = [];

  if (overdueRfis.length) {
    score -= Math.min(28, overdueRfis.length * 9);
    reasons.push(`${overdueRfis.length} overdue RFI${overdueRfis.length === 1 ? "" : "s"}`);
  }
  if (criticalRfis.length) {
    score -= Math.min(16, criticalRfis.length * 5);
    reasons.push(`${criticalRfis.length} high-priority RFI${criticalRfis.length === 1 ? "" : "s"}`);
  }
  if (lateDeliveries.length) {
    score -= Math.min(24, lateDeliveries.length * 8);
    reasons.push(`${lateDeliveries.length} late deliver${lateDeliveries.length === 1 ? "y" : "ies"}`);
  }
  if (overdueActions.length) {
    score -= Math.min(14, overdueActions.length * 4);
    reasons.push(`${overdueActions.length} overdue action${overdueActions.length === 1 ? "" : "s"}`);
  }
  if (delayedTasks.length) {
    score -= Math.min(18, delayedTasks.length * 6);
    reasons.push(`${delayedTasks.length} delayed task${delayedTasks.length === 1 ? "" : "s"}`);
  }
  if (budget > 0 && committed > budget) {
    score -= Math.min(22, Math.ceil(((committed - budget) / budget) * 100));
    reasons.push("Cost exposure over budget");
  }
  if (budget === 0 && n(originalContractValue) > 0) {
    score -= 8;
    reasons.push("Budget not fully set up");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const health: HealthLevel =
    score >= DEFAULT_HEALTH_THRESHOLDS.onTrack ? "On Track"
    : score >= DEFAULT_HEALTH_THRESHOLDS.watch ? "Watch"
    : "At Risk";

  return {
    score,
    health,
    reasons,
    openRfis: openRfis.length,
    overdueRfis: overdueRfis.length,
    criticalRfis: criticalRfis.length,
    lateDeliveries: lateDeliveries.length,
    overdueActions: overdueActions.length,
    delayedTasks: delayedTasks.length,
  };
}
