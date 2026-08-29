import { isSummaryTask } from "@/lib/schedule/summaryTasks";

export type LoadClash = {
  shipTaskId: string;
  erectTaskId: string;
  title: string;
  detail: string;
};

function toISO(s: unknown): string | null {
  if (!s) return null;
  const str = String(s).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : null;
}

function areaOf(task: Record<string, any>): string {
  return String(task.area || task.zone || task.area_sequence || "").trim().toLowerCase();
}

function isShip(task: Record<string, any>): boolean {
  const phase = String(task.phase || "").toLowerCase();
  const name = String(task.task_name || "").toLowerCase();
  const seq = String(task.sequence || task.wbs_code || "");
  return /deliver|shipping|ship/.test(phase) || /truck|load|ship/.test(name) || /^LD[-.]/i.test(seq);
}

function isErect(task: Record<string, any>): boolean {
  const phase = String(task.phase || "").toLowerCase();
  const name = String(task.task_name || "").toLowerCase();
  const seq = String(task.sequence || task.wbs_code || "");
  return /erect|install/.test(phase) || /erect|install/.test(name) || /^E[-.]/i.test(seq);
}

/**
 * Flag when a ship/load task finishes after erection starts in the same area.
 * Area match is required — no project-wide false positives.
 */
export function findLoadSequenceClashes(tasks: Record<string, any>[]): LoadClash[] {
  const leaves = (tasks || []).filter((t) => t?.id && !isSummaryTask(t));
  const ships = leaves.filter(isShip);
  const erects = leaves.filter(isErect);
  const out: LoadClash[] = [];

  for (const ship of ships) {
    const finish = toISO(ship.end_date);
    if (!finish) continue;
    const area = areaOf(ship);
    if (!area) continue;
    const follow = erects.find((e) => {
      const eArea = areaOf(e);
      return eArea && (eArea === area || eArea.startsWith(area) || area.startsWith(eArea)) && toISO(e.start_date);
    });
    const start = follow ? toISO(follow.start_date) : null;
    if (follow && start && start < finish) {
      out.push({
        shipTaskId: String(ship.id),
        erectTaskId: String(follow.id),
        title: `Load sequence clash — ${ship.wbs_code || ship.task_name}`,
        detail: `${ship.task_name} finishes ${finish} after ${follow.task_name} starts ${start}`,
      });
    }
  }
  return out;
}
