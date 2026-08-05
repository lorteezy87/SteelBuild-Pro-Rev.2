/**
 * Soft-delete filter used across page shells.
 * Live rows are those without is_deleted === true.
 */
export type SoftDeletable = { is_deleted?: boolean | null };

export function filterLiveRecords<T extends SoftDeletable>(
  rows: T[] | null | undefined,
): T[] {
  return (rows || []).filter((r) => !r?.is_deleted);
}
