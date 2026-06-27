import { parseDateUTC, toDateOnly } from "./scheduleDateUtils";
import { displayPct } from "./scheduleTaskUtils";

// Tree-sorting: parent/child hierarchy within each phase.
//
// Given a flat task list, returns a depth-first flattened tree. Parent rows are
// treated as true summary tasks: their displayed WBS, dates, duration, and
// percent complete roll up from their direct children.
export function buildTreeOrder(tasks, options = {}) {
  const { rootPrefix = null } = options;
  const input = Array.isArray(tasks) ? tasks : [];
  const taskIds = new Set(input.map((task) => task.id));
  const childMap = {};
  const roots = [];

  input.forEach((task) => {
    const parentId = task.parent_task_id;
    if (parentId && taskIds.has(parentId)) {
      if (!childMap[parentId]) childMap[parentId] = [];
      childMap[parentId].push(task);
    } else {
      roots.push(task);
    }
  });

  const sortByOrder = (a, b) => {
    const aHas = a.sort_order !== null && a.sort_order !== undefined;
    const bHas = b.sort_order !== null && b.sort_order !== undefined;
    if (aHas && bHas && a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (!a.start_date && b.start_date) return 1;
    if (a.start_date && !b.start_date) return -1;
    if (a.start_date && b.start_date) {
      const d = new Date(a.start_date) - new Date(b.start_date);
      if (d !== 0) return d;
    }
    if (a.created_at && b.created_at) return new Date(a.created_at) - new Date(b.created_at);
    return 0;
  };

  Object.values(childMap).forEach((children) => children.sort(sortByOrder));
  roots.sort(sortByOrder);

  const makeWbs = (parentWbs, siblingIndex, fallback) => {
    if (parentWbs) return `${parentWbs}.${siblingIndex + 1}`;
    if (rootPrefix !== null && rootPrefix !== undefined) return `${rootPrefix}.${siblingIndex + 1}`;
    return fallback || String(siblingIndex + 1);
  };

  const rollupSummary = (task, directChildren, displayWbs) => {
    if (!directChildren.length) {
      return {
        ...task,
        _stored_wbs_code: task.wbs_code || null,
        _wbsDisplayCode: displayWbs,
        _directChildrenCount: 0,
        _summaryTaskCount: 0,
        wbs_code: displayWbs,
      };
    }

    const starts = directChildren.map((child) => parseDateUTC(child.start_date)).filter(Boolean);
    const ends = directChildren.map((child) => parseDateUTC(child.end_date)).filter(Boolean);
    const minStart = starts.length ? new Date(Math.min(...starts.map((date) => date.getTime()))) : null;
    const maxEnd = ends.length ? new Date(Math.max(...ends.map((date) => date.getTime()))) : null;
    const summaryTaskCount = directChildren.reduce((sum, child) => sum + 1 + (Number(child._summaryTaskCount) || 0), 0);
    const pctTotal = directChildren.reduce((sum, child) => sum + displayPct(child), 0);
    const rolledPct = directChildren.length ? Math.round(pctTotal / directChildren.length) : displayPct(task);
    const rolledDuration = minStart && maxEnd
      ? Math.max(0, Math.round((maxEnd - minStart) / 86400000))
      : task.duration;

    return {
      ...task,
      _stored_wbs_code: task.wbs_code || null,
      _stored_start_date: task.start_date || null,
      _stored_end_date: task.end_date || null,
      _stored_duration: task.duration ?? null,
      _stored_percent_complete: task.percent_complete ?? null,
      _wbsDisplayCode: displayWbs,
      _directChildrenCount: directChildren.length,
      _summaryTaskCount: summaryTaskCount,
      _isRolledUpSummary: true,
      wbs_code: displayWbs,
      start_date: minStart ? toDateOnly(minStart) : task.start_date || null,
      end_date: maxEnd ? toDateOnly(maxEnd) : task.end_date || null,
      duration: rolledDuration,
      percent_complete: rolledPct,
      task_type: task.task_type || "Summary",
      is_summary: true,
    };
  };

  const walk = (task, depth, siblingIndex, parentWbs) => {
    const displayWbs = makeWbs(parentWbs, siblingIndex, task.wbs_code);
    const children = childMap[task.id] || [];
    const childRows = children.flatMap((child, index) => walk(child, depth + 1, index, displayWbs));
    const directChildren = childRows.filter((child) => child.parent_task_id === task.id);
    const rolledTask = rollupSummary(task, directChildren, displayWbs);

    return [
      {
        ...rolledTask,
        _depth: depth,
        _hasChildren: directChildren.length > 0,
      },
      ...childRows,
    ];
  };

  return roots.flatMap((root, index) => walk(root, 0, index, null));
}
