/**
 * Pure helpers for Backcharges page shell.
 */
export function buildIdMap<T extends { id?: string | null }>(
  rows: T[],
): Map<string, T> {
  return new Map(
    (rows || [])
      .filter((r): r is T & { id: string } => Boolean(r?.id))
      .map((r) => [r.id as string, r]),
  );
}

/** Currency display used by Backcharges form/detail panels. */
export function formatUsd(n: unknown): string {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
