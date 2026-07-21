import { supabase } from "@/lib/supabase";
import type { ImportPayload, PieceImportSourceType } from "./reconciliation";

export interface PieceRegisterRow {
  id: string;
  project_id: string;
  piece_mark: string;
  normalized_piece_mark: string;
  lot_code: string;
  parent_piece_id: string | null;
  quantity: number;
  profile: string | null;
  material_grade: string | null;
  weight_each_lbs: number | null;
  weight_total_lbs: number | null;
  work_package_id: string | null;
  lifecycle_status: string;
  current_station?: string | null;
  on_hold: boolean;
  is_container?: boolean;
  is_deleted?: boolean;
  source_system: string | null;
  external_ref: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface PieceImportBatch {
  id: string;
  project_id: string;
  source_type: PieceImportSourceType;
  source_name: string | null;
  status: "pending_review" | "approved" | "applied";
  row_count: number;
  decision_counts: Record<string, number>;
  created_at: string;
  approved_at: string | null;
  applied_at: string | null;
  apply_summary: Record<string, unknown> | null;
}

export interface PieceImportStagedRow {
  id: string;
  source_row_number: number;
  normalized_payload: Record<string, unknown>;
  decision: string;
  warnings: string[];
  resolution: string | null;
  matched_piece_id: string | null;
}

const db = supabase as any;

async function fetchAllProjectRows<T>(table: string, projectId: string): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("project_id", projectId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function fetchPieceRegister(projectId: string): Promise<PieceRegisterRow[]> {
  const rows = await fetchAllProjectRows<PieceRegisterRow>("pieces", projectId);
  return rows.filter((row) => !row.deleted_at);
}

export async function fetchPieceImportBatches(projectId: string): Promise<PieceImportBatch[]> {
  const { data, error } = await db
    .from("piece_import_batches")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as PieceImportBatch[];
}

export async function fetchPieceImportRows(
  projectId: string,
  batchId: string,
): Promise<PieceImportStagedRow[]> {
  const { data, error } = await db
    .from("piece_import_rows")
    .select("id, source_row_number, normalized_payload, decision, warnings, resolution, matched_piece_id")
    .eq("project_id", projectId)
    .eq("batch_id", batchId)
    .order("source_row_number");
  if (error) throw error;
  return (data ?? []) as PieceImportStagedRow[];
}

export async function stagePieceImportBatch(
  projectId: string,
  sourceType: PieceImportSourceType,
  sourceName: string,
  rows: ImportPayload[],
): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc("stage_piece_import_batch", {
    p_project_id: projectId,
    p_source_type: sourceType,
    p_source_name: sourceName,
    p_rows: rows,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function approvePieceImportBatch(batchId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc("approve_piece_import_batch", { p_batch_id: batchId });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function applyPieceImportBatch(batchId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc("apply_piece_import_batch", { p_batch_id: batchId });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function archivePieceLots(
  projectId: string,
  pieceIds: string[],
  confirmation: string,
  reason: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc("archive_piece_lots", {
    p_project_id: projectId,
    p_piece_ids: pieceIds,
    p_confirmation: confirmation,
    p_reason: reason,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}
