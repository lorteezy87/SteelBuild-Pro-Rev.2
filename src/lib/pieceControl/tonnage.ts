import { PieceWeightInputs } from "./types";

const normalizeNumeric = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
};

const pieceWeightFallback = (value: PieceWeightInputs): number | null => {
  const totalLbs = normalizeNumeric(value.weight_total_lbs);
  if (totalLbs !== null) return totalLbs;

  const eachLbs = normalizeNumeric(value.weight_each_lbs);
  const quantity = normalizeNumeric(value.quantity);
  if (eachLbs === null || quantity === null) return null;

  return eachLbs * quantity;
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

