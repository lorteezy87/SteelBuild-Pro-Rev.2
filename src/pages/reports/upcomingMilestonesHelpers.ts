/** Pure helpers for Upcoming Milestones report. */

import { buildParentIdSet, isSummaryTask } from "@/lib/schedule/summaryTasks";

export type UpcomingMilestoneRow = {
  id: string | null | undefined;
  taskName: string;
  projectId: string | null | undefined;
  projectName: string;
  projectNumber: string;
  phase: string;
  startDate: string;
  daysOut: number;
  status: string;
};

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function buildUpcomingMilestoneRows(input: {
  tasks?: Array<{
    id?: string | null;
    task_type?: string | null;
    start_date?: string | null;
    task_name?: string | null;
    project_id?: string | null;
    phase?: string | null;
    status?: string | null;
    parent_task_id?: string | null;
  }>;
  projectsById?: Map<
    string,
    { name?: string | null; project_number?: string | null }
  >;
  windowDays?: number | string;
  now?: Date;
}): UpcomingMilestoneRow[] {
  const tasks = input.tasks || [];
  const projectsById = input.projectsById || new Map();
  const windowDays = Number(input.windowDays ?? 60);
  const today = startOfDay(input.now ?? new Date());
  const windowEnd = new Date(today.getTime() + windowDays * 86400000);
  const parentIds = buildParentIdSet(tasks as any);

  return tasks
    .filter(
      (t) =>
        t.task_type === "Milestone" &&
        !isSummaryTask(t as any, parentIds) &&
        t.start_date &&
        new Date(t.start_date) >= today &&
        new Date(t.start_date) <= windowEnd,
    )
    .map((t) => {
      const proj =
        t.project_id != null ? projectsById.get(String(t.project_id)) : undefined;
      const dueDate = new Date(t.start_date as string);
      const daysOut = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
      return {
        id: t.id,
        taskName: t.task_name || "Untitled milestone",
        projectId: t.project_id,
        projectName: proj?.name || "—",
        projectNumber: proj?.project_number || "",
        phase: t.phase || "",
        startDate: t.start_date as string,
        daysOut,
        status: t.status || "Not Started",
      };
    })
    .sort((a, b) => {
      const byProj = a.projectName.localeCompare(b.projectName);
      if (byProj !== 0) return byProj;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });
}

export function filterUpcomingMilestoneRows(
  rows: UpcomingMilestoneRow[],
  search = "",
): UpcomingMilestoneRow[] {
  if (!search.trim()) return rows || [];
  const q = search.trim().toLowerCase();
  return (rows || []).filter(
    (r) =>
      r.taskName.toLowerCase().includes(q) ||
      r.projectName.toLowerCase().includes(q) ||
      r.projectNumber.toLowerCase().includes(q),
  );
}

export const MILESTONE_WINDOWS = [
  { key: "30", label: "Next 30 days" },
  { key: "60", label: "Next 60 days" },
  { key: "90", label: "Next 90 days" },
  { key: "180", label: "Next 180 days" },
] as const;
