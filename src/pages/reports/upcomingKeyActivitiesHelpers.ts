/** Pure helpers for Upcoming Key Activities report. */

import { buildParentIdSet, isSummaryTask } from "@/lib/schedule/summaryTasks";

export type KeyActivityTask = {
  id: string | null | undefined;
  taskName: string;
  type: string;
  phase: string;
  startDate: string;
  endDate: string | null | undefined;
  status: string;
  daysOut: number;
};

export type KeyActivityGroup = {
  project: unknown;
  projectId: string | null | undefined;
  projectName: string;
  projectNumber: string;
  tasks: KeyActivityTask[];
};

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function groupUpcomingKeyActivities(input: {
  tasks?: Array<{
    id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    status?: string | null;
    project_id?: string | null;
    task_name?: string | null;
    task_type?: string | null;
    phase?: string | null;
    parent_task_id?: string | null;
    is_summary?: boolean | null;
  }>;
  projectsById?: Map<
    string,
    { name?: string | null; project_number?: string | null }
  >;
  windowDays?: number | string;
  now?: Date;
}): KeyActivityGroup[] {
  const tasks = input.tasks || [];
  const projectsById = input.projectsById || new Map();
  const windowDays = Number(input.windowDays ?? 14);
  const today = startOfDay(input.now ?? new Date());
  const windowEnd = new Date(today.getTime() + windowDays * 86400000);
  const parentIds = buildParentIdSet(tasks as any);
  const m: Record<string, KeyActivityGroup> = {};

  for (const t of tasks) {
    if (!t.start_date) continue;
    if (isSummaryTask(t as any, parentIds)) continue;
    const d = new Date(t.start_date);
    if (d < today || d > windowEnd) continue;
    if (t.status === "Complete" || t.status === "Cancelled") continue;
    const proj =
      t.project_id != null ? projectsById.get(String(t.project_id)) : undefined;
    const key = t.project_id || "_unknown";
    if (!m[key]) {
      m[key] = {
        project: proj,
        projectId: t.project_id,
        projectName: proj?.name || "—",
        projectNumber: proj?.project_number || "",
        tasks: [],
      };
    }
    m[key].tasks.push({
      id: t.id,
      taskName: t.task_name || "Untitled",
      type: t.task_type || "Task",
      phase: t.phase || "",
      startDate: t.start_date,
      endDate: t.end_date,
      status: t.status || "Not Started",
      daysOut: Math.round((d.getTime() - today.getTime()) / 86400000),
    });
  }

  for (const g of Object.values(m)) {
    g.tasks.sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
  }
  return Object.values(m).sort((a, b) =>
    a.projectName.localeCompare(b.projectName),
  );
}

export function countKeyActivities(groups: KeyActivityGroup[]): number {
  return (groups || []).reduce((s, g) => s + g.tasks.length, 0);
}

export const KEY_ACTIVITY_WINDOWS = [
  { key: "7", label: "Next 7 days" },
  { key: "14", label: "Next 14 days" },
  { key: "30", label: "Next 30 days" },
] as const;

