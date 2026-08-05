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

export const monoStyle = { fontFamily: "var(--font-mono)" } as const;
export const displayStyle = {
  fontFamily: "'Space Grotesk', var(--font-display)",
} as const;
export const AI_ACCENT = "var(--ai-accent, var(--status-info))";

/** Quick-pick scope starters for the WBS builder input step. */
export const WBS_EXAMPLES = [
  {
    label: "Bid-style base bid",
    text:  [
      "1. SC1 columns per P-S1.010 and P-S1.011",
      "2. W27x84 beams per P-S1.012 and P-S1.013",
      "3. Canopy per P-S1.012 and P-S1.013 ref detail 308",
      "4. Ledger at canopies ref detail 305",
      "5. Elevator spreader beams per P-S1.015",
      "6. Elevator spreader columns full height per keynote 107/P-S1.015",
      "7. Elevator hoist beams per 4/P-S1.015",
      "8. North Stair A and B per PA6.001A and PA6.003 ref P-S6.001",
      "8a. Railing per details on PA8.005A",
      "9. Moment Frame - Grid Line A per detail S1/P-S2.005",
      "10. X-Brace at North Bay per detail 301/P-S2.006",
      "11. Bollards per detail 5/PA8.002",
      "12. Bike Racks per keynote 7/PA1.101A",
      "13. Shear Studs - Level 2 Composite Beams per detail 704/P-S3.005",
      "14. Floor Deck - Level 2 Composite Deck per detail 701/P-S3.003",
      "15. RTU Dunnage Framing - Roof Level per detail 603/P-S5.004",
    ].join("\n"),
  },
  {
    label: "Two-building school (bid-style)",
    text:  [
      "1. Anchor Bolts - Bldg. 1 & 2",
      "2. Embed Plates - Bldg. 1",
      "3. Embed Plates - Bldg. 2",
      "4. Main Steel Frame - Bldg. 1",
      "5. Main Steel Frame - Bldg. 2",
      "6. North Stair A - Bldg. 1 ref P-S6.001",
      "6a. Railing per PA8.005A",
      "7. South Stair B - Bldg. 2 ref P-S6.001",
      "7a. Railing per PA8.005A",
      "8. Site Misc - Bldg. 1 & 2",
    ].join("\n"),
  },
  {
    label: "Short category list",
    text:  "Anchor Bolts - Bldg. 1\nPanel Embeds - Bldg. 1\nMain Steel - Bldg. 1\nStairs - Bldg. 1\nRailings - Bldg. 1\nJoists / Deck - Bldg. 1\nLadders - Bldg. 1\nSite Misc - Bldg. 1",
  },
  {
    label: "Canopy retrofit",
    text:  "1. Entry Canopy\n2. Railings\n3. Misc Steel",
  },
] as const;

export const IMPORT_BTN_PRIMARY: Record<string, string | number> = {
  padding: "8px 22px",
  background: AI_ACCENT,
  color: "var(--on-accent)",
  border: "none",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const IMPORT_BTN_GHOST: Record<string, string | number> = {
  padding: "8px 18px",
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};
