// Critical Path calculation for project scheduling

export function calculateCriticalPath(tasks) {
  if (!tasks || tasks.length === 0) return [];

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

  // Find start tasks (no predecessors)
  const startTasks = tasks.filter(t => !predecessorMap[t.id] || predecessorMap[t.id].length === 0);

  if (startTasks.length === 0) return [];

  // Calculate earliest start/finish times
  const earliestStart = {};
  const earliestFinish = {};
  const visited = new Set();

  function calculateEarliest(taskId) {
    if (visited.has(taskId)) return;
    visited.add(taskId);

    const task = taskMap[taskId];
    const preds = predecessorMap[taskId] || [];

    if (preds.length === 0) {
      earliestStart[taskId] = new Date(task.start_date).getTime();
    } else {
      let maxFinish = 0;
      preds.forEach(predId => {
        calculateEarliest(predId);
        const predTask = taskMap[predId];
        const lagDays = (predTask.lag_days || 0) * 86400000;
        maxFinish = Math.max(maxFinish, (earliestFinish[predId] || 0) + lagDays);
      });
      earliestStart[taskId] = maxFinish;
    }

    const duration = getDurationMs(task.start_date, task.end_date);
    earliestFinish[taskId] = earliestStart[taskId] + duration;
  }

  tasks.forEach(t => calculateEarliest(t.id));

  // Find project end date
  const projectEnd = Math.max(...Object.values(earliestFinish));

  // Calculate latest start/finish times
  const latestFinish = {};
  const latestStart = {};
  visited.clear();

  function calculateLatest(taskId) {
    if (visited.has(taskId)) return;
    visited.add(taskId);

    const task = taskMap[taskId];
    const succs = successorMap[taskId] || [];

    if (succs.length === 0) {
      latestFinish[taskId] = projectEnd;
    } else {
      let minStart = Infinity;
      succs.forEach(succId => {
        calculateLatest(succId);
        const succTask = taskMap[succId];
        const lagDays = (succTask.lag_days || 0) * 86400000;
        minStart = Math.min(minStart, (latestStart[succId] || 0) - lagDays);
      });
      latestFinish[taskId] = minStart;
    }

    const duration = getDurationMs(task.start_date, task.end_date);
    latestStart[taskId] = latestFinish[taskId] - duration;
  }

  tasks.forEach(t => calculateLatest(t.id));

  // Find critical path (tasks with zero slack)
  const criticalTasks = tasks.filter(task => {
    const slack = (latestStart[task.id] || 0) - (earliestStart[task.id] || 0);
    return Math.abs(slack) < 1000; // Allow tiny floating point error
  });

  return criticalTasks.map(t => t.id);
}

function getDurationMs(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(0, end.getTime() - start.getTime());
}