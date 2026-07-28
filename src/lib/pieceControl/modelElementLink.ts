/**
 * Client-side lot-aware mark matching (mirrors link_model_elements_to_pieces).
 * Used for unit tests and any pre-flight UI; the DB RPC is authoritative.
 *
 * Large IFC rosters are linked via the paged RPC so each call stays under the
 * API statement_timeout (the full-project RPC can still time out on big models).
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

export type LinkModelElementsSummary = {
  project_id: string;
  linked: number;
  unchanged: number;
  unmatched: number;
  ambiguous: number;
};

type LinkPageResult = LinkModelElementsSummary & {
  processed?: number;
  next_after_id?: string | null;
  done?: boolean;
};

/** Elements processed per RPC page — keep well under statement_timeout. */
export const LINK_MODEL_ELEMENTS_PAGE_SIZE = 1500;

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

export function accumulateLinkPage(
  totals: LinkModelElementsSummary,
  page: Pick<
    LinkPageResult,
    "linked" | "unchanged" | "unmatched" | "ambiguous"
  >,
): LinkModelElementsSummary {
  return {
    project_id: totals.project_id,
    linked: totals.linked + (page.linked ?? 0),
    unchanged: totals.unchanged + (page.unchanged ?? 0),
    unmatched: totals.unmatched + (page.unmatched ?? 0),
    ambiguous: totals.ambiguous + (page.ambiguous ?? 0),
  };
}

async function linkModelElementsPage(
  projectId: string,
  afterId: string | null,
  limit: number,
): Promise<LinkPageResult> {
  const db = supabase as any;
  const { data, error } = await db.rpc("link_model_elements_to_pieces_page", {
    p_project_id: projectId,
    p_limit: limit,
    p_after_id: afterId,
  });
  if (error) throw error;
  return data as LinkPageResult;
}

/**
 * Link roster marks to canonical piece lots.
 * Uses paged RPCs when available; falls back to the full-project RPC once.
 */
export async function linkModelElementsToPieces(
  projectId: string,
  options?: { pageSize?: number },
): Promise<LinkModelElementsSummary> {
  const pageSize = options?.pageSize ?? LINK_MODEL_ELEMENTS_PAGE_SIZE;
  let totals: LinkModelElementsSummary = {
    project_id: projectId,
    linked: 0,
    unchanged: 0,
    unmatched: 0,
    ambiguous: 0,
  };
  let afterId: string | null = null;
  let guard = 0;

  try {
    for (;;) {
      guard += 1;
      if (guard > 10_000) {
        throw new Error("Link marks exceeded the maximum number of pages.");
      }
      const page = await linkModelElementsPage(projectId, afterId, pageSize);
      totals = accumulateLinkPage(totals, page);
      if (page.done || !page.next_after_id || (page.processed ?? 0) === 0) {
        return totals;
      }
      afterId = page.next_after_id;
    }
  } catch (error: any) {
    const message = String(error?.message ?? error ?? "");
    const missingPageRpc =
      /link_model_elements_to_pieces_page/i.test(message) ||
      /could not find the function/i.test(message) ||
      /PGRST202/i.test(message) ||
      error?.code === "PGRST202";
    if (!missingPageRpc || afterId !== null || totals.linked + totals.unchanged + totals.unmatched + totals.ambiguous > 0) {
      throw error;
    }
    // Older DBs without the page RPC: one-shot full link.
    const db = supabase as any;
    const { data, error: fullError } = await db.rpc(
      "link_model_elements_to_pieces",
      { p_project_id: projectId },
    );
    if (fullError) throw fullError;
    return data as LinkModelElementsSummary;
  }
}
