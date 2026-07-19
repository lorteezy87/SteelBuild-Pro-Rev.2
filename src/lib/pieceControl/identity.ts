/** Canonical piece-mark normalization shared by piece-control and legacy readers. */
export function normalizePieceMark(mark: unknown): string {
  return String(mark ?? "").trim().toUpperCase();
}

