/**
 * fieldLookahead.js — Generate a field look-ahead report for superintendents
 * and erection foremen.
 *
 * The look-ahead is a filterable (2/3/4 week) printable HTML table optimized
 * for field use: large text, high contrast, landscape orientation, crew/resource
 * grouping. Generates a new window with print-ready HTML that the user can
 * Ctrl+P to PDF or send directly to a plotter.
 *
 * Columns: Task Name, Crew/Resource, Start Date, Duration, Predecessor Info, Status
 *
 * Design choices:
 *   - Pure HTML generation (no PDF library needed — browser print-to-PDF
 *     gives better results than jsPDF for tabular field reports).
 *   - Monospace fonts for dates and numbers (matches SBD design system).
 *   - Color-coded status (matches app's status token system).
 *   - Grouped by week for easy daily standup reference.
 */

/**
 * Filter tasks to the specified look-ahead window.
 *
 * @param {Array} tasks - All schedule tasks (with effective dates applied)
 * @param {number} weeks - Number of weeks ahead (2, 3, or 4)
 * @returns {Array} Tasks within the look-ahead window
 */
export function filterLookaheadTasks(tasks, weeks = 3) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + weeks * 7);

  return tasks.filter((t) => {
    if (t.status === "Complete") return false; // skip completed
    const start = t.start_date ? new Date(t.start_date + "T00:00:00") : null;
    const end = t.end_date ? new Date(t.end_date + "T00:00:00") : null;
    const taskStart = start || end;
    const taskEnd = end || start;
    if (!taskStart || !taskEnd) return false;
    // Task intersects the look-ahead window
    return taskStart <= endDate && taskEnd >= today;
  });
}

/**
 * Group tasks by calendar week (Monday start).
 */
function groupByWeek(tasks) {
  const groups = {};
  tasks.forEach((t) => {
    const d = new Date((t.start_date || t.end_date) + "T00:00:00");
    // Find Monday of this week
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  // Sort weeks chronologically
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, weekTasks]) => ({
      weekStart,
      weekLabel: formatWeekLabel(weekStart),
      tasks: weekTasks.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "")),
    }));
}

function formatWeekLabel(mondayStr) {
  const d = new Date(mondayStr + "T00:00:00");
  const fri = new Date(d);
  fri.setDate(fri.getDate() + 4);
  const opts = { month: "short", day: "numeric" };
  return `Week of ${d.toLocaleDateString("en-US", opts)} - ${fri.toLocaleDateString("en-US", opts)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "--";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
}

function statusColor(status) {
  switch (status) {
    case "In Progress": return "#d97706";
    case "Delayed": return "#dc2626";
    case "Not Started": return "#6b7280";
    default: return "#374151";
  }
}

/**
 * Build the dependency display string for a task.
 */
function buildPredecessorInfo(task, allTasks) {
  const deps = parseDeps(task.dependencies);
  if (!deps.length) return "--";
  const taskMap = {};
  allTasks.forEach((t) => { taskMap[t.id] = t; });
  return deps.map((d) => {
    const pred = taskMap[d.id];
    return pred?.task_name || `Task #${d.id}`;
  }).join(", ");
}

function parseDeps(deps) {
  if (!deps) return [];
  if (typeof deps === "string") {
    try {
      const parsed = JSON.parse(deps);
      if (Array.isArray(parsed)) return parsed;
    } catch { return []; }
  }
  if (Array.isArray(deps)) return deps;
  return [];
}

/**
 * Generate and open a printable field look-ahead report.
 *
 * @param {object} opts
 * @param {Array}  opts.tasks        - All schedule tasks (effective dates)
 * @param {Array}  opts.allTasks     - Full task list (for predecessor resolution)
 * @param {number} opts.weeks        - Look-ahead window (2, 3, or 4)
 * @param {object} opts.project      - { name, project_number }
 */
export function openFieldLookahead({ tasks, allTasks, weeks = 3, project = {} }) {
  const filtered = filterLookaheadTasks(tasks, weeks);
  const weekGroups = groupByWeek(filtered);
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${weeks}-Week Look-Ahead — ${project.name || "Project"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page {
      size: landscape;
      margin: 0.5in;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11px;
      color: #1a1a1a;
      background: #fff;
      padding: 16px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 3px solid #1a1a1a;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .header h1 {
      font-size: 18px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .header .meta {
      font-family: 'IBM Plex Mono', 'Consolas', monospace;
      font-size: 9px;
      text-align: right;
      color: #555;
    }
    .week-group {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .week-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: #1a1a1a;
      color: #fff;
      padding: 4px 10px;
      margin-bottom: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    th {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      padding: 5px 8px;
      text-align: left;
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    td {
      border: 1px solid #e5e7eb;
      padding: 5px 8px;
      vertical-align: top;
    }
    tr:nth-child(even) { background: #fafafa; }
    .mono {
      font-family: 'IBM Plex Mono', 'Consolas', monospace;
      font-size: 9px;
    }
    .status {
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
    }
    .task-name {
      font-weight: 600;
      max-width: 280px;
    }
    .footer {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1px solid #d1d5db;
      font-size: 9px;
      color: #6b7280;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${weeks}-Week Field Look-Ahead</h1>
      <div style="font-size:12px; margin-top:2px;">${escHtml(project.name || "")} ${project.project_number ? `(${escHtml(project.project_number)})` : ""}</div>
    </div>
    <div class="meta">
      <div>Generated: ${today}</div>
      <div>${filtered.length} active tasks</div>
      <div>Window: ${weeks} weeks</div>
    </div>
  </div>

  <div class="no-print" style="margin-bottom:12px;">
    <button onclick="window.print()" style="padding:8px 16px; font-size:11px; font-weight:700; cursor:pointer; background:#1a1a1a; color:#fff; border:none; border-radius:4px;">
      PRINT / SAVE PDF
    </button>
  </div>

  ${weekGroups.length === 0 ? '<p style="padding:20px; color:#6b7280;">No tasks scheduled in the next ' + weeks + ' weeks.</p>' : ""}

  ${weekGroups.map((wg) => `
  <div class="week-group">
    <div class="week-label">${escHtml(wg.weekLabel)}</div>
    <table>
      <thead>
        <tr>
          <th style="width:30%">Task</th>
          <th style="width:15%">Crew / Resource</th>
          <th style="width:12%">Start</th>
          <th style="width:8%">Duration</th>
          <th style="width:22%">Predecessors</th>
          <th style="width:13%">Status</th>
        </tr>
      </thead>
      <tbody>
        ${wg.tasks.map((t) => `
        <tr>
          <td class="task-name">${escHtml(t.task_name || "")}</td>
          <td class="mono">${escHtml(t.resource_names || "--")}</td>
          <td class="mono">${formatDate(t.start_date)}</td>
          <td class="mono">${t.duration ? t.duration + "d" : "--"}</td>
          <td style="font-size:9px;">${escHtml(buildPredecessorInfo(t, allTasks))}</td>
          <td class="status" style="color:${statusColor(t.status)}">${escHtml(t.status || "--")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`).join("")}

  <div class="footer">
    <span>SteelBuild Pro -- Field Look-Ahead Report</span>
    <span>${escHtml(project.name || "")} | ${today}</span>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
  return filtered.length;
}

function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
