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

type ScheduleTaskLike = {
  id?: string;
  metadata?: unknown;
  task_name?: string | null;
  wbs_code?: string | null;
  status?: string | null;
  stage?: string | null;
  task_type?: string | null;
  resource_names?: string | null;
  assigned_to?: string | null;
  dependencies?: unknown;
  is_critical?: boolean | null;
  is_critical_path?: boolean | null;
  critical_path?: boolean | null;
  [key: string]: unknown;
};

type RowGeom = { top: number; height: number };

export function addDaysUTC(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function shiftDateOnly(input: unknown, days: number): string | null {
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

export function loadColWidths(): number[] {
  try {
    const raw = typeof window !== "undefined" && window.localStorage?.getItem(COL_WIDTHS_KEY);
    if (!raw) return DEFAULT_COL_WIDTHS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_COL_WIDTHS.length) return DEFAULT_COL_WIDTHS;
    return parsed.map((w: unknown, i: number) => {
      if (typeof w !== "number" || !Number.isFinite(w)) return DEFAULT_COL_WIDTHS[i];
      // Don't trust stored widths smaller than our hard min (could lock users out).
      return w === 0 ? 0 : Math.max(MIN_COL_WIDTH, Math.min(400, w));
    });
  } catch {
    return DEFAULT_COL_WIDTHS;
  }
}

export function findFirstRowAtOrAfter(items: RowGeom[], y: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].top + items[mid].height < y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function findFirstRowAfter(items: RowGeom[], y: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].top <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function getTaskMetadata(task: ScheduleTaskLike | null | undefined): Record<string, unknown> {
  if (!task?.metadata) return {};
  if (typeof task.metadata === "object") return task.metadata as Record<string, unknown>;
  if (typeof task.metadata === "string") {
    try {
      const parsed = JSON.parse(task.metadata);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function getTaskBaseline(task: ScheduleTaskLike | null | undefined): { start: unknown; end: unknown } | null {
  const metadata = getTaskMetadata(task);
  const bs = metadata.baseline_start || null;
  const be = metadata.baseline_end || null;
  if (!bs && !be) return null;
  return { start: bs, end: be };
}

export function hasBaselineDrift(
  task: ScheduleTaskLike | null | undefined,
  effStartDate: unknown,
  effEndDate: unknown,
): boolean {
  const baseline = getTaskBaseline(task);
  if (!baseline) return false;
  return baseline.start !== effStartDate || baseline.end !== effEndDate;
}

export function isCriticalTask(task: ScheduleTaskLike | null | undefined): boolean {
  const metadata = getTaskMetadata(task);
  return Boolean(
    metadata.is_critical ||
    metadata.critical_path ||
    task?.is_critical ||
    task?.is_critical_path ||
    task?.critical_path
  );
}

export function taskSearchHaystack(task: ScheduleTaskLike | null | undefined, phaseLabel = ""): string {
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

export function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function isStalledTask(
  task: ScheduleTaskLike | null | undefined,
  today: Date,
  parseStart: (task: ScheduleTaskLike) => Date | null | undefined,
): boolean {
  if (!task || task.status === "Complete" || String(task.status || "").toLowerCase().includes("complete")) return false;
  const start = parseStart(task);
  return Boolean(start && start < today && displayPct(task) === 0);
}

export function isOpenScheduleTask(task: ScheduleTaskLike | null | undefined): boolean {
  const status = String(task?.status || "").toLowerCase();
  return !["complete", "completed", "closed", "cancelled", "canceled"].some((closed) => status.includes(closed));
}

// Row-level summary check (flag-based). Delegates to the canonical predicate so
// the "is this a parent/summary row?" logic lives in exactly one place. The
// Gantt already enriches rows with _hasChildren/_isRolledUpSummary, so the
// single-arg (flag-only) form is sufficient here; surfaces that lack that
// enrichment pass a parentIds set to the canonical helper directly.
export function isSummaryScheduleTask(task: ScheduleTaskLike | null | undefined): boolean {
  return isSummaryTaskCanonical(task);
}

export function isActionableScheduleTask(task: ScheduleTaskLike | null | undefined): boolean {
  return !isSummaryScheduleTask(task);
}

export function taskOwner(task: ScheduleTaskLike | null | undefined): string {
  return String(task?.resource_names || task?.assigned_to || "").trim();
}

export function isUnassignedTask(task: ScheduleTaskLike | null | undefined): boolean {
  return Boolean(task && isOpenScheduleTask(task) && isActionableScheduleTask(task) && !taskOwner(task));
}

export function hasLogicGapTask(
  task: ScheduleTaskLike | null | undefined,
  successorCountById: Record<string, number | undefined>,
): boolean {
  if (!task || !isOpenScheduleTask(task) || !isActionableScheduleTask(task)) return false;
  // Milestones are natural network endpoints — exempt from logic-gap checks.
  if (isMilestoneTask(task)) return false;
  const predecessorCount = parseDeps(task.dependencies).length;
  const successorCount = successorCountById[task.id as string] || 0;
  // A task with either a predecessor OR a successor is part of the schedule
  // network. Only flag completely unlinked tasks — those are the real logic
  // gaps. The previous `||` condition flagged start tasks (no predecessor)
  // and end tasks (no successor) as gaps, which is wrong: "Project Kickoff"
  // naturally has no predecessors, and final milestones naturally have no
  // successors. Multiple tasks sharing the same predecessor (e.g. several
  // tasks starting after kickoff) is valid schedule logic, not a gap.
  return predecessorCount === 0 && successorCount === 0;
}

export function isLookaheadTask(
  task: ScheduleTaskLike | null | undefined,
  today: Date,
  getStart: (task: ScheduleTaskLike) => unknown,
  getEnd: (task: ScheduleTaskLike) => unknown,
  days = 14,
): boolean {
  if (!task || task.status === "Complete" || String(task.status || "").toLowerCase().includes("complete")) return false;
  const start = parseDateUTC(getStart(task));
  const end = parseDateUTC(getEnd(task));
  if (!start && !end) return false;

  const windowEnd = new Date(today);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + days);

  if (start && end) return start <= windowEnd && end >= today;
  if (start) return start >= today && start <= windowEnd;
  return end! >= today && end! <= windowEnd;
}

/** Filter + phase-group + tree-order tasks for ScheduleGantt left/timeline. */
export function groupGanttTasksByPhase<T extends { id?: string }>(
  rawTasks: T[],
  phaseFilter: string,
  deps: {
    normalizePhase: (t: T) => string | null | undefined;
    PHASES: Array<{ id: number; key: string; label: string; color?: string }>;
    buildTreeOrder: (tasks: T[], opts: { rootPrefix: number }) => T[];
    uncategorizedColor: string;
  },
): Array<{ phase: { id: number; key: string; label: string; color?: string }; tasks: T[] }> {
  const { normalizePhase, PHASES, buildTreeOrder, uncategorizedColor } = deps;
  const filtered =
    phaseFilter === "all"
      ? rawTasks
      : rawTasks.filter((t) => normalizePhase(t) === phaseFilter);

  const map: Record<string, T[]> = {};
  filtered.forEach((t) => {
    const ph = normalizePhase(t) || "Uncategorized";
    if (!map[ph]) map[ph] = [];
    map[ph].push(t);
  });

  const ordered: Array<{
    phase: { id: number; key: string; label: string; color?: string };
    tasks: T[];
  }> = [];
  PHASES.forEach((ph) => {
    if (map[ph.key]) {
      ordered.push({
        phase: ph,
        tasks: buildTreeOrder(map[ph.key], { rootPrefix: ph.id }),
      });
    }
  });
  if (map["Uncategorized"]) {
    ordered.push({
      phase: {
        id: 99,
        key: "Uncategorized",
        label: "Uncategorized",
        color: uncategorizedColor,
      },
      tasks: buildTreeOrder(map["Uncategorized"], { rootPrefix: 99 }),
    });
  }
  return ordered;
}

export function filterGroupedTasksByVisibleIds<
  T extends { id?: string },
  G extends { phase: unknown; tasks: T[] },
>(
  grouped: G[],
  visibleTaskIds: Set<string> | null | undefined,
): G[] {
  if (!visibleTaskIds) return grouped;
  return grouped
    .map((g) => ({
      ...g,
      tasks: g.tasks.filter((task) => task.id && visibleTaskIds.has(task.id)),
    }))
    .filter((g) => g.tasks.length > 0) as G[];
}

/** UTC midnight "today" for Gantt date math. */
export function utcToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}


/** Flat phase/task/delivery row list for ScheduleGantt scroll sync. */
export function buildGanttFlatRows(args: {
  grouped: Array<{ phase: any; tasks: any[] }>;
  collapsed: Record<string, boolean>;
  collapsedTasks: Record<string, boolean>;
  showDeliveries: boolean;
  deliveries: any[];
  collapsedDeliveries: boolean;
  effStart: (task: any) => unknown;
  effEnd: (task: any) => unknown;
}): any[] {
  const {
    grouped,
    collapsed,
    collapsedTasks,
    showDeliveries,
    deliveries,
    collapsedDeliveries,
    effStart,
    effEnd,
  } = args;

  const list: any[] = [];

  // Check if task should be visible (no collapsed ancestor in task tree)
  const isTaskVisible = (task: any, allPhaseTasks: any[]) => {
    let pid = task.parent_task_id;
    while (pid) {
      if (collapsedTasks[pid]) return false;
      const parent = allPhaseTasks.find((t) => t.id === pid);
      if (!parent) break;
      pid = parent.parent_task_id;
    }
    return true;
  };

  // Helper: insert delivery entity rows into the list
  const insertDeliveryRows = () => {
    if (!showDeliveries || deliveries.length === 0) return;
    const delStarts = deliveries.map((d) => d.scheduled_date).filter(Boolean).sort();
    const delEnds = deliveries
      .map((d) => d.required_date || d.actual_date || d.scheduled_date)
      .filter(Boolean)
      .sort();
    const deliveredCount = deliveries.filter((d) => d.status === "Delivered").length;
    const pct = deliveries.length > 0 ? Math.round((deliveredCount / deliveries.length) * 100) : 0;
    list.push({
      type: "delivery-summary",
      deliveryCount: deliveries.length,
      start: delStarts[0],
      end: delEnds[delEnds.length - 1],
      pctComplete: pct,
    });
    if (!collapsedDeliveries) {
      deliveries
        .slice()
        .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))
        .forEach((d) => {
          list.push({ type: "delivery", delivery: d });
        });
    }
  };

  // Insert deliveries in correct phase sequence:
  // Pre-Construction → Detailing → Procurement → Fabrication → DELIVERIES → Installation → Closeout
  let deliveriesInserted = false;

  grouped.forEach(({ phase, tasks }) => {
    // Insert delivery section right before Installation (after Fabrication/Delivery task phases)
    if (!deliveriesInserted && (phase.key === "Installation" || phase.id >= 6)) {
      deliveriesInserted = true;
      insertDeliveryRows();
    }

    // Phase % uses displayPct so Complete tasks always count as 100% even
    // when their percent_complete field is stale.
    const phaseProgressTasks = tasks.filter((task) => !task._hasChildren);
    const progressBasis = phaseProgressTasks.length ? phaseProgressTasks : tasks;
    const avgPct =
      progressBasis.length > 0
        ? progressBasis.reduce((sum, t) => sum + displayPct(t), 0) / progressBasis.length
        : 0;

    // Phase summary bar spans from the earliest *effective* start to the
    // latest *effective* end so a delayed predecessor visibly stretches
    // its parent phase, matching what the task bars actually show.
    const starts = tasks.map((t) => effStart(t)).filter(Boolean).sort();
    const ends = tasks.map((t) => effEnd(t)).filter(Boolean).sort();
    list.push({
      type: "summary",
      phase,
      tasks,
      start: starts[0],
      end: ends[ends.length - 1],
      pctComplete: avgPct,
    });
    if (!collapsed[phase.key]) {
      tasks.forEach((t) => {
        if (isTaskVisible(t, tasks)) {
          list.push({ type: "task", task: t, phase });
        }
      });
    }
  });

  // Fallback: if no Installation phase existed, append deliveries after all phases
  if (!deliveriesInserted) {
    insertDeliveryRows();
  }

  return list;
}
