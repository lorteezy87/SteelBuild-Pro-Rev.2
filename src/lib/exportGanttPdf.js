/**
 * exportGanttPdf.js — Export the Schedule Gantt to a PDF file.
 *
 * Data-driven (jsPDF text + shapes). The previous html2canvas path cloned the
 * live Gantt, but that surface is virtualized and dual-scrolled, so the clone
 * only contained the viewport rows. html2canvas also chokes on color-mix /
 * CSS variables used by the dark theme. A task-list + bar chart drawn from
 * schedule data is what GCs and shops actually need to print.
 *
 * Call site: useScheduleMutations.handleExportPdf. Pass `tasks` (prefer the
 * effective-date overlay so bars match the on-screen Gantt).
 */

import { jsPDF } from "jspdf";
import { parseDateUTC, fmtDate } from "@/components/schedule/scheduleDateUtils";

const PAGE_FORMAT = "tabloid";
const PAGE_ORIENT = "landscape";
const PAGE_MARGIN = 24;
const HEADER_H = 48;
const FOOTER_H = 20;
const COL_HEADER_H = 22;
const ROW_H = 16;
const PHASE_H = 18;

const C_ACCENT = [200, 155, 32];
const C_MUTED = [110, 118, 132];
const C_BORDER = [215, 219, 227];
const C_TEXT = [20, 24, 32];
const C_PHASE_BG = [245, 246, 248];
const C_ROW_ALT = [250, 251, 252];
const C_TODAY = [200, 80, 40];
const C_BAR_TRACK = [230, 233, 238];

const STATUS_RGB = {
  Complete: [16, 185, 129],
  "In Progress": [46, 168, 255],
  Delayed: [239, 68, 68],
  Overdue: [239, 68, 68],
  "On Hold": [200, 155, 32],
  "Not Started": [100, 116, 139],
};

const PHASE_ORDER = [
  "Pre-Construction",
  "Detailing",
  "Procurement",
  "Fabrication",
  "Delivery",
  "Installation",
  "Closeout",
];

const LEFT_COLS = [
  { key: "wbs", label: "WBS", width: 48 },
  { key: "name", label: "TASK", width: 168 },
  { key: "dur", label: "DUR", width: 28 },
  { key: "start", label: "START", width: 50 },
  { key: "finish", label: "FINISH", width: 50 },
  { key: "status", label: "STATUS", width: 62 },
  { key: "pct", label: "%", width: 26 },
];

const LEFT_W = LEFT_COLS.reduce((sum, col) => sum + col.width, 0);

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHeaderDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusRgb(status) {
  return STATUS_RGB[status] || STATUS_RGB["Not Started"];
}

function normalizePhaseKey(task) {
  const raw = String(task?.phase || "").trim();
  if (raw === "Erection") return "Installation";
  return PHASE_ORDER.includes(raw) ? raw : raw || "Uncategorized";
}

function taskStart(task) {
  return parseDateUTC(task?.start_date);
}

function taskEnd(task) {
  return parseDateUTC(task?.end_date) || taskStart(task);
}

function durationDays(task) {
  const n = Number(task?.duration);
  if (Number.isFinite(n) && n >= 0) return Math.round(n);
  const s = taskStart(task);
  const e = taskEnd(task);
  if (!s || !e) return null;
  return Math.max(0, Math.round((e - s) / 86400000));
}

/**
 * Percent complete, or null when unknown. Mirrors percentCompleteOrNull in
 * components/schedule/scheduleTaskUtils — this module is a standalone jsPDF
 * renderer and deliberately carries no React-side imports.
 */
function percentCompleteOrNull(task) {
  if (!task) return null;
  if (task.status === "Complete") return 100;
  if (task.percent_complete === null || task.percent_complete === undefined) return null;
  const v = Number(task.percent_complete);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
}

function taskName(task) {
  const raw = String(task?.task_name || "").trim();
  return raw || "Untitled task";
}

