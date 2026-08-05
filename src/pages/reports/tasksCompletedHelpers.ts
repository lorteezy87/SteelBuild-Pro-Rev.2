/** Pure helpers for Tasks Completed report. */

export type CompletedTaskRow = {
  id: string | null | undefined;
  taskName: string;
  projectId: string | null | undefined;
  projectName: string;
  projectNumber: string;
  phase: string;
  type: string;
  completedAt: string | null | undefined;
  assignedTo: string;
};

export function buildCompletedTaskRows(
  tasks: Array<Record<string, any>>,
  projectsById: Map<string, { name?: string | null; project_number?: string | null }>,
  windowDays: string | number,
  now: Date = new Date(),
): CompletedTaskRow[] {
  const windowMs = windowDays === "all" ? Infinity : Number(windowDays) * 86400000;
  return (tasks || [])
    .filter((t) => t.status === "Complete")
    .map((t) => {
      const proj = projectsById.get(t.project_id);
      const completedAt = t.end_date || t.updated_at || t.created_at;
      return {
        id: t.id,
        taskName: t.task_name || "Untitled",
        projectId: t.project_id,
        projectName: proj?.name || "—",
        projectNumber: proj?.project_number || "",
        phase: t.phase || "",
        type: t.task_type || "Task",
        completedAt,
        assignedTo: t.assigned_to || "",
      };
    })
    .filter((r) => {
      if (!r.completedAt) return windowDays === "all";
      const diff = now.getTime() - new Date(String(r.completedAt)).getTime();
      return diff >= 0 && diff <= windowMs;
    });
}

export function filterCompletedTaskRows(
  rows: CompletedTaskRow[],
  search: string,
): CompletedTaskRow[] {
  if (!(search || "").trim()) return rows || [];
  const q = search.trim().toLowerCase();
  return (rows || []).filter(
    (r) =>
      r.taskName.toLowerCase().includes(q) ||
      r.projectName.toLowerCase().includes(q) ||
      r.assignedTo.toLowerCase().includes(q),
  );
}
