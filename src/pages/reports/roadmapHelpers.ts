/** Pure helpers for Roadmap (phase swim lanes) report. */

export function quartersBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
  while (d <= end) {
    out.push(new Date(d));
    d.setMonth(d.getMonth() + 3);
  }
  return out;
}

export function yearOptions(allDates: Array<number | Date | null | undefined>): number[] {
  const years = new Set<number>();
  for (const d of allDates || []) {
    if (d == null) continue;
    years.add(new Date(d).getFullYear());
  }
  return Array.from(years).sort((a, b) => a - b);
}

export type PhaseRange = { start: number; end: number };
export type PhaseRangesByProject = Record<string, Record<string, PhaseRange>>;

export function buildPhaseRangesByProject(
  tasks: Array<{
    start_date?: string | null;
    end_date?: string | null;
    project_id?: string | null;
    phase?: string | null;
  }>,
  phases: readonly string[],
): PhaseRangesByProject {
  const m: PhaseRangesByProject = {};
  for (const t of tasks || []) {
    if (!t.start_date || !t.end_date || !t.project_id || !phases.includes(String(t.phase || ""))) {
      continue;
    }
    const pid = String(t.project_id);
    m[pid] = m[pid] || {};
    const phase = String(t.phase);
    const cur = m[pid][phase];
    const s = new Date(t.start_date).getTime();
    const e = new Date(t.end_date).getTime();
    if (!cur) m[pid][phase] = { start: s, end: e };
    else {
      if (s < cur.start) cur.start = s;
      if (e > cur.end) cur.end = e;
    }
  }
  return m;
}

export function collectPhaseRangeDates(
  phaseRangesByProject: PhaseRangesByProject,
): number[] {
  const ds: number[] = [];
  for (const phases of Object.values(phaseRangesByProject || {})) {
    for (const r of Object.values(phases || {})) {
      ds.push(r.start, r.end);
    }
  }
  return ds;
}

export function resolveRoadmapRange(
  yearFilter: string,
  allDates: number[],
): { rangeStart: Date | null; rangeEnd: Date | null } {
  if (yearFilter !== "auto") {
    const y = Number(yearFilter);
    return { rangeStart: new Date(y, 0, 1), rangeEnd: new Date(y, 11, 31) };
  }
  if (!allDates.length) return { rangeStart: null, rangeEnd: null };
  return {
    rangeStart: new Date(Math.min(...allDates)),
    rangeEnd: new Date(Math.max(...allDates)),
  };
}

export function filterProjectsWithPhaseRanges<T extends { id?: string | null }>(
  projects: T[],
  phaseRangesByProject: PhaseRangesByProject,
): T[] {
  return (projects || []).filter((p) => phaseRangesByProject[String(p.id)]);
}

/** X pixel for a timestamp within [rangeStart, rangeEnd]. */
export function xForTimestamp(
  ts: number,
  rangeStart: Date | null,
  rangeEnd: Date | null,
  leftGutter: number,
  innerW: number,
): number {
  if (!rangeStart || !rangeEnd) return leftGutter;
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (!totalMs) return leftGutter;
  const clamped = Math.max(rangeStart.getTime(), Math.min(rangeEnd.getTime(), ts));
  return leftGutter + ((clamped - rangeStart.getTime()) / totalMs) * innerW;
}

/** Layout sizes for Roadmap phase swim lanes (SVG). */
export const ROW_HEIGHT = 48;
export const HEADER_HEIGHT = 36;
export const LEFT_GUTTER = 220;
export const RIGHT_GUTTER = 16;
export const BAND_HEIGHT = 14;
