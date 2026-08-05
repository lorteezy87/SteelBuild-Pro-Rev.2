/** Pure helpers for Task Board kanban report. */

export type TaskBoardRow = {
  id: string | null | undefined;
  taskName: string;
  projectId: string | null | undefined;
  projectName: string;
  projectNumber: string;
  phase: string;
  status: string;
  endDate: string | null | undefined;
};

export const TASK_BOARD_STATUSES = [
  "Not Started",
  "In Progress",
  "Complete",
  "Delayed",
] as const;

export type TaskBoardColumns = Record<string, TaskBoardRow[]>;

export function mapTasksToBoardRows(input: {
  tasks?: Array<{
    id?: string | null;
    task_name?: string | null;
    project_id?: string | null;
    phase?: string | null;
    status?: string | null;
    end_date?: string | null;
  }>;
  projectsById?: Map<
    string,
    { name?: string | null; project_number?: string | null }
  >;
}): TaskBoardRow[] {
  const projectsById = input.projectsById || new Map();
  return (input.tasks || []).map((t) => {
    const proj =
      t.project_id != null ? projectsById.get(String(t.project_id)) : undefined;
    return {
      id: t.id,
      taskName: t.task_name || "Untitled",
      projectId: t.project_id,
      projectName: proj?.name || "—",
      projectNumber: proj?.project_number || "",
      phase: t.phase || "",
      status: t.status || "Not Started",
      endDate: t.end_date,
    };
  });
}

export function filterTaskBoardRows(
  rows: TaskBoardRow[],
  opts: { search?: string; projectFilter?: string } = {},
): TaskBoardRow[] {
  let out = rows || [];
  if (opts.projectFilter && opts.projectFilter !== "all") {
    out = out.filter((r) => r.projectId === opts.projectFilter);
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    out = out.filter(
      (r) =>
        r.taskName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q),
    );
  }
  return out;
}

export function groupTaskBoardColumns(
  rows: TaskBoardRow[],
  statuses: readonly string[] = TASK_BOARD_STATUSES,
): TaskBoardColumns {
  const grouped: TaskBoardColumns = {};
  for (const s of statuses) grouped[s] = [];
  for (const r of rows || []) {
    if (grouped[r.status]) grouped[r.status].push(r);
  }
  for (const arr of Object.values(grouped)) {
    arr.sort((a, b) => {
      const da = a.endDate ? new Date(a.endDate).getTime() : Infinity;
      const db = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      return da - db;
    });
  }
  return grouped;
}

export const TASK_BOARD_COLUMNS = [
  { key: "Not Started", label: "Not Started", color: "var(--text-muted)" },
  { key: "In Progress", label: "In Progress", color: "var(--accent)" },
  { key: "Complete", label: "Complete", color: "var(--status-success)" },
  { key: "Delayed", label: "Delayed", color: "var(--status-error)" },
] as const;