function startOfUtcWeek(date) {
  const d = new Date(date.getTime());
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dow);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addUtcDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function buildPrintRows(tasks) {
  const buckets = new Map();
  for (const task of tasks || []) {
    if (!task) continue;
    const phase = normalizePhaseKey(task);
    if (!buckets.has(phase)) buckets.set(phase, []);
    buckets.get(phase).push(task);
  }

  const phaseKeys = [
    ...PHASE_ORDER.filter((key) => buckets.has(key)),
    ...[...buckets.keys()].filter((key) => !PHASE_ORDER.includes(key)),
  ];

  const rows = [];
  for (const phase of phaseKeys) {
    const items = buckets.get(phase) || [];
    items.sort((a, b) => String(a.wbs_code || "").localeCompare(String(b.wbs_code || ""), undefined, { numeric: true }));
    rows.push({ type: "phase", phase, count: items.length });
    for (const task of items) {
      rows.push({ type: "task", task, phase });
    }
  }
  return rows;
}

function computeRange(tasks) {
  let min = null;
  let max = null;
  for (const task of tasks || []) {
    const s = taskStart(task);
    const e = taskEnd(task);
    if (s && (!min || s < min)) min = s;
    if (e && (!max || e > max)) max = e;
  }
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!min || !max) {
    min = addUtcDays(todayUtc, -14);
    max = addUtcDays(todayUtc, 42);
  }
  const start = startOfUtcWeek(addUtcDays(min, -7));
  let end = addUtcDays(max, 7);
  if (end <= start) end = addUtcDays(start, 7);
  const weeks = [];
  for (let cursor = new Date(start.getTime()); cursor < end; cursor = addUtcDays(cursor, 7)) {
    weeks.push(new Date(cursor.getTime()));
  }
  return { start, end, weeks, todayUtc };
}

function clip(pdf, text, maxWidth) {
  const raw = String(text ?? "");
  if (!raw) return "";
  if (pdf.getTextWidth(raw) <= maxWidth) return raw;
  const ellipsis = "…";
  let out = raw;
  while (out.length > 1 && pdf.getTextWidth(out + ellipsis) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}${ellipsis}`;
}

function drawHeader(pdf, { project, pageIndex, pageCount, now }) {
  const pageW = pdf.internal.pageSize.getWidth();
  const y = PAGE_MARGIN;
  pdf.setDrawColor(...C_BORDER);
  pdf.setLineWidth(0.75);
  pdf.line(PAGE_MARGIN, y + HEADER_H - 8, pageW - PAGE_MARGIN, y + HEADER_H - 8);

  pdf.setTextColor(...C_TEXT);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(`Schedule — ${project?.name || "Project"}`, PAGE_MARGIN, y + 14);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...C_MUTED);
  const bits = [];
  if (project?.project_number) bits.push(`Project #${project.project_number}`);
  bits.push(`Exported ${formatHeaderDate(now)}`);
  if (pageCount > 1) bits.push(`Page ${pageIndex + 1} of ${pageCount}`);
  pdf.text(bits.join("  ·  "), PAGE_MARGIN, y + 28);

  pdf.setFillColor(...C_ACCENT);
  pdf.rect(pageW - PAGE_MARGIN - 60, y + 6, 60, 4, "F");
}

function drawFooter(pdf, { pageIndex, pageCount }) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setTextColor(...C_MUTED);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("SteelBuild Pro", PAGE_MARGIN, pageH - PAGE_MARGIN / 2);
  pdf.text(`${pageIndex + 1} / ${pageCount}`, pageW - PAGE_MARGIN, pageH - PAGE_MARGIN / 2, { align: "right" });
}

function drawLeftHeader(pdf, x, y) {
  let cursor = x;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...C_MUTED);
  for (const col of LEFT_COLS) {
    pdf.text(col.label, cursor + 3, y + 13);
    cursor += col.width;
  }
  pdf.setDrawColor(...C_BORDER);
  pdf.setLineWidth(0.4);
  pdf.line(x, y + COL_HEADER_H, x + LEFT_W, y + COL_HEADER_H);
}

