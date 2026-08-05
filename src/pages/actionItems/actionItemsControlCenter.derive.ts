/**
 * Pure derivations for the Action Items Control Center (canonical presentation redesign).
 * No React, no network. All inputs come from the real action_items rows.
 */
import { daysUntil as libDaysUntil } from "@/lib/dateMath";
import { ACTION_ITEM_STATUS } from "@/lib/enums";

/** Canonical shape we consume from the entity rows. */
export interface ActionItemRecord {
  id: string;
  title: string | null;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  due_date: string | null;
  category: string | null;
  project_area: string | null;
  constraint_type: string | null;
  meeting_reference: string | null;
  project_id: string;
  project_name: string | null;
  metadata: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Per-owner summary in the "By Owner" decision panel. */
export interface OwnerSummaryRow {
  owner: string;
  count: number;
  overdueCount: number;
  criticalCount: number;
}

export interface ActionItemsSummary {
  total: number;
  open: number;
  overdue: number;
  dueToday: number;
  critical: number;
  completed: number;
  /** Active = not complete, not cancelled. */
  active: number;
  /** Completion % across ALL items (including setup). */
  completionPct: number;
  /** Top 6 items ranked for today's priority queue. */
  todayQueue: ActionItemRecord[];
  /** Active items that are overdue (no owner) or missing an owner — "stuck / blocked" sense. */
  waitingQueue: ActionItemRecord[];
  /** Per-owner breakdown for the third decision panel. */
  byOwner: OwnerSummaryRow[];
}

const ACTIVE_STATUSES = new Set<string>([
  ACTION_ITEM_STATUS.OPEN,
  ACTION_ITEM_STATUS.IN_PROGRESS,
]);

/** Days until due_date using the shared dateMath helper. Returns Infinity if no date. */
function daysUntilDue(item: ActionItemRecord): number {
  return libDaysUntil(item.due_date);
}

/** True when the item is active and past its due date. */
export function isOverdue(item: ActionItemRecord): boolean {
  if (!ACTIVE_STATUSES.has(item.status)) return false;
  if (!item.due_date) return false;
  return daysUntilDue(item) < 0;
}

/** Priority weight used for consistent ranking across both queues. */
function priorityScore(item: ActionItemRecord): number {
  let s = 0;
  if (item.priority === "Critical") s += 50;
  else if (item.priority === "High") s += 35;
  else if (item.priority === "Medium") s += 20;
  const d = daysUntilDue(item);
  if (d < 0) s += 60 + Math.min(30, Math.abs(d) * 4); // overdue
  else if (d === 0) s += 45;
  else if (d === 1) s += 30;
  else if (d === 2) s += 20;
  if (!item.assigned_to) s += 12; // unowned → bump
  return s;
}

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

/** Group active items by owner → count + overdue + critical. */
function ownerBreakdown(active: ActionItemRecord[]): OwnerSummaryRow[] {
  const map = new Map<string, OwnerSummaryRow>();
  for (const item of active) {
    const owner = item.assigned_to || "Unassigned";
    const existing = map.get(owner);
    if (existing) {
      existing.count++;
      if (isOverdue(item)) existing.overdueCount++;
      if (item.priority === "Critical") existing.criticalCount++;
    } else {
      map.set(owner, {
        owner,
        count: 1,
        overdueCount: isOverdue(item) ? 1 : 0,
        criticalCount: item.priority === "Critical" ? 1 : 0,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/**
 * All KPIs + queues for the Action Items Control Center.
 * Excludes SETUP-category items from KPI and queue counts, mirroring the
 * classic ActionItems.jsx which separates setup items from action items.
 */
export function buildActionItemsSummary(
  rows: ActionItemRecord[]
): ActionItemsSummary {
  // Mirror the classic page: SETUP items are a separate checklist, not in stats.
  const actionItems = rows.filter((r) => r.category !== "SETUP");

  const active = actionItems.filter((r) => ACTIVE_STATUSES.has(r.status));
  const completed = actionItems.filter(
    (r) => r.status === ACTION_ITEM_STATUS.COMPLETE
  );
  const overdue = active.filter((r) => isOverdue(r));
  const dueToday = active.filter((r) => {
    const d = daysUntilDue(r);
    return Number.isFinite(d) && d === 0;
  });
  const critical = active.filter((r) => r.priority === "Critical");

  // Today queue: top 6 active items by priority score.
  const byScore = [...active].sort(
    (a, b) => priorityScore(b) - priorityScore(a)
  );
  const todayQueue = byScore.slice(0, 6);

  // Waiting queue: overdue active items + active items with no owner (stuck).
  const waitingSet = new Set<string>();
  const waitingQueue: ActionItemRecord[] = [];
  for (const item of byScore) {
    if (isOverdue(item) || !item.assigned_to) {
      if (!waitingSet.has(item.id)) {
        waitingSet.add(item.id);
        waitingQueue.push(item);
      }
    }
    if (waitingQueue.length >= 6) break;
  }

  return {
    total: actionItems.length,
    open: actionItems.filter((r) => r.status === ACTION_ITEM_STATUS.OPEN).length,
    overdue: overdue.length,
    dueToday: dueToday.length,
    critical: critical.length,
    completed: completed.length,
    active: active.length,
    completionPct: percent(completed.length, actionItems.length),
    todayQueue,
    waitingQueue,
    byOwner: ownerBreakdown(active),
  };
}
