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

export interface TonnageRollup {
  /** Tons from pieces that HAVE a resolvable weight. */
  tons: number;
  /** Pieces counted in `tons`. */
  weighedCount: number;
  /**
   * Pieces with no resolvable weight. They contribute 0 tons — surface this,
   * don't ignore it.
   */
  unknownWeightCount: number;
  /** True when at least one piece has no weight, so `tons` is a FLOOR. */
  partial: boolean;
}

/**
 * sumPieceTons() with the missing-data signal attached.
 *
 * sumPieceTons treats a piece with no resolvable weight as 0 tons, which is
 * arithmetically the only option but silently under-reports the total with no
 * indication. Tonnage drives shipping, billing lines and production percent for
 * a fabricator, so "142 tons" and "142 tons plus 38 pieces we couldn't weigh"
 * are very different numbers to hand someone.
 *
 * sumPieceTons is left exactly as it was — plenty of call sites just want the
 * number — but anything that DISPLAYS or BILLS a tonnage should use this and
 * show the partial flag.
 */
export function rollupPieceTons(
  pieces: Array<PieceWeightInputs> | null | undefined,
): TonnageRollup {
  if (!pieces?.length) {
    return { tons: 0, weighedCount: 0, unknownWeightCount: 0, partial: false };
  }

  let tons = 0;
  let weighedCount = 0;
  let unknownWeightCount = 0;

  for (const piece of pieces) {
    const pieceTonnage = pieceTons(piece);
    if (pieceTonnage === null) {
      unknownWeightCount += 1;
    } else {
      tons += pieceTonnage;
      weighedCount += 1;
    }
  }

  return { tons, weighedCount, unknownWeightCount, partial: unknownWeightCount > 0 };
}