function drawWeekHeader(pdf, weeks, weekStartIndex, weekCount, timelineX, timelineW, y, rangeStart) {
  const weekW = timelineW / weekCount;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  for (let i = 0; i < weekCount; i++) {
    const week = weeks[weekStartIndex + i];
    if (!week) continue;
    const x = timelineX + i * weekW;
    const label = week.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    pdf.setTextColor(...C_MUTED);
    pdf.text(label, x + 3, y + 13);
    pdf.setDrawColor(...C_BORDER);
    pdf.setLineWidth(0.3);
    pdf.line(x, y, x, y + COL_HEADER_H);
  }
  pdf.setDrawColor(...C_BORDER);
  pdf.setLineWidth(0.4);
  pdf.line(timelineX, y + COL_HEADER_H, timelineX + timelineW, y + COL_HEADER_H);
  return { weekW, rangeStart };
}

function drawPhaseRow(pdf, row, x, y, width) {
  pdf.setFillColor(...C_PHASE_BG);
  pdf.rect(x, y, width, PHASE_H, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...C_TEXT);
  pdf.text(`${row.phase}  ·  ${row.count}`, x + 6, y + 12);
}

function drawTaskRow(pdf, row, x, y, alt) {
  if (alt) {
    pdf.setFillColor(...C_ROW_ALT);
    pdf.rect(x, y, LEFT_W, ROW_H, "F");
  }

  const task = row.task;
  const values = {
    wbs: task.wbs_code || "",
    name: taskName(task),
    dur: durationDays(task) == null ? "—" : `${durationDays(task)}d`,
    start: fmtDate(task.start_date),
    finish: fmtDate(task.end_date),
    status: task.status || "Not Started",
    pct: percentCompleteOrNull(task) === null ? "—" : `${percentCompleteOrNull(task)}`,
  };

  let cursor = x;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...C_TEXT);
  for (const col of LEFT_COLS) {
    const text = clip(pdf, values[col.key], col.width - 6);
    if (col.key === "status") pdf.setTextColor(...statusRgb(task.status || "Not Started"));
    else pdf.setTextColor(...C_TEXT);
    pdf.text(text, cursor + 3, y + 11);
    cursor += col.width;
  }
}

function drawTaskBar(pdf, task, timelineX, y, weekW, weekStartIndex, weekCount, rangeStart) {
  const start = taskStart(task);
  const end = taskEnd(task);
  if (!start || !end) return;

  const sliceStart = addUtcDays(rangeStart, weekStartIndex * 7);
  const sliceEnd = addUtcDays(sliceStart, weekCount * 7);
  const clippedStart = start < sliceStart ? sliceStart : start;
  const clippedEnd = end > sliceEnd ? sliceEnd : end;
  if (clippedEnd < sliceStart || clippedStart > sliceEnd) return;

  const startDays = (clippedStart - sliceStart) / 86400000;
  const spanDays = Math.max(0.6, (clippedEnd - clippedStart) / 86400000);
  const pxPerDay = weekW / 7;
  const barX = timelineX + startDays * pxPerDay;
  const barW = Math.max(3, spanDays * pxPerDay);
  const barY = y + 4;
  const barH = ROW_H - 8;

  pdf.setFillColor(...C_BAR_TRACK);
  pdf.rect(barX, barY, barW, barH, "F");

  // Bar width only — an unknown percent draws as an empty track.
  const pct = (percentCompleteOrNull(task) ?? 0) / 100;
  const [r, g, b] = statusRgb(task.status || "Not Started");
  if (pct > 0) {
    pdf.setFillColor(r, g, b);
    pdf.rect(barX, barY, Math.max(2, barW * pct), barH, "F");
  } else {
    pdf.setDrawColor(r, g, b);
    pdf.setLineWidth(0.6);
    pdf.rect(barX, barY, barW, barH);
  }
}

function drawTodayLine(pdf, todayUtc, timelineX, y, height, weekW, weekStartIndex, weekCount, rangeStart) {
  const sliceStart = addUtcDays(rangeStart, weekStartIndex * 7);
  const sliceEnd = addUtcDays(sliceStart, weekCount * 7);
  if (todayUtc < sliceStart || todayUtc > sliceEnd) return;
  const days = (todayUtc - sliceStart) / 86400000;
  const x = timelineX + days * (weekW / 7);
  pdf.setDrawColor(...C_TODAY);
  pdf.setLineWidth(0.8);
  pdf.line(x, y, x, y + height);
}

