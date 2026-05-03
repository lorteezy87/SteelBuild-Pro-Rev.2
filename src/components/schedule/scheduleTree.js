// ── Tree-sorting: parent/child hierarchy within each phase ───────────
//
// Extracted from ScheduleGantt.jsx. Pure data transform — given a flat
// list of tasks (each with optional parent_task_id, sort_order,
// start_date, created_at), returns a depth-first flattened array where
// each node carries `_depth` and `_hasChildren` flags used by the Gantt
// for indentation and expand/collapse rendering.
export function buildTreeOrder(tasks) {
  // Build parent→children map
  const childMap = {};
  const roots = [];
  tasks.forEach(t => {
    const pid = t.parent_task_id;
    if (pid && tasks.some(p => p.id === pid)) {
      if (!childMap[pid]) childMap[pid] = [];
      childMap[pid].push(t);
    } else {
      roots.push(t);
    }
  });
  // Order within each sibling group:
  //   1. Prefer sort_order (manually set by the user via Move Up /
  //      Move Down). Lower value = higher on screen.
  //   2. Tasks without a sort_order fall to the end and then sort by
  //      start_date, so newly-created rows still slot in chronologically
  //      until a user moves them explicitly.
  //   3. created_at is the final tiebreaker so render order stays
  //      stable across refreshes when two rows are otherwise equal.
  const sortByOrder = (a, b) => {
    const aHas = a.sort_order !== null && a.sort_order !== undefined;
    const bHas = b.sort_order !== null && b.sort_order !== undefined;
    if (aHas && bHas && a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    // Fallback to start_date
    if (!a.start_date && b.start_date) return 1;
    if (a.start_date && !b.start_date) return -1;
    if (a.start_date && b.start_date) {
      const d = new Date(a.start_date) - new Date(b.start_date);
      if (d !== 0) return d;
    }
    // Last-resort stable tiebreaker: created_at
    if (a.created_at && b.created_at) return new Date(a.created_at) - new Date(b.created_at);
    return 0;
  };
  Object.values(childMap).forEach(arr => arr.sort(sortByOrder));
  roots.sort(sortByOrder);

  // DFS flatten
  const result = [];
  const walk = (node, depth) => {
    result.push({ ...node, _depth: depth, _hasChildren: !!(childMap[node.id]?.length) });
    (childMap[node.id] || []).forEach(child => walk(child, depth + 1));
  };
  roots.forEach(r => walk(r, 0));
  return result;
}
