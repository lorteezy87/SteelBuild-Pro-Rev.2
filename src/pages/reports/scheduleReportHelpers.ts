/** Pure helpers for Schedule Report (all tasks table). */

export type ScheduleReportRow = {
  id: string | null | undefined;
  taskName: string;
  projectId: string | null | undefined;
  projectName: string;
  projectNumber: string;
  wbs: string;
  phase: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  assignee: string;
  taskType: string;
};

export function buildScheduleReportRows(
  tasks: Array<Record<string, any>>,
  projectsById: Map<string, { name?: string | null; project_number?: string | null }>,
): ScheduleReportRow[] {
  return (tasks || []).map((t) => {
    const proj = projectsById.get(t.project_id);
    return {
      id: t.id,
      taskName: t.task_name || "Untitled task",
      projectId: t.project_id,
      projectName: proj?.name || "—",
      projectNumber: proj?.project_number || "",
      wbs: t.wbs_code || "",
      phase: t.phase || "",
      startDate: t.start_date || null,
      endDate: t.end_date || null,
      status: t.status || "Not Started",
      assignee: t.assigned_to || "",
      taskType: t.task_type || "",
    };
  });
}

export function filterScheduleReportRows(
  rows: ScheduleReportRow[],
  opts: {
    search?: string;
    phaseFilter?: string;
    statusFilter?: string;
    typeFilter?: string;
  },
): ScheduleReportRow[] {
  let out = rows || [];
  const q = (opts.search || "").trim().toLowerCase();
  if (q) {
    out = out.filter(
      (r) =>
        r.taskName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        r.wbs.toLowerCase().includes(q) ||
        r.assignee.toLowerCase().includes(q),
    );
  }
  if (opts.phaseFilter && opts.phaseFilter !== "all") {
    out = out.filter((r) => r.phase === opts.phaseFilter);
  }
  if (opts.statusFilter && opts.statusFilter !== "all") {
    out = out.filter((r) => r.status === opts.statusFilter);
  }
  if (opts.typeFilter && opts.typeFilter !== "all") {
    out = out.filter((r) => r.taskType === opts.typeFilter);
  }
  return out;
}
