/** Pure stage buckets + summary for SubmittalVisualBoard. */

export function bucketBoardItemsByStage<T extends { stage?: string | null }>(
  boardItems: T[],
  stageOrder: readonly string[],
  fallbackStage = "Not Started",
): Record<string, T[]> {
  const buckets = Object.fromEntries(stageOrder.map((stage) => [stage, [] as T[]])) as Record<
    string,
    T[]
  >;
  for (const item of boardItems) {
    const key = stageOrder.includes(item.stage as string)
      ? (item.stage as string)
      : fallbackStage;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(item);
  }
  return buckets;
}

export function summarizeBoardItems(
  allItems: Array<{
    due?: { overdue?: boolean; dueSoon?: boolean };
    needsAction?: boolean;
    linked?: boolean;
    stage?: string | null;
  }>,
) {
  return {
    total: allItems.length,
    overdue: allItems.filter((item) => item.due?.overdue).length,
    dueSoon: allItems.filter((item) => item.due?.dueSoon).length,
    needsAction: allItems.filter((item) => item.needsAction).length,
    unlinked: allItems.filter((item) => !item.linked).length,
    released: allItems.filter((item) => item.stage === "Released").length,
  };
}
