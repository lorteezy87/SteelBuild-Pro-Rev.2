import { getTaskBaseline } from "@/components/schedule/scheduleGanttHelpers";
import { isSummaryTask } from "@/lib/schedule/summaryTasks";
import type { CpmRow } from "./cpmFloat";

export type FloatSeverity = "watch" | "alert" | "critical";

export type FloatFlag = {
  taskId: string;
  wbs: string;
  name: string;
  code: "float_watch" | "float_thin" | "float_gone" | "slip_window" | "slip_over";
  severity: FloatSeverity;
  detail: string;
};

const DAY_MS = 86_400_000;

function toISO(s: unknown): string | null {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : null;
}

function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / DAY_MS);
}

/**
 * SteelOps float-protection bands:
 * 10–14d remaining float (or 10–14d start slip vs locked baseline) = watch
 * <10d float or >14d slip = alert
 * ≤0 float = critical
 */
export function flagFloatProtection(
  tasks: Record<string, any>[],
  cpm: Map<string, CpmRow>,
): FloatFlag[] {
  const flags: FloatFlag[] = [];
  for (const t of tasks) {
    if (!t?.id || isSummaryTask(t)) continue;
    const id = String(t.id);
    const row = cpm.get(id);
    const wbs = String(t.wbs_code || "");
    const name = String(t.task_name || "Untitled");

    if (row?.totalFloat !== null && row?.totalFloat !== undefined) {
      if (row.totalFloat <= 0) {
        flags.push({
          taskId: id,
          wbs,
          name,
          code: "float_gone",
          severity: "critical",
          detail: `Total float ${row.totalFloat}d — on the critical path`,
        });
      } else if (row.totalFloat < 10) {
        flags.push({
          taskId: id,
          wbs,
          name,
          code: "float_thin",
          severity: "alert",
          detail: `Total float ${row.totalFloat}d — below the 10-day protection band`,
        });
      } else if (row.totalFloat <= 14) {
        flags.push({
          taskId: id,
          wbs,
          name,
          code: "float_watch",
          severity: "watch",
          detail: `Total float ${row.totalFloat}d — inside the 10–14 day erosion window`,
        });
      }
    }

    const baseline = getTaskBaseline(t);
    const start = toISO(t.start_date);
    const baseStart = toISO(baseline?.start);
    if (start && baseStart) {
      const slip = diffDays(baseStart, start);
      if (slip >= 10 && slip <= 14) {
        flags.push({
          taskId: id,
          wbs,
          name,
          code: "slip_window",
          severity: "watch",
          detail: `Start slipped ${slip}d vs baseline (10–14 day erosion window)`,
        });
      } else if (slip > 14) {
        flags.push({
          taskId: id,
          wbs,
          name,
          code: "slip_over",
          severity: "alert",
          detail: `Start slipped ${slip}d vs baseline`,
        });
      }
    }
  }

  const rank: Record<FloatSeverity, number> = { critical: 0, alert: 1, watch: 2 };
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity] || a.wbs.localeCompare(b.wbs));
}
