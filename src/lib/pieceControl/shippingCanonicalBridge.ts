import { normalizePieceMark } from "./identity";

export interface ShippingListPieceRef {
  mark?: string | null;
}

export interface ShippingListLoadRef {
  pieces?: ShippingListPieceRef[] | null;
  ship_date?: string | null;
  load_number?: string | null;
}

export interface CanonicalShipCandidate {
  id: string;
  piece_mark: string;
  lifecycle_status: string;
  on_hold: boolean;
  is_container?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  parent_piece_id?: string | null;
}

export interface CanonicalShipResolution {
  shipIds: string[];
  skipped: Array<{ mark: string; reason: string }>;
}

/**
 * Exact piece-mark matching only. Never guesses. Only fabricated, non-held,
 * actionable leaf lots are eligible to advance to shipped.
 */
export function resolveCanonicalShipTargets(
  loads: ShippingListLoadRef[],
  pieces: CanonicalShipCandidate[],
): CanonicalShipResolution {
  const marks = new Set<string>();
  for (const load of loads) {
    for (const piece of load.pieces || []) {
      const mark = normalizePieceMark(piece.mark);
      if (mark) marks.add(mark);
    }
  }

  const active = (pieces || []).filter(
    (piece) => !piece.is_deleted && !piece.deleted_at,
  );
  const parentIds = new Set(
    active
      .map((piece) => piece.parent_piece_id)
      .filter((id): id is string => Boolean(id)),
  );

  const byMark = new Map<string, CanonicalShipCandidate[]>();
  for (const piece of active) {
    const mark = normalizePieceMark(piece.piece_mark);
    if (!mark || !marks.has(mark)) continue;
    const list = byMark.get(mark) ?? [];
    list.push(piece);
    byMark.set(mark, list);
  }

  const shipIds: string[] = [];
  const skipped: Array<{ mark: string; reason: string }> = [];

  for (const mark of marks) {
    const candidates = (byMark.get(mark) ?? []).filter(
      (piece) => !piece.is_container && !parentIds.has(piece.id),
    );
    if (candidates.length === 0) {
      skipped.push({ mark, reason: "No canonical leaf lot matched this mark" });
      continue;
    }
    if (candidates.length > 1) {
      const fabricated = candidates.filter((piece) => piece.lifecycle_status === "fabricated" && !piece.on_hold);
      if (fabricated.length !== 1) {
        skipped.push({
          mark,
          reason: "Ambiguous canonical lots for this mark — resolve lots before shipping",
        });
        continue;
      }
      shipIds.push(fabricated[0].id);
      continue;
    }

    const piece = candidates[0];
    if (piece.on_hold) {
      skipped.push({ mark, reason: "Piece is on hold" });
      continue;
    }
    if (piece.lifecycle_status !== "fabricated") {
      skipped.push({
        mark,
        reason: `Requires Fabricated status (current: ${piece.lifecycle_status})`,
      });
      continue;
    }
    shipIds.push(piece.id);
  }

  return { shipIds: Array.from(new Set(shipIds)), skipped };
}
