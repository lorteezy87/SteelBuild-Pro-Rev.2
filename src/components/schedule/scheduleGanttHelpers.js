// ── Pure helpers extracted from ScheduleGantt.jsx ─────────────────────────
//
// Date math, Gantt row-geometry binary searches, column-width persistence,
// and the task predicates/derivations the Gantt uses for its quick filters
// and badges (critical / stalled / lookahead / logic-gap / unassigned / …).
// None of these touch React or the component's closure state — they take every
// input as an argument, so they're safe to import from the Gantt and to
// unit-test in isolation. Bodies are byte-identical to the originals; this is a
// mechanical extraction, not a behavior change.
import { parseDateUTC, toDateOnly } from "./scheduleDateUtils";
import { displayPct, isMilestoneTask } from "./scheduleTaskUtils";
import { parseDeps } from "./scheduleDependencies";
import { isSummaryTask as isSummaryTaskCanonical } from "@/lib/schedule/summaryTasks";

export function addDaysUTC(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function shiftDateOnly(input, days) {
  const date = parseDateUTC(input);
  return date ? toDateOnly(addDaysUTC(date, days)) : null;
}

// Column widths are now user-adjustable via drag handles on each header.
// TASK NAME is "flex" (takes remaining space) — represented as 0 in the
// state array and rendered as 1fr in the CSS grid. Every other column is
// a fixed pixel width the user can drag wider/narrower. Persisted to
// localStorage so the user's layout sticks across reloads.
//
// Header order: WBS · TASK · DUR · START · FINISH · PRED · RESOURCES ·
//               STATUS · STAGE · %
export const DEFAULT_COL_WIDTHS = [50, 0, 40, 68, 68, 48, 80, 72, 88, 36];
export const MIN_COL_WIDTH = 24;
// Task-name (flex) column gets at least this much. Bumped from 140 → 240
// to make names readable out of the box — the user complained names were
// too cramped. Users can still drag other columns narrower for more name
// room, or drag the name column's handle to pin a specific width.
export const MIN_NAME_WIDTH = 240;
export const COL_WIDTHS_KEY = "sbp-gantt-col-widths-v1";

export function loadColWidths() {
  try {
    const raw = typeof window !== "undefined" && window.localStorage?.getItem(COL_WIDTHS_KEY);
    if (!raw) return DEFAULT_COL_WIDTHS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_COL_WIDTHS.length) return DEFAULT_COL_WIDTHS;
    return parsed.map((w, i) => {
      if (typeof w !== "number" || !Number.isFinite(w)) return DEFAULT_COL_WIDTHS[i];
      // Don't trust stored widths smaller than our hard min (could lock users out).
      return w === 0 ? 0 : Math.max(MIN_COL_WIDTH, Math.min(400, w));
    });
  } catch { return DEFAULT_COL_WIDTHS; }
}

export function findFirstRowAtOrAfter(items, y) {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].top + items[mid].height < y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function findFirstRowAfter(items, y) {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].top <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function getTaskMetadata(task) {
  if (!task?.metadata) return {};
  if (typeof task.metadata === "object") return task.metadata;
  if (typeof task.metadata === "string") {
    try {
      const parsed = JSON.parse(task.metadata);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function getTaskBaseline(task) {
  const metadata = getTaskMetadata(task);
  const bs = metadata.baseline_start || null;
  const be = metadata.baseline_end || null;
  if (!bs && !be) return null;
  return { start: bs, end: be };
}

export function hasBaselineDrift(task, effStartDate, effEndDate) {
  const baseline = getTaskBaseline(task);
  if (!baseline) return false;
  return baseline.start !== effStartDate || baseline.end !== effEndDate;
}

export function isCriticalTask(task) {
  const metadata = getTaskMetadata(task);
  return Boolean(
    metadata.is_critical ||
    metadata.critical_path ||
    task?.is_critical ||
    task?.is_critical_path ||
    task?.critical_path
  );
}

export function taskSearchHaystack(task, phaseLabel = "") {
  return [
    task?.task_name,
    task?.wbs_code,
    task?.status,
    task?.stage,
    task?.task_type,
    task?.resource_names,
    task?.assigned_to,
    phaseLabel,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function pluralize(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function isStalledTask(task, today, parseStart) {
  if (!task || task.status === "Complete" || String(task.status || "").toLowerCase().includes("complete")) return false;
  const start = parseStart(task);
  return Boolean(start && start < today && displayPct(task) === 0);
}

export function isOpenScheduleTask(task) {
  const status = String(task?.status || "").toLowerCase();
  return !["complete", "completed", "closed", "cancelled", "canceled"].some((closed) => status.includes(closed));
}

// Row-level summary check (flag-based). Delegates to the canonical predicate so
// the "is this a parent/summary row?" logic lives in exactly one place. The
// Gantt already enriches rows with _hasChildren/_isRolledUpSummary, so the
// single-arg (flag-only) form is sufficient here; surfaces that lack that
// enrichment pass a parentIds set to the canonical helper directly.
export function isSummaryScheduleTask(task) {
  return isSummaryTaskCanonical(task);
}

export function isActionableScheduleTask(task) {
  return !isSummaryScheduleTask(task);
}

export function taskOwner(task) {
  return String(task?.resource_names || task?.assigned_to || "").trim();
}

export function isUnassignedTask(task) {
  return Boolean(task && isOpenScheduleTask(task) && isActionableScheduleTask(task) && !taskOwner(task));
}

export function hasLogicGapTask(task, successorCountById) {
  if (!task || !isOpenScheduleTask(task) || !isActionableScheduleTask(task)) return false;
  // Milestones are natural network endpoints — exempt from logic-gap checks.
  if (isMilestoneTask(task)) return false;
  const predecessorCount = parseDeps(task.dependencies).length;
  const successorCount = successorCountById[task.id] || 0;
  // A task with either a predecessor OR a successor is part of the schedule
  // network. Only flag completely unlinked tasks — those are the real logic
  // gaps. The previous `||` condition flagged start tasks (no predecessor)
  // and end tasks (no successor) as gaps, which is wrong: "Project Kickoff"
  // naturally has no predecessors, and final milestones naturally have no
  // successors. Multiple tasks sharing the same predecessor (e.g. several
  // tasks starting after kickoff) is valid schedule logic, not a gap.
  return predecessorCount === 0 && successorCount === 0;
}

export function isLookaheadTask(task, today, getStart, getEnd, days = 14) {
  if (!task || task.status === "Complete" || String(task.status || "").toLowerCase().includes("complete")) return false;
  const start = parseDateUTC(getStart(task));
  const end = parseDateUTC(getEnd(task));
  if (!start && !end) return false;

  const windowEnd = new Date(today);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + days);

  if (start && end) return start <= windowEnd && end >= today;
  if (start) return start >= today && start <= windowEnd;
  return end >= today && end <= windowEnd;
}
