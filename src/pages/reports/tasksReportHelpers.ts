/** Pure helpers for Tasks list report. */

export type TasksReportRow = {
  id: string | null | undefined;
  taskName: string;
  projectId: string | null | undefined;
  projectName: string;
  projectNumber: string;
  phase: string;
  type: string;
  status: string;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  pct: number;
  assignedTo: string;
};

export function buildTasksReportRows(input: {
  tasks?: Array<Record<string, any>>;
  projectsById?: Map<
    string,
    { name?: string | null; project_number?: string | null }
  >;
}): TasksReportRow[] {
  const projectsById = input.projectsById || new Map();
  return (input.tasks || []).map((t) => {
    const proj =
      t.project_id != null ? projectsById.get(String(t.project_id)) : undefined;
    return {
      id: t.id,
      taskName: t.task_name || "Untitled task",
      projectId: t.project_id,
      projectName: proj?.name || "—",
      projectNumber: proj?.project_number || "",
      phase: t.phase || "",
      type: t.task_type || "Task",
      status: t.status || "Not Started",
      startDate: t.start_date,
      endDate: t.end_date,
      pct: Number(t.percent_complete) || 0,
      assignedTo: t.assigned_to || "",
    };
  });
}

export function filterTasksReportRows(
  rows: TasksReportRow[],
  opts: {
    search?: string;
    projectFilter?: string;
    phaseFilter?: string;
    typeFilter?: string;
    statusFilter?: string;
  } = {},
): TasksReportRow[] {
  let out = rows || [];
  if (opts.projectFilter && opts.projectFilter !== "all") {
    out = out.filter((r) => r.projectId === opts.projectFilter);
  }
  if (opts.phaseFilter && opts.phaseFilter !== "all") {
    out = out.filter((r) => r.phase === opts.phaseFilter);
  }
  if (opts.typeFilter && opts.typeFilter !== "all") {
    out = out.filter((r) => r.type === opts.typeFilter);
  }
  if (opts.statusFilter && opts.statusFilter !== "all") {
    out = out.filter((r) => r.status === opts.statusFilter);
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    out = out.filter(
      (r) =>
        r.taskName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        r.assignedTo.toLowerCase().includes(q),
    );
  }
  return out;
}

/** Live schedule_tasks.task_type values for the Tasks report filter. */
export const TASKS_REPORT_TYPES = [
  "Task",
  "Milestone",
  "Submittal",
  "Fabrication",
  "Install",
  "Delivery",
] as const;

export const TASKS_REPORT_STATUSES = [
  "Not Started",
  "In Progress",
  "Complete",
  "Delayed",
  "On Hold",
  "Cancelled",
] as const;

