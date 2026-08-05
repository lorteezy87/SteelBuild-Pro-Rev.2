/** Pure id-array coerce + linked-task filter for RelatedScheduleTasksChips. */

export function asIdArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function filterTasksLinkedToTarget<
  T extends Record<string, unknown> & { id?: string },
>(
  tasks: T[] | null | undefined,
  relatedField: string,
  targetId: string | null | undefined,
): T[] {
  if (!targetId) return [];
  return (tasks || []).filter((t) =>
    asIdArray(t[relatedField]).includes(targetId),
  );
}
