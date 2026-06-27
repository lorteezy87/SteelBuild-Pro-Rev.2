/**
 * scheduleExport.js — Export filtered schedule tasks to CSV or XLSX.
 *
 * Exports respect the currently-visible (filtered) tasks so users get
 * exactly what they see on screen. Column set is fixed and matches the
 * standard schedule report columns used by GCs and owners:
 *
 *   Task Name | WBS | Phase | Start | End | Duration | % Complete |
 *   Predecessor | Resource | Status
 *
 * CSV export is pure-JS (no deps). XLSX export uses the `xlsx` package
 * already in the project for PSR import.
 */

import * as XLSX from "xlsx";

// ── Column definitions ───────────────────────────────��──────────────────

const COLUMNS = [
  { key: "task_name", header: "Task Name" },
  { key: "wbs_code", header: "WBS" },
  { key: "phase", header: "Phase" },
  { key: "start_date", header: "Start" },
  { key: "end_date", header: "End" },
  { key: "duration", header: "Duration (days)" },
  { key: "percent_complete", header: "% Complete" },
  { key: "dependencies_display", header: "Predecessor" },
  { key: "resource_names", header: "Resource" },
  { key: "status", header: "Status" },
];

// ── Helpers ──────────────────────────────────────────���──────────────────

/**
 * Build a display string for dependencies, referencing predecessor task
 * names instead of raw IDs. Falls back to IDs if the task isn't found.
 */
function buildDependencyDisplay(task, allTasks) {
  const deps = parseDeps(task.dependencies);
  if (!deps.length) return "";
  const taskMap = {};
  allTasks.forEach((t) => { taskMap[t.id] = t; });
  return deps.map((d) => {
    const pred = taskMap[d.id];
    const name = pred?.task_name || `#${d.id}`;
    const suffix = d.type && d.type !== "FS" ? ` (${d.type})` : "";
    const lag = d.lag_days ? ` +${d.lag_days}d` : "";
    return `${name}${suffix}${lag}`;
  }).join("; ");
}

function parseDeps(deps) {
  if (!deps) return [];
  if (typeof deps === "string") {
    try {
      const parsed = JSON.parse(deps);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return deps.split(",").map((s) => s.trim()).filter(Boolean).map((id) => ({
        id: Number(id) || id, type: "FS", lag_days: 0,
      }));
    }
  }
  if (Array.isArray(deps)) return deps;
  return [];
}

/**
 * Prepare row data from a task for export.
 */
function taskToRow(task, allTasks) {
  return {
    task_name: task.task_name || "",
    wbs_code: task.wbs_code || "",
    phase: task.phase || "",
    start_date: task.start_date || "",
    end_date: task.end_date || "",
    duration: task.duration != null ? task.duration : "",
    percent_complete: task.percent_complete != null ? task.percent_complete : 0,
    dependencies_display: buildDependencyDisplay(task, allTasks),
    resource_names: task.resource_names || "",
    status: task.status || "",
  };
}

// ── CSV Export ───────────────────────────────────────────────────────────

/**
 * Escape a CSV field value (quote if it contains commas, quotes, or newlines).
 */
function csvEscape(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export tasks to a CSV string.
 *
 * @param {Array} tasks - Filtered schedule tasks to export
 * @param {Array} allTasks - All tasks (for dependency name resolution)
 * @returns {string} CSV content
 */
export function exportToCSV(tasks, allTasks = tasks) {
  const headers = COLUMNS.map((c) => c.header);
  const rows = tasks.map((t) => {
    const row = taskToRow(t, allTasks);
    return COLUMNS.map((c) => csvEscape(row[c.key]));
  });
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}

/**
 * Export tasks to an XLSX blob.
 *
 * @param {Array} tasks - Filtered schedule tasks to export
 * @param {Array} allTasks - All tasks (for dependency name resolution)
 * @returns {Blob} XLSX file blob
 */
export function exportToXLSX(tasks, allTasks = tasks) {
  const headers = COLUMNS.map((c) => c.header);
  const data = [headers];
  tasks.forEach((t) => {
    const row = taskToRow(t, allTasks);
    data.push(COLUMNS.map((c) => row[c.key]));
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths for readability
  ws["!cols"] = [
    { wch: 40 }, // Task Name
    { wch: 10 }, // WBS
    { wch: 16 }, // Phase
    { wch: 12 }, // Start
    { wch: 12 }, // End
    { wch: 10 }, // Duration
    { wch: 10 }, // % Complete
    { wch: 30 }, // Predecessor
    { wch: 20 }, // Resource
    { wch: 14 }, // Status
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Schedule");
  const xlsxData = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([xlsxData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/**
 * Trigger a browser download of a CSV file.
 */
export function downloadCSV(tasks, allTasks, projectNumber = "project") {
  const csv = exportToCSV(tasks, allTasks);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const filename = `${projectNumber}-schedule.csv`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

/**
 * Trigger a browser download of an XLSX file.
 */
export function downloadXLSX(tasks, allTasks, projectNumber = "project") {
  const blob = exportToXLSX(tasks, allTasks);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const filename = `${projectNumber}-schedule.xlsx`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
