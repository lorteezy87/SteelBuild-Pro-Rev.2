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

/** @deprecated Prefer `@/pages/shared/formatUsd`. */
export { formatUsd } from "@/pages/shared/formatUsd";
