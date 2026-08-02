/**
 * Resolve RFI metadata.piece_marks → currently on-hold piece IDs and clear them.
 * Pure lookup + setPieceHold; caller owns toast / invalidation.
 */
import { supabase } from "@/lib/supabase";
import { normalizePieceMark } from "@/lib/pieceControl/identity";
import { setPieceHold } from "@/lib/pieceControl/productionRepository";

export function parseRfiPieceMarks(pieceMarks: unknown): string[] {
  return String(pieceMarks ?? "")
    .split(/[,\s]+/)
    .map(normalizePieceMark)
    .filter(Boolean);
}

export async function releaseHoldsForRfiMarks(opts: {
  projectId: string;
  pieceMarks: unknown;
  reason?: string;
}): Promise<{ releasedCount: number; pieceIds: string[] }> {
  const marks = parseRfiPieceMarks(opts.pieceMarks);
  if (!marks.length) return { releasedCount: 0, pieceIds: [] };

  const { data, error } = await (supabase as any)
    .from("pieces")
    .select("id, on_hold")
    .eq("project_id", opts.projectId)
    .in("normalized_piece_mark", marks)
    .eq("is_deleted", false)
    .is("deleted_at", null);
  if (error) throw error;

  const ids = (data ?? [])
    .filter((p: { on_hold?: boolean }) => Boolean(p.on_hold))
    .map((p: { id: string }) => p.id);

  if (!ids.length) return { releasedCount: 0, pieceIds: [] };

  await setPieceHold(opts.projectId, ids, false, opts.reason);
  return { releasedCount: ids.length, pieceIds: ids };
}
