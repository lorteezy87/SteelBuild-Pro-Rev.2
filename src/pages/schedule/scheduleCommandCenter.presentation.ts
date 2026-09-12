import type { KpiCellDef } from "@/components/command";
import { parseDateUTC } from "@/components/schedule/scheduleDateUtils";
import type { ScheduleSummary, TaskRecord } from "./scheduleCommandCenter.derive";

interface HeroChip {
  label: string;
  tone?: "danger" | "warn";
}

interface HeroStat {
  value: string;
  label: string;
}

export function formatScheduleDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "TBD";
  const date = parseDateUTC(dateStr);
  if (!date) return "TBD";
  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function buildScheduleHeroChips(summary: ScheduleSummary): HeroChip[] {
  return [
    { label: `${summary.total} Tasks` },
    {
      label: `${summary.critical} Critical`,
      tone: summary.critical ? "danger" : undefined,
    },
    {
      label: `${summary.tbd} TBD`,
      tone: summary.tbd ? "warn" : undefined,
    },
  ];
}

export function buildScheduleHeroStats(
  summary: ScheduleSummary,
  pctComplete: number | undefined,
  projectHealth: string | null | undefined,
): HeroStat[] {
  return [
    {
      value: `${pctComplete !== undefined ? pctComplete : summary.pctComplete}%`,
      label: "Complete",
    },
    { value: projectHealth || "—", label: "Project Health" },
  ];
}

export function buildScheduleKpiCells(summary: ScheduleSummary): KpiCellDef[] {
  return [
    {
      label: "Critical Path",
      value: summary.critical,
      sublabel: "tasks",
      tone: summary.critical ? "danger" : "neutral",
    },
    {
      label: "Activities",
      value: summary.activities,
      sublabel: "leaf tasks",
      tone: "neutral",
    },
    {
      label: "At Risk",
      value: summary.atRisk,
      sublabel: "open",
      tone: summary.atRisk ? "danger" : "neutral",
    },
    {
      label: "Overdue",
      value: summary.overdue,
      sublabel: "tasks",
      tone: summary.overdue ? "danger" : "neutral",
    },
    {
      label: "In Lookahead",
      value: summary.inLookahead,
      sublabel: "14 days",
      tone: "info",
    },
    {
      label: "% Complete",
      value: `${summary.pctComplete}%`,
      sublabel: "activities",
      tone: summary.pctComplete >= 75
        ? "good"
        : summary.pctComplete >= 40
          ? "warn"
          : "neutral",
    },
    {
      label: "TBD / Unscheduled",
      value: summary.tbd,
      sublabel: "tasks",
      tone: summary.tbd ? "warn" : "neutral",
    },
    {
      label: "Milestones",
      value: summary.milestones,
      sublabel: "total",
      tone: "neutral",
    },
  ];
}

export function buildScheduleRiskReasons(
  task: TaskRecord,
  today: Date = new Date(),
): string[] {
  const endDate = parseDateUTC(task.end_date);
  const todayUtc = new Date(today);
  todayUtc.setUTCHours(0, 0, 0, 0);

  const reasons: string[] = [];
  if (endDate && endDate < todayUtc) reasons.push("Overdue");
  if (!task.end_date && !task.start_date) reasons.push("TBD dates");
  if (task.priority === "Critical") reasons.push("Critical priority");
  if (task.blockers && String(task.blockers).trim()) reasons.push("Blocked");
  if (!task.resource_names && !task.assigned_to) reasons.push("Unassigned");
  return reasons;
}
