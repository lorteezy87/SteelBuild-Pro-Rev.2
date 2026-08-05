/** Pure helpers for Tasks Status roll-up report. */

export const TASK_STATUS_KEYS = [
  "Not Started",
  "In Progress",
  "Complete",
  "Delayed",
  "On Hold",
  "Cancelled",
] as const;

export type TaskStatusKey = (typeof TASK_STATUS_KEYS)[number] | string;

export function countTasksByStatus(
  tasks: Array<{ status?: string | null }>,
  statuses: readonly string[] = TASK_STATUS_KEYS,
): Record<string, number> {
  const t: Record<string, number> = {};
  for (const s of statuses) t[s] = 0;
  for (const row of tasks || []) {
    const s = row.status || "Not Started";
    if (t[s] === undefined) t[s] = 0;
    t[s] += 1;
  }
  return t;
}

export function buildStatusPhaseMatrix(
  tasks: Array<{ status?: string | null; phase?: string | null }>,
  phases: readonly string[],
  statuses: readonly string[] = TASK_STATUS_KEYS,
): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  for (const p of phases) {
    m[p] = {};
    for (const s of statuses) m[p][s] = 0;
  }
  for (const row of tasks || []) {
    const phase = row.phase as string;
    const status = row.status || "Not Started";
    if (!m[phase]) continue;
    if (m[phase][status] === undefined) m[phase][status] = 0;
    m[phase][status] += 1;
  }
  return m;
}

export function phaseTotalsFromMatrix(
  matrix: Record<string, Record<string, number>>,
  phases: readonly string[],
  statuses: readonly string[] = TASK_STATUS_KEYS,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of phases) {
    out[p] = statuses.reduce((s, st) => s + (matrix[p]?.[st] || 0), 0);
  }
  return out;
}

export function buildStatusPhaseTableRows(
  phases: readonly string[],
  matrix: Record<string, Record<string, number>>,
  phaseTotals: Record<string, number>,
  statuses: readonly string[] = TASK_STATUS_KEYS,
) {
  return phases.map((phase) => ({
    id: phase,
    phase,
    ...statuses.reduce((acc, s) => ({ ...acc, [s]: matrix[phase]?.[s] || 0 }), {} as Record<string, number>),
    total: phaseTotals[phase] || 0,
  }));
}

export const TASK_STATUS_COLORS: Record<string, string> = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--accent)",
  Complete: "var(--status-success)",
  Delayed: "var(--status-error)",
  "On Hold": "var(--status-warning)",
  Cancelled: "var(--text-disabled, var(--text-muted))",
};
