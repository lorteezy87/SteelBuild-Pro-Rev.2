/**
 * Pure phase-group + forecast rollups for WbsBuilderModal.
 */
import { PHASES } from "@/utils/phases";


/** Group kept tasks under canonical PHASES headings. */
export function groupWbsTasksByPhase<T extends { phase?: string | null }>(
  kept: T[],
  phases: readonly string[] = PHASES as unknown as readonly string[],
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const p of phases) out[p] = [];
  for (const t of kept) {
    if (!out[t.phase as string]) continue;
    out[t.phase as string].push(t);
  }
  return out;
}

export function countNonEmptyPhases(byPhase: Record<string, unknown[]>): number {
  return Object.values(byPhase).filter((g) => g.length > 0).length;
}

// ── Forecast summary ──────────────────────────────────────────────────
//
// Roll the kept tasks back up to one row per source scope item so the
// PM can see "Anchor Bolts - Bldg. 1 → done by ~MMM DD (X working
// days)" without having to mentally sum the four phase rows. Project-
// level completion = the latest end_date across all items.

export function buildForecast(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const key = t._scopeGroupIndex ?? `wbs:${t.wbs_code}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        // Strip the trailing phase verb so the row reads as the source
        // scope item rather than the last phase that fell into the
        // group ("Anchor Bolts - Bldg. 1" rather than
        // "Anchor Bolts - Bldg. 1 — Erection").
        label: stripPhaseVerb(t.task_name),
        scopeType: t._scopeLabel || null,
        start: t.start_date,
        end:   t.end_date,
        durationDays: 0,
      });
    }
    const g = groups.get(key);
    if (!g.start || t.start_date < g.start) g.start = t.start_date;
    if (!g.end   || t.end_date   > g.end)   g.end   = t.end_date;
    g.durationDays += Number(t.duration) || 0;
  }
  const items = Array.from(groups.values()).sort((a, b) =>
    String(a.start || "").localeCompare(String(b.start || ""))
  );
  // Project-level totals: span = first start → last end.
  const allStarts = items.map((i) => i.start).filter(Boolean).sort();
  const allEnds   = items.map((i) => i.end).filter(Boolean).sort();
  const projectStart = allStarts[0] || null;
  const projectEnd   = allEnds[allEnds.length - 1] || null;
  const projectSpan  = (projectStart && projectEnd) ? daysSpan(projectStart, projectEnd) : 0;
  return { items, projectStart, projectEnd, projectSpan };
}

export function stripPhaseVerb(name) {
  if (!name) return "";
  // Builder format is "<base> — <verb>" with em-dash. Drop everything
  // after the LAST em-dash so the rollup reads as the scope label.
  const idx = name.lastIndexOf(" — ");
  return idx > 0 ? name.slice(0, idx) : name;
}

export function daysSpan(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const s = new Date(startIso + "T00:00:00Z");
  const e = new Date(endIso + "T00:00:00Z");
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

export function formatPretty(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch { return iso; }
}

