import { PieceWeightInputs } from "./types";

const normalizeNumeric = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
};

/**
 * Prefer each × quantity when both total and each are present and disagree.
 * Prevents a stale weight_total_lbs from silently inflating tonnage after qty edits.
 */
const pieceWeightFallback = (value: PieceWeightInputs): number | null => {
  const eachLbs = normalizeNumeric(value.weight_each_lbs);
  const quantity = normalizeNumeric(value.quantity);
  const fromEach =
    eachLbs !== null && quantity !== null ? eachLbs * quantity : null;
  const totalLbs = normalizeNumeric(value.weight_total_lbs);

  if (fromEach !== null && totalLbs !== null) {
    const tolerance = Math.max(0.01, totalLbs * 0.01);
    if (Math.abs(fromEach - totalLbs) > tolerance) return fromEach;
  }
  if (totalLbs !== null) return totalLbs;
  return fromEach;
};

export function pieceTotalWeightLbs(piece: PieceWeightInputs): number | null {
  return pieceWeightFallback(piece);
}

export function pieceTons(piece: PieceWeightInputs): number | null {
  const weightLbs = pieceTotalWeightLbs(piece);
  if (weightLbs === null) return null;
  return weightLbs / 2000;
}

export function sumPieceTons(pieces: Array<PieceWeightInputs> | null | undefined): number {
  if (!pieces?.length) return 0;

  return pieces.reduce((total, piece) => {
    const tons = pieceTons(piece);
    return total + (tons ?? 0);
  }, 0);
}