/**
 * Build the schedule PDF from task records.
 * @param {object} args
 * @param {object} [args.project]
 * @param {Array}  [args.tasks]
 * @param {Date}   [args.now]
 * @returns {jsPDF}
 */
export function buildGanttPdf({ project = {}, tasks = [], now = new Date() } = {}) {
  const list = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  if (!list.length) {
    throw new Error("No schedule tasks to export.");
  }

  const rows = buildPrintRows(list);
  const range = computeRange(list);
  const pdf = new jsPDF({ orientation: PAGE_ORIENT, unit: "pt", format: PAGE_FORMAT });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const availW = pageW - PAGE_MARGIN * 2;
  const availH = pageH - PAGE_MARGIN - HEADER_H - FOOTER_H;
  const timelineX = PAGE_MARGIN + LEFT_W;
  const timelineW = Math.max(120, availW - LEFT_W);
  const weeksPerPage = Math.max(4, Math.min(range.weeks.length, Math.floor(timelineW / 28)));
  const weekSlices = Math.max(1, Math.ceil(range.weeks.length / weeksPerPage));

  const bodyH = availH - COL_HEADER_H;
  const chunks = [];
  let cursor = 0;
  while (cursor < rows.length) {
    const chunk = [];
    let used = 0;
    while (cursor < rows.length) {
      const row = rows[cursor];
      const h = row.type === "phase" ? PHASE_H : ROW_H;
      if (chunk.length > 0 && used + h > bodyH) break;
      chunk.push(row);
      used += h;
      cursor += 1;
    }
    chunks.push(chunk);
  }

  const pageCount = Math.max(1, chunks.length * weekSlices);
  let pageIndex = 0;

  for (let weekSlice = 0; weekSlice < weekSlices; weekSlice++) {
    const weekStartIndex = weekSlice * weeksPerPage;
    const weekCount = Math.min(weeksPerPage, range.weeks.length - weekStartIndex);
    const weekW = timelineW / weekCount;

    for (const chunk of chunks) {
      if (pageIndex > 0) pdf.addPage(PAGE_FORMAT, PAGE_ORIENT);
      drawHeader(pdf, { project, pageIndex, pageCount, now });
      drawFooter(pdf, { pageIndex, pageCount });

      const gridY = PAGE_MARGIN + HEADER_H;
      drawLeftHeader(pdf, PAGE_MARGIN, gridY);
      drawWeekHeader(pdf, range.weeks, weekStartIndex, weekCount, timelineX, timelineW, gridY, range.start);

      let y = gridY + COL_HEADER_H;
      let taskIndex = 0;
      for (const row of chunk) {
        if (row.type === "phase") {
          drawPhaseRow(pdf, row, PAGE_MARGIN, y, availW);
          y += PHASE_H;
          continue;
        }
        drawTaskRow(pdf, row, PAGE_MARGIN, y, taskIndex % 2 === 1);
        drawTaskBar(pdf, row.task, timelineX, y, weekW, weekStartIndex, weekCount, range.start);
        y += ROW_H;
        taskIndex += 1;
      }

      drawTodayLine(
        pdf,
        range.todayUtc,
        timelineX,
        gridY + COL_HEADER_H,
        Math.max(0, y - gridY - COL_HEADER_H),
        weekW,
        weekStartIndex,
        weekCount,
        range.start,
      );
      pageIndex += 1;
    }
  }

  return pdf;
}

function filenameFor(project, now = new Date()) {
  const dateKey = localDateKey(now);
  const raw = project?.project_number || project?.name || "project";
  const projectKey = String(raw).replace(/[^\w.-]+/g, "_").slice(0, 60) || "project";
  return `schedule-${projectKey}-${dateKey}.pdf`;
}

/**
 * @param {object} opts
 * @param {object} [opts.project]
 * @param {Array}  [opts.tasks]
 * @param {Date}   [opts.now]
 * @returns {Promise<{pageCount:number, filename:string}>}
 */
export async function exportGanttToPdf({ project = {}, tasks = [], now = new Date() } = {}) {
  const pdf = buildGanttPdf({ project, tasks, now });
  const filename = filenameFor(project, now);
  pdf.save(filename);
  return { pageCount: pdf.internal.getNumberOfPages(), filename };
}
