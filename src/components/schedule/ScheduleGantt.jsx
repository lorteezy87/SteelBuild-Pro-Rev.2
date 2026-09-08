import React, { useMemo, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { risksForTaskWindow } from "@/lib/weatherRisk";
import {
  GANTT_BASELINE_VAR,
  GANTT_BG_VAR,
  GANTT_DEPENDENCY_VAR,
  GANTT_GRID_STRONG_VAR,
  GANTT_GRID_VAR,
  GANTT_HEADER_VAR,
  GANTT_LEFT_VAR,
  GANTT_PANEL_STRONG_VAR,
  GANTT_PANEL_VAR,
  GANTT_PHASE_VAR,
  GANTT_ROW_HOVER_VAR,
  GANTT_STATUS_HEX,
  GANTT_TODAY_SOFT_VAR,
  GANTT_TODAY_VAR,
  GANTT_WEEKEND_VAR,
} from "@/lib/ganttTheme";
import {
  parseDateUTC,
  toDateOnly,
  fmtDate,
  calcDuration,
} from "./scheduleDateUtils";
import { buildTreeOrder } from "./scheduleTree";
import { parseDeps } from "./scheduleDependencies";
import {
  PHASES,
  normalizePhase,
  displayPct,
  isMilestoneTask,
  sanitizeTaskName,
  statusColor,
} from "./scheduleTaskUtils";
import {
  addDaysUTC,
  getTaskBaseline, hasBaselineDrift, isCriticalTask,
  pluralize, taskOwner, isUnassignedTask, hasLogicGapTask,
  isSummaryScheduleTask,
} from "./scheduleGanttHelpers";
import { buildBaselineRows, createBaseline } from "@/services/scheduleBaselines";
import { todayLocalISO, todayUtcMidnightFromLocal } from "@/lib/dateMath";
import {
  WEATHER_SENSITIVE_PHASES as WEATHER_SENSITIVE_PHASES_SET,
  buildWeatherRiskByTask,
  computeScheduleStats,
} from "./scheduleGanttStats";
import { GanttStatsBar, GanttQuickFilters, GanttMetricCards, GanttLegend } from "./ScheduleGanttToolbar";
import { useColumnResize } from "./useColumnResize";
import { useGanttLayout } from "./useGanttLayout";
import { useTaskBarDrag } from "./useTaskBarDrag";
import { useTaskRowDnD } from "./useTaskRowDnD";
import {
  computeCycleTaskIdsKey,
  selectShiftedSyncTasks,
  computeSuccessorCountById,
  computeVisibleTaskIds,
  buildTaskPositions,
  buildDepArrows,
  buildRowLayout,
  sliceVirtualRows,
  computeVirtualPadding,
  filterVisibleDepArrows,
  GANTT_ROW_H,
  GANTT_SUM_H,
} from "./scheduleGanttDerive";
import { GanttLeftPanelRows, GanttTimelineRows } from "./GanttTaskRows";

const HEAD_H  = 40;
const tint = (color, percent) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

// Stable identity for the `effectiveDates` fallback. An inline `{}` default
// would be a fresh object every render and would invalidate every memo below
// that lists `effectiveDates` as a dependency.
const NO_EFFECTIVE_DATES = Object.freeze({});
const NO_BASELINE_MAP = Object.freeze({});

export default function ScheduleGantt({ tasks: rawTasks = [], submittals = [], deliveries = [], weatherRisk = null, effectiveDates = NO_EFFECTIVE_DATES, onTaskClick, onSave, onReparent, phaseFilter = "all", externalFocus = null, projectId = null, baselineMap = NO_BASELINE_MAP, onBaselineChange }) {
  const [collapsed, setCollapsed] = useState({});
  const [zoom, setZoom] = useState("week"); // "week" | "month"
  const [showSubmittals, setShowSubmittals] = useState(true);
  const [showDeliveries, setShowDeliveries] = useState(true);
  const [collapsedDeliveries, setCollapsedDeliveries] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [hoveredRowId, setHoveredRowId] = useState(null);
  const [collapsedTasks, setCollapsedTasks] = useState({});
  const [searchText, setSearchText] = useState("");
  const [showBaseline, setShowBaseline] = useState(true);
  const [quickFilter, setQuickFilter] = useState("all");
  const [focusedTaskId, setFocusedTaskId] = useState(null);
  const [showLegend, setShowLegend] = useState(true);
  const [bodyViewport, setBodyViewport] = useState({ scrollTop: 0, height: 720 });
  const suppressTaskClickRef = useRef(false);

  useEffect(() => {
    if (!externalFocus?.filter) return;
    setQuickFilter(externalFocus.filter);
    setSearchText("");
    setFocusedTaskId(externalFocus.taskId ? String(externalFocus.taskId) : null);
    setCollapsed({});
    setCollapsedTasks({});
    setCollapsedDeliveries(false);
  }, [externalFocus]);

  // ── Resizable columns ───────────────────────────────────────────────
  // Column widths (drag-to-resize + persistence) — see useColumnResize.
  const { GRID, LEFT_W, startColResize, resetColWidths, resetColumn } = useColumnResize();
  const toggleTask = (taskId) => setCollapsedTasks(c => ({ ...c, [taskId]: !c[taskId] }));
  const leftRef   = useRef(null);
  const rightHead = useRef(null);
  const rightBody = useRef(null);
  const containerRef = useRef(null);

  // "Today" as the user's LOCAL calendar date, anchored at UTC midnight so all
  // date math (overdue checks, today line, scroll-to-today) compares apples to
  // apples with task dates stored as YYYY-MM-DD and parsed at T00:00:00Z.
  //
  // This used to read getUTCDate() — the UTC calendar date — which in Arizona
  // (UTC-7) is already tomorrow from 5 PM local onward, so the today line
  // jumped a day early and overdue flipped with it (audit §2.5).
  const today = useMemo(() => todayUtcMidnightFromLocal(), []);

  const startInlineEdit = (task, e) => {
    e.stopPropagation();
    // A summary row's start/end are derived from its children by the DB rollup
    // trigger, so anything typed here is overwritten on the next child write.
    // ScheduleTaskList already refuses this; the Gantt row did not.
    if (isSummaryScheduleTask(task)) return;
    setEditingId(task.id);
    setEditDraft({
      task_name: task.task_name || "",
      start_date: task.start_date || "",
      end_date: task.end_date || "",
      status: task.status || "Not Started",
      // Seed the editor with the same value the UI shows — Complete tasks
      // round to 100 even if percent_complete is stale, otherwise the user
      // sees a confusing "100% Complete" row that snaps back to 0 on edit.
      percent_complete: displayPct(task),
    });
  };

  const commitEdit = async (taskId) => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave({ id: taskId, ...editDraft });
      setEditingId(null);
      setEditDraft({});
    } catch (err) {
      console.error("Gantt save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  // Sync vertical scroll between left and right body
  const syncScroll = (from) => {
    const other = from === "left" ? rightBody.current : leftRef.current;
    const src = from === "left" ? leftRef.current : rightBody.current;
    if (src && other) {
      other.scrollTop = src.scrollTop;
      setBodyViewport((prev) => (
        prev.scrollTop === src.scrollTop && prev.height === src.clientHeight
          ? prev
          : { scrollTop: src.scrollTop, height: src.clientHeight || prev.height }
      ));
    }
  };

  // Sync horizontal scroll: right body → right header
  const syncHScroll = () => {
    if (rightBody.current && rightHead.current) {
      rightHead.current.scrollLeft = rightBody.current.scrollLeft;
    }
  };

  useEffect(() => {
    const body = rightBody.current || leftRef.current;
    if (!body) return undefined;
    const update = () => {
      setBodyViewport((prev) => {
        const next = { scrollTop: body.scrollTop || 0, height: body.clientHeight || prev.height };
        return next.scrollTop === prev.scrollTop && next.height === prev.height ? prev : next;
      });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  // ── Filter + group by phase ─────────────────────────────────────────
  const grouped = useMemo(() => {
    const filtered = phaseFilter === "all"
      ? rawTasks
      : rawTasks.filter(t => normalizePhase(t) === phaseFilter);

    const map = {};
    filtered.forEach(t => {
      const ph = normalizePhase(t) || "Uncategorized";
      if (!map[ph]) map[ph] = [];
      map[ph].push(t);
    });

    // Order by PHASES array, uncategorized last — tree-sort within each phase
    const ordered = [];
    PHASES.forEach(ph => {
      if (map[ph.key]) ordered.push({ phase: ph, tasks: buildTreeOrder(map[ph.key], { rootPrefix: ph.id }) });
    });
    if (map["Uncategorized"]) {
      ordered.push({ phase: { id: 99, key: "Uncategorized", label: "Uncategorized", color: GANTT_BASELINE_VAR }, tasks: buildTreeOrder(map["Uncategorized"], { rootPrefix: 99 }) });
    }
    return ordered;
  }, [rawTasks, phaseFilter]);

  // ── Date range ─────────────────────────────────────────────────────
  const allTasks = grouped.flatMap(g => g.tasks);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks]);
  const focusedTask = useMemo(
    () => focusedTaskId ? allTasks.find((task) => String(task.id) === String(focusedTaskId)) : null,
    [allTasks, focusedTaskId]
  );

  // ── Hierarchy editing via drag-and-drop ─────────────────────────────
  //
  // Each task carries parent_task_id in the DB. `buildTreeOrder()` (at the
  // top of this file) flattens the tree per phase so every row already has
  // _depth / _hasChildren. The left-panel rows are made draggable: drop ON
  // a row nests the dragged task under it; drop in the top/bottom band
  // reorders it as a sibling. The reparent is delegated to the parent via
  // onReparent (Schedule.tsx's reparentMut), which validates cycles, writes
  // sort_order, audits, and invalidates the cache. The pure zone math +
  // cycle filtering live in useTaskRowDnD / hierarchy.js so this surface
  // can't drift from the drawer picker or bulk reparent.
  const { dragId, dropTarget, onDragStart, onDragOverRow, onDropRow, onDragEnd } = useTaskRowDnD({
    tasks: allTasks,
    onReparent: (p) => onReparent?.(p),
    getScrollEl: () => leftRef.current,
  });

  // ── Effective dates ─────────────────────────────────────────────────
  // `effectiveDates` arrives as a PROP, computed once in Schedule.tsx over the
  // WHOLE project. It is deliberately not recomputed here.
  //
  // This component previously ran `computeEffectiveDates(allTasks)` — but
  // `allTasks` is phase-FILTERED, and scheduleCascade skips any link whose
  // predecessor is absent from the array it was handed. So filtering the Gantt
  // to one phase dropped every cross-phase predecessor and silently reverted
  // its successors to un-cascaded stored dates, with no indicator. Two thirds
  // of real predecessor links cross a phase boundary (Detailing -> Approval ->
  // Fab -> Delivery -> Erection is the normal shape of a steel job), so the
  // filter was changing the dates on screen rather than just narrowing them.
  // See docs/audits/SCHEDULE_MODULE_AUDIT_2026-09-08.md §1.1.
  //
  // The filter now narrows DISPLAY only. Stored dates are still never mutated.
  if (import.meta.env.DEV && rawTasks.length > 0 && Object.keys(effectiveDates).length === 0) {
    // Failing open here would render the entire project un-cascaded — exactly
    // the silence this wiring exists to remove — so make it loud in dev.
    console.error(
      "[ScheduleGantt] `effectiveDates` prop is empty while tasks are present. " +
      "Every bar will render at its stored date and cascaded rows will be wrong. " +
      "Check that ScheduleBody is passing effectiveDatesMap.",
    );
  }

  // ── Cycle observability ─────────────────────────────────────────────
  // The cascade flags every task in a predecessor cycle with `cycle: true`.
  // One toast per distinct cycle set tells the user their schedule has a loop;
  // without it the members silently fall back to stored dates and the row just
  // looks like "the cascade didn't shift this".
  //
  // Scoped to the RENDERED rows: the map now covers the whole project, and
  // naming loops on rows the user cannot see (and cannot reach under a filter)
  // would be noise. A partly-visible cycle still warns — the member on screen
  // is the one sitting on stored dates.
  const cycleTaskIdsKey = useMemo(
    () => computeCycleTaskIdsKey(effectiveDates, allTasks),
    [effectiveDates, allTasks],
  );
  useEffect(() => {
    if (!cycleTaskIdsKey) return;
    const count = cycleTaskIdsKey.split("|").filter(Boolean).length;
    toast.warning(
      `${count} task${count === 1 ? "" : "s"} in a predecessor cycle — falling back to stored dates`,
      { description: "Open the Dependencies tab on each affected row to break the loop." }
    );
  }, [cycleTaskIdsKey]);

  const effStart = (task) => effectiveDates[task.id]?.start || task.start_date;
  const effEnd   = (task) => effectiveDates[task.id]?.end   || task.end_date;

  // Date↔pixel projection: chart window, week/day scale, px/spanPx, today marker.
  const {
    WEEK_PX, dateRange, PX_PER_DAY, totalW,
    px, spanPx, todayPx, showToday, isCurrentWeek,
  } = useGanttLayout({ zoom, today, allTasks, deliveries, effStart, effEnd });

  // Two populations, deliberately distinct (audit §1.5):
  //   allTasks     — phase-filtered + tree-rolled. What is ON SCREEN. Correct
  //                  for anything DESCRIBING the current view.
  //   projectTasks — every task on the project, un-rolled. Correct for the
  //                  project-wide WRITE actions (baseline, date sync), which
  //                  must not silently do less than their dialog claims, and
  //                  for the drag's landing prediction, which has to see every
  //                  predecessor — not just the ones in the current phase.
  // Declared HERE, above its first consumer, so it is never in the temporal
  // dead zone for a hook argument below.
  const projectTasks = rawTasks;

  // Bar drag-to-reschedule (move / resize-start / resize-end) — useTaskBarDrag.
  const { taskDrag, startTaskBarDrag } = useTaskBarDrag({ onSave, saving, setSaving, PX_PER_DAY, suppressTaskClickRef, setTooltip, projectTasks });

  // ── Weather-risk overlay ───────────────────────────────────────────
  // Only attach risks to field-sensitive phases (Installation, Delivery).
  // Indoor work doesn't get flagged — a rainy day in Phoenix isn't a
  // problem for Detailing. Memoised keyed by (weatherRisk, allTasks)
  // so the lookup per row is O(1).
  const WEATHER_SENSITIVE_PHASES = WEATHER_SENSITIVE_PHASES_SET;
  const weatherRiskByTask = useMemo(
    () => buildWeatherRiskByTask(weatherRisk, allTasks, effStart, effEnd, risksForTaskWindow, WEATHER_SENSITIVE_PHASES),
    // effStart/effEnd depend on effectiveDates; adding it to deps keeps
    // the memo honest if dependencies shift a task into bad weather.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weatherRisk, allTasks, effectiveDates, WEATHER_SENSITIVE_PHASES],
  );

  // Overdue uses the *effective* finish so a task whose predecessor slipped
  // is judged against where the bar actually sits in the gantt — not the
  // stale stored finish. Tasks marked Complete are never overdue.
  const isOverdue = (task) => {
    if (!task || task.status === "Complete") return false;
    const e = parseDateUTC(effEnd(task));
    if (!e) return false;
    return e < today;
  };

  const scrollToToday = () => {
    if (rightBody.current) {
      const todayOffset = (today - dateRange.start) / 86400000 * (WEEK_PX / 7);
      rightBody.current.scrollLeft = Math.max(0, todayOffset - 200);
    }
  };

  const scrollToProjectStart = () => {
    if (rightBody.current) rightBody.current.scrollLeft = 0;
  };

  const scrollToProjectEnd = () => {
    if (rightBody.current) {
      rightBody.current.scrollLeft = Math.max(0, rightBody.current.scrollWidth - rightBody.current.clientWidth);
    }
  };

  const expandAllRows = () => {
    setCollapsed({});
    setCollapsedTasks({});
    setCollapsedDeliveries(false);
  };

  const collapseAllRows = () => {
    const phaseMap = {};
    grouped.forEach(({ phase }) => {
      phaseMap[phase.key] = true;
    });
    setCollapsed(phaseMap);
    setCollapsedDeliveries(true);
  };

  // Auto-scroll to today ONCE, after the timeline first has data — then never
  // again, so the user's horizontal scrolling is never yanked back to the start
  // on a re-render (data refetch, vertical scroll, zoom, hover, etc.). The
  // Today / Start / End buttons re-center on demand.
  const didAutoScrollRef = useRef(false);
  useEffect(() => {
    if (didAutoScrollRef.current) return undefined;
    const timer = setTimeout(() => {
      if (rightBody.current && dateRange.weeks.length > 0) {
        const todayOffset = (today - dateRange.start) / 86400000 * (WEEK_PX / 7);
        rightBody.current.scrollLeft = Math.max(0, todayOffset - rightBody.current.clientWidth / 3);
        didAutoScrollRef.current = true;
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [dateRange.start, dateRange.weeks.length, today, WEEK_PX]);

  // Stats: one pass over the visible schedule model. This keeps filter/search
  // changes responsive on large imported schedules.
  const scheduleStats = useMemo(
    () =>
      computeScheduleStats(allTasks, {
        today,
        effectiveDates,
        weatherRiskByTask,
        effStart,
        effEnd,
        isOverdue,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, effectiveDates, today, weatherRiskByTask],
  );

  const {
    totalTasks,
    completeTasks,
    overdueTasks,
    inProgressTasks,
    unscheduledTasks,
    lookaheadTasks,
    stalledTasks,
    criticalTasks,
    milestoneTasks,
    shiftedTasks,
    totalShiftDays,
    unassignedTasks,
    weatherRiskTasks,
    dependencyLinks,
    avgProgress,
  } = scheduleStats;

  // ── Baseline stats & handler ─────────────────────────────────────────
  // Stays VIEW-scoped on purpose: it only gates the baseline toggle and the
  // legend, both of which describe what is currently rendered. A project that
  // has baselines elsewhere but none in this phase has nothing to overlay here.
  const baselineTaskCount = useMemo(
    () => allTasks.filter((t) => getTaskBaseline(t, baselineMap) !== null).length,
    [allTasks, baselineMap]
  );

  const handleSetBaseline = async () => {
    if (saving) return;
    if (!projectId) {
      toast.error("Select a project before taking a baseline.");
      return;
    }
    // Rows are built from STORED dates, so count on the same basis the snapshot
    // will use — counting dated-by-effective would promise rows that
    // buildBaselineRows then skips.
    const rows = buildBaselineRows(projectTasks);
    if (rows.length === 0) {
      toast.info("No tasks with dates to baseline.");
      return;
    }

    const name = window.prompt(
      `Name this baseline — ${rows.length} dated task${rows.length === 1 ? "" : "s"}.\n\n` +
      "This covers the whole project, not just the phase you are viewing. " +
      "It snapshots the dates as entered, not the cascaded dates the bars show.\n\n" +
      "Baselines are never overwritten — this is added alongside any already taken.\n" +
      "Examples: \"Baseline 0 — contract\", \"Rev 2 — CO 14 time extension\".",
      `Baseline ${todayLocalISO()}`,
    );
    if (name === null) return; // cancelled
    if (!name.trim()) {
      toast.error("A baseline needs a name.");
      return;
    }

    const reason = window.prompt(
      "Why is this baseline being taken? (optional, but this is the field that " +
      "answers \"who changed the contract schedule and on what authority\")",
      "",
    );
    if (reason === null) return; // cancelled at the second step

    setSaving(true);
    try {
      const { baseline, rowsWritten, rowsFailed } = await createBaseline({
        projectId,
        name,
        reason,
        // The WHOLE project, never the phase-filtered rows — §1.5 shipped a
        // version that baselined one phase while the dialog counted the job.
        tasks: projectTasks,
      });

      if (rowsFailed > 0) {
        // A baseline missing rows is worse than no baseline if nobody knows.
        toast.warning(
          `Baseline "${baseline.name}" saved with ${rowsWritten} of ${rowsWritten + rowsFailed} tasks — ${rowsFailed} failed. Retract and retake it rather than relying on a partial snapshot.`,
        );
      } else {
        toast.success(`Baseline "${baseline.name}" set for ${rowsWritten} tasks`);
      }
      onBaselineChange?.();
    } catch (err) {
      toast.error("Failed to set baseline: " + (err?.message || "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  // ── "Update Scheduled Dates" ─────────────────────────────────────────
  // The Gantt renders cascaded (effective) dates, but the DB — and the Task
  // Drawer — hold the entered start_date/end_date, so a task pushed by a late
  // predecessor looks one way on the bar and another in the drawer. This
  // writes the computed dates back so the two agree. Only tasks the cascade
  // actually shifted are touched; cycle members (whose effective dates fall
  // back to stored) and tasks without a computed start/end are skipped, so we
  // never invent a date on a TBD task.
  // Pure + unit-tested: see scheduleGanttDerive.selectShiftedSyncTasks. Takes
  // the WHOLE project (not the filtered rows) and skips summary rows, whose
  // dates the DB rollup trigger owns.
  const shiftedSyncTasks = useMemo(
    () => selectShiftedSyncTasks(projectTasks, effectiveDates),
    [projectTasks, effectiveDates]
  );

  const handleSyncScheduledDates = async () => {
    if (!onSave || saving) return;
    const n = shiftedSyncTasks.length;
    if (n === 0) {
      toast.info("Scheduled dates already match the Gantt — nothing to sync.");
      return;
    }
    const confirmed = window.confirm(
      `Update scheduled dates for ${n} task${n === 1 ? "" : "s"} across this project?\n\n` +
      "Dependency logic has pushed these tasks past their saved dates, so the Gantt " +
      "shows later dates than what's stored. This writes the computed start/end back " +
      "to each task so the saved schedule matches the Gantt.\n\n" +
      "This covers the whole project, not just the phase you are viewing. " +
      "Summary rows are skipped — their dates roll up from their children. " +
      "Baselines are not changed."
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      const updates = shiftedSyncTasks.map((task) =>
        onSave({
          id: task.id,
          start_date: toDateOnly(effStart(task)),
          end_date: toDateOnly(effEnd(task)),
        })
      );
      for (let i = 0; i < updates.length; i += 10) {
        await Promise.all(updates.slice(i, i + 10));
      }
      toast.success(`Updated ${n} scheduled date${n === 1 ? "" : "s"} to match the Gantt`);
    } catch (err) {
      toast.error("Failed to update scheduled dates: " + (err?.message || "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const successorCountById = useMemo(() => computeSuccessorCountById(allTasks), [allTasks]);
  const logicGapTasks = allTasks.filter(t => hasLogicGapTask(t, successorCountById)).length;

  const normalizedSearch = searchText.trim().toLowerCase();
  const hasActiveRowFilter = normalizedSearch.length > 0 || quickFilter !== "all";

  const visibleTaskIds = useMemo(
    () => computeVisibleTaskIds({
      allTasks,
      grouped,
      normalizedSearch,
      quickFilter,
      hasActiveRowFilter,
      effectiveDates,
      successorCountById,
      weatherRiskByTask,
      today,
      isOverdue,
      effStart,
      effEnd,
    }),
    [
      allTasks,
      grouped,
      normalizedSearch,
      quickFilter,
      hasActiveRowFilter,
      effectiveDates,
      successorCountById,
      weatherRiskByTask,
    ],
  );

  const visibleGrouped = useMemo(() => {
    if (!visibleTaskIds) return grouped;
    return grouped
      .map(({ phase, tasks }) => ({
        phase,
        tasks: tasks.filter((task) => visibleTaskIds.has(task.id)),
      }))
      .filter(({ tasks }) => tasks.length > 0);
  }, [grouped, visibleTaskIds]);

  const visibleTaskCount = visibleTaskIds ? allTasks.filter((task) => visibleTaskIds.has(task.id)).length : totalTasks;

  const togglePhase = (key) => setCollapsed(c => ({ ...c, [key]: !c[key] }));

  // Build flat row list for synchronized scroll + row position tracking
  const rows = useMemo(() => {
    const list = [];

    // Check if task should be visible (no collapsed ancestor in task tree)
    const isTaskVisible = (task, allPhaseTasks) => {
      let pid = task.parent_task_id;
      while (pid) {
        if (collapsedTasks[pid]) return false;
        const parent = allPhaseTasks.find(t => t.id === pid);
        if (!parent) break;
        pid = parent.parent_task_id;
      }
      return true;
    };

    // Helper: insert delivery entity rows into the list
    const insertDeliveryRows = () => {
      if (!showDeliveries || deliveries.length === 0) return;
      const delStarts = deliveries.map(d => d.scheduled_date).filter(Boolean).sort();
      const delEnds = deliveries.map(d => d.required_date || d.actual_date || d.scheduled_date).filter(Boolean).sort();
      const deliveredCount = deliveries.filter(d => d.status === "Delivered").length;
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
          .forEach(d => {
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
      const avgPct = progressBasis.length > 0
        ? progressBasis.reduce((sum, t) => sum + displayPct(t), 0) / progressBasis.length
        : 0;

      // Phase summary bar spans from the earliest *effective* start to the
      // latest *effective* end so a delayed predecessor visibly stretches
      // its parent phase, matching what the task bars actually show.
      const starts = tasks.map(t => effStart(t)).filter(Boolean).sort();
      const ends   = tasks.map(t => effEnd(t)).filter(Boolean).sort();
      list.push({ type: "summary", phase, tasks, start: starts[0], end: ends[ends.length - 1], pctComplete: avgPct });
      if (!collapsed[phase.key]) {
        tasks.forEach(t => {
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
    // `effectiveDates` is a real dependency: the phase-band start/end above are
    // derived through effStart/effEnd. It used to be recomputed from `allTasks`
    // (already a dep via visibleGrouped) so it never needed listing; now that it
    // arrives as a prop it can change on its own.
  }, [visibleGrouped, collapsed, collapsedTasks, showDeliveries, deliveries, collapsedDeliveries, effectiveDates]);

  const taskPositions = useMemo(() => buildTaskPositions(rows, GANTT_ROW_H, GANTT_SUM_H), [rows]);

  const depArrows = useMemo(
    () => buildDepArrows({ rows, taskPositions, taskById, effStart, effEnd, px }),
    // effStart/effEnd read `effectiveDates`; as a prop it can change without
    // `rows` changing, which would leave the arrows pointing at stale endpoints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, taskPositions, taskById, effectiveDates],
  );

  const rowLayout = useMemo(() => buildRowLayout(rows, GANTT_ROW_H, GANTT_SUM_H), [rows]);

  const totalHeight = rowLayout.totalHeight;
  const virtualRows = useMemo(
    () => sliceVirtualRows(rowLayout, bodyViewport.scrollTop, bodyViewport.height),
    [rowLayout, bodyViewport],
  );

  const { virtualTopPadding, virtualBottomPadding } = computeVirtualPadding(virtualRows, totalHeight);

  useEffect(() => {
    if (!focusedTaskId) return;
    const focusedRow = rowLayout.items.find((item) => (
      item.row.type === "task" && String(item.row.task?.id) === String(focusedTaskId)
    ));
    if (!focusedRow) return;

    const targetTop = Math.max(0, focusedRow.top - 96);
    requestAnimationFrame(() => {
      if (leftRef.current) leftRef.current.scrollTop = targetTop;
      if (rightBody.current) rightBody.current.scrollTop = targetTop;
      setBodyViewport((prev) => (
        prev.scrollTop === targetTop ? prev : { scrollTop: targetTop, height: rightBody.current?.clientHeight || leftRef.current?.clientHeight || prev.height }
      ));
    });
  }, [focusedTaskId, rowLayout, externalFocus?.requestedAt]);

  const visibleDepArrows = useMemo(
    () => filterVisibleDepArrows(depArrows, bodyViewport.scrollTop, bodyViewport.height),
    [depArrows, bodyViewport],
  );

  return (
    <div ref={containerRef} data-gantt-export-root style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: GANTT_BG_VAR, overflow: "hidden" }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div data-gantt-export-exclude style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "6px 16px", borderBottom: `1px solid ${GANTT_GRID_STRONG_VAR}`, background: GANTT_PANEL_VAR }}>
        {/* Stats */}
        <GanttStatsBar
          totalTasks={totalTasks} completeTasks={completeTasks} inProgressTasks={inProgressTasks}
          overdueTasks={overdueTasks} criticalTasks={criticalTasks}
          shiftedTasks={shiftedTasks} unscheduledTasks={unscheduledTasks}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 360 }}>
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search WBS, task, resource, status..."
            aria-label="Search Gantt tasks"
            style={{
              width: 260,
              height: 28,
              borderRadius: 8,
              border: "1px solid var(--border-default)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              padding: "0 10px",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              outline: "none",
            }}
          />
          {hasActiveRowFilter && (
            <button
              type="button"
              onClick={() => { setSearchText(""); setQuickFilter("all"); setFocusedTaskId(null); }}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--divider)",
                background: "transparent",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Clear
            </button>
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {visibleTaskCount}/{totalTasks} visible
          </span>
          {focusedTask && (
            <button
              type="button"
              onClick={() => setFocusedTaskId(null)}
              title="Clear Rivet task focus"
              style={{
                maxWidth: 220,
                padding: "4px 8px",
                borderRadius: 999,
                border: `1px solid ${tint(GANTT_STATUS_HEX.inProgress, 53)}`,
                background: tint(GANTT_STATUS_HEX.inProgress, 9),
                color: GANTT_STATUS_HEX.inProgress,
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Rivet Focus: {sanitizeTaskName(focusedTask)}
            </button>
          )}
        </div>
        {/* Controls */}
        {submittals.filter(s => s.is_submittal && s.linked_wp_id).length > 0 && (
          <button
            onClick={() => setShowSubmittals(v => !v)}
            style={{
              padding: "4px 10px", borderRadius: 4,
              border: showSubmittals ? `1px solid ${GANTT_STATUS_HEX.inProgress}` : "1px solid var(--divider)",
              background: showSubmittals ? tint(GANTT_STATUS_HEX.inProgress, 10) : "transparent",
              color: showSubmittals ? GANTT_STATUS_HEX.inProgress : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            📂 Submittals ({submittals.filter(s => s.is_submittal && s.linked_wp_id).length})
          </button>
        )}
        {deliveries.length > 0 && (
          <button
            onClick={() => setShowDeliveries(v => !v)}
            style={{
              padding: "4px 10px", borderRadius: 4,
              border: showDeliveries ? `1px solid ${GANTT_PHASE_VAR.Delivery}` : "1px solid var(--divider)",
              background: showDeliveries ? `color-mix(in srgb, ${GANTT_PHASE_VAR.Delivery} 12%, transparent)` : "transparent",
              color: showDeliveries ? GANTT_PHASE_VAR.Delivery : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            🚛 Deliveries ({deliveries.length})
          </button>
        )}
        {baselineTaskCount > 0 && (
          <button
            onClick={() => setShowBaseline(v => !v)}
            style={{
              padding: "4px 10px", borderRadius: 4,
              border: showBaseline ? `1px solid color-mix(in srgb, ${GANTT_BASELINE_VAR} 70%, transparent)` : "1px solid var(--divider)",
              background: showBaseline ? `color-mix(in srgb, ${GANTT_BASELINE_VAR} 14%, transparent)` : "transparent",
              color: showBaseline ? GANTT_BASELINE_VAR : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            Baseline {showBaseline ? "ON" : "OFF"}
          </button>
        )}
        {onSave && (
          <button
            onClick={handleSetBaseline}
            /* Without this, a double-click fires the whole project-wide write
               set twice concurrently. The sync button beside it already
               guarded; this one did not. */
            disabled={saving}
            title="Snapshot every dated task on this project as the baseline for variance tracking"
            style={{
              padding: "4px 10px", borderRadius: 4,
              border: "1px solid var(--divider)",
              background: "transparent",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1,
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            Set Baseline
          </button>
        )}
        {onSave && shiftedSyncTasks.length > 0 && (
          <button
            onClick={handleSyncScheduledDates}
            disabled={saving}
            title="Dependency logic has pushed these tasks past their saved dates. Click to write the computed start/end back so the saved schedule (and the Task Drawer) match the Gantt."
            style={{
              padding: "4px 10px", borderRadius: 4,
              border: "1px solid var(--accent-border)",
              background: "var(--accent-muted)",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800,
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
              letterSpacing: "0.06em", textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            ⟳ Update Scheduled Dates ({shiftedSyncTasks.length})
          </button>
        )}
        <button onClick={scrollToToday} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--accent-border)", background: "transparent", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Today
        </button>
        <button onClick={scrollToProjectStart} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--divider)", background: "transparent", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Start
        </button>
        <button onClick={scrollToProjectEnd} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--divider)", background: "transparent", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          End
        </button>
        <button onClick={expandAllRows} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--divider)", background: "transparent", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Expand
        </button>
        <button onClick={collapseAllRows} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--divider)", background: "transparent", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Collapse
        </button>
        <div style={{ display: "flex", border: "1px solid var(--divider)", borderRadius: 4, overflow: "hidden" }}>
          {["month", "week", "day"].map(z => (
            <button key={z} onClick={() => setZoom(z)} style={{ padding: "4px 10px", border: "none", background: zoom === z ? "var(--accent-muted)" : "transparent", color: zoom === z ? "var(--accent)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {z}
            </button>
          ))}
        </div>
      </div>

      {/* ── Synchronized header row ─────────────────────────────────── */}
      <div data-gantt-export-exclude style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "stretch",
        gap: 10,
        padding: "8px 16px",
        borderBottom: "1px solid var(--divider)",
        background: "var(--sched-toolbar-bg)",
        overflowX: "auto",
      }}>
        <GanttQuickFilters active={quickFilter} onSelect={(key) => { setQuickFilter(key); setFocusedTaskId(null); }} />
        <div style={{ width: 1, background: "var(--divider)", flexShrink: 0 }} />
        <GanttMetricCards
          avgProgress={avgProgress} lookaheadTasks={lookaheadTasks} stalledTasks={stalledTasks}
          logicGapTasks={logicGapTasks} unassignedTasks={unassignedTasks} shiftedTasks={shiftedTasks}
          totalShiftDays={totalShiftDays} dependencyLinks={dependencyLinks}
          milestoneTasks={milestoneTasks} weatherRiskTasks={weatherRiskTasks}
        />
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          style={{
            marginLeft: "auto",
            padding: "5px 10px",
            borderRadius: 8,
            border: "1px solid var(--divider)",
            background: showLegend ? GANTT_ROW_HOVER_VAR : GANTT_PANEL_STRONG_VAR,
            color: showLegend ? "var(--accent)" : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {showLegend ? "Hide Guide" : "Show Guide"}
        </button>
      </div>

      {showLegend && <GanttLegend baselineTaskCount={baselineTaskCount} />}

      <div style={{ display: "flex", flexShrink: 0, height: HEAD_H, borderBottom: "1px solid var(--divider)" }}>
        {/* Left header — each column cell wraps its label in a relative
            container with a drag handle on the right edge. Dragging any
            handle resizes THAT column; TASK NAME (flex) auto-rebalances.
            Double-click the handle to reset that single column to its
            default width; double-click the "% " header to reset ALL. */}
        <div style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, background: GANTT_HEADER_VAR, borderRight: `1px solid ${GANTT_GRID_STRONG_VAR}`, display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 4 }}>
          {["WBS", "TASK NAME", "DUR", "START", "FINISH", "PRED", "RESOURCES", "STATUS", "STAGE", "%"].map((h, i) => (
            <div key={i} style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", overflow: "visible" }}
                 onDoubleClick={i === 9 ? resetColWidths : undefined}
                 title={i === 9 ? "Double-click to reset all column widths" : undefined}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "var(--text-muted)", textTransform: "uppercase", textAlign: i >= 2 ? "center" : "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{h}</span>
              {/* Drag handle — last column has no handle (nothing to its right) */}
              {i < 9 && (
                <div
                  onMouseDown={(e) => startColResize(i, e)}
                  onDoubleClick={(e) => { e.stopPropagation(); resetColumn(i); }}
                  title="Drag to resize · double-click to reset"
                  style={{
                    position: "absolute",
                    right: -6,
                    top: 4,
                    bottom: 4,
                    width: 8,
                    cursor: "col-resize",
                    zIndex: 5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => { const bar = e.currentTarget.firstChild; if (bar) bar.style.background = "var(--accent)"; }}
                  onMouseLeave={(e) => { const bar = e.currentTarget.firstChild; if (bar) bar.style.background = "var(--divider)"; }}
                >
                  <div style={{ width: 2, height: "60%", background: "var(--divider)", borderRadius: 1, transition: "background 120ms" }} />
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Right timeline header — Gantter-AI two-tier strip:
            top half is the month band (only the first week of a month
            renders the month label, rest stay transparent so the eye
            reads the month as a wide segment); bottom half shows
            week-of-year + start-of-week date. Current week is
            highlighted with the accent color across both tiers. */}
        <div ref={rightHead} style={{ flex: 1, overflowX: "hidden", overflowY: "hidden", background: GANTT_HEADER_VAR }}>
          <div style={{ display: "flex", width: totalW, height: HEAD_H, position: "relative" }}>
            {dateRange.weeks.map((week, i) => {
              const cur = isCurrentWeek(week);
              const banded = i % 2 === 1 && !cur;
              // First week of a month — used to emit the month label
              // and render a slightly stronger left-edge divider.
              const isMonthStart = week.getDate() <= 7;
              const headerBg = cur
                ? GANTT_TODAY_SOFT_VAR
                : banded
                  ? GANTT_WEEKEND_VAR
                  : "transparent";
              const monthLabel = isMonthStart
                ? week.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).toUpperCase()
                : "";
              return (
                <div key={i} style={{
                  minWidth: WEEK_PX,
                  borderRight: `1px solid ${GANTT_GRID_VAR}`,
                  borderLeft: isMonthStart ? `1px solid ${GANTT_GRID_STRONG_VAR}` : "none",
                  display: "flex",
                  flexDirection: "column",
                  background: headerBg,
                  position: "relative",
                }}>
                  {/* Top tier: month label (only on month-start weeks) */}
                  <div style={{
                    height: "44%",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 8,
                    borderBottom: `1px solid ${GANTT_GRID_VAR}`,
                  }}>
                    {monthLabel && (
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: "0.14em",
                        color: cur ? "var(--accent)" : "var(--text-secondary)",
                      }}>
                        {monthLabel}
                      </span>
                    )}
                  </div>
                  {/* Bottom tier: week-of-year + start date */}
                  <div style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                  }}>
                    <span className="sbd-num" style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      color: cur ? "var(--accent)" : "var(--text-muted)",
                      letterSpacing: "0.06em",
                    }}>
                      {week.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="sbd-num" style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 7,
                      fontWeight: 600,
                      color: cur ? "var(--accent)" : "var(--text-muted)",
                      letterSpacing: "0.10em",
                      opacity: cur ? 1 : 0.7,
                    }}>
                      WK {Math.ceil((week - new Date(week.getFullYear(), 0, 1)) / 604800000)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* Left panel */}
        <div ref={leftRef} onScroll={() => syncScroll("left")} style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, overflowY: "auto", overflowX: "hidden", borderRight: `1px solid ${GANTT_GRID_STRONG_VAR}`, background: GANTT_LEFT_VAR }}>
          {rows.length === 0 && (
            <div style={{ padding: 18, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              No tasks match the current Gantt filters.
            </div>
          )}
          {virtualTopPadding > 0 && <div aria-hidden="true" style={{ height: virtualTopPadding, flexShrink: 0 }} />}
          <GanttLeftPanelRows
            virtualRows={virtualRows}
            collapsed={collapsed}
            togglePhase={togglePhase}
            collapsedDeliveries={collapsedDeliveries}
            setCollapsedDeliveries={setCollapsedDeliveries}
            GRID={GRID}
            today={today}
            setHoveredRowId={setHoveredRowId}
            taskById={taskById}
            successorCountById={successorCountById}
            effectiveDates={effectiveDates}
            editingId={editingId}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            hoveredRowId={hoveredRowId}
            focusedTaskId={focusedTaskId}
            dropTarget={dropTarget}
            dragId={dragId}
            onDragStart={onDragStart}
            onDragOverRow={onDragOverRow}
            onDropRow={onDropRow}
            onDragEnd={onDragEnd}
            onTaskClick={onTaskClick}
            commitEdit={commitEdit}
            cancelEdit={cancelEdit}
            onSave={onSave}
            startInlineEdit={startInlineEdit}
            toggleTask={toggleTask}
            collapsedTasks={collapsedTasks}
            weatherRiskByTask={weatherRiskByTask}
            weatherRisk={weatherRisk}
            saving={saving}
            effStart={effStart}
            effEnd={effEnd}
            isOverdue={isOverdue}
          />
          {virtualBottomPadding > 0 && <div aria-hidden="true" style={{ height: virtualBottomPadding, flexShrink: 0 }} />}
        </div>

        {/* Right gantt panel */}
        <div ref={rightBody} onScroll={() => { syncScroll("right"); syncHScroll(); }} style={{ flex: 1, overflowX: "auto", overflowY: "auto", background: GANTT_BG_VAR, position: "relative" }}>
          <div style={{ width: totalW, height: totalHeight, position: "relative" }}>

            {/* Alternating week bands — softer than before to match the
                Gantter-AI dark canvas. Bands sit at zIndex 0 so dividers,
                today marker, and bars all paint on top. */}
            {dateRange.weeks.map((w, i) => (
              i % 2 === 1 ? (
                <div key={`band-${i}`} style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: i * WEEK_PX,
                  width: WEEK_PX,
                  background: GANTT_WEEKEND_VAR,
                  pointerEvents: "none",
                  zIndex: 0,
                }} />
              ) : null
            ))}

            {/* Today line — Gantter-AI-style: a soft full-height accent
                wash behind a crisp 2px center stripe, plus a small pill
                label. The wash gives the line presence even where bars
                are dense; the center stripe keeps the exact "now"
                position readable. */}
            {showToday && (
              <>
                {/* Soft wash — wider, low-opacity stripe behind the bars */}
                <div style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: todayPx - 12, width: 24,
                  background: `linear-gradient(90deg, transparent 0%, ${GANTT_TODAY_SOFT_VAR} 50%, transparent 100%)`,
                  pointerEvents: "none",
                  zIndex: 6,
                }} />
                {/* Sharp center line — sits above bars so it never gets
                    visually swallowed by a colored fill. */}
                <div style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: todayPx - 1, width: 2,
                  background: GANTT_TODAY_VAR,
                  zIndex: 12,
                  boxShadow: `0 0 4px color-mix(in srgb, ${GANTT_TODAY_VAR} 65%, transparent), 0 0 12px color-mix(in srgb, ${GANTT_TODAY_VAR} 35%, transparent)`,
                }}>
                  <div style={{
                    position: "absolute", top: 0, left: -22,
                    background: GANTT_TODAY_VAR,
                    borderRadius: "2px 2px 2px 0",
                    padding: "2px 6px",
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800,
                    color: "var(--on-accent)", letterSpacing: "0.10em",
                    whiteSpace: "nowrap",
                    boxShadow: `0 2px 6px color-mix(in srgb, ${GANTT_BG_VAR} 70%, transparent)`,
                  }}>TODAY</div>
                </div>
              </>
            )}

            {/* Week / month grid lines — week boundaries are a hairline
                rgba so they don't compete with bars; month boundaries
                get a slightly stronger line so the eye can navigate the
                long timeline by month at a glance. */}
            {dateRange.weeks.map((w, i) => {
              const isMonthStart = w.getDate() <= 7;
              return (
                <div key={i} style={{
                  position: "absolute", top: 0, bottom: 0, left: i * WEEK_PX, width: 1,
                  background: isMonthStart ? GANTT_GRID_STRONG_VAR : GANTT_GRID_VAR,
                  zIndex: 1,
                  pointerEvents: "none",
                }} />
              );
            })}

            {/* Dependency arrows — SVG overlay. Steel-blue 1px line with
                a small filled arrowhead — quiet enough not to compete
                with the bars but clear enough to trace a chain at a
                glance. Sits at zIndex 5 so it paints below the today
                line (12) but above the week bands and grid lines. */}
            {visibleDepArrows.length > 0 && (
              <svg style={{ position: "absolute", top: 0, left: 0, width: totalW, height: totalHeight, pointerEvents: "none", zIndex: 5 }}>
                <defs>
                  <marker id="depArrowHead" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto-start-reverse">
                    <polygon points="0 0, 10 3.5, 0 7" fill={GANTT_DEPENDENCY_VAR} />
                  </marker>
                </defs>
                {visibleDepArrows.map(({ key, fromX, fromY, toX, toY }) => {
                  // Finish-to-Start arrow: from end of predecessor to start of successor
                  const gap = 8;
                  const midX = fromX + gap;
                  const sameRow = Math.abs(fromY - toY) < 4;
                  const stroke = GANTT_DEPENDENCY_VAR;
                  const strokeOpacity = 0.65;
                  if (sameRow) {
                    return (
                      <line key={key} x1={fromX} y1={fromY} x2={toX - 2} y2={toY}
                        stroke={stroke} strokeOpacity={strokeOpacity} strokeWidth="1" markerEnd="url(#depArrowHead)" />
                    );
                  }
                  const path = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX - 2} ${toY}`;
                  return (
                    <path key={key} d={path} fill="none" stroke={stroke} strokeOpacity={strokeOpacity} strokeWidth="1" markerEnd="url(#depArrowHead)" />
                  );
                })}
              </svg>
            )}

            {/* Rows */}
            <GanttTimelineRows
              virtualRows={virtualRows}
              effStart={effStart}
              effEnd={effEnd}
              px={px}
              spanPx={spanPx}
              today={today}
              hoveredRowId={hoveredRowId}
              setHoveredRowId={setHoveredRowId}
              focusedTaskId={focusedTaskId}
              suppressTaskClickRef={suppressTaskClickRef}
              onTaskClick={onTaskClick}
              taskDrag={taskDrag}
              onSave={onSave}
              saving={saving}
              startTaskBarDrag={startTaskBarDrag}
              showBaseline={showBaseline}
              baselineMap={baselineMap}
              showSubmittals={showSubmittals}
              submittals={submittals}
              setTooltip={setTooltip}
              isOverdue={isOverdue}
            />
          </div>
        </div>
      </div>

      {/* ── Tooltip ─────────────────────────────────────────────────── */}
      {/* Uses the design-system .sbd-card-strong surface (frosted dark
          panel + subtle inner border) so the hover card matches the
          rest of the SteelBuild dark theme instead of the flat
          background-surface previous version. */}
      {taskDrag?.hasMoved && (
        <div
          className="sbd-card-strong"
          style={{
            position: "fixed",
            left: taskDrag.x + 12,
            top: taskDrag.y - 12,
            zIndex: 10000,
            padding: "8px 10px",
            pointerEvents: "none",
            borderRadius: 7,
            boxShadow: "var(--shadow-lg)",
            minWidth: 220,
          }}
        >
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>
            {taskDrag.taskName}
          </div>
          <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.04em" }}>
            {(() => {
              const m = taskDrag.mode || "move";
              const s = addDaysUTC(taskDrag.displayStart, m === "resize-end" ? 0 : taskDrag.daysDelta);
              const e = addDaysUTC(taskDrag.displayEnd, m === "resize-start" ? 0 : taskDrag.daysDelta);
              const head = m === "move"
                ? `${taskDrag.daysDelta > 0 ? "+" : ""}${taskDrag.daysDelta}d`
                : `${Math.max(0, Math.round((e - s) / 86400000))}d dur`;
              return `${head} | ${fmtDate(s)} - ${fmtDate(e)}`;
            })()}
          </div>
        </div>
      )}

      {tooltip && (
        <div className="sbd-card-strong" style={{
          position: "fixed",
          left: tooltip.x + 12,
          top: tooltip.y - 10,
          zIndex: 9999,
          padding: "10px 14px",
          pointerEvents: "none",
          minWidth: 260,
          boxShadow: "var(--shadow-lg)",
          borderRadius: 8,
        }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "0.01em" }}>
            {sanitizeTaskName(tooltip.task)}
          </div>
          {tooltip.task.wbs_code && (
            <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.06em" }}>
              WBS · {tooltip.task.wbs_code}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {isCriticalTask(tooltip.task) && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--status-warning)", border: "1px solid var(--status-warning)", borderRadius: 999, padding: "2px 6px" }}>
                Critical
              </span>
            )}
            {isMilestoneTask(tooltip.task) && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999, padding: "2px 6px" }}>
                Milestone
              </span>
            )}
            {effectiveDates[tooltip.task.id]?.shifted && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderRadius: 999, padding: "2px 6px" }}>
                Shifted {effectiveDates[tooltip.task.id]?.shiftedBy || 0}d
              </span>
            )}
            {hasLogicGapTask(tooltip.task, successorCountById) && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--status-warning)", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderRadius: 999, padding: "2px 6px" }}>
                Logic gap
              </span>
            )}
            {isUnassignedTask(tooltip.task) && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 999, padding: "2px 6px" }}>
                No owner
              </span>
            )}
            {hasBaselineDrift(tooltip.task, effStart(tooltip.task), effEnd(tooltip.task), baselineMap) && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: GANTT_BASELINE_VAR, background: `color-mix(in srgb, ${GANTT_BASELINE_VAR} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${GANTT_BASELINE_VAR} 40%, transparent)`, borderRadius: 999, padding: "2px 6px" }}>
                Baseline drift
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(tooltip.task.status), flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: statusColor(tooltip.task.status), fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {tooltip.task.status || "Not Started"}
            </span>
          </div>
          <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", marginBottom: 2 }}>
            {fmtDate(tooltip.task.start_date)} → {fmtDate(tooltip.task.end_date)}
          </div>
          <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 2 }}>
            Effective {fmtDate(effStart(tooltip.task))} to {fmtDate(effEnd(tooltip.task))} / {calcDuration(effStart(tooltip.task), effEnd(tooltip.task))}
          </div>
          {(() => {
            const bl = getTaskBaseline(tooltip.task, baselineMap);
            if (!bl) return null;
            const drifted = hasBaselineDrift(tooltip.task, effStart(tooltip.task), effEnd(tooltip.task), baselineMap);
            return (
              <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: drifted ? "var(--status-warning)" : "var(--text-muted)", marginBottom: 2 }}>
                Baseline {fmtDate(bl.start)} to {fmtDate(bl.end)}{drifted ? " (drifted)" : ""}
              </div>
            );
          })()}
          <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isOverdue(tooltip.task) ? GANTT_STATUS_HEX.delayed : "var(--text-secondary)" }}>
            {displayPct(tooltip.task)}% complete{isOverdue(tooltip.task) ? " · OVERDUE" : ""}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${GANTT_GRID_VAR}` }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Pred</div>
              <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)", fontWeight: 800 }}>
                {parseDeps(tooltip.task.dependencies).length}
              </div>
              {parseDeps(tooltip.task.dependencies).length === 0 && hasLogicGapTask(tooltip.task, successorCountById) && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-warning)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Missing
                </div>
              )}
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Succ</div>
              <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)", fontWeight: 800 }}>
                {successorCountById[tooltip.task.id] || 0}
              </div>
              {!successorCountById[tooltip.task.id] && hasLogicGapTask(tooltip.task, successorCountById) && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-warning)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Missing
                </div>
              )}
            </div>
          </div>
          {weatherRiskByTask[tooltip.task.id] && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${GANTT_GRID_VAR}` }}>
              Weather risk: {pluralize(weatherRiskByTask[tooltip.task.id].length, "day")}
            </div>
          )}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: taskOwner(tooltip.task) ? "var(--text-muted)" : "var(--status-error)", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${GANTT_GRID_VAR}` }}>
            Owner: {taskOwner(tooltip.task) || "Unassigned"}
          </div>
          {onSave && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 6, opacity: 0.65 }}>
              Double-click row to edit
            </div>
          )}
        </div>
      )}
    </div>
  );
}
