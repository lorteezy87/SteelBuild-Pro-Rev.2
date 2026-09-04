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
 * Efficiency: one paged roster fetch for model_elements + one pieces fetch,
 * then in-memory mark grouping and batched updates by target fab_status.
 * Avoids the previous N+1 ilike-per-mark pattern on large imports.
 */

import { supabase } from "@/lib/supabase";
import type { ProductionStage } from "@/lib/importProductionStatus";
import type { FabStatus } from "@/lib/fabStatus";
import { FAB_STATUS_ORDER } from "@/lib/fabStatus";
import { fetchAllProjectRowsPaged } from "@/lib/pieceControl/pagedSelect";
import type { StagedProductionRow } from "./repository";
import { fetchAllModelElements } from "@/lib/ifc/fetchAllModelElements";

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
  piecesAdvanced: number;
  piecesSkipped: number;
  mode: string;
}

export interface SyncProductionBridgeOpts {
  /**
   * When true, allow pieces.lifecycle_status to move backward (operator bulk
   * stage correction). Import path leaves this false so EPM never regresses.
   */
  allowLifecycleRegress?: boolean;
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

  // ── Pilot/live: advance unique leaf pieces ────────────────────────────────
  const { data: project, error: projectErr } = await from("projects")
    .select("piece_control_mode")
    .eq("id", projectId)
    .maybeSingle();
  if (projectErr) throw projectErr;
  const mode = String(project?.piece_control_mode ?? "off");
  summary.mode = mode;
  if (mode !== "pilot" && mode !== "live") return summary;

  // Paged so marks past row 1000 are not silently left un-advanced.
  const pieces = await fetchAllProjectRowsPaged<Record<string, unknown>>(
    supabase as any,
    "pieces",
    projectId,
    {
      select:
        "id, normalized_piece_mark, lot_code, lifecycle_status, is_container, is_deleted, deleted_at, parent_piece_id",
      build: (query) => query.eq("is_deleted", false).is("deleted_at", null),
    },
  );

  const all = (pieces || []) as Array<{
    id: string;
    normalized_piece_mark: string | null;
    lot_code: string | null;
    lifecycle_status: string | null;
    is_container?: boolean | null;
    parent_piece_id?: string | null;
  }>;

  const childParentIds = new Set(
    all.filter((p) => p.parent_piece_id).map((p) => p.parent_piece_id as string),
  );
  const leaves = all.filter(
    (p) => !p.is_container && !childParentIds.has(p.id),
  );

  const leavesByMark = new Map<string, typeof leaves>();
  for (const leaf of leaves) {
    const mk = normalizeMark(leaf.normalized_piece_mark);
    if (!mk) continue;
    const list = leavesByMark.get(mk) ?? [];
    list.push(leaf);
    leavesByMark.set(mk, list);
  }

  // Collect advances grouped by target fab so we can batch .in() updates.
  const advanceIdsByFab = new Map<FabStatus, string[]>();
  for (const [mark, fab] of fabByMark) {
    const candidates = leavesByMark.get(mark) ?? [];
    if (candidates.length !== 1) {
      summary.piecesSkipped += candidates.length;
      continue;
    }
    const leaf = candidates[0];
    const currentRank = fabRank(leaf.lifecycle_status);
    const nextRank = fabRank(fab);
    // Import path never regresses. Explicit operator bulk may pass
    // allowLifecycleRegress to apply corrections (e.g. Shipped → Cut).
    if (nextRank < 0) {
      summary.piecesSkipped += 1;
      continue;
    }
    if (!opts?.allowLifecycleRegress && nextRank <= currentRank) {
      summary.piecesSkipped += 1;
      continue;
    }
    if (opts?.allowLifecycleRegress && nextRank === currentRank) {
      summary.piecesSkipped += 1;
      continue;
    }
    const bucket = advanceIdsByFab.get(fab);
    if (bucket) bucket.push(leaf.id);
    else advanceIdsByFab.set(fab, [leaf.id]);
  }

  for (const [fab, ids] of advanceIdsByFab) {
    summary.piecesAdvanced += await batchUpdateByIds("pieces", ids, {
      lifecycle_status: fab,
    });
  }

  return summary;
}
