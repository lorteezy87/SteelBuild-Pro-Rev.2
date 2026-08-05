/**
 * Pure helpers for Field Plan board.
 */
import { daysUntil, toLocalMidnight, startOfToday } from "@/lib/dateMath";

export const HORIZON_OPTIONS = [
  { days: 7, label: "7-DAY" },
  { days: 14, label: "14-DAY" },
  { days: 21, label: "21-DAY" },
] as const;

export const UNASSIGNED_CREW = "__unassigned";

export type BlockerChipData = {
  type: string;
  label: string;
  severity: "danger" | "warn" | "ok";
  resolved: boolean;
};

export type DayColumn = {
  iso: string;
  date: Date;
  label: string;
  weekday: number;
};

/** Build day columns (today → today + horizonDays-1). */
export function buildDayColumns(horizonDays: number, base: Date = startOfToday()): DayColumn[] {
  const out: DayColumn[] = [];
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    out.push({ iso, date: d, label, weekday: d.getDay() });
  }
  return out;
}

export function resolveBlocker(
  b: { id?: string; type?: string } | null | undefined,
  maps: {
    rfiById: Map<string, any>;
    submById: Map<string, any>;
    delById: Map<string, any>;
  },
): BlockerChipData | null {
  if (!b || !b.id) return null;
  if (b.type === "rfi") {
    const r = maps.rfiById.get(b.id);
    if (!r) return null;
    const open = r.status !== "Closed" && r.status !== "Answered";
    return {
      type: "RFI",
      label: `${r.rfi_number || "RFI"} · ${r.title || ""}`.slice(0, 60),
      severity: open ? "danger" : "ok",
      resolved: !open,
    };
  }
  if (b.type === "submittal") {
    const s = maps.submById.get(b.id);
    if (!s) return null;
    const approved = s.status === "Approved" || s.status === "Approved as Noted";
    return {
      type: "SUB",
      label: `${s.submittal_number || "SUB"} · ${s.title || ""}`.slice(0, 60),
      severity: approved ? "ok" : "warn",
      resolved: approved,
    };
  }
  if (b.type === "delivery") {
    const d = maps.delById.get(b.id);
    if (!d) return null;
    const delivered = d.status === "Delivered";
    return {
      type: "DEL",
      label: `${d.po_number || "Delivery"} · ${d.vendor || ""}`.slice(0, 60),
      severity: delivered ? "ok" : "warn",
      resolved: delivered,
    };
  }
  return null;
}

export function buildBlockerMaps(rfis: any[], submittals: any[], deliveries: any[]) {
  return {
    rfiById: new Map(rfis.map((r) => [r.id, r])),
    submById: new Map(submittals.map((s) => [s.id, s])),
    delById: new Map(deliveries.map((d) => [d.id, d])),
  };
}

export type FieldPlanTask = {
  id?: string;
  crew_id?: string | null;
  crew_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  blockers?: Array<{ id?: string; type?: string }> | null;
  [k: string]: unknown;
};

export type FieldPlanCellTask = FieldPlanTask & {
  _chips: BlockerChipData[];
  _isBlocked: boolean;
};

export function groupTasksByCrewAndDay(
  tasks: FieldPlanTask[],
  days: DayColumn[],
  resolve: (b: { id?: string; type?: string }) => BlockerChipData | null,
) {
  const crewMap = new Map<string, string>();
  const cellMap = new Map<string, FieldPlanCellTask[]>();
  let total = 0;
  let blocked = 0;
  let dueThisWeek = 0;
  let completed = 0;

  for (const t of tasks || []) {
    const crewKey = t.crew_id || UNASSIGNED_CREW;
    const crewName = t.crew_name || "Unassigned";
    if (!crewMap.has(crewKey)) crewMap.set(crewKey, crewName);

    const start = t.start_date ? toLocalMidnight(t.start_date) : null;
    const end = t.end_date ? toLocalMidnight(t.end_date) : start;
    if (!start || !end) continue;

    const chips = Array.isArray(t.blockers)
      ? t.blockers.map(resolve).filter(Boolean) as BlockerChipData[]
      : [];
    const isBlocked = chips.some((c) => !c.resolved);
    if (isBlocked) blocked += 1;
    if (t.status === "Complete") completed += 1;
    total += 1;

    for (const day of days) {
      const d = toLocalMidnight(day.iso);
      if (!d) continue;
      if (d >= start && d <= end) {
        const key = `${crewKey}|${day.iso}`;
        if (!cellMap.has(key)) cellMap.set(key, []);
        cellMap.get(key)!.push({ ...t, _chips: chips, _isBlocked: isBlocked });
        if (daysUntil(day.iso) >= 0 && daysUntil(day.iso) < 7) dueThisWeek += 1;
      }
    }
  }

  const crews = [...crewMap.entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => {
      if (a.key === UNASSIGNED_CREW) return 1;
      if (b.key === UNASSIGNED_CREW) return -1;
      return a.name.localeCompare(b.name);
    });

  return { crews, cellMap, stats: { total, blocked, dueThisWeek, completed } };
}

export function filterVisibleCrews(
  crews: Array<{ key: string; name: string }>,
  days: DayColumn[],
  cellMap: Map<string, FieldPlanCellTask[]>,
  onlyBlocked: boolean,
) {
  if (!onlyBlocked) return crews;
  return crews.filter((c) =>
    days.some((d) => (cellMap.get(`${c.key}|${d.iso}`) || []).some((t) => t._isBlocked)),
  );
}

export function buildFieldPlanIcsFilename(
  projectNumber: string | null | undefined,
  projectId: string,
  horizonDays: number,
): string {
  return `field-plan-${projectNumber || projectId}-${horizonDays}d.ics`;
}

export function commandBarSubtitle(stats: {
  blocked: number;
  dueThisWeek: number;
  completed: number;
}): string {
  return stats.blocked > 0
    ? `${stats.blocked} blocked · ${stats.dueThisWeek} this week · ${stats.completed} complete`
    : `${stats.dueThisWeek} this week · ${stats.completed} complete · no blockers`;
}
