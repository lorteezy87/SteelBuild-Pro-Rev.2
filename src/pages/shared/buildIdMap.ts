/** Build id → row map for register/detail lookups. */
export function buildIdMap<T extends { id?: string | null }>(
  rows: T[] | null | undefined,
): Map<string, T> {
  return new Map(
    (rows || [])
      .filter((r): r is T & { id: string } => Boolean(r?.id))
      .map((r) => [r.id as string, r]),
  );
}
