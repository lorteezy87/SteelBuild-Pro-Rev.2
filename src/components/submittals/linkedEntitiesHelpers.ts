import { buildIdMap } from "@/pages/shared/buildIdMap";

export { buildIdMap };

/** Items not already present in linkedIds (same semantics as !value.includes(id)). */
export function filterUnlinkedItems<T extends { id?: string | null }>(
  allItems: T[] | null | undefined,
  linkedIds: Array<string | null | undefined> | null | undefined,
): T[] {
  const value = linkedIds || [];
  return (allItems || []).filter((item) => !value.includes(item.id as any));
}
