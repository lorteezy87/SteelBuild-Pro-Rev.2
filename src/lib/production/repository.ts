/**
 * repository.ts — typed persistence for piece_production (Phase 4 EPM import).
 *
 * Self-contained because piece_production isn't in the generated DB types yet:
 * this module owns its own typed access (the same pattern as the backcharge /
 * payapp repositories). All reads filter soft-deletes; RLS enforces project
 * membership + role (members read, field+ write, pm+ delete).
 */

import { supabase } from "@/lib/supabase";
import { PRODUCTION_STAGES, STAGE_PERCENT, type ProductionStage } from "@/lib/importProductionStatus";
import {
  syncProductionRowsToModelAndPieces,
  type ProductionBridgeSummary,
} from "./productionToFabBridge";

const TABLE = "piece_production";

// piece_production isn't in the generated Database types — own the cast here.
// The optional client arg lets listPieceProduction page against an injected
// mock in tests; every other caller uses the real client by default.

const from = (table: string, client: typeof supabase = supabase): any =>
  (client.from as unknown as (t: string) => any)(table);

export interface PieceProductionRow {
  id: string;
  project_id: string;
  piece_mark: string;
  assembly_mark: string | null;
  status: string | null;
  percent_complete: number | null;
  quantity: number | null;
  weight: number | null;
  sequence_number: string | null;
  erection_area: string | null;
  ship_date: string | null;
  stage_data: Record<string, unknown> | null;
  source: string | null;
  external_ref: string | null;
  notes: string | null;
  imported_at: string | null;
  is_deleted: boolean;
}

/** A staged row from parseProductionCsv, ready to commit. */
export interface StagedProductionRow {
  action: "create" | "update";
  existing_id: string | null;
  piece_mark: string;
  assembly_mark: string | null;
  status: string | null;
  percent_complete: number | null;
  ship_date: string | null;
  stage_data: Record<string, unknown> | null;
  quantity: number | null;
  weight: number | null;
  sequence_number: string | null;
  erection_area: string | null;
  external_ref: string | null;
}

// Supabase caps a single PostgREST request at 1000 rows server-side
// (db-max-rows), so a plain `.select()` silently truncates a big shop roster at
// 1000. That under-counts the Production Status page AND makes a re-import
// mis-classify every piece past row 1000 as NEW (the import stages the CSV
// against this list), duplicating it. So page with `.range()` to completeness —
// the same fix fetchAllModelElements applies to the 3D model roster. A stable
// (piece_mark, id) order keeps pages from overlapping/skipping rows.
const PAGE = 1000;
const SAFETY_MAX_ROWS = 200_000;

export async function listPieceProduction(
  projectId: string,
  opts: { client?: typeof supabase; page?: number } = {},
): Promise<PieceProductionRow[]> {
  if (!projectId) return [];
  const { client = supabase, page = PAGE } = opts;
  const all: PieceProductionRow[] = [];
  for (let offset = 0; offset < SAFETY_MAX_ROWS; offset += page) {
    const { data, error } = await from(TABLE, client)
      .select("*")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("piece_mark", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + page - 1);
    if (error) throw error;
    const batch = (data || []) as PieceProductionRow[];
    all.push(...batch);
    if (batch.length < page) return all;
  }
  // Hit the safety ceiling — surface it rather than silently returning partial.

  console.warn(`[piece_production] listPieceProduction stopped at the ${SAFETY_MAX_ROWS}-row safety cap — data may be incomplete.`);
  return all;
}

function toFields(row: StagedProductionRow, projectId: string, importedAt: string) {
  return {
    project_id: projectId,
    piece_mark: row.piece_mark,
    assembly_mark: row.assembly_mark,
    status: row.status,
    percent_complete: row.percent_complete,
    quantity: row.quantity,
    weight: row.weight,
    sequence_number: row.sequence_number,
    erection_area: row.erection_area,
    ship_date: row.ship_date,
    stage_data: row.stage_data,
    external_ref: row.external_ref,
    source: "tekla_epm",
    imported_at: importedAt,
  };
}

const CHUNK = 200;
/** Parallelism for per-row updates (each row has a distinct payload). */
const UPDATE_CONCURRENCY = 25;

/**
 * Commit staged rows: bulk-insert the creates (chunked), update the existing
 * pieces by id in parallel batches. Returns the applied counts.
 * After a successful write, best-effort sync into model_elements.fab_status and
 * (when pilot/live) unique leaf pieces.lifecycle_status so Fab-mode colors update.
 */
