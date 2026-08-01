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
 */

import { supabase } from "@/lib/supabase";
import type { ProductionStage } from "@/lib/importProductionStatus";
import type { FabStatus } from "@/lib/fabStatus";
import { FAB_STATUS_ORDER } from "@/lib/fabStatus";
import type { StagedProductionRow } from "./repository";

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

/** Escape % and _ so ilike behaves as exact case-insensitive equality. */
function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export interface ProductionBridgeSummary {
  modelElementsUpdated: number;
  piecesAdvanced: number;
  piecesSkipped: number;
  mode: string;
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
): Promise<ProductionBridgeSummary> {
  const summary: ProductionBridgeSummary = {
    modelElementsUpdated: 0,
    piecesAdvanced: 0,
    piecesSkipped: 0,
    mode: "off",
  };
  if (!projectId || !rows?.length) return summary;

  // Build mark → furthest-along fab status (if the same mark appears twice).
  const fabByMark = new Map<string, FabStatus>();
  for (const row of rows) {
    const mark = normalizeMark(row.piece_mark);
    const fab = mapProductionStageToFabStatus(row.status);
    if (!mark || !fab) continue;
    const prev = fabByMark.get(mark);
    if (!prev || fabRank(fab) > fabRank(prev)) fabByMark.set(mark, fab);
  }
  if (fabByMark.size === 0) return summary;

  // ── Always: model_elements.fab_status by mark ─────────────────────────────
  for (const [mark, fab] of fabByMark) {
    const { data: candidates, error: selErr } = await from("model_elements")
      .select("id, piece_mark")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .ilike("piece_mark", escapeIlikeExact(mark));
    if (selErr) throw selErr;

    const ids = (candidates || [])
      .filter(
        (el: { piece_mark?: string | null }) =>
          normalizeMark(el.piece_mark) === mark,
      )
      .map((el: { id: string }) => el.id);
    if (ids.length === 0) continue;

    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { error: updErr } = await from("model_elements")
        .update({ fab_status: fab })
        .in("id", slice);
      if (updErr) throw updErr;
      summary.modelElementsUpdated += slice.length;
    }
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

  const { data: pieces, error: piecesErr } = await from("pieces")
    .select(
      "id, normalized_piece_mark, lot_code, lifecycle_status, is_container, is_deleted, deleted_at, parent_piece_id",
    )
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .is("deleted_at", null);
  if (piecesErr) throw piecesErr;

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

  for (const [mark, fab] of fabByMark) {
    const candidates = leavesByMark.get(mark) ?? [];
    if (candidates.length !== 1) {
      summary.piecesSkipped += candidates.length;
      continue;
    }
    const leaf = candidates[0];
    const currentRank = fabRank(leaf.lifecycle_status);
    const nextRank = fabRank(fab);
    // Never regress lifecycle from an EPM import.
    if (nextRank < 0 || nextRank <= currentRank) {
      summary.piecesSkipped += 1;
      continue;
    }
    const { error: updErr } = await from("pieces")
      .update({ lifecycle_status: fab })
      .eq("id", leaf.id);
    if (updErr) throw updErr;
    summary.piecesAdvanced += 1;
  }

  return summary;
}
