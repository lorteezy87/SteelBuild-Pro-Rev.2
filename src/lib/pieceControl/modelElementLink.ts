/**
 * Client-side lot-aware mark matching (mirrors link_model_elements_to_pieces).
 * Used for unit tests and any pre-flight UI; the DB RPC is authoritative.
 */

import { supabase } from "@/lib/supabase";

export interface LinkCandidatePiece {
  id: string;
  normalized_piece_mark: string;
  lot_code: string;
  is_container?: boolean;
  parent_piece_id?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

export interface LinkCandidateElement {
  id: string;
  piece_mark: string;
  metadata?: Record<string, unknown> | null;
  piece_id?: string | null;
}

export type LinkMatchResult =
  | { kind: "linked"; pieceId: string }
  | { kind: "unchanged"; pieceId: string }
  | { kind: "unmatched" }
  | { kind: "ambiguous"; count: number };

function normalizeMark(mark: string): string {
  return String(mark ?? "").trim().toUpperCase();
}

function isActionableLeaf(
  piece: LinkCandidatePiece,
  all: LinkCandidatePiece[],
): boolean {
  if (piece.is_deleted || piece.deleted_at) return false;
  if (piece.is_container) return false;
  const hasChild = all.some(
    (other) =>
      other.parent_piece_id === piece.id &&
      !other.is_deleted &&
      !other.deleted_at,
  );
  return !hasChild;
}

export function matchElementToPiece(
  element: LinkCandidateElement,
  pieces: LinkCandidatePiece[],
): LinkMatchResult {
  const mark = normalizeMark(element.piece_mark);
  if (!mark) return { kind: "unmatched" };

  const lotRaw = element.metadata?.lot_code;
  const lot =
    typeof lotRaw === "string" && lotRaw.trim() ? lotRaw.trim() : null;

  const leaves = pieces.filter((p) => isActionableLeaf(p, pieces));
  const matches = leaves.filter((p) => {
    if (p.normalized_piece_mark !== mark) return false;
    if (lot !== null) return p.lot_code === lot;
    return true;
  });

  if (matches.length === 0) return { kind: "unmatched" };
  if (matches.length > 1) return { kind: "ambiguous", count: matches.length };
  const pieceId = matches[0].id;
  if (element.piece_id === pieceId) return { kind: "unchanged", pieceId };
  return { kind: "linked", pieceId };
}

export async function linkModelElementsToPieces(projectId: string) {
  const db = supabase as any;
  const { data, error } = await db.rpc("link_model_elements_to_pieces", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return data as {
    project_id: string;
    linked: number;
    unchanged: number;
    unmatched: number;
    ambiguous: number;
  };
}
