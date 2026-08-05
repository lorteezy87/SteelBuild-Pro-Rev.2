/** Pure helpers for Tasks Due This Week report. */

export function startOfLocalDay(now: Date = new Date()): Date {
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  return t;
}

export function weekEndFromToday(today: Date, days = 7): Date {
  return new Date(today.getTime() + days * 86400000);
}

export type TaskDueRow = {
  id: string | null | undefined;
  taskName: string;
  projectId: string | null | undefined;
  projectName: string;
  projectNumber: string;
  phase: string;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  status: string;
  assignee: string;
  priority: string;
  taskType: string;
  due: Date;
  overdue: boolean;
  inWeek: boolean;
};

export function enrichTasksDueThisWeek(input: {
  tasks: Array<{
    id?: string | null;
    end_date?: string | null;
    start_date?: string | null;
    status?: string | null;
    project_id?: string | null;
    task_name?: string | null;
    phase?: string | null;
    assigned_to?: string | null;
    priority?: string | null;
    task_type?: string | null;
    [k: string]: unknown;
  }>;
  projectsById: Map<string, { name?: string | null; project_number?: string | null }>;
  today: Date;
  weekEnd: Date;
  buildParentIdSet: (tasks: any[]) => Set<string>;
  isSummaryTask: (t: any, parentIds: Set<string>) => boolean;
}): TaskDueRow[] {
  const { tasks, projectsById, today, weekEnd, buildParentIdSet, isSummaryTask } = input;
  // Exclude summary/parent rows: their end_date merely spans their children,
  // so a late child already surfaces on its own row. Counting the parent too
  // would double-count on the overdue/due-this-week KPIs and the table.
  const parentIds = buildParentIdSet(tasks || []);
  return (tasks || [])
    .filter(
      (t) =>
        t.end_date &&
        t.status !== "Complete" &&
        !isSummaryTask(t, parentIds),
    )
    .map((t) => {
      const proj = projectsById.get(t.project_id as string);
      const due = new Date(String(t.end_date));
      const overdue = due < today;
      const inWeek = !overdue && due <= weekEnd;
      return {
        id: t.id,
        taskName: t.task_name || "Untitled task",
        projectId: t.project_id,
        projectName: proj?.name || "—",
        projectNumber: proj?.project_number || "",
        phase: t.phase || "",
        startDate: t.start_date,
        endDate: t.end_date,
        status: t.status || "Not Started",
        assignee: t.assigned_to || "",
        priority: t.priority || "",
        taskType: t.task_type || "",
        due,
        overdue,
        inWeek,
      };
    });
}

export function scopeTasksDue(
  enriched: TaskDueRow[],
  scope: string,
): TaskDueRow[] {
  if (scope === "week") return (enriched || []).filter((r) => r.inWeek);
  if (scope === "overdue") return (enriched || []).filter((r) => r.overdue);
  return (enriched || []).filter((r) => r.inWeek || r.overdue);
}

export function filterAndSortTasksDue(
  scoped: TaskDueRow[],
  search: string,
): TaskDueRow[] {
  let out = scoped || [];
  const q = (search || "").trim().toLowerCase();
  if (q) {
    out = out.filter(
      (r) =>
        r.taskName.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        r.assignee.toLowerCase().includes(q),
    );
  }
  return [...out].sort((a, b) => a.due.getTime() - b.due.getTime());
}

export function computeTasksDueKpis(enriched: TaskDueRow[]) {
  const dueInWeekCount = (enriched || []).filter((r) => r.inWeek).length;
  const overdueCount = (enriched || []).filter((r) => r.overdue).length;
  const criticalCount = (enriched || []).filter(
    (r) => (r.inWeek || r.overdue) && r.priority === "Critical",
  ).length;
  return { dueInWeekCount, overdueCount, criticalCount };
}
