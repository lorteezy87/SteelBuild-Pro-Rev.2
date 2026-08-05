/** Pure helpers for Who's Doing What — in-progress tasks by assignee. */

export type WhosDoingWhatItem = {
  id: string | null | undefined;
  taskName: string;
  projectId: string | null | undefined;
  projectName: string;
  projectNumber: string;
  phase: string;
  endDate: string | null | undefined;
  pct: number;
};

export type WhosDoingWhatGroup = {
  name: string;
  items: WhosDoingWhatItem[];
};

export function groupInProgressByAssignee(input: {
  tasks?: Array<{
    id?: string | null;
    status?: string | null;
    assigned_to?: string | null;
    task_name?: string | null;
    project_id?: string | null;
    phase?: string | null;
    end_date?: string | null;
    percent_complete?: number | string | null;
  }>;
  projectsById?: Map<
    string,
    { name?: string | null; project_number?: string | null }
  >;
}): WhosDoingWhatGroup[] {
  const projectsById = input.projectsById || new Map();
  const m: Record<string, WhosDoingWhatItem[]> = {};

  for (const t of input.tasks || []) {
    if (t.status !== "In Progress") continue;
    const a = (t.assigned_to || "").trim() || "Unassigned";
    if (!m[a]) m[a] = [];
    const proj = t.project_id != null ? projectsById.get(String(t.project_id)) : undefined;
    m[a].push({
      id: t.id,
      taskName: t.task_name || "Untitled",
      projectId: t.project_id,
      projectName: proj?.name || "—",
      projectNumber: proj?.project_number || "",
      phase: t.phase || "",
      endDate: t.end_date,
      pct: Number(t.percent_complete) || 0,
    });
  }

  for (const arr of Object.values(m)) {
    arr.sort((a, b) => {
      const da = a.endDate ? new Date(a.endDate).getTime() : Infinity;
      const db = b.endDate ? new Date(b.endDate).getTime() : Infinity;
      return da - db;
    });
  }

  return Object.entries(m)
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length);
}

export function countActiveTasks(groups: WhosDoingWhatGroup[]): number {
  return (groups || []).reduce((s, p) => s + p.items.length, 0);
}
