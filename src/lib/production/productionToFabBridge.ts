/**
 * productionToFabBridge.ts — write-through from piece_production imports into
 * the 3D / Piece Control surfaces the viewer actually paints from.
 *
 * piece_production is the legacy Production Status table. The 3D Fab color mode
 * reads:
 *   1) pieces.lifecycle_status via model_elements.piece_id (when linked)
 *   2) model_elements.fab_status (when unlinked)
 * Neither of those was updated by commitProductionRows, so EPM imports never
 * recolored the model. This bridge closes that gap.
 *
 * Two write paths:
 *   1) model_elements.fab_status by mark — a direct batched UPDATE (the table
 *      grants authenticated writes) so unlinked parts recolor immediately.
 *   2) canonical pieces — ONLY through the sync_production_stages_to_pieces
 *      RPC. Browser sessions cannot write `pieces`, and a direct write would
 *      skip station completions / piece_events anyway.
 */

import { supabase } from "@/lib/supabase";
import type { ProductionStage } from "@/lib/importProductionStatus";
import type { FabStatus } from "@/lib/fabStatus";
import { FAB_STATUS_ORDER } from "@/lib/fabStatus";
import { isMissingSchemaObjectError } from "@/lib/postgrestErrors";
import { unwrapPieceControlRpc } from "@/lib/pieceControl/rpcResult";
import type { StagedProductionRow } from "./repository";
import { fetchAllModelElements } from "@/lib/ifc/fetchAllModelElements";
import {
  planProductionStageSync,
  type StageSyncResultRow,
  type StageSyncRpcSummary,
} from "./productionStageStations";

const from = (table: string): any =>
  (supabase.from as unknown as (t: string) => any)(table);

/** Map a Production Status stage onto the closed fab/lifecycle vocabulary. */
export function mapProductionStageToFabStatus(
  stage: string | null | undefined,
): FabStatus | null {
  if (!stage) return null;
  switch (stage as ProductionStage) {
    case "Not Started":
      return "not_started";
    case "Cut":
    case "Fit":
    case "Weld":
    case "Clean":
      return "in_fabrication";
    case "Paint":
      // Paint / "Complete" / "Fabricated" aliases resolve to fab-complete.
      return "fabricated";
    case "Shipped":
      return "shipped";
    default:
      return null;
  }
}

function fabRank(status: string | null | undefined): number {
  if (!status) return -1;
  return FAB_STATUS_ORDER.indexOf(status as FabStatus);
}

function normalizeMark(mark: string | null | undefined): string {
  return String(mark ?? "")
    .trim()
    .toUpperCase();
}

export interface ProductionBridgeSummary {
  modelElementsUpdated: number;
  /** Lots that gained at least one station completion or were shipped. */
  piecesAdvanced: number;
  /** Lots the RPC could not act on (not released, on hold, ambiguous mark…). */
  piecesSkipped: number;
  /** Lots already at or past the requested stage. */
  piecesUnchanged: number;
  /** Per-mark outcomes from the RPC (empty when piece control is off). */
  results: StageSyncResultRow[];
  /** True when the hosted schema lacks the sync RPC (migration not applied). */
  rpcMissing: boolean;
  mode: string;
}

export interface SyncProductionBridgeOpts {
  /**
   * Legacy `model_elements.fab_status` always follows the batch, forward or
   * back. Canonical lots are append-only (stations complete, lots ship), so a
   * backward EPM stage is reported as unchanged/skipped, never applied.
   */
  allowLifecycleRegress?: boolean;
  /** Recorded on piece_events / ship reference data. */
  source?: string;
}

const UPDATE_CHUNK = 200;

async function batchUpdateByIds(
  table: string,
  ids: string[],
  patch: Record<string, unknown>,
): Promise<number> {
  let updated = 0;
  for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
    const slice = ids.slice(i, i + UPDATE_CHUNK);
    const { error } = await from(table).update(patch).in("id", slice);
    if (error) throw error;
    updated += slice.length;
  }
  return updated;
}

/**
 * After piece_production rows are committed, push the resolved stages onto
 * model_elements (always) and onto unique leaf pieces when Piece Control is
 * pilot/live. Best-effort at the call site: import should not fail if the
 * bridge partially errors after piece_production is already written.
 */
