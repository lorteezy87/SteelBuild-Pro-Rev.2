/** Pure helpers for Timeline band-chart report. */

export function monthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    months.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

export function filterTimelineTasks(
  tasks: Array<{
    start_date?: string | null;
    end_date?: string | null;
    project_id?: string | null;
    phase?: string | null;
  }> = [],
  opts: { projectFilter?: string; phases?: readonly string[] } = {},
) {
  const projectFilter = opts.projectFilter ?? "all";
  const phases = opts.phases;
  return (tasks || []).filter((t) => {
    if (!t.start_date || !t.end_date) return false;
    if (projectFilter !== "all" && t.project_id !== projectFilter) return false;
    if (phases && !phases.includes(t.phase as string)) return false;
    return true;
  });
}

export function timelineDateRange(
  tasks: Array<{ start_date?: string | null; end_date?: string | null }>,
): { minDate: Date | null; maxDate: Date | null } {
  if (!tasks?.length) return { minDate: null, maxDate: null };
  let mn = Infinity;
  let mx = -Infinity;
  for (const t of tasks) {
    const s = new Date(t.start_date as string).getTime();
    const e = new Date(t.end_date as string).getTime();
    if (s < mn) mn = s;
    if (e > mx) mx = e;
  }
  return { minDate: new Date(mn), maxDate: new Date(mx) };
}

export function groupTasksByPhase<T extends { phase?: string | null }>(
  tasks: T[],
  phases: readonly string[],
): Record<string, T[]> {
  const m: Record<string, T[]> = {};
  for (const p of phases) m[p] = [];
  for (const t of tasks || []) {
    if (t.phase && m[t.phase]) m[t.phase].push(t);
  }
  return m;
}

export function timelineXFor(input: {
  date: string | Date;
  minDate: Date | null;
  totalMs: number;
  leftGutter: number;
  innerW: number;
}): number {
  if (!input.totalMs || !input.minDate) return input.leftGutter;
  const t = new Date(input.date).getTime();
  return (
    input.leftGutter +
    ((t - input.minDate.getTime()) / input.totalMs) * input.innerW
  );
}