export async function commitProductionRows(
  projectId: string,
  rows: StagedProductionRow[],
): Promise<{ created: number; updated: number; pieceControl: ProductionBridgeSummary | null }> {
  const importedAt = new Date().toISOString();
  const creates = rows.filter((r) => r.action === "create").map((r) => toFields(r, projectId, importedAt));
  const updates = rows.filter((r) => r.action === "update" && r.existing_id);

  let created = 0;
  for (let i = 0; i < creates.length; i += CHUNK) {
    const slice = creates.slice(i, i + CHUNK);
    const { error } = await from(TABLE).insert(slice);
    if (error) throw error;
    created += slice.length;
  }

  let updated = 0;
  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    const slice = updates.slice(i, i + UPDATE_CONCURRENCY);
    const results = await Promise.all(
      slice.map((row) =>
        from(TABLE)
          .update(toFields(row, projectId, importedAt))
          .eq("id", row.existing_id)
          .then(({ error }: { error: unknown }) => {
            if (error) throw error;
            return 1;
          }),
      ),
    );
    updated += results.length;
  }

  let pieceControl: ProductionBridgeSummary | null = null;
  try {
    pieceControl = await syncProductionRowsToModelAndPieces(projectId, rows, {
      source: "production_import",
    });
  } catch (bridgeError) {
    console.warn(
      "[piece_production] production→fab bridge failed after commit:",
      bridgeError,
    );
  }

  return { created, updated, pieceControl };
}

export async function softDeletePieceProduction(id: string): Promise<void> {
  const { error } = await from(TABLE).update({ is_deleted: true }).eq("id", id);
  if (error) throw error;
}

/**
 * Bulk-set stage (and STAGE_PERCENT baseline) for existing piece_production rows.
 * Loads marks for the fab bridge, updates status/percent in chunks, then runs
 * syncProductionRowsToModelAndPieces so 3D / Piece Control colors stay in sync.
 * Returns the number of rows actually found and written (not the request size).
 */
export async function bulkUpdateProductionStage(
  projectId: string,
  ids: string[],
  stage: ProductionStage,
): Promise<{ updated: number; pieceControl: ProductionBridgeSummary | null }> {
  if (!projectId || !ids.length) return { updated: 0, pieceControl: null };
  if (!(PRODUCTION_STAGES as readonly string[]).includes(stage)) {
    throw new Error(`Invalid production stage: ${stage}`);
  }
  const percent = STAGE_PERCENT[stage];
  const uniqueIds = [...new Set(ids)];

  const selected: PieceProductionRow[] = [];
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const slice = uniqueIds.slice(i, i + CHUNK);
    const { data, error } = await from(TABLE)
      .select("*")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .in("id", slice);
    if (error) throw error;
    selected.push(...((data || []) as PieceProductionRow[]));
  }

  if (selected.length === 0) return { updated: 0, pieceControl: null };

  const selectedIds = selected.map((r) => r.id);
  for (let i = 0; i < selectedIds.length; i += CHUNK) {
    const slice = selectedIds.slice(i, i + CHUNK);
    const { error } = await from(TABLE)
      .update({ status: stage, percent_complete: percent })
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .in("id", slice);
    if (error) throw error;
  }

  const staged: StagedProductionRow[] = selected.map((row) => ({
    action: "update",
    existing_id: row.id,
    piece_mark: row.piece_mark,
    assembly_mark: row.assembly_mark,
    status: stage,
    percent_complete: percent,
    ship_date: row.ship_date,
    stage_data: row.stage_data,
    quantity: row.quantity,
    weight: row.weight,
    sequence_number: row.sequence_number,
    erection_area: row.erection_area,
    external_ref: row.external_ref,
  }));

  let pieceControl: ProductionBridgeSummary | null = null;
  try {
    // Operator bulk may correct the legacy stage backward (Shipped → Cut);
    // model_elements.fab_status follows, canonical lots never regress.
    pieceControl = await syncProductionRowsToModelAndPieces(projectId, staged, {
      allowLifecycleRegress: true,
      source: "production_bulk_stage",
    });
  } catch (bridgeError) {
    console.warn("[piece_production] bulk stage → fab bridge failed:", bridgeError);
  }

  return { updated: selected.length, pieceControl };
}