export async function syncProductionRowsToModelAndPieces(
  projectId: string,
  rows: StagedProductionRow[],
  opts?: SyncProductionBridgeOpts,
): Promise<ProductionBridgeSummary> {
  const summary: ProductionBridgeSummary = {
    modelElementsUpdated: 0,
    piecesAdvanced: 0,
    piecesSkipped: 0,
    piecesUnchanged: 0,
    results: [],
    rpcMissing: false,
    mode: "off",
  };
  if (!projectId || !rows?.length) return summary;

  // Build mark → furthest-along fab status (if the same mark appears twice).
  // When allowLifecycleRegress is on, still prefer the highest rank among the
  // staged batch so conflicting marks in one bulk stay deterministic.
  const fabByMark = new Map<string, FabStatus>();
  for (const row of rows) {
    const mark = normalizeMark(row.piece_mark);
    const fab = mapProductionStageToFabStatus(row.status);
    if (!mark || !fab) continue;
    const prev = fabByMark.get(mark);
    if (!prev || fabRank(fab) > fabRank(prev)) fabByMark.set(mark, fab);
  }
  if (fabByMark.size === 0) return summary;

  // ── Always: model_elements.fab_status by mark (one roster fetch) ───────────
  // Slim projection + concurrent paging — avoids N+1 ilike selects and the
  // silent 1000-row PostgREST cap on large projects.
  const roster = (await fetchAllModelElements(projectId, {
    columns: "id,piece_mark",
  })) as Array<{ id: string; piece_mark?: string | null }>;

  const idsByMark = new Map<string, string[]>();
  for (const el of roster) {
    const mark = normalizeMark(el.piece_mark);
    if (!mark) continue;
    const list = idsByMark.get(mark);
    if (list) list.push(el.id);
    else idsByMark.set(mark, [el.id]);
  }

  // Group target marks by desired fab_status so identical patches share one
  // (chunked) .in() update instead of one round-trip per mark.
  const idsByFab = new Map<FabStatus, string[]>();
  for (const [mark, fab] of fabByMark) {
    const ids = idsByMark.get(mark);
    if (!ids?.length) continue;
    const bucket = idsByFab.get(fab);
    if (bucket) bucket.push(...ids);
    else idsByFab.set(fab, [...ids]);
  }

  for (const [fab, ids] of idsByFab) {
    summary.modelElementsUpdated += await batchUpdateByIds("model_elements", ids, {
      fab_status: fab,
    });
  }

  // ── Pilot/live: drive canonical lots through their stations via RPC ──────
  // `pieces` is SELECT-only for browser sessions; the sanctioned write path is
  // sync_production_stages_to_pieces, which walks each lot through the same
  // advance_piece_station / ship functions the register uses (completions,
  // events, WP progress), and reports per-lot skips instead of failing the batch.
  const { data: project, error: projectErr } = await from("projects")
    .select("piece_control_mode")
    .eq("id", projectId)
    .maybeSingle();
  if (projectErr) throw projectErr;
  const mode = String(project?.piece_control_mode ?? "off");
  summary.mode = mode;
  if (mode !== "pilot" && mode !== "live") return summary;

  const updates = planProductionStageSync(rows);
  if (updates.length === 0) return summary;

  const { data, error } = await (supabase as any).rpc("sync_production_stages_to_pieces", {
    p_project_id: projectId,
    p_updates: updates.map(({ mark, target_station, ship }) => ({ mark, target_station, ship })),
    p_source: opts?.source ?? "production_import",
  });
  if (error) {
    if (isMissingSchemaObjectError(error)) {
      // Hosted schema hasn't picked up the migration yet. Never fall back to a
      // direct pieces UPDATE (blocked by grants and skips station history).
      console.warn(
        "[piece_production] sync_production_stages_to_pieces RPC missing — pieces not advanced; apply migration 20260905090000",
      );
      summary.rpcMissing = true;
      summary.piecesSkipped += updates.length;
      return summary;
    }
    throw error;
  }
  const result = unwrapPieceControlRpc<StageSyncRpcSummary>(data);
  summary.piecesAdvanced = Number(result.advanced ?? 0);
  summary.piecesSkipped = Number(result.skipped ?? 0);
  summary.piecesUnchanged = Number(result.unchanged ?? 0);
  summary.results = Array.isArray(result.results) ? result.results : [];

  return summary;
}
