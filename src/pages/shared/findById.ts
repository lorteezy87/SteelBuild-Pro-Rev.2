/**
 * Shared row lookup used across page shells.
 */
export function findById<T extends { id?: string | null }>(
  rows: T[] | null | undefined,
  id: string | null | undefined,
): T | null {
  if (!id) return null;
  return (rows || []).find((r) => r.id === id) || null;
}
