/**
 * sortLogic.js — Default sort comparator for the Command Center feed.
 *
 * Priority order:
 *   1. Overdue first, by daysValue descending (most overdue wins)
 *   2. Blocking / critical-path items
 *   3. Due this week (due-soon)
 *   4. Awaiting others, oldest first
 *   5. Normal, by daysValue descending (oldest first)
 */

const URGENCY_RANK = {
  overdue:  0,
  blocking: 1,
  "due-soon": 2,
  awaiting: 3,
  normal:   4,
};

/**
 * Compare two feed items for sorting.
 * Items with lower urgency rank sort first;
 * within the same rank, higher daysValue sorts first (more urgent).
 */
export function defaultFeedSort(a, b) {
  const rankA = URGENCY_RANK[a.urgency] ?? 5;
  const rankB = URGENCY_RANK[b.urgency] ?? 5;

  if (rankA !== rankB) return rankA - rankB;

  // Within the same urgency bucket, higher daysValue = more urgent
  return (b.daysValue || 0) - (a.daysValue || 0);
}

/**
 * Urgency bucket labels for grouping in the UI.
 */
export const URGENCY_LABELS = {
  overdue:    "Overdue",
  blocking:   "Blocking",
  "due-soon": "Due Soon",
  awaiting:   "Awaiting Others",
  normal:     "Open Items",
};
