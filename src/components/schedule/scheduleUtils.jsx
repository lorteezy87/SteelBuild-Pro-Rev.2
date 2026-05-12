// Schedule utility functions for data mapping and calculations
import { GANTT_GRADIENT, GANTT_PHASE_HEX, GANTT_STATUS_HEX } from "@/lib/ganttTheme";

export function mapWorkPackagesToTasks(workPackages) {
  return workPackages.map((wp, idx) => ({
    id: `wp-${wp.id || idx}`,
    task_number: undefined, // will be auto-assigned on create
    project_id: wp.project_id,
    project_name: wp.project_name,
    task_name: wp.name,
    task_type: wp.phase === 'Erection' ? 'Install' : 'Fabrication',
    phase: wp.phase,
    start_date: wp.released_date || new Date().toISOString().split('T')[0],
    end_date: wp.released_date || new Date().toISOString().split('T')[0],
    duration: 1,
    percent_complete: wp.percent_complete || 0,
    status: wp.status,
    priority: 'Normal',
    linked_entity_type: 'WorkPackage',
    linked_entity_id: wp.id,
    is_milestone: false,
  }));
}

export function mapDeliveriesToTasks(deliveries) {
  return deliveries.map((del) => ({
    id: `del-${del.id || del.delivery_id}`,
    task_number: undefined,
    project_id: del.project_id,
    project_name: del.project_name,
    task_name: del.description || `DEL-${del.delivery_id}`,
    task_type: 'Delivery',
    phase: 'Delivery',
    start_date: del.scheduled_date,
    end_date: del.scheduled_date,
    duration: 1,
    percent_complete: del.status === 'Delivered' ? 100 : 0,
    status: del.status,
    priority: del.priority || 'Normal',
    linked_entity_type: 'Delivery',
    linked_entity_id: del.id,
    is_milestone: true,
  }));
}

export function mapSubmittalsToTasks(drawings) {
  return drawings.map((dwg) => ({
    id: `dwg-${dwg.id || dwg.drawing_id}`,
    task_number: undefined,
    project_id: dwg.project_id,
    project_name: dwg.project_name,
    task_name: `${dwg.sheet_number || ''} ${dwg.title || ''}`.trim(),
    task_type: 'Submittal',
    phase: 'Detailing',
    start_date: dwg.submitted_date || dwg.issue_date || new Date().toISOString().split('T')[0],
    end_date: dwg.due_date || dwg.return_date || new Date().toISOString().split('T')[0],
    duration: dwg.due_date && dwg.submitted_date ? Math.max(1, Math.ceil((new Date(dwg.due_date) - new Date(dwg.submitted_date)) / 86400000)) : 1,
    percent_complete: dwg.stage === 'Released' ? 100 : 0,
    status: dwg.stage || 'Not Started',
    priority: dwg.priority_flag ? 'High' : 'Normal',
    linked_entity_type: 'Submittal',
    linked_entity_id: dwg.id,
    is_milestone: false,
  }));
}

export function calculateTaskDuration(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end - start;
  return Math.max(1, Math.ceil(diff / 86400000));
}

export function getDateRangeForTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    const today = new Date();
    return {
      minDate: today,
      maxDate: new Date(today.getTime() + 90 * 86400000),
    };
  }
  const dates = tasks
    .flatMap(t => [new Date(t.start_date), new Date(t.end_date)])
    .filter(d => !isNaN(d.getTime()));
  
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
  
  // Pad by 2 weeks on each side
  minDate.setDate(minDate.getDate() - 14);
  maxDate.setDate(maxDate.getDate() + 14);
  
  return { minDate, maxDate };
}

export function getTaskTypeColor(taskType) {
  const colors = {
    Fabrication: { gradient: GANTT_GRADIENT.Fabrication, solid: GANTT_PHASE_HEX.Fabrication },
    Delivery: { gradient: GANTT_GRADIENT.Delivery, solid: GANTT_PHASE_HEX.Delivery },
    Install: { gradient: GANTT_GRADIENT.Installation, solid: GANTT_PHASE_HEX.Installation },
    Submittal: { gradient: GANTT_GRADIENT.Detailing, solid: GANTT_PHASE_HEX.Detailing },
    RFI: { gradient: GANTT_GRADIENT.Procurement, solid: GANTT_PHASE_HEX.Procurement },
    Milestone: { gradient: 'none', solid: GANTT_STATUS_HEX.inProgress },
    Task: { gradient: 'linear-gradient(90deg, rgba(160,175,210,0.4), rgba(130,145,180,0.4))', solid: 'rgba(160,175,210,0.5)' },
  };
  return colors[taskType] || colors.Task;
}

export function formatDateShort(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

export function getDaysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.ceil((e - s) / 86400000);
}

export function isToday(date) {
  const today = new Date();
  const d = new Date(date);
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

export function isWeekend(date) {
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 || day === 6;
}

// ── Auto-scheduling via dependencies ─────────────────────────────────
//
// Parse the stringified dependencies column into a plain array. Mirrors
// the helper in ScheduleGantt / TaskDetailDrawer so callers can import
// from one place.
export function parseDependencies(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

/**
 * Given a task and a list of its predecessor task records, return the
 * auto-scheduled start and end dates (finish-to-start, 1-day lag),
 * preserving the task's current duration.
 *
 * The rule: a task can't start until the day *after* the LATEST
 * predecessor's finish. If the task's current start already satisfies
 * that constraint, returns null to signal "nothing to shift" — callers
 * should only persist when a change is actually produced.
 *
 * Dates are all YYYY-MM-DD date-only strings. Duration is measured in
 * whole days between start and end. If either task date is missing we
 * assume 1-day duration as a reasonable default.
 *
 * Sanity: predecessor end dates outside [1900, 2200] are ignored (same
 * clamp the gantt uses) so one bad typo can't fling the suggestion
 * thousands of years into the future.
 */
const MIN_SANE_YEAR = 1900;
const MAX_SANE_YEAR = 2200;
function parseDateOnly(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : str;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < MIN_SANE_YEAR || y > MAX_SANE_YEAR) return null;
  return d;
}
function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(d, n) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function computeAutoScheduledDates(task, predecessors) {
  if (!task || !predecessors || predecessors.length === 0) return null;

  // Latest (sanity-clamped) predecessor finish date.
  let latestEnd = null;
  for (const p of predecessors) {
    const d = parseDateOnly(p?.end_date);
    if (!d) continue;
    if (!latestEnd || d > latestEnd) latestEnd = d;
  }
  if (!latestEnd) return null;

  // Earliest legal start = the day after the latest predecessor end.
  const earliestStart = addDays(latestEnd, 1);

  const currentStart = parseDateOnly(task.start_date);
  // If the task already starts on or after the constraint, nothing to do.
  // (User intentionally put it later — we don't pull tasks backwards.)
  if (currentStart && currentStart >= earliestStart) return null;

  // Preserve duration in whole days (minimum 1 day).
  const currentEnd = parseDateOnly(task.end_date);
  let durationDays = 1;
  if (currentStart && currentEnd) {
    durationDays = Math.max(1, Math.round((currentEnd - currentStart) / 86400000));
  }

  const newStart = earliestStart;
  const newEnd = addDays(newStart, Math.max(0, durationDays - 1));

  return {
    start_date: toIsoDate(newStart),
    end_date: toIsoDate(newEnd),
    // Helpful metadata for toast messaging — not persisted.
    _shiftedFrom: task.start_date || null,
    _driver: latestEnd ? toIsoDate(latestEnd) : null,
  };
}
