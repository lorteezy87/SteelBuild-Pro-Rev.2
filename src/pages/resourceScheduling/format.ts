import { formatLocalDate } from "@/utils/dates";
import { wpBudgetHoursForResource, wpActualHoursForResource } from "@/lib/wpHoursForResource";

export function formatHours(value: unknown): string {
  return `${Math.round(Number(value) || 0).toLocaleString()}h`;
}

export function formatShortDate(value: unknown): string {
  if (!value) return "No booking";
  return formatLocalDate(value as string, "en-US", { month: "short", day: "numeric" });
}

export interface ScheduleStats {
  totalBudgetHrs: number;
  totalActualHrs: number;
  totalShopBudget: number;
  totalShopActual: number;
  totalFieldBudget: number;
  totalFieldActual: number;
  assignedWPCount: number;
  unassignedCount: number;
  totalWpCount: number;
  overAllocatedResources: number;
}

export function buildScheduleStats(
  filteredWorkPackages: Record<string, unknown>[],
  scheduledWps: Record<string, unknown>[],
  topLevelResources: Record<string, unknown>[],
  effectiveCapacityById: Record<string, number>,
): ScheduleStats {
  const totalBudgetHrs = filteredWorkPackages.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
  const totalActualHrs = filteredWorkPackages.reduce((s, wp) => s + wpActualHoursForResource(wp), 0);
  const totalShopBudget = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.shop_hours_budget) || 0), 0);
  const totalShopActual = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.shop_hours_actual) || 0), 0);
  const totalFieldBudget = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.field_hours_budget) || 0), 0);
  const totalFieldActual = filteredWorkPackages.reduce((s, wp) => s + (Number(wp.field_hours_actual) || 0), 0);
  const assignedWPCount = scheduledWps.filter(wp => wp.crew).length;
  const unassignedCount = filteredWorkPackages.filter(wp => !wp.crew).length;
  const totalWpCount = filteredWorkPackages.length;
  const overAllocatedResources = topLevelResources.filter(res => {
    const resWPs = scheduledWps.filter(wp => wp.crew === res.name);
    const resBudget = resWPs.reduce((s, wp) => s + wpBudgetHoursForResource(wp), 0);
    const effCap = effectiveCapacityById[res.id as string] || 0;
    return effCap > 0 && resBudget > effCap;
  }).length;

  return {
    totalBudgetHrs,
    totalActualHrs,
    totalShopBudget,
    totalShopActual,
    totalFieldBudget,
    totalFieldActual,
    assignedWPCount,
    unassignedCount,
    totalWpCount,
    overAllocatedResources,
  };
}

export interface HoursSummaryCell {
  label: string;
  value: string | number;
  color: string;
}

export function buildHoursSummaryCells(stats: ScheduleStats): HoursSummaryCell[] {
  return [
    { label: "TOTAL ESTIMATED", value: `${stats.totalBudgetHrs.toLocaleString()}h`, color: "var(--accent)" },
    { label: "TOTAL ACTUAL", value: `${stats.totalActualHrs.toLocaleString()}h`, color: stats.totalActualHrs > stats.totalBudgetHrs ? "var(--status-error)" : "var(--status-success)" },
    { label: "SHOP HRS", value: `${stats.totalShopActual.toLocaleString()} / ${stats.totalShopBudget.toLocaleString()}`, color: stats.totalShopActual > stats.totalShopBudget ? "var(--status-error)" : "var(--text-secondary)" },
    { label: "FIELD HRS", value: `${stats.totalFieldActual.toLocaleString()} / ${stats.totalFieldBudget.toLocaleString()}`, color: stats.totalFieldActual > stats.totalFieldBudget ? "var(--status-error)" : "var(--text-secondary)" },
    { label: "ASSIGNED / TOTAL", value: `${stats.assignedWPCount} / ${stats.totalWpCount} WPs`, color: stats.unassignedCount > 0 ? "var(--status-warning)" : "var(--status-success)" },
    { label: "OVER-ALLOCATED", value: stats.overAllocatedResources, color: stats.overAllocatedResources > 0 ? "var(--status-error)" : "var(--status-success)" },
  ];
}
