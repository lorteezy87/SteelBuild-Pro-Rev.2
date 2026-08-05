/** Pure helpers for Workload report. */

export type WorkloadRow = {
  name: string;
  inProgress: number;
  notStarted: number;
  delayed: number;
  total: number;
};

export function buildWorkloadRows(
  tasks: Array<{ assigned_to?: string | null; status?: string | null }> = [],
): WorkloadRow[] {
  const m: Record<string, WorkloadRow> = {};
  const ensure = (name: string) => {
    if (!m[name]) {
      m[name] = { name, inProgress: 0, notStarted: 0, delayed: 0, total: 0 };
    }
    return m[name];
  };

  for (const t of tasks) {
    const name = (t.assigned_to || "").trim();
    if (!name) continue;
    const r = ensure(name);
    if (t.status === "In Progress") r.inProgress += 1;
    if (t.status === "Not Started") r.notStarted += 1;
    if (t.status === "Delayed") r.delayed += 1;
    if (t.status !== "Complete" && t.status !== "Cancelled") r.total += 1;
  }

  return Object.values(m).sort((a, b) => b.inProgress - a.inProgress);
}

export function maxInProgressLoad(rows: WorkloadRow[]): number {
  return Math.max(1, ...(rows || []).map((r) => r.inProgress));
}
