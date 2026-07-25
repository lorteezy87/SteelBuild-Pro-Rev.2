import { supabase } from "@/lib/supabase";
import type { CommentDispositionLike } from "@/lib/commentDispositionGate";
import { fetchPieceRegister, type PieceRegisterRow } from "./repository";
import type {
  DrawingReviewEvidence,
  DrawingRevisionEvidence,
  DrawingSetEvidence,
  DrawingSignoffEvidence,
  ReadinessDrawing,
  ReadinessPieceDrawing,
  ReadinessWorkPackage,
  SheetResponseEvidence,
  SubmittalEvidence,
} from "./readiness";

export interface PieceCommentDispositionEvidence extends CommentDispositionLike {
  id: string;
  project_id?: string | null;
  related_piece_ids?: string[] | null;
  drawing_id?: string | null;
  submittal_id?: string | null;
}

export interface PieceRelationshipSnapshot {
  pieces: PieceRegisterRow[];
  pieceDrawings: ReadinessPieceDrawing[];
  drawings: ReadinessDrawing[];
  workPackages: ReadinessWorkPackage[];
  drawingSets: DrawingSetEvidence[];
  submittals: SubmittalEvidence[];
  sheetResponses: SheetResponseEvidence[];
  drawingRevisions: DrawingRevisionEvidence[];
  drawingReviews: DrawingReviewEvidence[];
  drawingSignoffs: DrawingSignoffEvidence[];
  commentDispositions: PieceCommentDispositionEvidence[];
}

const db = supabase as any;

async function fetchProjectRows<T>(
  table: string,
  projectId: string,
  select = "*",
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from(table)
      .select(select)
      .eq("project_id", projectId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function fetchPieceRelationshipSnapshot(
  projectId: string,
): Promise<PieceRelationshipSnapshot> {
  const [
    pieces,
    pieceDrawings,
    drawings,
    workPackages,
    drawingSets,
    submittals,
    sheetResponses,
    drawingRevisions,
    drawingReviews,
    drawingSignoffs,
    commentDispositions,
  ] = await Promise.all([
    fetchPieceRegister(projectId),
    fetchProjectRows<ReadinessPieceDrawing>("piece_drawings", projectId),
    fetchProjectRows<ReadinessDrawing>(
      "drawings",
      projectId,
      "id, project_id, drawing_set_id, sheet_number, title, stage, set_approval_status, is_deleted, deleted_at, is_superseded",
    ),
    fetchProjectRows<ReadinessWorkPackage>(
      "work_packages",
      projectId,
      "id, project_id, wp_number, name, is_deleted, deleted_at",
    ),
    fetchProjectRows<DrawingSetEvidence>(
      "drawing_sets",
      projectId,
      "id, set_approval_status, is_deleted, deleted_at",
    ),
    fetchProjectRows<SubmittalEvidence>(
      "submittals",
      projectId,
      "id, status, ball_in_court, drawing_set_ids, current_round_id, submitted_date, updated_at, round_number, is_deleted, deleted_at",
    ),
    fetchProjectRows<SheetResponseEvidence>(
      "submittal_sheet_responses",
      projectId,
      "drawing_id, submittal_round_id, response_status, is_deleted, deleted_at",
    ),
    fetchProjectRows<DrawingRevisionEvidence>(
      "drawing_revisions",
      projectId,
      "id, drawing_id, is_current, archived_at, revision_code",
    ),
    fetchProjectRows<DrawingReviewEvidence>(
      "drawing_reviews",
      projectId,
      "drawing_revision_id, decision",
    ),
    fetchProjectRows<DrawingSignoffEvidence>(
      "drawing_signoffs",
      projectId,
      "drawing_id, drawing_revision_id, stamp_type, is_voided",
    ),
    fetchProjectRows<PieceCommentDispositionEvidence>(
      "submittal_comment_dispositions",
      projectId,
      "id, project_id, status, is_required, is_deleted, comment_text, comment_number, location, related_piece_ids, drawing_id, submittal_id",
    ),
  ]);

  return {
    pieces,
    pieceDrawings,
    drawings,
    workPackages,
    drawingSets,
    submittals,
    sheetResponses,
    drawingRevisions,
    drawingReviews,
    drawingSignoffs,
    commentDispositions,
  };
}

async function callRpc(name: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc(name, params);
  if (error) throw error;
  return data as Record<string, unknown>;
}

export function assignPiecesToWorkPackage(
  projectId: string,
  pieceIds: string[],
  workPackageId: string,
) {
  return callRpc("assign_pieces_to_work_package", {
    p_project_id: projectId,
    p_piece_ids: pieceIds,
    p_work_package_id: workPackageId,
  });
}

export function unassignPiecesFromWorkPackage(projectId: string, pieceIds: string[]) {
  return callRpc("unassign_pieces_from_work_package", {
    p_project_id: projectId,
    p_piece_ids: pieceIds,
  });
}

export function linkPieceDrawing(projectId: string, pieceId: string, drawingId: string) {
  return callRpc("link_piece_drawing", {
    p_project_id: projectId,
    p_piece_id: pieceId,
    p_drawing_id: drawingId,
  });
}

export function unlinkPieceDrawing(projectId: string, pieceId: string, drawingId: string) {
  return callRpc("unlink_piece_drawing", {
    p_project_id: projectId,
    p_piece_id: pieceId,
    p_drawing_id: drawingId,
  });
}
