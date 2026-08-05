/** Pure helpers for Project Status (Gantt) report. */

export function parseGanttDate(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export type MonthTick = { label: string; fraction: number };

/** Generate a list of {label, fraction} ticks spanning [from, to]. */
export function buildMonthTicks(from: Date, to: Date): MonthTick[] {
  const ticks: MonthTick[] = [];
  const span = to.getTime() - from.getTime();
  if (span <= 0) return ticks;
  let cur = monthStart(from);
  while (cur <= to) {
    ticks.push({
      label: cur.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
      fraction: Math.max(0, Math.min(1, (cur.getTime() - from.getTime()) / span)),
    });
    cur = monthEnd(cur);
  }
  return ticks;
}

export type GanttProjectLike = {
  id?: string | null;
  name?: string | null;
  project_number?: string | null;
  health_status?: string | null;
  phase?: string | null;
  start_date?: string | null;
  target_completion_date?: string | null;
  forecast_completion_date?: string | null;
};

export type GanttRow = {
  id: string;
  name: string;
  number: string;
  health: string | null | undefined;
  phase: string | null | undefined;
  start: Date | null;
  end: Date | null;
};

export function mapProjectsToGanttRows(projects: GanttProjectLike[]): GanttRow[] {
  return (projects || []).map((p) => ({
    id: (p.id as string) ?? "",
    name: p.name || "Untitled Project",
    number: p.project_number || `P-${p.id}`,
    health: p.health_status || "",
    phase: p.phase || "",
    start: parseGanttDate(p.start_date),
    end:
      parseGanttDate(p.target_completion_date) ||
      parseGanttDate(p.forecast_completion_date),
  }));
}

export function filterGanttRows(
  rows: GanttRow[],
  opts: { search?: string; healthFilter?: string },
): GanttRow[] {
  let out = rows || [];
  const q = (opts.search || "").trim().toLowerCase();
  if (q) {
    out = out.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.number || "").toLowerCase().includes(q),
    );
  }
  if (opts.healthFilter && opts.healthFilter !== "all") {
    out = out.filter((r) => r.health === opts.healthFilter);
  }
  return out;
}

export type GanttWindow = { from: Date; to: Date };

/** Timeline window padded ±14d around dated rows; fallback 90d around now. */
export function computeGanttWindow(
  datedRows: Array<{ start: Date | null; end: Date | null }>,
  now: Date = new Date(),
): GanttWindow {
  const dated = (datedRows || []).filter((r) => r.start && r.end) as Array<{
    start: Date;
    end: Date;
  }>;
  if (dated.length === 0) {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth() + 6, 1),
    };
  }
  const minStart = dated.reduce(
    (min, r) => (r.start < min ? r.start : min),
    dated[0].start,
  );
  const maxEnd = dated.reduce(
    (max, r) => (r.end > max ? r.end : max),
    dated[0].end,
  );
  const fromPadded = new Date(minStart.getTime() - 14 * 86400000);
  const toPadded = new Date(maxEnd.getTime() + 14 * 86400000);
  return {
    from: monthStart(fromPadded),
    to: monthEnd(toPadded),
  };
}

/** Percent position of "today" within [from, to], or null if outside. */
export function computeTodayPct(
  from: Date,
  to: Date,
  now: Date = new Date(),
): number | null {
  const span = to.getTime() - from.getTime();
  if (span <= 0) return null;
  if (now < from || now > to) return null;
  return ((now.getTime() - from.getTime()) / span) * 100;
}

export function computeGanttBarLayout(
  row: { start: Date | null; end: Date | null },
  from: Date,
  to: Date,
): { leftPct: number; widthPct: number } | null {
  const span = to.getTime() - from.getTime();
  if (span <= 0 || !row.start || !row.end) return null;
  const leftPct = ((row.start.getTime() - from.getTime()) / span) * 100;
  const widthPct = ((row.end.getTime() - row.start.getTime()) / span) * 100;
  return { leftPct, widthPct };
}
