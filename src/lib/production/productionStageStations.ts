/**
 * productionStageStations.ts — how a legacy Production Status (EPM) stage maps
 * onto the canonical Piece Control station line, and the pure planner that
 * turns a batch of staged EPM rows into the RPC payload for
 * `sync_production_stages_to_pieces`.
 *
 * EPM shop order:   Not Started → Cut → Fit → Weld → Clean → Paint → Shipped
 * Canonical line:   cut → fit → weld → qc → paint → ready_to_ship  (then ship)
 *
 * Mapping decisions (positional, so progress stays monotonic):
 *   - Clean has no canonical twin; it sits where QC does, so Clean ⇒ qc.
 *   - Paint is the shop's final EPM stage (there is no EPM "ready to ship"), so
 *     Paint completes through ready_to_ship ⇒ lifecycle "fabricated". This
 *     matches the legacy Paint → fabricated fab_status colour.
 *   - Shipped completes the line and then ships the lot (fabricated → shipped).
 *   - Not Started has nothing to advance.
 */
import { PRODUCTION_STAGES, type ProductionStage } from "@/lib/importProductionStatus";
import type { PieceStation } from "@/lib/pieceControl/types";

export interface StageStationTarget {
  /** Deepest canonical station this EPM stage completes (null = none). */
  station: PieceStation | null;
  /** Whether the lot is also shipped once fabricated. */
  ship: boolean;
}

export const PRODUCTION_STAGE_TO_STATION: Record<ProductionStage, StageStationTarget> = {
  "Not Started": { station: null, ship: false },
  Cut: { station: "cut", ship: false },
  Fit: { station: "fit", ship: false },
  Weld: { station: "weld", ship: false },
  Clean: { station: "qc", ship: false },
  Paint: { station: "ready_to_ship", ship: false },
  Shipped: { station: "ready_to_ship", ship: true },
};

/** Position of a stage in shop order; -1 for unknown / blank. */
export function productionStageRank(stage: string | null | undefined): number {
  if (!stage) return -1;
  return (PRODUCTION_STAGES as readonly string[]).indexOf(String(stage).trim());
}

export function normalizeProductionMark(mark: string | null | undefined): string {
  return String(mark ?? "").trim().toUpperCase();
}

export interface StageSyncUpdate {
  mark: string;
  target_station: PieceStation | null;
  ship: boolean;
  /** The EPM stage that produced this update (for diagnostics). */
  stage: ProductionStage;
}

/**
 * Collapse staged rows to one update per mark — the furthest-along stage wins
 * when a mark appears more than once in a batch — and drop rows with nothing
 * to advance (blank mark, unknown stage, Not Started).
 */
export function planProductionStageSync(
  rows: Array<{ piece_mark?: string | null; status?: string | null }>,
): StageSyncUpdate[] {
  const stageByMark = new Map<string, ProductionStage>();
  for (const row of rows || []) {
    const mark = normalizeProductionMark(row?.piece_mark);
    const rank = productionStageRank(row?.status);
    if (!mark || rank < 0) continue;
    const stage = PRODUCTION_STAGES[rank];
    const prev = stageByMark.get(mark);
    if (!prev || rank > productionStageRank(prev)) stageByMark.set(mark, stage);
  }

  const updates: StageSyncUpdate[] = [];
  for (const [mark, stage] of stageByMark) {
    const target = PRODUCTION_STAGE_TO_STATION[stage];
    if (!target.station && !target.ship) continue;
    updates.push({ mark, target_station: target.station, ship: target.ship, stage });
  }
  return updates.sort((a, b) => a.mark.localeCompare(b.mark, undefined, { numeric: true }));
}

/**
 * One-line operator summary of a bridge run for toasts, e.g.
 * "Piece Control: 12 lots advanced · 3 unchanged · 2 skipped (not released)".
 * Returns null when piece control is off (nothing canonical happened).
 */
export function describeProductionSync(summary: {
  mode: string;
  piecesAdvanced: number;
  piecesUnchanged: number;
  piecesSkipped: number;
  rpcMissing: boolean;
  results: StageSyncResultRow[];
} | null | undefined): string | null {
  if (!summary || (summary.mode !== "pilot" && summary.mode !== "live")) return null;
  if (summary.rpcMissing) {
    return "Piece Control: lots not advanced — the production sync migration is not applied yet.";
  }
  const parts = [`${summary.piecesAdvanced.toLocaleString()} lot${summary.piecesAdvanced === 1 ? "" : "s"} advanced`];
  if (summary.piecesUnchanged) parts.push(`${summary.piecesUnchanged.toLocaleString()} unchanged`);
  if (summary.piecesSkipped) {
    const reasons = new Map<string, number>();
    for (const r of summary.results) {
      if (r.status !== "skipped") continue;
      const key = skipReasonLabel(r.reason);
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    const top = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([label, n]) => `${n} ${label}`).join(", ");
    parts.push(`${summary.piecesSkipped.toLocaleString()} skipped${top ? ` (${top})` : ""}`);
  }
  return `Piece Control: ${parts.join(" · ")}`;
}

/** Map RPC skip reasons (and advance_piece_station messages) to short labels. */
export function skipReasonLabel(reason: string | null | undefined): string {
  const r = String(reason ?? "").toLowerCase();
  if (!r) return "other";
  if (r === "no_leaf_lot") return "no register lot";
  if (r === "ambiguous_mark") return "ambiguous mark";
  if (r === "station_not_configured") return "station not configured";
  if (r === "not_fabricated_cannot_ship") return "not fabricated";
  if (r.includes("canonical release")) return "not released";
  if (r.includes("on hold")) return "on hold";
  if (r.includes("leaf")) return "container lot";
  return "other";
}

/** One result row from the RPC. */
export interface StageSyncResultRow {
  mark: string;
  piece_id?: string;
  status: "advanced" | "unchanged" | "skipped";
  reason?: string | null;
  completions_added?: number;
  shipped?: boolean;
  candidate_count?: number;
  station_key?: string;
}

export interface StageSyncRpcSummary {
  project_id: string;
  source: string;
  requested: number;
  advanced: number;
  unchanged: number;
  skipped: number;
  results: StageSyncResultRow[];
  atomic: false;
}
