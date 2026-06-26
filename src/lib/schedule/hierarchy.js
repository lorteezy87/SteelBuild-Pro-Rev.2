// Pure hierarchy helpers for schedule_tasks parent/child (WBS) editing.
// No React, no DB, no clock — testable in isolation and reused by every
// reparent surface (drag, drawer picker, bulk). The single home for "is this
// reparent legal" + "where does sort_order land", so the logic can't drift
// between entry points (the bug that produced the two-Gantt split-brain).

const MAX_DEPTH = 10000; // guard against corrupt pre-existing cycles in data

/** Index tasks by id once. */
function indexById(tasks) {
  const byId = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (t && t.id) byId.set(t.id, t);
  }
  return byId;
}

/**
 * True if making `childId` a child of `newParentId` would create a cycle
 * (self-parent, or newParentId is a descendant of childId). Walks the
 * ancestor chain of the prospective parent looking for childId. A depth
 * guard makes it safe against already-corrupt cyclic data.
 */
export function wouldCreateCycle(tasks, childId, newParentId) {
  if (!childId) return false;
  if (!newParentId) return false; // reparent to root is always legal
  if (newParentId === childId) return true; // self-parent
  const byId = indexById(tasks);
  let cursor = byId.get(newParentId);
  const visited = new Set();
  let depth = 0;
  while (cursor && depth < MAX_DEPTH) {
    if (cursor.id === childId) return true;
    if (visited.has(cursor.id)) return false; // corrupt loop, not our concern
    visited.add(cursor.id);
    cursor = cursor.parent_task_id ? byId.get(cursor.parent_task_id) : null;
    depth += 1;
  }
  return false;
}

/** Set of all descendant ids of `rootId` (not including rootId). */
function descendantIds(tasks, rootId) {
  const childMap = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || !t.id) continue;
    const p = t.parent_task_id;
    if (!p) continue;
    if (!childMap.has(p)) childMap.set(p, []);
    childMap.get(p).push(t.id);
  }
  const out = new Set();
  const stack = [...(childMap.get(rootId) || [])];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    for (const c of childMap.get(id) || []) stack.push(c);
  }
  return out;
}

/**
 * The set of task ids that are legal parents of `childId`: every task
 * except `childId` itself and its descendants. Used to filter parent
 * pickers so an illegal target is never offered.
 */
export function validReparentTargets(tasks, childId) {
  const banned = descendantIds(tasks, childId);
  banned.add(childId);
  const out = new Set();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (t && t.id && !banned.has(t.id)) out.add(t.id);
  }
  return out;
}

/** The direct children of `parentId` (null = root-level), sorted by sort_order. */
function siblingsOf(tasks, parentId) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((t) => t && (t.parent_task_id ?? null) === (parentId ?? null))
    .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity));
}

/**
 * Compute the sort_order for a task being placed under `newParentId`.
 *   - Nest drop (dropIndex == null): append → max(sibling.sort_order)+1000.
 *   - Gap drop (dropIndex provided): midpoint between the siblings that
 *     straddle dropIndex; at an end, neighbor ± 1000.
 * Null sibling sort_orders are seeded so the result is always a finite number.
 */
export function computeSiblingSortOrder(tasks, newParentId, dropIndex) {
  const sibs = siblingsOf(tasks, newParentId);
  if (dropIndex == null) {
    if (!sibs.length) return 1000;
    const maxOrder = Math.max(...sibs.map((s) => s.sort_order ?? 0));
    return maxOrder + 1000;
  }
  const before = sibs[dropIndex - 1];
  const after = sibs[dropIndex];
  const beforeOrder = before?.sort_order ?? null;
  const afterOrder = after?.sort_order ?? null;
  if (beforeOrder == null && afterOrder == null) return 1000;
  if (beforeOrder == null) return afterOrder - 1000;
  if (afterOrder == null) return beforeOrder + 1000;
  return Math.round((beforeOrder + afterOrder) / 2);
}
