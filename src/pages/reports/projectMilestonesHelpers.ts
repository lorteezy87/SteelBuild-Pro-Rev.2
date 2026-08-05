/** Pure helpers for Project Milestones (all-time) report. */

export type ProjectMilestoneRow = {
  id: string | null | undefined;
  taskName: string;
  projectId: string | null | undefined;
  projectName: string;
  projectNumber: string;
  phase: string;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  status: string;
};

export function buildProjectMilestoneRows(input: {
  tasks?: Array<{
    id?: string | null;
    task_type?: string | null;
    is_milestone?: boolean | null;
    task_name?: string | null;
    project_id?: string | null;
    phase?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    status?: string | null;
  }>;
  projectsById?: Map<
    string,
    { name?: string | null; project_number?: string | null }
  >;
}): ProjectMilestoneRow[] {
  const projectsById = input.projectsById || new Map();
  return (input.tasks || [])
    .filter((t) => t.task_type === "Milestone" || t.is_milestone === true)
    .map((t) => {
      const proj =
        t.project_id != null ? projectsById.get(String(t.project_id)) : undefined;
      return {
        id: t.id,
        taskName: t.task_name || "Untitled milestone",
        projectId: t.project_id,
        projectName: proj?.name || "—",
        projectNumber: proj?.project_number || "",
        phase: t.phase || "",
        startDate: t.start_date,
        endDate: t.end_date,
        status: t.status || "Not Started",
      };
    })
    .sort((a, b) => {
      const byProj = a.projectName.localeCompare(b.projectName);
      if (byProj !== 0) return byProj;
      const da = a.startDate ? new Date(a.startDate).getTime() : Infinity;
      const db = b.startDate ? new Date(b.startDate).getTime() : Infinity;
      return da - db;
    });
}

export function filterProjectMilestoneRows(
  rows: ProjectMilestoneRow[],
  opts: {
    search?: string;
    projectFilter?: string;
    statusFilter?: string;
  } = {},
): ProjectMilestoneRow[] {
  let out = rows || [];
  if (opts.projectFilter && opts.projectFilter !== "all") {
    out = out.filter((r) => r.projectId === opts.projectFilter);
  }
  if (opts.statusFilter === "open") {
    out = out.filter(
      (r) => r.status !== "Complete" && r.status !== "Cancelled",
    );
  }
  if (opts.statusFilter === "complete") {
    out = out.filter((r) => r.status === "Complete");
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    out = out.filter(
      (r) =>
        r.taskName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        r.projectNumber.toLowerCase().includes(q),
    );
  }
  return out;
}
