/**
 * Pure derivations for the canonical Production Status Control Center.
 * No React, no network. Computes KPIs directly from production-control rows,
 * with stage-group queues for the DecisionPanel columns.
 *
 * The canonical fab stages and their per-stage percent baselines come from
 * src/lib/importProductionStatus.js — we import them directly to stay in sync.
 */
import { PRODUCTION_STAGES, STAGE_PERCENT } from "@/lib/importProductionStatus";
import type { PieceProductionRow } from "@/lib/production/repository";

// Re-export the canonical stages so consumers can reference them
export { PRODUCTION_STAGES };

// ── Types ────────────────────────────────────────────────────────────────────

export type { PieceProductionRow as PieceRecord };

export interface StageSummaryRow {
  stage: string;
  count: number;
  pct: number; // % of total pieces in this stage
}

export interface AreaSummaryRow {
  area: string;
  total: number;
  shipped: number;
  inFab: number;
  avgPct: number;
}

export interface ProductionSummary {
  // KPI counts
  total: number;
  inProduction: number;
  completed: number; // Shipped
  notStarted: number;
  qualityHold: number; // MISSING — no quality_hold field on PieceProductionRow
  pastDue: number;     // ship_date < today AND not yet Shipped
  pctComplete: number; // floor avg of percent_complete across all pieces

  // Stage distribution (for the stacked bar + legend)
  byStage: StageSummaryRow[];
  unknown: number;

  // Panel queues
  byArea: AreaSummaryRow[];      // By Erection Area queue
  stageQueue: StageSummaryRow[]; // By Stage/Status queue (top-3 active stages)
  pastDueQueue: PieceProductionRow[]; // Past-Due pieces (ship_date < today, not Shipped)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isPastDue(piece: PieceProductionRow): boolean {
  if (!piece.ship_date) return false;
  if (piece.status === "Shipped") return false;
  return piece.ship_date < todayISO();
}

function num(v: number | null | undefined): number {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

// ── Main derivation ───────────────────────────────────────────────────────────

/**
 * buildProductionSummary — derive all KPIs, queues, and distributions from
 * the live piece_production rows. Safe to call with an empty array.
 *
 * NOTE: `qualityHold` is always 0 — there is no quality_hold / hold flag on
 * PieceProductionRow (confirmed from src/lib/production/repository.ts). A future
 * schema column (e.g. `on_hold: boolean`) would wire in here. The KPI is kept in
 * the interface so the UI renders the slot and makes the gap visible.
 */
export function buildProductionSummary(pieces: PieceProductionRow[]): ProductionSummary {
  const total = pieces.length;

  // Stage distribution
  const stageCountMap: Record<string, number> = Object.fromEntries(
    PRODUCTION_STAGES.map((s) => [s, 0]),
  );
  let unknown = 0;
  let pctSum = 0;
  let pctCount = 0;
  const pastDueQueue: PieceProductionRow[] = [];

  for (const p of pieces) {
    const stage = p.status ?? "";
    if (stage && stageCountMap[stage] !== undefined) {
      stageCountMap[stage] += 1;
    } else {
      unknown += 1;
    }

    if (p.percent_complete !== null && p.percent_complete !== undefined) {
      pctSum += num(p.percent_complete);
      pctCount += 1;
    }

    if (isPastDue(p)) {
      pastDueQueue.push(p);
    }
  }

  const shipped = stageCountMap["Shipped"] ?? 0;
  const notStarted = stageCountMap["Not Started"] ?? 0;
  const inProduction = total - shipped - notStarted - unknown;
  const avgPct = pctCount > 0 ? Math.round(pctSum / pctCount) : 0;

  // Sort past-due pieces by ship_date ascending (most overdue first)
  const sortedPastDue = [...pastDueQueue].sort((a, b) =>
    (a.ship_date ?? "").localeCompare(b.ship_date ?? ""),
  );

  // byStage rows — all canonical stages, ordered by fab progression
  const byStage: StageSummaryRow[] = PRODUCTION_STAGES.map((stage) => ({
    stage,
    count: stageCountMap[stage] ?? 0,
    pct: total > 0 ? Math.round(((stageCountMap[stage] ?? 0) / total) * 100) : 0,
  }));

  // stageQueue — top active (non-Shipped, non-Not-Started) stages by count
  const stageQueue: StageSummaryRow[] = byStage
    .filter((s) => s.stage !== "Shipped" && s.stage !== "Not Started" && s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // By Erection Area
  const areaMap = new Map<string, { total: number; shipped: number; inFab: number; pctSum: number; pctCount: number }>();
  for (const p of pieces) {
    const area = p.erection_area || "Unassigned";
    let bucket = areaMap.get(area);
    if (!bucket) {
      bucket = { total: 0, shipped: 0, inFab: 0, pctSum: 0, pctCount: 0 };
      areaMap.set(area, bucket);
    }
    bucket.total += 1;
    if (p.status === "Shipped") bucket.shipped += 1;
    else if (p.status && p.status !== "Not Started") bucket.inFab += 1;
    if (p.percent_complete !== null && p.percent_complete !== undefined) {
      bucket.pctSum += num(p.percent_complete);
      bucket.pctCount += 1;
    }
  }
  const byArea: AreaSummaryRow[] = [...areaMap.entries()]
    .map(([area, b]) => ({
      area,
      total: b.total,
      shipped: b.shipped,
      inFab: b.inFab,
      avgPct: b.pctCount > 0 ? Math.round(b.pctSum / b.pctCount) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total,
    inProduction,
    completed: shipped,
    notStarted,
    qualityHold: 0, // MISSING: no quality_hold column on piece_production
    pastDue: sortedPastDue.length,
    pctComplete: avgPct,
    byStage,
    unknown,
    byArea,
    stageQueue,
    pastDueQueue: sortedPastDue.slice(0, 8),
  };
}

// ── Stage → tone (for Pill) ──────────────────────────────────────────────────

import type { PillTone } from "@/components/command";

/**
 * Map a canonical fab stage to a command-kit tone.
 * Shipped → good, active stages → info/warn, Not Started → neutral.
 */
export function stageTone(stage: string | null | undefined): PillTone {
  switch (stage) {
    case "Shipped":     return "good";
    case "Paint":       return "good";
    case "Clean":       return "info";
    case "Weld":        return "warn";
    case "Fit":         return "warn";
    case "Cut":         return "info";
    case "Not Started": return "neutral";
    default:            return "neutral";
  }
}

/**
 * Return the canonical stage's percent-complete baseline (from STAGE_PERCENT),
 * used when a piece has no explicit percent_complete recorded.
 */
export function stageBaselinePercent(stage: string | null | undefined): number {
  if (!stage) return 0;
  return (STAGE_PERCENT as Record<string, number>)[stage] ?? 0;
}
