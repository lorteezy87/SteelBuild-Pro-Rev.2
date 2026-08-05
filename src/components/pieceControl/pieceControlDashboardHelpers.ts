/**
 * Pure shadow-mode register vs legacy production comparison.
 */
import { rollupCanonicalPieces } from "@/lib/pieceControl/canonicalRollups";

export function computeShadowComparison(args: {
  mode: string;
  pieces: unknown[] | null | undefined;
  legacyProduction:
    | Array<{ quantity?: number | string | null; weight?: number | string | null }>
    | null
    | undefined;
}): { pieceDelta: number; tonsDelta: number } | null {
  const { mode, pieces, legacyProduction } = args;
  if (mode !== "shadow" || !pieces) return null;

  const registerRollup = rollupCanonicalPieces(pieces as any);
  const legacy = legacyProduction || [];
  const existingPieceCount = legacy.reduce(
    (total, row) => total + (Number(row.quantity) || 0),
    0,
  );
  const existingTons = legacy.reduce(
    (total, row) =>
      row.weight == null
        ? total
        : total + (Number(row.weight) * (Number(row.quantity) || 1)) / 2000,
    0,
  );
  const pieceDelta = registerRollup.pieceCount - existingPieceCount;
  const tonsDelta = registerRollup.knownTons - existingTons;

  if (Math.abs(pieceDelta) < 1 && Math.abs(tonsDelta) < 0.1) return null;
  return { pieceDelta, tonsDelta };
}
