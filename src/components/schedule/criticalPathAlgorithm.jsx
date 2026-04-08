// Critical Path calculation for project scheduling

export function calculateCriticalPath(tasks) {
  if (!tasks || tasks.length === 0) return { criticalTaskIds: [], hasCycles: false };

  // Build dependency map
  const taskMap = {};
  const predecessorMap = {};
  const successorMap = {};

  tasks.forEach(task => {
    taskMap[task.id] = task;
    predecessorMap[task.id] = [];
    successorMap[task.id] = [];

    if (task.predecessor_ids) {
      const predIds = task.predecessor_ids.split(',').map(id => id.trim());
      predecessorMap[task.id] = predIds.filter(id => taskMap[id]);
    }
  });

  // Build successor map
  Object.entries(predecessorMap).forEach(([taskId, predIds]) => {
    predIds.forEach(predId => {
      if (!successorMap[predId]) successorMap[predId] = [];
      successorMap[predId].push(taskId);
    });
  });

  // ── Cycle detection (pre-validation) ────────────────────────────────────
  let hasCycles = false;
  const cycleEdges = new Set(); // Store "fromId->toId" strings for edges that form cycles

  function detectCycles() {
    const white = new Set(tasks.map(t => String(t.id))); // unvisited
    const gray = new Set();  // in current DFS path
    const black = new Set(); // fully processed

    function dfs(taskId) {
      white.delete(taskId);
      gray.add(taskId);

      const preds = predecessorMap[taskId] || [];
      for (const predId of preds) {
        if (black.has(predId)) continue;
        if (gray.has(predId)) {
          // Back-edge found — this dependency creates a cycle
          hasCycles = true;
          cycleEdges.add(`${taskId}->${predId}`);
          console.warn(`Circular dependency detected: task ${taskId} depends on ${predId}, which is an ancestor in the current path`);
          continue;
        }
        if (white.has(predId)) {
          dfs(predId);
        }
      }

      gray.delete(taskId);
      black.add(taskId);
    }

    for (const taskId of [...white]) {
      if (white.has(taskId)) {
        dfs(taskId);
      }
    }
  }

  detectCycles();

  // Find start tasks (no predecessors)
  const startTasks = tasks.filter(t => !predecessorMap[t.id] || predecessorMap[t.id].length === 0);

  if (startTasks.length === 0) return { criticalTaskIds: [], hasCycles };

  // Calculate earliest start/finish times
  const earliestStart = {};
  const earliestFinish = {};
  const visitedEarliest = new Set();

  function calculateEarliest(taskId, path = new Set()) {
    if (path.has(taskId)) {
      console.warn('Circular dependency detected at task:', taskId);
      return; // Break the cycle
    }
    if (visitedEarliest.has(taskId)) return;
    path.add(taskId);
    visitedEarliest.add(taskId);

    const task = taskMap[taskId];
    const preds = predecessorMap[taskId] || [];

    if (preds.length === 0) {
      earliestStart[taskId] = new Date(task.start_date).getTime();
    } else {
      let maxFinish = 0;
      preds.forEach(predId => {
        // Skip edges that form cycles
        if (cycleEdges.has(`${taskId}->${predId}`)) return;
        calculateEarliest(predId, path);
        const predTask = taskMap[predId];
        const lagDays = (predTask.lag_days || 0) * 86400000;
        maxFinish = Math.max(maxFinish, (earliestFinish[predId] || 0) + lagDays);
      });
      // If all predecessors were cycle edges, fall back to task's own start date
      if (maxFinish === 0) {
        earliestStart[taskId] = new Date(task.start_date).getTime();
      } else {
        earliestStart[taskId] = maxFinish;
      }
    }

    const duration = getDurationMs(task.start_date, task.end_date);
    earliestFinish[taskId] = earliestStart[taskId] + duration;

    path.delete(taskId); // Remove from current path when backtracking
  }

  tasks.forEach(t => calculateEarliest(t.id));

  // Find project end date
  const projectEnd = Math.max(...Object.values(earliestFinish));

  // Calculate latest start/finish times
  const latestFinish = {};
  const latestStart = {};
  const visitedLatest = new Set();

  function calculateLatest(taskId, path = new Set()) {
    if (path.has(taskId)) {
      console.warn('Circular dependency detected at task:', taskId);
      return; // Break the cycle
    }
    if (visitedLatest.has(taskId)) return;
    path.add(taskId);
    visitedLatest.add(taskId);

    const task = taskMap[taskId];
    const succs = successorMap[taskId] || [];

    if (succs.length === 0) {
      latestFinish[taskId] = projectEnd;
    } else {
      let minStart = Infinity;
      succs.forEach(succId => {
        // Skip edges that form cycles
        if (cycleEdges.has(`${succId}->${taskId}`)) return;
        calculateLatest(succId, path);
        const succTask = taskMap[succId];
        const lagDays = (succTask.lag_days || 0) * 86400000;
        minStart = Math.min(minStart, (latestStart[succId] || 0) - lagDays);
      });
      // If all successors were cycle edges, fall back to project end
      if (minStart === Infinity) {
        latestFinish[taskId] = projectEnd;
      } else {
        latestFinish[taskId] = minStart;
      }
    }

    const duration = getDurationMs(task.start_date, task.end_date);
    latestStart[taskId] = latestFinish[taskId] - duration;

    path.delete(taskId); // Remove from current path when backtracking
  }

  tasks.forEach(t => calculateLatest(t.id));

  // Find critical path (tasks with zero slack)
  const criticalTasks = tasks.filter(task => {
    const slack = (latestStart[task.id] || 0) - (earliestStart[task.id] || 0);
    return Math.abs(slack) < 1000; // Allow tiny floating point error
  });

  return { criticalTaskIds: criticalTasks.map(t => t.id), hasCycles };
}

function getDurationMs(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(0, end.getTime() - start.getTime());
}