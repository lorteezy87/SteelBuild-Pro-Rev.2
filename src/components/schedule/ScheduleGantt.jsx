import React, { useMemo, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { risksForTaskWindow } from "@/lib/weatherRisk";
import { computeEffectiveDates } from "@/services/scheduleCascade";
import {
  MIN_YEAR,
  MAX_YEAR,
  parseDateUTC,
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
  StatusChip,
  SummaryBar,
  StageGateMilestones,
  TaskBar,
  SubmittalBar,
  DeliveryBar,
} from "./scheduleGanttBars";

const DELIVERY_STATUS_DOT = {
  "Scheduled":  "#F59E0B",
  "In Transit": "#3B82F6",
  "Delivered":  "#10B981",
  "Partial":    "#EF4444",
  "Rejected":   "#EF4444",
  "Delayed":    "#DC2626",
};

const ROW_H   = 40;
const SUM_H   = 36;
const HEAD_H  = 40;

// Column widths are now user-adjustable via drag handles on each header.
// TASK NAME is "flex" (takes remaining space) — represented as 0 in the
// state array and rendered as 1fr in the CSS grid. Every other column is
// a fixed pixel width the user can drag wider/narrower. Persisted to
// localStorage so the user's layout sticks across reloads.
//
// Header order: WBS · TASK · DUR · START · FINISH · PRED · RESOURCES ·
//               STATUS · STAGE · %
const DEFAULT_COL_WIDTHS = [50, 0, 40, 68, 68, 48, 80, 72, 88, 36];
const MIN_COL_WIDTH = 24;
// Task-name (flex) column gets at least this much. Bumped from 140 → 240
// to make names readable out of the box — the user complained names were
// too cramped. Users can still drag other columns narrower for more name
// room, or drag the name column's handle to pin a specific width.
const MIN_NAME_WIDTH = 240;
const COL_WIDTHS_KEY = "sbp-gantt-col-widths-v1";

function loadColWidths() {
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

// Valid drawing-stage values for a scheduled detailing task — matches the
// drawings.stage CHECK constraint after migration 077 (corrected 7-stage
// flow) minus "Not Started" (stage on a scheduled task only becomes
// meaningful once work is in motion). IFC and Released are now distinct
// stages so we expose both directly with no display alias.
const DETAILING_STAGES = ["IFA", "OFA", "BFA", "OFS", "IFC", "Released"];
const STAGE_DISPLAY = {};  // no aliases — display each stage by its key

const QUICK_FILTERS = [
  { key: "all", label: "All" },
  { key: "lookahead", label: "14-Day" },
  { key: "critical", label: "Critical" },
  { key: "delayed", label: "Delayed" },
  { key: "stalled", label: "Stalled" },
  { key: "overdue", label: "Overdue" },
  { key: "tbd", label: "TBD" },
  { key: "logic", label: "Logic Gaps" },
  { key: "shifted", label: "Variance" },
  { key: "deps", label: "Linked" },
  { key: "unlinked", label: "Unlinked" },
  { key: "milestones", label: "Milestones" },
  { key: "weather", label: "Weather" },
];

function getTaskMetadata(task) {
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

function isCriticalTask(task) {
  const metadata = getTaskMetadata(task);
  return Boolean(
    metadata.is_critical ||
    metadata.critical_path ||
    task?.is_critical ||
    task?.is_critical_path ||
    task?.critical_path
  );
}

function taskSearchHaystack(task, phaseLabel = "") {
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

function pluralize(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function isStalledTask(task, today, parseStart) {
  if (!task || task.status === "Complete" || String(task.status || "").toLowerCase().includes("complete")) return false;
  const start = parseStart(task);
  return Boolean(start && start < today && displayPct(task) === 0);
}

function isOpenScheduleTask(task) {
  const status = String(task?.status || "").toLowerCase();
  return !["complete", "completed", "closed", "cancelled", "canceled"].some((closed) => status.includes(closed));
}

function hasLogicGapTask(task, successorCountById) {
  if (!task || !isOpenScheduleTask(task) || task._hasChildren || task.is_summary) return false;
  const predecessorCount = parseDeps(task.dependencies).length;
  const successorCount = successorCountById[task.id] || 0;
  return predecessorCount === 0 || successorCount === 0;
}

function isLookaheadTask(task, today, getStart, getEnd, days = 14) {
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

export default function ScheduleGantt({ tasks: rawTasks = [], submittals = [], deliveries = [], weatherRisk = null, onTaskClick, onSave, phaseFilter = "all", externalFocus = null }) {
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
  const [quickFilter, setQuickFilter] = useState("all");
  const [showLegend, setShowLegend] = useState(true);

  useEffect(() => {
    if (!externalFocus?.filter) return;
    setQuickFilter(externalFocus.filter);
    setSearchText("");
    setCollapsed({});
    setCollapsedTasks({});
    setCollapsedDeliveries(false);
  }, [externalFocus]);

  // ── Resizable columns ───────────────────────────────────────────────
  // Widths live in state; dragging a header divider mutates the index
  // for that column. 0 means "flex" (1fr) — used by TASK NAME so it
  // auto-fills leftover space. Persisted to localStorage per-user.
  const [colWidths, setColWidths] = useState(loadColWidths);
  const GRID = useMemo(
    () => colWidths.map(w => (w === 0 ? `minmax(${MIN_NAME_WIDTH}px, 1fr)` : `${w}px`)).join(" "),
    [colWidths]
  );
  // Left-panel width auto-grows with the fixed columns so TASK NAME never
  // collapses below MIN_NAME_WIDTH. Flex (0-width) entries contribute the
  // min — the column itself gets more via 1fr if there's extra space.
  const LEFT_W = useMemo(
    () => colWidths.reduce((sum, w) => sum + (w === 0 ? MIN_NAME_WIDTH : w), 0) + 24 /* inner padding */,
    [colWidths]
  );
  // Drag handler factory for a given column index. We capture the
  // pointer at mousedown, track deltaX, clamp, and persist on mouseup.
  const startColResize = (colIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[colIndex];
    // For the flex column we pin a concrete starting width so dragging
    // it feels natural (otherwise going from 1fr → Npx mid-drag jumps).
    const effectiveStart = startW === 0 ? MIN_NAME_WIDTH : startW;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (mv) => {
      const delta = mv.clientX - startX;
      const next = Math.max(MIN_COL_WIDTH, Math.min(400, effectiveStart + delta));
      setColWidths(prev => {
        const out = [...prev];
        out[colIndex] = next;
        return out;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      setColWidths(curr => {
        try { window.localStorage?.setItem(COL_WIDTHS_KEY, JSON.stringify(curr)); } catch {}
        return curr;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const resetColWidths = () => {
    setColWidths(DEFAULT_COL_WIDTHS);
    try { window.localStorage?.removeItem(COL_WIDTHS_KEY); } catch {}
  };
  const toggleTask = (taskId) => setCollapsedTasks(c => ({ ...c, [taskId]: !c[taskId] }));
  const leftRef   = useRef(null);
  const rightHead = useRef(null);
  const rightBody = useRef(null);
  const containerRef = useRef(null);

  const WEEK_PX = zoom === "month" ? 80 : zoom === "day" ? 420 : 240;

  // Normalize "today" to UTC midnight so all date math (overdue checks, today
  // line, scroll-to-today) compares apples to apples with task dates that are
  // stored as YYYY-MM-DD and parsed at T00:00:00Z. Without this, a 4pm local
  // load drifts every comparison by hours and can flip overdue/upcoming.
  const today = useMemo(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }, []);

  const startInlineEdit = (task, e) => {
    e.stopPropagation();
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
    if (src && other) other.scrollTop = src.scrollTop;
  };

  // Sync horizontal scroll: right body → right header
  const syncHScroll = () => {
    if (rightBody.current && rightHead.current) {
      rightHead.current.scrollLeft = rightBody.current.scrollLeft;
    }
  };

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
      if (map[ph.key]) ordered.push({ phase: ph, tasks: buildTreeOrder(map[ph.key]) });
    });
    if (map["Uncategorized"]) {
      ordered.push({ phase: { id: 99, key: "Uncategorized", label: "Uncategorized", color: "#888" }, tasks: buildTreeOrder(map["Uncategorized"]) });
    }
    return ordered;
  }, [rawTasks, phaseFilter]);

  // ── Date range ─────────────────────────────────────────────────────
  const allTasks = grouped.flatMap(g => g.tasks);

  // ── Hierarchy helpers (inline indent / outdent) ─────────────────────
  //
  // Each task carries parent_task_id in the DB. `buildTreeOrder()` (at
  // the top of this file) flattens the tree per phase so we already
  // have _depth / _hasChildren on every row. These helpers compute the
  // new parent_task_id when the user clicks the in-row indent/outdent
  // buttons (or hits Tab / Shift+Tab while hovering a row):
  //
  //   Indent: make the task a child of the closest preceding task
  //           whose depth is ≤ this task's depth. New depth = that
  //           task's depth + 1. Flat-order traversal guarantees we
  //           never nest into our own descendants (they come after
  //           us in the list) so cycle-safety is automatic.
  //   Outdent: promote up one level — new parent = current parent's
  //            parent_task_id (or null → root).
  const phaseFlatByKey = useMemo(() => {
    const m = {};
    for (const g of grouped) m[g.phase.key] = g.tasks;
    return m;
  }, [grouped]);

  const computeIndentTarget = (task) => {
    const flat = phaseFlatByKey[task.phase] || [];
    const idx = flat.findIndex((t) => t.id === task.id);
    if (idx <= 0) return null;
    const myDepth = task._depth || 0;
    for (let i = idx - 1; i >= 0; i--) {
      const prev = flat[i];
      if ((prev._depth || 0) <= myDepth) {
        return { newParentId: prev.id };
      }
    }
    return null;
  };

  const computeOutdentTarget = (task) => {
    if (!task.parent_task_id) return null;
    const parent = allTasks.find((t) => t.id === task.parent_task_id);
    return { newParentId: parent?.parent_task_id || null };
  };

  const canIndent  = (task) => computeIndentTarget(task)  !== null;
  const canOutdent = (task) => computeOutdentTarget(task) !== null;

  // ── Move Up / Move Down (manual ordering within siblings) ───────────
  //
  // Siblings = tasks in the same phase AND same parent_task_id. A root
  // task's siblings are the other root tasks in its phase. A child's
  // siblings are the other children of its parent.
  //
  // Move mechanics: swap sort_order with the adjacent sibling. Both
  // rows are updated; the user sees the move land after the next
  // refetch. If the task has no sort_order yet (shouldn't happen
  // post-backfill but defend anyway), we synthesize one from its
  // position before swapping.
  const findSiblings = (task) => {
    const flat = phaseFlatByKey[task.phase] || [];
    return flat.filter((t) => (t.parent_task_id || null) === (task.parent_task_id || null));
  };
  const computeMoveUpTarget = (task) => {
    const sibs = findSiblings(task);
    const idx = sibs.findIndex((t) => t.id === task.id);
    if (idx <= 0) return null;
    return sibs[idx - 1];
  };
  const computeMoveDownTarget = (task) => {
    const sibs = findSiblings(task);
    const idx = sibs.findIndex((t) => t.id === task.id);
    if (idx < 0 || idx >= sibs.length - 1) return null;
    return sibs[idx + 1];
  };
  const canMoveUp   = (task) => computeMoveUpTarget(task)   !== null;
  const canMoveDown = (task) => computeMoveDownTarget(task) !== null;

  // Swap sort_order between two sibling tasks. Falls back to assigning
  // sensible numbers if either is null. We fire both updates in
  // parallel — the query invalidation after onSave picks up both.
  const swapOrder = async (taskA, taskB) => {
    if (!onSave) return;
    let a = taskA.sort_order;
    let b = taskB.sort_order;
    // Post-backfill everyone has a sort_order, but defend against
    // a future where a freshly-created task lands here with null.
    if (a == null && b == null) { a = 2000; b = 1000; }
    else if (a == null)          { a = b + 1000; }
    else if (b == null)          { b = a + 1000; }
    try {
      await Promise.all([
        onSave({ id: taskA.id, sort_order: b }),
        onSave({ id: taskB.id, sort_order: a }),
      ]);
    } catch { /* onSave toasts errors itself */ }
  };
  const handleMoveUp = async (task) => {
    if (!onSave) return;
    const tgt = computeMoveUpTarget(task);
    if (!tgt) {
      toast.info("Already at the top of its group.");
      return;
    }
    await swapOrder(task, tgt);
  };
  const handleMoveDown = async (task) => {
    if (!onSave) return;
    const tgt = computeMoveDownTarget(task);
    if (!tgt) {
      toast.info("Already at the bottom of its group.");
      return;
    }
    await swapOrder(task, tgt);
  };

  // onSave writes its own "Task saved" toast. We add targeted toasts
  // for the disabled / no-op paths so a hover-click that went nowhere
  // tells the user why ("Already at root", etc.) instead of feeling
  // broken. Errors from onSave still surface via its own toast path.
  const handleIndent = async (task) => {
    if (!onSave) return;
    const tgt = computeIndentTarget(task);
    if (!tgt) {
      toast.info("Nothing above to nest under — this is the first task in its phase.");
      return;
    }
    try {
      await onSave({ id: task.id, parent_task_id: tgt.newParentId });
    } catch { /* onSave toasts errors itself */ }
  };
  const handleOutdent = async (task) => {
    if (!onSave) return;
    const tgt = computeOutdentTarget(task);
    if (!tgt) {
      toast.info("Already at top level — can't outdent further.");
      return;
    }
    try {
      await onSave({ id: task.id, parent_task_id: tgt.newParentId });
    } catch { /* onSave toasts errors itself */ }
  };

  // Tab / Shift+Tab while hovering a task row indents / outdents that
  // row without needing the user to click the small in-row buttons.
  // We only bind when a task row is hovered AND we're not inside a
  // text input (to avoid hijacking Tab inside the inline edit input).
  useEffect(() => {
    if (!hoveredRowId) return undefined;
    const onKey = (ev) => {
      const el = document.activeElement;
      const inEditable = el && (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable
      );
      if (inEditable) return;
      const task = allTasks.find((t) => t.id === hoveredRowId);
      if (!task) return;
      // Tab / Shift+Tab → indent / outdent (change parent_task_id)
      if (ev.key === "Tab") {
        ev.preventDefault();
        if (ev.shiftKey) handleOutdent(task);
        else             handleIndent(task);
        return;
      }
      // Alt+ArrowUp / Alt+ArrowDown → move up / down among siblings
      // (swap sort_order). Alt avoids clashing with the browser's
      // own Home/End/PageUp scrolling behaviours.
      if (ev.altKey && ev.key === "ArrowUp") {
        ev.preventDefault();
        handleMoveUp(task);
        return;
      }
      if (ev.altKey && ev.key === "ArrowDown") {
        ev.preventDefault();
        handleMoveDown(task);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Only re-bind when the hovered row changes — handlers close over
    // allTasks + sort_order state which is refetched into allTasks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredRowId, allTasks]);

  // ── Effective dates: cascade through dependencies so a late predecessor
  // automatically shifts its successors forward in the gantt view. The
  // underlying task.start_date / task.end_date in the DB are NEVER mutated;
  // this only affects how the bars are positioned visually.
  //
  // Delegates to the shared `computeEffectiveDates` utility (see
  // `src/services/scheduleCascade.js`) so every schedule consumer — the
  // Gantt, Task List, 6-Week Lookahead, ICS export — agrees on where each
  // task sits on the calendar once predecessor links are followed. The
  // utility supports FS / SS / FF / SF + lag; for the legacy "id only"
  // dep shape it defaults to FS + 1 day to preserve the regression-test
  // bar set by the previous inline cascade.
  const effectiveDates = useMemo(() => computeEffectiveDates(allTasks), [allTasks]);

  // ── Cycle observability ─────────────────────────────────────────────
  // The cascade flags every task in a predecessor cycle with `cycle:
  // true`. We surface a single toast when cycles are present so a user
  // looking at the Gantt knows their schedule has a circular dependency
  // they need to break — without it, the cycle members silently fall
  // back to their stored dates and the user just sees "the cascade
  // didn't shift this row" with no explanation. We dedupe by the set of
  // cycle-affected task IDs so the toast doesn't fire on every render.
  const cycleTaskIdsKey = useMemo(() => {
    const ids = Object.keys(effectiveDates).filter((id) => effectiveDates[id]?.cycle);
    return ids.sort().join("|");
  }, [effectiveDates]);
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

  // ── Weather-risk overlay ───────────────────────────────────────────
  // Only attach risks to field-sensitive phases (Installation, Delivery).
  // Indoor work doesn't get flagged — a rainy day in Phoenix isn't a
  // problem for Detailing. Memoised keyed by (weatherRisk, allTasks)
  // so the lookup per row is O(1).
  const WEATHER_SENSITIVE_PHASES = useMemo(() => new Set(["Installation", "Delivery", "Erection", "Erection/Installation"]), []);
  const weatherRiskByTask = useMemo(() => {
    const out = {};
    if (!weatherRisk?.risks?.length || !allTasks?.length) return out;
    for (const t of allTasks) {
      if (!WEATHER_SENSITIVE_PHASES.has(t.phase)) continue;
      const hits = risksForTaskWindow(weatherRisk.risks, effStart(t), effEnd(t));
      if (hits.length > 0) out[t.id] = hits;
    }
    return out;
    // effStart/effEnd depend on effectiveDates; adding it to deps keeps
    // the memo honest if dependencies shift a task into bad weather.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherRisk, allTasks, effectiveDates, WEATHER_SENSITIVE_PHASES]);

  // Overdue uses the *effective* finish so a task whose predecessor slipped
  // is judged against where the bar actually sits in the gantt — not the
  // stale stored finish. Tasks marked Complete are never overdue.
  const isOverdue = (task) => {
    if (!task || task.status === "Complete") return false;
    const e = parseDateUTC(effEnd(task));
    if (!e) return false;
    return e < today;
  };

  const dateRange = useMemo(() => {
    if (allTasks.length === 0) {
      // Even with no tasks, build a 4-week window around today
      const s = new Date(today);
      s.setDate(s.getDate() - s.getDay() - 7); // 1 week before
      const e = new Date(today);
      e.setDate(e.getDate() + (6 - e.getDay()) + 21); // 3 weeks after
      const weeks = [];
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));
      return { start: s, end: e, weeks };
    }
    const dates = allTasks.flatMap(t => [
      parseDateUTC(effStart(t)),
      parseDateUTC(effEnd(t)),
    ]).filter(Boolean);
    // Include delivery dates so the timeline stretches to cover them
    deliveries.forEach(d => {
      const sd = parseDateUTC(d.scheduled_date); if (sd) dates.push(sd);
      const rd = parseDateUTC(d.required_date);  if (rd) dates.push(rd);
      const ad = parseDateUTC(d.actual_date);    if (ad) dates.push(ad);
    });
    // Always include today in the range so the TODAY line is always visible
    dates.push(today);
    let start = new Date(Math.min(...dates));
    let end   = new Date(Math.max(...dates));
    // Belt-and-suspenders: parseDateUTC already clamps to [1900,2200], but if
    // a rogue date somehow lands here and we ended up with NaN or a wild
    // year, fall back to a today-centred window rather than generating a
    // million weeks and freezing the browser.
    const startYear = start.getUTCFullYear();
    const endYear   = end.getUTCFullYear();
    if (isNaN(start.getTime()) || isNaN(end.getTime()) ||
        startYear < MIN_YEAR || endYear > MAX_YEAR) {
      start = new Date(today); start.setDate(start.getDate() - start.getDay() - 7);
      end   = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()) + 21);
    }
    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + (6 - end.getDay()) + 7);
    const weeks = [];
    // Hard cap at ~10 years of weeks (520). If someone's data actually
    // legitimately spans more than that, the gantt is the wrong tool.
    const MAX_WEEKS = 520;
    let d = new Date(start);
    while (d <= end && weeks.length < MAX_WEEKS) {
      weeks.push(new Date(d));
      d.setDate(d.getDate() + 7);
    }
    if (weeks.length >= MAX_WEEKS) end = new Date(weeks[weeks.length - 1]);
    return { start, end, weeks };
  }, [allTasks, deliveries, today]);

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

  // Auto-scroll to today on mount so every project starts centred on the current date
  useEffect(() => {
    const timer = setTimeout(() => {
      if (rightBody.current && dateRange.weeks.length > 0) {
        const todayOffset = (today - dateRange.start) / 86400000 * (WEEK_PX / 7);
        rightBody.current.scrollLeft = Math.max(0, todayOffset - rightBody.current.clientWidth / 3);
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [dateRange.start, dateRange.weeks.length, today, WEEK_PX]);

  const dayCount = Math.ceil((dateRange.end - dateRange.start) / 86400000);
  const PX_PER_DAY = WEEK_PX / 7;
  const totalW = Math.max(dayCount * PX_PER_DAY, dateRange.weeks.length * WEEK_PX);

  // Stats
  const totalTasks = allTasks.length;
  const completeTasks = allTasks.filter(t => t.status === "Complete").length;
  const overdueTasks = allTasks.filter(isOverdue).length;
  const inProgressTasks = allTasks.filter(t => t.status === "In Progress").length;
  const unscheduledTasks = allTasks.filter(t => !effStart(t) || !effEnd(t)).length;
  const lookaheadTasks = allTasks.filter(t => isLookaheadTask(t, today, effStart, effEnd)).length;
  const stalledTasks = allTasks.filter(t => isStalledTask(t, today, (task) => parseDateUTC(effStart(task)))).length;
  const criticalTasks = allTasks.filter(isCriticalTask).length;
  const milestoneTasks = allTasks.filter(isMilestoneTask).length;
  const shiftedTasks = allTasks.filter(t => effectiveDates[t.id]?.shifted).length;
  const totalShiftDays = allTasks.reduce((sum, t) => sum + (Number(effectiveDates[t.id]?.shiftedBy) || 0), 0);
  const weatherRiskTasks = allTasks.filter(t => weatherRiskByTask[t.id]).length;
  const dependencyLinks = allTasks.reduce((sum, t) => sum + parseDeps(t.dependencies).length, 0);
  const avgProgress = totalTasks > 0
    ? Math.round(allTasks.reduce((sum, t) => sum + displayPct(t), 0) / totalTasks)
    : 0;

  const successorCountById = useMemo(() => {
    const out = {};
    allTasks.forEach((task) => {
      parseDeps(task.dependencies).forEach((predId) => {
        out[predId] = (out[predId] || 0) + 1;
      });
    });
    return out;
  }, [allTasks]);
  const logicGapTasks = allTasks.filter(t => hasLogicGapTask(t, successorCountById)).length;

  const normalizedSearch = searchText.trim().toLowerCase();
  const hasActiveRowFilter = normalizedSearch.length > 0 || quickFilter !== "all";

  const visibleTaskIds = useMemo(() => {
    if (!hasActiveRowFilter) return null;

    const allById = new Map(allTasks.map((task) => [task.id, task]));
    const phaseById = new Map();
    grouped.forEach(({ phase, tasks }) => {
      tasks.forEach((task) => phaseById.set(task.id, phase));
    });

    const directMatches = new Set();
    allTasks.forEach((task) => {
      const phase = phaseById.get(task.id);
      const matchesText = !normalizedSearch || taskSearchHaystack(task, phase?.label || phase?.key || "").includes(normalizedSearch);
      const matchesQuick = (() => {
        if (quickFilter === "all") return true;
        if (quickFilter === "lookahead") return isLookaheadTask(task, today, effStart, effEnd);
        if (quickFilter === "critical") return isCriticalTask(task);
        if (quickFilter === "delayed") return String(task.status || "").toLowerCase().includes("delay");
        if (quickFilter === "stalled") return isStalledTask(task, today, (item) => parseDateUTC(effStart(item)));
        if (quickFilter === "overdue") return isOverdue(task);
        if (quickFilter === "tbd") return !effStart(task) || !effEnd(task);
        if (quickFilter === "logic") return hasLogicGapTask(task, successorCountById);
        if (quickFilter === "shifted") return Boolean(effectiveDates[task.id]?.shifted);
        if (quickFilter === "deps") return parseDeps(task.dependencies).length > 0 || successorCountById[task.id] > 0;
        if (quickFilter === "unlinked") return parseDeps(task.dependencies).length === 0 && !successorCountById[task.id] && !task.parent_task_id && !task._hasChildren;
        if (quickFilter === "milestones") return isMilestoneTask(task);
        if (quickFilter === "weather") return Boolean(weatherRiskByTask[task.id]);
        return true;
      })();
      if (matchesText && matchesQuick) directMatches.add(task.id);
    });

    const withAncestors = new Set(directMatches);
    directMatches.forEach((taskId) => {
      let parentId = allById.get(taskId)?.parent_task_id;
      const guard = new Set();
      while (parentId && !guard.has(parentId)) {
        guard.add(parentId);
        withAncestors.add(parentId);
        parentId = allById.get(parentId)?.parent_task_id;
      }
    });

    return withAncestors;
  }, [
    allTasks,
    grouped,
    normalizedSearch,
    quickFilter,
    hasActiveRowFilter,
    effectiveDates,
    successorCountById,
    weatherRiskByTask,
  ]);

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

  const px = (dateStr) => {
    const d = parseDateUTC(dateStr);
    if (!d) return 0;
    return Math.max(0, (d - dateRange.start) / 86400000 * PX_PER_DAY);
  };
  const spanPx = (start, end) => {
    const s = parseDateUTC(start);
    const e = parseDateUTC(end);
    if (!s || !e) return 0;
    return Math.max(4, (e - s) / 86400000 * PX_PER_DAY);
  };

  const todayPx = (today - dateRange.start) / 86400000 * PX_PER_DAY;
  const showToday = todayPx >= 0 && todayPx <= totalW;

  const nowWeekStart = new Date(today);
  nowWeekStart.setDate(today.getDate() - today.getDay());
  const isCurrentWeek = (w) => w.toDateString() === nowWeekStart.toDateString();

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
      const avgPct = tasks.length > 0
        ? tasks.reduce((sum, t) => sum + displayPct(t), 0) / tasks.length
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
  }, [visibleGrouped, collapsed, collapsedTasks, showDeliveries, deliveries, collapsedDeliveries]);

  // Build task ID → row index + Y position map for dependency arrows
  const taskPositions = useMemo(() => {
    const posMap = {};
    let y = 0;
    rows.forEach((row) => {
      if (row.type === "summary" || row.type === "delivery-summary") {
        y += SUM_H;
      } else if (row.type === "task") {
        posMap[row.task.id] = { y: y + ROW_H / 2 }; // center of the row
        y += ROW_H;
      } else {
        y += ROW_H; // delivery rows
      }
    });
    return posMap;
  }, [rows]);

  // Build dependency arrows
  const depArrows = useMemo(() => {
    const arrows = [];
    rows.forEach((row) => {
      if (row.type !== "task") return;
      const task = row.task;
      const deps = parseDeps(task.dependencies);
      if (!deps.length) return;
      const toPos = taskPositions[task.id];
      const taskEffStart = effStart(task);
      if (!toPos || !taskEffStart) return;
      const toX = px(taskEffStart);
      deps.forEach((predId) => {
        const predPos = taskPositions[predId];
        if (!predPos) return; // predecessor not visible (collapsed or filtered)
        const predTask = allTasks.find(t => t.id === predId);
        const predEnd = predTask ? effEnd(predTask) : null;
        if (!predTask || !predEnd) return;
        const fromX = px(predEnd);
        arrows.push({
          key: `${predId}-${task.id}`,
          fromX, fromY: predPos.y,
          toX, toY: toPos.y,
        });
      });
    });
    return arrows;
  }, [rows, taskPositions, allTasks]);

  const totalHeight = rows.reduce((h, r) => h + ((r.type === "summary" || r.type === "delivery-summary") ? SUM_H : ROW_H), 0);

  return (
    <div ref={containerRef} data-gantt-export-root style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-page)", overflow: "hidden" }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div data-gantt-export-exclude style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "6px 16px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 16, flex: 1 }}>
          {[
            { label: "TOTAL", val: totalTasks, color: "var(--text-secondary)" },
            { label: "COMPLETE", val: completeTasks, color: "#10B981" },
            { label: "IN PROGRESS", val: inProgressTasks, color: "var(--accent)" },
            { label: "OVERDUE", val: overdueTasks, color: "#EF4444" },
            { label: "CRITICAL", val: criticalTasks, color: "var(--status-warning)" },
            ...(shiftedTasks > 0 ? [{ label: "VARIANCE", val: shiftedTasks, color: "var(--status-warning)" }] : []),
            ...(unscheduledTasks > 0 ? [{ label: "TBD", val: unscheduledTasks, color: "var(--status-warning)" }] : []),
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>{s.label}</span>
            </div>
          ))}
        </div>
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
              background: "rgba(3,8,18,0.72)",
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
              onClick={() => { setSearchText(""); setQuickFilter("all"); }}
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
        </div>
        {/* Controls */}
        {submittals.filter(s => s.is_submittal && s.linked_wp_id).length > 0 && (
          <button
            onClick={() => setShowSubmittals(v => !v)}
            style={{
              padding: "4px 10px", borderRadius: 4,
              border: showSubmittals ? "1px solid #3B82F6" : "1px solid var(--divider)",
              background: showSubmittals ? "rgba(59,130,246,0.10)" : "transparent",
              color: showSubmittals ? "#3B82F6" : "var(--text-muted)",
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
              border: showDeliveries ? "1px solid #F59E0B" : "1px solid var(--divider)",
              background: showDeliveries ? "rgba(245,158,11,0.10)" : "transparent",
              color: showDeliveries ? "#F59E0B" : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            🚛 Deliveries ({deliveries.length})
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
        background: "linear-gradient(180deg, rgba(8,18,32,0.78), rgba(3,8,18,0.86))",
        overflowX: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setQuickFilter(filter.key)}
              style={{
                padding: "5px 9px",
                borderRadius: 999,
                border: quickFilter === filter.key ? "1px solid var(--accent)" : "1px solid var(--divider)",
                background: quickFilter === filter.key ? "rgba(86,176,255,0.16)" : "rgba(255,255,255,0.035)",
                color: quickFilter === filter.key ? "var(--accent)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div style={{ width: 1, background: "var(--divider)", flexShrink: 0 }} />
        {[
          { label: "Health", value: `${avgProgress}%`, hint: "avg complete", color: "var(--accent)" },
          { label: "14-Day", value: lookaheadTasks, hint: "handoff", color: lookaheadTasks ? "var(--status-info)" : "var(--text-muted)" },
          { label: "Stalled", value: stalledTasks, hint: "started 0%", color: stalledTasks ? "var(--status-error)" : "var(--text-muted)" },
          { label: "Logic", value: logicGapTasks, hint: "open ends", color: logicGapTasks ? "var(--status-warning)" : "var(--text-muted)" },
          { label: "Variance", value: shiftedTasks, hint: `${totalShiftDays}d moved`, color: shiftedTasks ? "var(--status-warning)" : "var(--text-muted)" },
          { label: "Links", value: dependencyLinks, hint: "predecessors", color: dependencyLinks ? "var(--status-info)" : "var(--text-muted)" },
          { label: "Milestones", value: milestoneTasks, hint: "flagged", color: milestoneTasks ? "var(--status-warning)" : "var(--text-muted)" },
          { label: "Weather", value: weatherRiskTasks, hint: "field risk", color: weatherRiskTasks ? "var(--status-error)" : "var(--text-muted)" },
        ].map((card) => (
          <div key={card.label} style={{
            minWidth: 104,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            background: "rgba(255,255,255,0.035)",
            padding: "6px 8px",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {card.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: card.color, fontWeight: 900, lineHeight: 1.1 }}>
                {card.value}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {card.hint}
              </span>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          style={{
            marginLeft: "auto",
            padding: "5px 10px",
            borderRadius: 8,
            border: "1px solid var(--divider)",
            background: showLegend ? "rgba(86,176,255,0.12)" : "rgba(255,255,255,0.03)",
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

      {showLegend && (
        <div data-gantt-export-exclude style={{
          flexShrink: 0,
          display: "flex",
          gap: 10,
          padding: "7px 16px",
          borderBottom: "1px solid var(--divider)",
          background: "rgba(255,255,255,0.025)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          overflowX: "auto",
        }}>
          <span><strong style={{ color: "var(--accent)" }}>Double-click</strong> edit row</span>
          <span><strong style={{ color: "var(--accent)" }}>Alt+Up/Down</strong> reorder</span>
          <span><strong style={{ color: "var(--accent)" }}>Tab / Shift+Tab</strong> indent</span>
          <span><strong style={{ color: "var(--status-warning)" }}>Variance</strong> effective dates differ from stored dates</span>
          <span><strong style={{ color: "var(--status-info)" }}>Linked</strong> predecessor or successor exists</span>
        </div>
      )}

      <div style={{ display: "flex", flexShrink: 0, height: HEAD_H, borderBottom: "1px solid var(--divider)" }}>
        {/* Left header — each column cell wraps its label in a relative
            container with a drag handle on the right edge. Dragging any
            handle resizes THAT column; TASK NAME (flex) auto-rebalances.
            Double-click the handle to reset that single column to its
            default width; double-click the "% " header to reset ALL. */}
        <div style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, background: "var(--bg-surface-low)", borderRight: "1px solid var(--divider)", display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 4 }}>
          {["WBS", "TASK NAME", "DUR", "START", "FINISH", "PRED", "RESOURCES", "STATUS", "STAGE", "%"].map((h, i) => (
            <div key={i} style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", overflow: "visible" }}
                 onDoubleClick={i === 9 ? resetColWidths : undefined}
                 title={i === 9 ? "Double-click to reset all column widths" : undefined}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "var(--text-muted)", textTransform: "uppercase", textAlign: i >= 2 ? "center" : "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{h}</span>
              {/* Drag handle — last column has no handle (nothing to its right) */}
              {i < 9 && (
                <div
                  onMouseDown={(e) => startColResize(i, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setColWidths(prev => {
                      const out = [...prev];
                      out[i] = DEFAULT_COL_WIDTHS[i];
                      try { window.localStorage?.setItem(COL_WIDTHS_KEY, JSON.stringify(out)); } catch {}
                      return out;
                    });
                  }}
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
        <div ref={rightHead} style={{ flex: 1, overflowX: "hidden", overflowY: "hidden", background: "var(--bg-surface-low)" }}>
          <div style={{ display: "flex", width: totalW, height: HEAD_H, position: "relative" }}>
            {dateRange.weeks.map((week, i) => {
              const cur = isCurrentWeek(week);
              const banded = i % 2 === 1 && !cur;
              // First week of a month — used to emit the month label
              // and render a slightly stronger left-edge divider.
              const isMonthStart = week.getDate() <= 7;
              const headerBg = cur
                ? "rgba(200,155,32,0.10)"
                : banded
                  ? "rgba(255,255,255,0.018)"
                  : "transparent";
              const monthLabel = isMonthStart
                ? week.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).toUpperCase()
                : "";
              return (
                <div key={i} style={{
                  minWidth: WEEK_PX,
                  borderRight: "1px solid rgba(255,255,255,0.04)",
                  borderLeft: isMonthStart ? "1px solid rgba(255,255,255,0.10)" : "none",
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
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
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
        <div ref={leftRef} onScroll={() => syncScroll("left")} style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, overflowY: "auto", overflowX: "hidden", borderRight: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
          {rows.length === 0 && (
            <div style={{ padding: 18, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              No tasks match the current Gantt filters.
            </div>
          )}
          {rows.map((row, i) => {
            if (row.type === "summary") {
              const { phase, tasks, pctComplete } = row;
              const isOpen = !collapsed[phase.key];
              const phaseOverdue = tasks.filter(isOverdue).length;
              const phaseCritical = tasks.filter(isCriticalTask).length;
              const phaseTbd = tasks.filter(t => !effStart(t) || !effEnd(t)).length;
              const phaseMeta = [
                `${pluralize(tasks.length, "task")}`,
                phaseCritical ? `${phaseCritical} critical` : null,
                phaseOverdue ? `${phaseOverdue} overdue` : null,
                phaseTbd ? `${phaseTbd} TBD` : null,
              ].filter(Boolean).join(" / ");
              return (
                <div
                  key={`sum-${phase.key}`}
                  onClick={() => togglePhase(phase.key)}
                  // Whole row is the click target (chevron + label + count
                  // + percent), with a subtle background-shift on hover so
                  // it's obviously interactive — the audit flagged the
                  // previous render as ambiguous about the hit area.
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${phase.color}1f`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = `${phase.color}12`; }}
                  title={`${isOpen ? "Collapse" : "Expand"} ${phase.label}`}
                  role="button"
                  aria-expanded={isOpen}
                  style={{ height: SUM_H, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", padding: "0 12px", gap: 8, borderBottom: `1px solid var(--divider)`, background: `${phase.color}12`, cursor: "pointer", userSelect: "none", transition: "background 0.12s" }}
                >
                  <span style={{ color: phase.color, fontSize: 10, transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", display: "inline-block", lineHeight: 1 }}>▾</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: phase.color, letterSpacing: "0.10em", background: `${phase.color}20`, border: `1px solid ${phase.color}40`, borderRadius: 2, padding: "1px 6px", flexShrink: 0 }}>{phase.id}.0</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: phase.color, letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{phase.label.toUpperCase()}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: phaseOverdue ? "#EF4444" : phaseCritical ? "var(--status-warning)" : "var(--text-muted)", flexShrink: 0 }}>{phaseMeta}</span>
                  </div>
                  <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: phase.color }}>{Math.round(pctComplete)}%</span>
                </div>
              );
            }
            // ── Delivery summary row ──
            if (row.type === "delivery-summary") {
              const isOpen = !collapsedDeliveries;
              const dColor = "#F59E0B";
              return (
                <div key="delivery-summary" onClick={() => setCollapsedDeliveries(v => !v)} style={{ height: SUM_H, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", padding: "0 12px", gap: 8, borderBottom: "1px solid var(--divider)", background: `${dColor}12`, cursor: "pointer", userSelect: "none" }}>
                  <span style={{ color: dColor, fontSize: 10, transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", display: "inline-block", lineHeight: 1 }}>▾</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: dColor, letterSpacing: "0.10em", background: `${dColor}20`, border: `1px solid ${dColor}40`, borderRadius: 2, padding: "1px 6px", flexShrink: 0 }}>🚛</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: dColor, letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>DELIVERIES</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", flexShrink: 0 }}>{row.deliveryCount} items</span>
                  </div>
                  <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: dColor }}>{row.pctComplete}%</span>
                </div>
              );
            }
            // ── Delivery item row ──
            if (row.type === "delivery") {
              const d = row.delivery;
              const dotColor = DELIVERY_STATUS_DOT[d.status] || "#F59E0B";
              const isLate = d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered";
              const label = d.description || d.vendor || "Delivery";
              return (
                <div key={`del-${d.id}`} style={{ height: ROW_H, display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 4, borderBottom: "1px solid var(--divider)", background: "transparent", borderLeft: isLate ? "3px solid #EF4444" : "3px solid transparent" }}
                  onMouseEnter={() => setHoveredRowId(`del-${d.id}`)}
                  onMouseLeave={() => setHoveredRowId(null)}
                >
                  {/* WBS placeholder */}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>—</span>
                  {/* Name + vendor */}
                  <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                    <span style={{ fontSize: 10, flexShrink: 0 }}>🚛</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 500, color: isLate ? "#EF4444" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                  </span>
                  {/* Tonnage instead of duration */}
                  <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap" }}>{d.weight_tons ? `${d.weight_tons}T` : "—"}</span>
                  {/* Scheduled date */}
                  <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isLate ? "#EF4444" : "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(d.scheduled_date)}</span>
                  {/* Required/actual date */}
                  <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(d.required_date || d.actual_date)}</span>
                  {/* Pieces */}
                  <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", textAlign: "center" }}>{d.pieces ? `${d.pieces}pc` : "—"}</span>
                  {/* Vendor */}
                  <span title={d.vendor || "—"} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.vendor || "—"}</span>
                  {/* Status */}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: dotColor, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.06em" }}>{d.status || "—"}</span>
                  {/* Stage — deliveries don't have a detailing stage */}
                  <span />
                  {/* No % for deliveries */}
                  <span />
                </div>
              );
            }
            // Task row
            const { task, phase } = row;
            const deps = parseDeps(task.dependencies);
            const depLabels = deps.map(dId => {
              const dt = allTasks.find(t => t.id === dId);
              return dt?.wbs_code || (dt?.task_name?.slice(0, 6) + "…") || "—";
            }).join(", ");
            const predecessorCount = deps.length;
            const successorCount = successorCountById[task.id] || 0;
            const logicGap = hasLogicGapTask(task, successorCountById);
            const overdue = isOverdue(task);
            // Show *effective* start/finish in the left columns so the date
            // text matches the bar position. If a task slipped because of a
            // dependency cascade we mark it with "*" so users know it's
            // shifted vs the stored value — clicking the row reveals the raw
            // dates in the detail panel.
            const dispStart = effStart(task);
            const dispEnd   = effEnd(task);
            const isShifted = !!effectiveDates[task.id]?.shifted;
            const isEditing = editingId === task.id;
            const leftHovered = hoveredRowId === task.id;
            const parentRowBg = task._hasChildren ? `rgba(200,155,32,0.04)` : "transparent";
            const critical = isCriticalTask(task);
            return (
              <div key={`task-${task.id}`}
                style={{ height: ROW_H, display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 4, borderBottom: "1px solid var(--divider)", background: leftHovered ? "rgba(200,155,32,0.07)" : critical ? "rgba(245,158,11,0.045)" : parentRowBg, transition: "background 0.08s", cursor: "pointer", borderLeft: overdue ? "3px solid #EF4444" : critical ? "3px solid var(--status-warning)" : "3px solid transparent" }}
                onClick={() => onTaskClick && onTaskClick(task)}
                onMouseEnter={() => setHoveredRowId(task.id)}
                onMouseLeave={() => setHoveredRowId(null)}
              >
                {/* WBS */}
                <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.wbs_code || "—"}</span>
                {/* Task name — with hierarchy indentation and expand/collapse */}
                {isEditing ? (
                  <input
                    autoFocus
                    value={editDraft.task_name}
                    onChange={e => setEditDraft(d => ({ ...d, task_name: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => { if (e.key === "Enter") commitEdit(task.id); if (e.key === "Escape") cancelEdit(); }}
                    style={{ fontFamily: "var(--font-body)", fontSize: 11, background: "var(--bg-input)", border: "1px solid var(--accent)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 6px", width: "100%" }}
                  />
                ) : (
                  <span
                    title={sanitizeTaskName(task)}
                    onDoubleClick={e => onSave && startInlineEdit(task, e)}
                    style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: (task._depth || 0) * 16, overflow: "hidden" }}
                  >
                    {/* Inline hierarchy + ordering controls — only
                        the hovered row shows these so the name column
                        stays quiet. Four buttons in a single strip:
                          ▲  move up within siblings (swap sort_order)
                          ▼  move down within siblings
                          ◂  outdent one level
                          ▸  indent under the task above
                        Keyboard mirrors the clicks: Alt+↑/↓ for move,
                        Tab/Shift+Tab for indent/outdent. */}
                    {leftHovered && (
                      <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, marginRight: 2, gap: 1 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveUp(task); }}
                          disabled={!canMoveUp(task)}
                          title="Move up (Alt+↑) — reorder within siblings"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: canMoveUp(task) ? "pointer" : "not-allowed",
                            color: canMoveUp(task) ? "var(--accent)" : "var(--divider)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            lineHeight: 1,
                            padding: "0 3px",
                          }}
                        >
                          ▲
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveDown(task); }}
                          disabled={!canMoveDown(task)}
                          title="Move down (Alt+↓) — reorder within siblings"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: canMoveDown(task) ? "pointer" : "not-allowed",
                            color: canMoveDown(task) ? "var(--accent)" : "var(--divider)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            lineHeight: 1,
                            padding: "0 3px",
                          }}
                        >
                          ▼
                        </button>
                        <span style={{ width: 1, height: 10, background: "var(--divider)", margin: "0 2px" }} />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOutdent(task); }}
                          disabled={!canOutdent(task)}
                          title="Outdent (Shift+Tab) — promote one level up"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: canOutdent(task) ? "pointer" : "not-allowed",
                            color: canOutdent(task) ? "var(--accent)" : "var(--divider)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            lineHeight: 1,
                            padding: "0 3px",
                          }}
                        >
                          ◂
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleIndent(task); }}
                          disabled={!canIndent(task)}
                          title="Indent (Tab) — make this a subtask of the task above"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: canIndent(task) ? "pointer" : "not-allowed",
                            color: canIndent(task) ? "var(--accent)" : "var(--divider)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            lineHeight: 1,
                            padding: "0 3px",
                          }}
                        >
                          ▸
                        </button>
                      </span>
                    )}
                    {task._hasChildren && (
                      <button onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 9, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>
                        {collapsedTasks[task.id] ? "▶" : "▾"}
                      </button>
                    )}
                    {!task._hasChildren && task._depth > 0 && <span style={{ width: 14, flexShrink: 0 }} />}
                    {isMilestoneTask(task) && <span style={{ marginRight: 4, color: "var(--accent)" }}>◆</span>}
                    {/* Weather-risk chip — only on Installation/Delivery
                        rows whose window overlaps rough forecast days.
                        Tooltip lists specific dates + drivers so the
                        super can plan around them. */}
                    {weatherRiskByTask[task.id] && (() => {
                      const hits = weatherRiskByTask[task.id];
                      const worst = hits.reduce((m, h) => (h.severity > m ? h.severity : m), 0);
                      const color = worst >= 3 ? "#EF4444" : "#F59E0B";
                      const label = hits.length === 1 ? hits[0].date.slice(5) : `${hits.length} days`;
                      const tipLines = hits.slice(0, 5).map((h) => `${h.date}: ${h.summary}`);
                      if (hits.length > 5) tipLines.push(`…${hits.length - 5} more`);
                      return (
                        <span
                          title={`Weather risk:\n${tipLines.join("\n")}\n(${weatherRisk?.source || "Open-Meteo"})`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            fontFamily: "var(--font-mono)",
                            fontSize: 8,
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                            color,
                            border: `1px solid ${color}`,
                            borderRadius: 2,
                            padding: "0 4px",
                            marginRight: 5,
                            flexShrink: 0,
                            lineHeight: 1.4,
                          }}
                        >
                          ⚠ {label}
                        </span>
                      );
                    })()}
                    {logicGap && (
                      <span
                        title={`${predecessorCount === 0 ? "Missing predecessor" : ""}${predecessorCount === 0 && successorCount === 0 ? " / " : ""}${successorCount === 0 ? "Missing successor" : ""}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          fontFamily: "var(--font-mono)",
                          fontSize: 7,
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          color: "var(--status-warning)",
                          border: "1px solid color-mix(in srgb, var(--status-warning) 50%, transparent)",
                          background: "rgba(245,158,11,0.10)",
                          borderRadius: 2,
                          padding: "1px 4px",
                          marginRight: 5,
                          flexShrink: 0,
                          lineHeight: 1.35,
                        }}
                      >
                        LOGIC
                      </span>
                    )}
                    <span style={{
                      fontFamily: "var(--font-body)",
                      // Slight WBS-level type ramp: parent tasks read as
                      // headers, leaf rows stay at the base weight. Depth
                      // also drops the size by 0.5px per level (max 2)
                      // so a glance can tell parent from grandchild.
                      fontSize: task._hasChildren ? 11.5 : Math.max(10, 11 - Math.min(task._depth || 0, 2) * 0.5),
                      fontWeight: task._hasChildren ? 800 : 500,
                      letterSpacing: task._hasChildren ? "0.01em" : 0,
                      textTransform: task._hasChildren ? "uppercase" : "none",
                      color: overdue
                        ? "#EF4444"
                        : task._hasChildren
                          ? "var(--text-primary)"
                          : (task._depth || 0) > 0
                            ? "var(--text-secondary)"
                            : "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {sanitizeTaskName(task)}
                    </span>
                  </span>
                )}
                {/* Duration — always derive from start/end so a stale stored
                    `duration` from an old MS Project import (or a manual edit
                    that touched dates without touching the duration column)
                    can't display "1d" on a 140-day task. The schedule_tasks
                    table still has a `duration` column, but it is no longer
                    a source of truth for display. */}
                <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap" }}>
                  {calcDuration(task.start_date, task.end_date)}
                </span>
                {/* Start */}
                {isEditing ? (
                  <input type="date" value={editDraft.start_date} onChange={e => setEditDraft(d => ({ ...d, start_date: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px", width: "100%" }} />
                ) : (
                  <span
                    className="sbd-num"
                    title={isShifted ? `Stored: ${fmtDate(task.start_date)}\nShifted by predecessors` : undefined}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: !dispStart ? "var(--status-warning)" : isShifted ? "var(--accent)" : "var(--text-secondary)", fontWeight: !dispStart ? 700 : 400, textAlign: "center", whiteSpace: "nowrap" }}
                  >
                    {fmtDate(dispStart)}{isShifted ? "*" : ""}
                  </span>
                )}
                {/* Finish */}
                {isEditing ? (
                  <input type="date" value={editDraft.end_date} onChange={e => setEditDraft(d => ({ ...d, end_date: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px", width: "100%" }} />
                ) : (
                  <span
                    className="sbd-num"
                    title={isShifted ? `Stored: ${fmtDate(task.end_date)}\nShifted by predecessors` : undefined}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: !dispEnd ? "var(--status-warning)" : overdue ? "#EF4444" : isShifted ? "var(--accent)" : "var(--text-secondary)", fontWeight: !dispEnd ? 700 : 400, textAlign: "center", whiteSpace: "nowrap" }}
                  >
                    {fmtDate(dispEnd)}{isShifted ? "*" : ""}
                  </span>
                )}
                {/* Predecessors */}
                <span title={depLabels || "—"} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{depLabels || "—"}</span>
                {/* Resources */}
                <span title={task.resource_names || task.assigned_to || "—"} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: task.resource_names || task.assigned_to ? "var(--text-secondary)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.resource_names || task.assigned_to || "—"}</span>
                {/* Status — chip rendering, tinted background + dot for
                    quick visual scan. Overdue rows promote to the
                    Delayed palette so an "Overdue" row visually
                    matches its red border-left strip. */}
                {isEditing ? (
                  <select value={editDraft.status} onChange={e => setEditDraft(d => ({ ...d, status: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px" }}>
                    {["Not Started","In Progress","Complete","Delayed","On Hold"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
                    <StatusChip status={task.status} overdue={overdue} />
                  </div>
                )}
                {/* Stage — only rendered with a picker on Detailing-phase
                    rows. `phase` here is the PHASES config object from the
                    row (not a string), so we check phase.key. For other
                    phases we emit an em-dash so the grid layout stays
                    aligned. Stage persists in
                    schedule_tasks.metadata.detailing_stage; onSave is the
                    parent Schedule page's ScheduleTask.update callback.
                    stopPropagation on mousedown + click so the row's
                    onTaskClick doesn't fire while the select is open. */}
                {phase?.key === "Detailing" ? (
                  <select
                    value={task.metadata?.detailing_stage || ""}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      const newStage = e.target.value || null;
                      if (onSave) {
                        onSave({
                          id: task.id,
                          metadata: { ...(task.metadata || {}), detailing_stage: newStage },
                        });
                      }
                    }}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                      background: "var(--bg-input)",
                      border: `1px solid ${task.metadata?.detailing_stage ? "var(--accent-border)" : "var(--divider)"}`,
                      borderRadius: 3,
                      color: task.metadata?.detailing_stage ? "var(--accent)" : "var(--text-muted)",
                      padding: "2px 2px",
                      width: "100%",
                      letterSpacing: "0.04em",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">—</option>
                    {DETAILING_STAGES.map((s) => (
                      <option key={s} value={s}>{STAGE_DISPLAY[s] || s}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>—</span>
                )}
                {/* % or save/cancel */}
                {isEditing ? (
                  <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => commitEdit(task.id)} disabled={saving} style={{ background: "var(--accent)", border: "none", borderRadius: 3, color: "#000", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, padding: "2px 6px", cursor: "pointer" }}>{saving ? "…" : "✓"}</button>
                    <button onClick={cancelEdit} style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px", cursor: "pointer" }}>✕</button>
                  </div>
                ) : (
                  <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: statusColor(task.status), textAlign: "right" }}>{displayPct(task)}%</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Right gantt panel */}
        <div ref={rightBody} onScroll={() => { syncScroll("right"); syncHScroll(); }} style={{ flex: 1, overflowX: "auto", overflowY: "auto", background: "var(--bg-page)", position: "relative" }}>
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
                  background: "rgba(255,255,255,0.018)",
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
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,107,0,0.10) 50%, transparent 100%)",
                  pointerEvents: "none",
                  zIndex: 6,
                }} />
                {/* Sharp center line — sits above bars so it never gets
                    visually swallowed by a colored fill. */}
                <div style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: todayPx - 1, width: 2,
                  background: "#FF6B00",
                  zIndex: 12,
                  boxShadow: "0 0 4px rgba(255,107,0,0.65), 0 0 12px rgba(255,107,0,0.35)",
                }}>
                  <div style={{
                    position: "absolute", top: 0, left: -22,
                    background: "#FF6B00",
                    borderRadius: "2px 2px 2px 0",
                    padding: "2px 6px",
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800,
                    color: "#fff", letterSpacing: "0.10em",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
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
                  background: isMonthStart ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.035)",
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
            {depArrows.length > 0 && (
              <svg style={{ position: "absolute", top: 0, left: 0, width: totalW, height: totalHeight, pointerEvents: "none", zIndex: 5 }}>
                <defs>
                  <marker id="depArrowHead" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto-start-reverse">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7DA3C7" />
                  </marker>
                </defs>
                {depArrows.map(({ key, fromX, fromY, toX, toY }) => {
                  // Finish-to-Start arrow: from end of predecessor to start of successor
                  const gap = 8;
                  const midX = fromX + gap;
                  const sameRow = Math.abs(fromY - toY) < 4;
                  const stroke = "#7DA3C7";
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
            {(() => {
              let top = 0;
              let taskIdx = 0;
              return rows.map((row, i) => {
                const rowTop = top;
                if (row.type === "summary") {
                  top += SUM_H;
                  // Use effective dates for the summary span as well
                  const phaseEffStarts = row.tasks.map(t => effStart(t)).filter(Boolean).sort();
                  const phaseEffEnds   = row.tasks.map(t => effEnd(t)).filter(Boolean).sort();
                  const sumStart = phaseEffStarts[0] || row.start;
                  const sumEnd   = phaseEffEnds[phaseEffEnds.length - 1] || row.end;
                  const startPx = px(sumStart);
                  const w = spanPx(sumStart, sumEnd);
                  return (
                    <div key={`gs-${row.phase.key}`} style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: SUM_H, background: `${row.phase.color}08`, borderBottom: `1px solid var(--divider)` }}>
                      <SummaryBar phase={row.phase} leftPx={startPx} widthPx={w} pctComplete={row.pctComplete} />
                    </div>
                  );
                }
                // ── Delivery summary bar ──
                if (row.type === "delivery-summary") {
                  top += SUM_H;
                  const startPx2 = px(row.start);
                  const w2 = spanPx(row.start, row.end);
                  const dColor = "#F59E0B";
                  const pct2 = row.pctComplete || 0;
                  return (
                    <div key="gs-deliveries" style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: SUM_H, background: `${dColor}08`, borderBottom: "1px solid var(--divider)" }}>
                      {/* Summary bar spanning all deliveries */}
                      <div style={{
                        position: "absolute", left: startPx2, width: Math.max(w2, 6), height: 14, top: "50%", transform: "translateY(-50%)",
                        background: `${dColor}40`, borderRadius: 2, overflow: "hidden",
                      }}>
                        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(pct2, 100)}%`, background: dColor, borderRadius: 2, transition: "width 0.3s" }} />
                        <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: "100%", background: dColor, borderRadius: "2px 0 0 2px" }} />
                        <div style={{ position: "absolute", right: 0, top: 0, width: 4, height: "100%", background: dColor, borderRadius: "0 2px 2px 0" }} />
                        {w2 > 40 && (
                          <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "var(--font-mono)" }}>{pct2}%</span>
                        )}
                      </div>
                    </div>
                  );
                }
                // ── Delivery item bar ──
                if (row.type === "delivery") {
                  const zebra2 = taskIdx++ % 2 === 1;
                  top += ROW_H;
                  const d = row.delivery;
                  const hovered = hoveredRowId === `del-${d.id}`;
                  const isLate = d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered";
                  const baseBg2 = isLate ? "rgba(239,68,68,0.04)" : zebra2 ? "var(--hover-bg)" : "transparent";
                  const startIso = (d.scheduled_date || "").split("T")[0];
                  const endIso = (d.required_date || d.actual_date || d.scheduled_date || "").split("T")[0];
                  if (!startIso) {
                    return <div key={`gd-${d.id}`} style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid var(--divider)", background: hovered ? "rgba(245,158,11,0.07)" : baseBg2 }} />;
                  }
                  return (
                    <div key={`gd-${d.id}`}
                      style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid var(--divider)", background: hovered ? "rgba(245,158,11,0.07)" : baseBg2, transition: "background 0.08s" }}
                      onMouseEnter={() => setHoveredRowId(`del-${d.id}`)}
                      onMouseLeave={() => setHoveredRowId(null)}
                    >
                      <DeliveryBar delivery={d} leftPx={px(startIso)} widthPx={spanPx(startIso, endIso)} />
                    </div>
                  );
                }
                const zebra = taskIdx++ % 2 === 1;
                top += ROW_H;
                const { task } = row;
                const overdue = isOverdue(task);
                const critical = isCriticalTask(task);
                const hovered = hoveredRowId === task.id;
                const parentBg = task._hasChildren ? "rgba(200,155,32,0.04)" : "transparent";
                const baseBg = overdue ? "rgba(239,68,68,0.04)" : critical ? "rgba(245,158,11,0.04)" : zebra ? "var(--hover-bg)" : parentBg;
                const hoverBg = "rgba(200,155,32,0.07)";
                if (!task.start_date || !task.end_date) {
                  const tbdLeft = px(today.toISOString().slice(0, 10));
                  return (
                    <div key={`gr-${task.id}`}
                      style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid var(--divider)", background: hovered ? hoverBg : baseBg, cursor: "pointer" }}
                      onClick={() => onTaskClick && onTaskClick(task)}
                      onMouseEnter={() => setHoveredRowId(task.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                    >
                      <div
                        title="Date TBD — task is tracked but not yet scheduled"
                        style={{
                          position: "absolute",
                          left: Math.max(tbdLeft - 20, 4),
                          top: "50%",
                          transform: "translateY(-50%)",
                          padding: "2px 8px",
                          border: "1px dashed var(--status-warning)",
                          borderRadius: 4,
                          background: "rgba(245,158,11,0.08)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          fontWeight: 700,
                          color: "var(--status-warning)",
                          letterSpacing: "0.06em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        TBD
                      </div>
                    </div>
                  );
                }
                const taskEffS = effStart(task);
                const taskEffE = effEnd(task);
                return (
                  <div key={`gr-${task.id}`}
                    style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid var(--divider)", background: hovered ? hoverBg : baseBg, cursor: "pointer", transition: "background 0.08s" }}
                    onClick={() => onTaskClick && onTaskClick(task)}
                    onMouseEnter={e => { setHoveredRowId(task.id); setTooltip({ task, x: e.clientX, y: e.clientY }); }}
                    onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                    onMouseLeave={() => { setHoveredRowId(null); setTooltip(null); }}
                  >
                    {task._hasChildren ? (
                      <SummaryBar phase={row.phase} leftPx={px(taskEffS)} widthPx={spanPx(taskEffS, taskEffE)} pctComplete={task.percent_complete || 0} />
                    ) : (
                      <TaskBar task={task} leftPx={px(taskEffS)} widthPx={spanPx(taskEffS, taskEffE)} />
                    )}
                    {/* Detailing stage-gate milestones — color-coded
                        diamonds (OFA / BFA / FFF / Released) overlayed
                        on the task bar at each filled date. Purely
                        decorative; bar placement comes from the
                        derived start/end. Component short-circuits
                        for non-Detailing rows. */}
                    <StageGateMilestones task={task} px={px} />

                    {/* Submittal review bars linked to this WP */}
                    {showSubmittals && submittals
                      .filter(s => s.is_submittal && s.linked_wp_id === task.id && s.due_date)
                      .map(s => {
                        const uploadIso = (s.uploaded_date || s.revision_date || task.start_date || "").split("T")[0];
                        const dueIso = s.due_date;
                        if (!uploadIso || !dueIso) return null;
                        return (
                          <SubmittalBar key={s.id} submittal={s} leftPx={px(uploadIso)} widthPx={spanPx(uploadIso, dueIso)} />
                        );
                      })
                    }
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* ── Tooltip ─────────────────────────────────────────────────── */}
      {/* Uses the design-system .sbd-card-strong surface (frosted dark
          panel + subtle inner border) so the hover card matches the
          rest of the SteelBuild dark theme instead of the flat
          background-surface previous version. */}
      {tooltip && (
        <div className="sbd-card-strong" style={{
          position: "fixed",
          left: tooltip.x + 12,
          top: tooltip.y - 10,
          zIndex: 9999,
          padding: "10px 14px",
          pointerEvents: "none",
          minWidth: 260,
          boxShadow: "0 12px 32px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)",
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
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--status-warning)", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 999, padding: "2px 6px" }}>
                Shifted {effectiveDates[tooltip.task.id]?.shiftedBy || 0}d
              </span>
            )}
            {hasLogicGapTask(tooltip.task, successorCountById) && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--status-warning)", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 999, padding: "2px 6px" }}>
                Logic gap
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
            Effective {fmtDate(effStart(tooltip.task))} to {fmtDate(effEnd(tooltip.task))} / {calcDuration(effStart(tooltip.task), effEnd(tooltip.task)) || 0}d
          </div>
          <div className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isOverdue(tooltip.task) ? "#EF4444" : "var(--text-secondary)" }}>
            {displayPct(tooltip.task)}% complete{isOverdue(tooltip.task) ? " · OVERDUE" : ""}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              Weather risk: {pluralize(weatherRiskByTask[tooltip.task.id].length, "day")}
            </div>
          )}
          {(tooltip.task.resource_names || tooltip.task.assigned_to) && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {tooltip.task.resource_names || tooltip.task.assigned_to}
            </div>
          )}
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
