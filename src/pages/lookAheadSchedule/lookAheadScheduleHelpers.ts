/**
 * Pure helpers for Look-Ahead Schedule page.
 */

export function buildWpLabelById(
  workPackages: Array<{ id?: string; wp_number?: string | null; name?: string | null }>,
): Record<string, string> {
  return Object.fromEntries(
    (workPackages || []).map((w) => [
      String(w.id),
      w.wp_number || w.name || String(w.id).slice(0, 8),
    ]),
  );
}

export function groupLookAheadItems<T extends {
  phase?: string | null;
  project_name?: string | null;
  crew?: string | null;
}>(items: T[], groupBy: string): { groupKeys: string[]; itemsByGroup: Map<string, T[]> } {
  const keyOf = (i: T) =>
    groupBy === "Phase"
      ? i.phase
      : groupBy === "Project"
        ? i.project_name
        : i.crew || "No Crew";
  const byGroup = new Map<string, T[]>();
  for (const i of items || []) {
    const k = keyOf(i);
    if (!k) continue;
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(i);
  }
  const keys =
    groupBy === "Phase"
      ? ["Detailing", "Fabrication", "Delivery", "Erection"]
      : Array.from(byGroup.keys());
  return { groupKeys: keys, itemsByGroup: byGroup };
}

export function computeLookAheadStats(
  items: Array<{ status?: string | null; percent_complete?: number | string | null }>,
) {
  const total = items.length;
  const inProgress = items.filter((i) => i.status === "In Progress").length;
  const complete = items.filter((i) => i.status === "Complete").length;
  const delayed = items.filter((i) => i.status === "Delayed").length;
  const avgProgress =
    total > 0
      ? Math.round(items.reduce((s, i) => s + (Number(i.percent_complete) || 0), 0) / total)
      : 0;
  return { total, inProgress, complete, delayed, avgProgress };
}

export function buildRfisById<T extends { id?: string | null }>(
  rfis: T[],
): Record<string, T> {
  return Object.fromEntries((rfis || []).map((r) => [String(r.id), r]));
}

export type LookAheadWindow = {
  start: Date;
  end: Date;
};

/** 2-week window anchored to today, shifted by weekOffset (in 14-day steps). */
export function buildLookAheadWindow(
  weekOffset: number,
  now: Date = new Date(),
): LookAheadWindow {
  const start = new Date(now);
  start.setDate(start.getDate() + weekOffset * 14);
  const end = new Date(start);
  end.setDate(start.getDate() + 14);
  return { start, end };
}

export function formatLookAheadWindowDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}


export function lookAheadCommandSubtitle(
  windowStart: Date,
  windowEnd: Date,
  fmt: (d: Date) => string = formatLookAheadWindowDate,
): string {
  return `${fmt(windowStart)} – ${fmt(windowEnd)}`;
}

export const LOOK_AHEAD_PHASE_COLORS: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  Detailing: {
    bg: "color-mix(in srgb, var(--phase-detailing) 12%, transparent)",
    color: "var(--phase-detailing)",
    border: "color-mix(in srgb, var(--phase-detailing) 30%, transparent)",
  },
  Fabrication: {
    bg: "color-mix(in srgb, var(--phase-fab) 12%, transparent)",
    color: "var(--phase-fab)",
    border: "color-mix(in srgb, var(--phase-fab) 30%, transparent)",
  },
  Delivery: {
    bg: "color-mix(in srgb, var(--phase-delivery) 12%, transparent)",
    color: "var(--phase-delivery)",
    border: "color-mix(in srgb, var(--phase-delivery) 30%, transparent)",
  },
  Erection: {
    bg: "color-mix(in srgb, var(--phase-erection) 12%, transparent)",
    color: "var(--phase-erection)",
    border: "color-mix(in srgb, var(--phase-erection) 30%, transparent)",
  },
};

export const LOOK_AHEAD_STATUS_CONFIG: Record<
  string,
  { bg: string; color: string; border: string; icon: string }
> = {
  "Not Started": {
    bg: "color-mix(in srgb, var(--text-muted) 12%, transparent)",
    color: "var(--text-muted)",
    border: "color-mix(in srgb, var(--text-muted) 30%, transparent)",
    icon: "○",
  },
  "In Progress": {
    bg: "color-mix(in srgb, var(--accent) 12%, transparent)",
    color: "var(--accent)",
    border: "color-mix(in srgb, var(--accent) 30%, transparent)",
    icon: "◑",
  },
  Complete: {
    bg: "color-mix(in srgb, var(--status-success) 12%, transparent)",
    color: "var(--status-success)",
    border: "color-mix(in srgb, var(--status-success) 30%, transparent)",
    icon: "✓",
  },
  Delayed: {
    bg: "color-mix(in srgb, var(--status-warning) 15%, transparent)",
    color: "var(--status-warning)",
    border: "color-mix(in srgb, var(--status-warning) 40%, transparent)",
    icon: "⚠",
  },
};

export const EMPTY_LOOK_AHEAD_ITEM = {
  project_id: "",
  project_name: "",
  activity: "",
  phase: "Erection",
  crew: "",
  planned_start: "",
  planned_end: "",
  forecast_start: "",
  forecast_end: "",
  percent_complete: 0,
  constraints: "",
  status: "Not Started",
};

