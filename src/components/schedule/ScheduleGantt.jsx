import React, { useMemo, useState, useRef, useEffect } from "react";
import { derivePhase } from "../../utils/phases";

// ── Phase definition — ordered 1-7 ──────────────────────────────────────
const PHASES = [
  { id: 1, label: "Pre-Construction",    key: "Pre-Construction",  color: "#64748B" },
  { id: 2, label: "Detailing",           key: "Detailing",         color: "#0EA5E9" },
  { id: 3, label: "Procurement",         key: "Procurement",       color: "#F59E0B" },
  { id: 4, label: "Fabrication",         key: "Fabrication",       color: "var(--status-review)" },
  { id: 5, label: "Delivery",            key: "Delivery",          color: "#10B981" },
  { id: 6, label: "Installation",        key: "Installation",      color: "#06B6D4" },
  { id: 7, label: "Closeout",            key: "Closeout",          color: "#6B7280" },
];
// Also catch Erection as Installation
const PHASE_KEY_MAP = { Erection: "Installation" };

function normalizePhase(task) {
  const raw = task.phase || derivePhase(task) || "";
  return PHASE_KEY_MAP[raw] || raw;
}

const PHASE_BY_KEY = Object.fromEntries(PHASES.map(p => [p.key, p]));

// ── Tree-sorting: parent/child hierarchy within each phase ───────────
function buildTreeOrder(tasks) {
  // Build parent→children map
  const childMap = {};
  const roots = [];
  tasks.forEach(t => {
    const pid = t.parent_task_id;
    if (pid && tasks.some(p => p.id === pid)) {
      if (!childMap[pid]) childMap[pid] = [];
      childMap[pid].push(t);
    } else {
      roots.push(t);
    }
  });
  // Sort children by start_date within each parent
  const sortByStart = (a, b) => {
    if (!a.start_date) return 1;
    if (!b.start_date) return -1;
    return new Date(a.start_date) - new Date(b.start_date);
  };
  Object.values(childMap).forEach(arr => arr.sort(sortByStart));
  roots.sort(sortByStart);

  // DFS flatten
  const result = [];
  const walk = (node, depth) => {
    result.push({ ...node, _depth: depth, _hasChildren: !!(childMap[node.id]?.length) });
    (childMap[node.id] || []).forEach(child => walk(child, depth + 1));
  };
  roots.forEach(r => walk(r, 0));
  return result;
}

// ── Dependency parsing ───────────────────────────────────────────────────
function parseDeps(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

// ── Display helpers ──────────────────────────────────────────────────────
// Tasks marked Complete should always read as 100% in the UI even if the
// underlying percent_complete field is stale or 0 (common data-entry gap).
function displayPct(task) {
  if (!task) return 0;
  if (task.status === "Complete") return 100;
  const v = Number(task.percent_complete);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

// Only treat a task as a milestone if the user explicitly flagged it.
// Auto-detection (duration === 0 or same start/end) was incorrectly marking
// every newly-created task as a milestone because AddTaskModal defaults both
// dates to today.
function isMilestoneTask(task) {
  if (!task) return false;
  if (task.milestone) return true;
  return false;
}

// Resource names sometimes get pasted into the task name field by mistake
// (e.g. "Stair #2Jagdish"). If the trailing chunk of the task name matches a
// known resource on the same task, strip it for display.
function sanitizeTaskName(task) {
  const raw = (task?.task_name || "").trim();
  if (!raw) return raw;
  const resources = (task.resource_names || task.assigned_to || "")
    .split(/[,/;]/)
    .map(r => r.trim())
    .filter(Boolean);
  let cleaned = raw;
  for (const r of resources) {
    if (r.length < 2) continue;
    // Trailing match with optional whitespace/punctuation
    const re = new RegExp(`[\\s\\-_/]*${r.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "i");
    cleaned = cleaned.replace(re, "").trim();
  }
  return cleaned || raw;
}

// ── Status helpers ────────────────────────────────────────────────────────
const STATUS_COLOR = {
  "Complete":    "#10B981",
  "In Progress": "var(--accent)",
  "Delayed":     "#EF4444",
  "On Hold":     "#DDB7FF",
  "Not Started": "var(--text-muted)",
};

function statusColor(s) { return STATUS_COLOR[s] || "var(--text-muted)"; }

// ── Formatting helpers ────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit", timeZone: "UTC" });
}

function calcDuration(start, end) {
  if (!start || !end) return "—";
  const days = Math.round((new Date(end + "T00:00:00Z") - new Date(start + "T00:00:00Z")) / 86400000);
  return days >= 0 ? `${days}d` : "—";
}

// ── Summary gantt bar with % rollup ──────────────────────────────────────
function SummaryBar({ phase, leftPx, widthPx, pctComplete }) {
  const ph = PHASE_BY_KEY[phase.key];
  const color = ph?.color || "#888";
  const pct = Math.round(pctComplete || 0);
  return (
    <div style={{
      position: "absolute",
      left: leftPx,
      width: Math.max(widthPx, 6),
      height: 14,
      top: "50%",
      transform: "translateY(-50%)",
      background: `${color}40`,
      borderRadius: 2,
      overflow: "hidden",
    }}>
      {/* Progress fill */}
      <div style={{
        position: "absolute", left: 0, top: 0, height: "100%",
        width: `${Math.min(pct, 100)}%`,
        background: color,
        borderRadius: 2,
        transition: "width 0.3s",
      }} />
      {/* End caps */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: "100%", background: color, borderRadius: "2px 0 0 2px" }} />
      <div style={{ position: "absolute", right: 0, top: 0, width: 4, height: "100%", background: color, borderRadius: "0 2px 2px 0" }} />
      {/* % label */}
      {widthPx > 40 && (
        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "var(--font-mono)" }}>
          {pct}%
        </span>
      )}
    </div>
  );
}

// ── Milestone diamond ────────────────────────────────────────────────────
function MilestoneDiamond({ leftPx, task }) {
  const color = task.status === "Complete" ? "#10B981" : "var(--accent)";
  return (
    <div style={{
      position: "absolute",
      left: leftPx - 7,
      top: "50%",
      transform: "translateY(-50%) rotate(45deg)",
      width: 14, height: 14,
      background: color,
      border: `2px solid ${color}`,
      boxShadow: `0 0 6px ${color}40`,
    }} />
  );
}

// ── Task gantt bar ────────────────────────────────────────────────────────
function TaskBar({ task, leftPx, widthPx }) {
  const pct = displayPct(task);
  const name = sanitizeTaskName(task);

  if (isMilestoneTask(task)) {
    return <MilestoneDiamond leftPx={leftPx} task={task} />;
  }

  if (task.status === "Complete") {
    return (
      <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", background: "#10B981", borderRadius: 2, overflow: "hidden", display: "flex", alignItems: "center", padding: "0 8px" }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: "#003915", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </div>
    );
  }
  if (task.status === "In Progress") {
    return (
      <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", border: "1.5px solid var(--accent)", borderRadius: 2, overflow: "hidden", background: "rgba(200,155,32,0.08)" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden" }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: "#000", whiteSpace: "nowrap" }}>{name}</span>
        </div>
      </div>
    );
  }
  if (task.status === "Delayed") {
    return (
      <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", border: "1.5px dashed #EF4444", borderRadius: 2, background: "rgba(239,68,68,0.06)", display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden" }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: "#EF4444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </div>
    );
  }
  // Not Started / default
  return (
    <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", border: "1px solid var(--border-strong)", borderRadius: 2, background: "var(--hover-bg)", display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden" }}>
      <span style={{ fontSize: 8, fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
    </div>
  );
}

// ── Submittal bar ─────────────────────────────────────────────────────────
function SubmittalBar({ submittal, leftPx, widthPx }) {
  const statusColors = {
    "Approved":             { bg: "rgba(16,185,129,0.15)", border: "#10B981", text: "#10B981" },
    "Approved as Noted":    { bg: "rgba(16,185,129,0.10)", border: "#10B981", text: "#10B981" },
    "Rejected":             { bg: "rgba(239,68,68,0.12)",  border: "#EF4444", text: "#EF4444" },
    "Revise & Resubmit":    { bg: "rgba(239,68,68,0.10)",  border: "#EF4444", text: "#EF4444" },
    "Under Review":         { bg: "rgba(59,130,246,0.12)", border: "#3B82F6", text: "#3B82F6" },
    "Draft":                { bg: "rgba(100,116,139,0.10)", border: "#64748B", text: "#94A3B8" },
  };
  const c = statusColors[submittal.status] || statusColors["Draft"];
  const isLate = submittal.due_date && new Date(submittal.due_date) < new Date() && submittal.status !== "Approved" && submittal.status !== "Approved as Noted";
  return (
    <div style={{
      position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 18,
      top: "50%", transform: "translateY(-50%)",
      background: c.bg, border: `1.5px dashed ${isLate ? "#EF4444" : c.border}`,
      borderRadius: 3, display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden", gap: 4,
    }}
    title={`📂 ${submittal.display_name || submittal.file_name}${isLate ? " — OVERDUE" : ""}`}
    >
      <span style={{ fontSize: 9, flexShrink: 0 }}>📂</span>
      <span style={{ fontSize: 8, fontWeight: 600, color: isLate ? "#EF4444" : c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {submittal.display_name || submittal.file_name}
      </span>
    </div>
  );
}

// ── Delivery bar ─────────────────────────────────────────────────────────
function DeliveryBar({ delivery, leftPx, widthPx }) {
  const statusColors = {
    "Scheduled":   { bg: "rgba(245,158,11,0.15)", border: "#F59E0B", text: "#F59E0B" },
    "In Transit":  { bg: "rgba(59,130,246,0.15)", border: "#3B82F6", text: "#3B82F6" },
    "Delivered":   { bg: "rgba(16,185,129,0.15)", border: "#10B981", text: "#10B981" },
    "Partial":     { bg: "rgba(239,68,68,0.12)",  border: "#EF4444", text: "#EF4444" },
    "Rejected":    { bg: "rgba(239,68,68,0.15)",  border: "#EF4444", text: "#EF4444" },
    "Delayed":     { bg: "rgba(168,85,247,0.12)", border: "#A855F7", text: "#A855F7" },
  };
  const c = statusColors[delivery.status] || statusColors["Scheduled"];
  const isLate = delivery.scheduled_date && new Date(delivery.scheduled_date) < new Date() && delivery.status !== "Delivered";
  const label = delivery.description || delivery.vendor || "Delivery";
  return (
    <div style={{
      position: "absolute", left: leftPx, width: Math.max(widthPx, 20), height: 20,
      top: "50%", transform: "translateY(-50%)",
      background: c.bg, border: `1.5px solid ${isLate ? "#EF4444" : c.border}`,
      borderRadius: 3, display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden", gap: 4,
    }}
    title={`🚛 ${label} · ${delivery.vendor || "—"} · ${delivery.pieces || 0}pc ${delivery.weight_tons || 0}T${isLate ? " — OVERDUE" : ""}`}
    >
      <span style={{ fontSize: 9, flexShrink: 0 }}>🚛</span>
      <span style={{ fontSize: 8, fontWeight: 600, color: isLate ? "#EF4444" : c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
    </div>
  );
}

const DELIVERY_STATUS_DOT = {
  "Scheduled":  "#F59E0B",
  "In Transit": "#3B82F6",
  "Delivered":  "#10B981",
  "Partial":    "#EF4444",
  "Rejected":   "#EF4444",
  "Delayed":    "#A855F7",
};

const ROW_H   = 40;
const SUM_H   = 36;
const HEAD_H  = 40;
const LEFT_W  = 680;
// grid: WBS | TASK NAME | DUR | START | FINISH | PRED | RESOURCES | STATUS | %
const GRID = "50px 1fr 40px 68px 68px 48px 80px 72px 36px";

export default function ScheduleGantt({ tasks: rawTasks, submittals = [], deliveries = [], expandedTask, setExpandedTask, onTaskClick, onSave, phaseFilter = "all" }) {
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
  const toggleTask = (taskId) => setCollapsedTasks(c => ({ ...c, [taskId]: !c[taskId] }));
  const leftRef   = useRef(null);
  const rightHead = useRef(null);
  const rightBody = useRef(null);
  const containerRef = useRef(null);

  const WEEK_PX = zoom === "month" ? 80 : 240;

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

  // ── Effective dates: cascade through dependencies so a late predecessor
  // automatically shifts its successors forward in the gantt view. The
  // underlying task.start_date / task.end_date in the DB are NEVER mutated;
  // this only affects how the bars are positioned visually.
  const effectiveDates = useMemo(() => {
    const out = {};
    const taskById = Object.fromEntries(allTasks.map(t => [t.id, t]));

    const dayMs = 86400000;
    const addDays = (iso, n) => {
      if (!iso) return iso;
      const d = new Date(iso + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const diffDays = (a, b) => {
      if (!a || !b) return 0;
      return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / dayMs);
    };

    const resolve = (taskId, visiting) => {
      if (out[taskId]) return out[taskId];
      if (visiting.has(taskId)) return null; // dependency cycle — bail out
      visiting.add(taskId);

      const task = taskById[taskId];
      if (!task) { visiting.delete(taskId); return null; }
      if (!task.start_date || !task.end_date) {
        out[taskId] = { start: task.start_date, end: task.end_date, shifted: false };
        visiting.delete(taskId);
        return out[taskId];
      }

      // Skip self-references — a task that lists itself as a predecessor
      // (data-entry bug) would otherwise short-circuit cycle detection on
      // the first hop and leave its bar undefined.
      const deps = parseDeps(task.dependencies).filter(depId => depId && depId !== taskId);
      let earliestStart = task.start_date;
      let shifted = false;
      for (const depId of deps) {
        const depResolved = resolve(depId, visiting);
        if (depResolved?.end) {
          const candidate = addDays(depResolved.end, 1);
          if (candidate > earliestStart) {
            earliestStart = candidate;
            shifted = true;
          }
        }
      }

      const dur = Math.max(0, diffDays(task.start_date, task.end_date));
      const newEnd = dur === 0 ? earliestStart : addDays(earliestStart, dur);
      out[taskId] = { start: earliestStart, end: newEnd, shifted };
      visiting.delete(taskId);
      return out[taskId];
    };

    for (const t of allTasks) resolve(t.id, new Set());
    return out;
  }, [allTasks]);

  const effStart = (task) => effectiveDates[task.id]?.start || task.start_date;
  const effEnd   = (task) => effectiveDates[task.id]?.end   || task.end_date;

  // Overdue uses the *effective* finish so a task whose predecessor slipped
  // is judged against where the bar actually sits in the gantt — not the
  // stale stored finish. Tasks marked Complete are never overdue.
  const isOverdue = (task) => {
    if (!task || task.status === "Complete") return false;
    const e = effEnd(task);
    if (!e) return false;
    return new Date(e + "T00:00:00Z") < today;
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
    const dates = allTasks.flatMap(t => {
      const s = effStart(t);
      const e = effEnd(t);
      return [
        s ? new Date(s + "T00:00:00Z") : null,
        e ? new Date(e + "T00:00:00Z") : null,
      ];
    }).filter(Boolean);
    // Include delivery dates so the timeline stretches to cover them
    deliveries.forEach(d => {
      if (d.scheduled_date) dates.push(new Date(d.scheduled_date + "T00:00:00Z"));
      if (d.required_date) dates.push(new Date(d.required_date + "T00:00:00Z"));
      if (d.actual_date) dates.push(new Date(d.actual_date + "T00:00:00Z"));
    });
    // Always include today in the range so the TODAY line is always visible
    dates.push(today);
    const start = new Date(Math.min(...dates));
    const end   = new Date(Math.max(...dates));
    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + (6 - end.getDay()) + 7);
    const weeks = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));
    return { start, end, weeks };
  }, [allTasks, deliveries]);

  const scrollToToday = () => {
    if (rightBody.current) {
      const todayOffset = (today - dateRange.start) / 86400000 * (WEEK_PX / 7);
      rightBody.current.scrollLeft = Math.max(0, todayOffset - 200);
    }
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
  }, [dateRange.start?.getTime?.(), dateRange.weeks.length]);

  const dayCount = Math.ceil((dateRange.end - dateRange.start) / 86400000);
  const PX_PER_DAY = WEEK_PX / 7;
  const totalW = Math.max(dayCount * PX_PER_DAY, dateRange.weeks.length * WEEK_PX);

  // Stats
  const totalTasks = allTasks.length;
  const completeTasks = allTasks.filter(t => t.status === "Complete").length;
  const overdueTasks = allTasks.filter(isOverdue).length;
  const inProgressTasks = allTasks.filter(t => t.status === "In Progress").length;

  const px = (dateStr) => {
    if (!dateStr) return 0;
    const d = new Date(dateStr + "T00:00:00Z");
    return Math.max(0, (d - dateRange.start) / 86400000 * PX_PER_DAY);
  };
  const spanPx = (start, end) => {
    if (!start || !end) return 0;
    return Math.max(4, (new Date(end + "T00:00:00Z") - new Date(start + "T00:00:00Z")) / 86400000 * PX_PER_DAY);
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
  }, [grouped, collapsed, collapsedTasks, showDeliveries, deliveries, collapsedDeliveries]);

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
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-page)", overflow: "hidden" }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "6px 16px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 16, flex: 1 }}>
          {[
            { label: "TOTAL", val: totalTasks, color: "var(--text-secondary)" },
            { label: "COMPLETE", val: completeTasks, color: "#10B981" },
            { label: "IN PROGRESS", val: inProgressTasks, color: "var(--accent)" },
            { label: "OVERDUE", val: overdueTasks, color: "#EF4444" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>{s.label}</span>
            </div>
          ))}
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
        <div style={{ display: "flex", border: "1px solid var(--divider)", borderRadius: 4, overflow: "hidden" }}>
          {["week", "month"].map(z => (
            <button key={z} onClick={() => setZoom(z)} style={{ padding: "4px 10px", border: "none", background: zoom === z ? "var(--accent-muted)" : "transparent", color: zoom === z ? "var(--accent)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {z}
            </button>
          ))}
        </div>
      </div>

      {/* ── Synchronized header row ─────────────────────────────────── */}
      <div style={{ display: "flex", flexShrink: 0, height: HEAD_H, borderBottom: "1px solid var(--divider)" }}>
        {/* Left header */}
        <div style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, background: "var(--bg-sidebar)", borderRight: "1px solid var(--divider)", display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 4 }}>
          {["WBS", "TASK NAME", "DUR", "START", "FINISH", "PRED", "RESOURCES", "STATUS", "%"].map((h, i) => (
            <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", color: "var(--text-muted)", textTransform: "uppercase", textAlign: i >= 2 ? "center" : "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h}</span>
          ))}
        </div>
        {/* Right timeline header */}
        <div ref={rightHead} style={{ flex: 1, overflowX: "hidden", overflowY: "hidden", background: "var(--bg-surface-low)" }}>
          <div style={{ display: "flex", width: totalW, height: HEAD_H }}>
            {dateRange.weeks.map((week, i) => {
              const cur = isCurrentWeek(week);
              return (
                <div key={i} style={{ minWidth: WEEK_PX, borderRight: "1px solid var(--divider)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: cur ? "rgba(200,155,32,0.06)" : "transparent" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: cur ? "var(--accent)" : "var(--text-muted)", letterSpacing: "0.08em" }}>
                    {week.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: cur ? "var(--accent)" : "var(--text-muted)", marginTop: 2 }}>
                    WK {Math.ceil((week - new Date(week.getFullYear(), 0, 1)) / 604800000)}
                  </span>
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
          {rows.map((row, i) => {
            if (row.type === "summary") {
              const { phase, tasks, pctComplete } = row;
              const isOpen = !collapsed[phase.key];
              return (
                <div key={`sum-${phase.key}`} onClick={() => togglePhase(phase.key)} style={{ height: SUM_H, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", padding: "0 12px", gap: 8, borderBottom: `1px solid var(--divider)`, background: `${phase.color}12`, cursor: "pointer", userSelect: "none" }}>
                  <span style={{ color: phase.color, fontSize: 10, transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", display: "inline-block", lineHeight: 1 }}>▾</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: phase.color, letterSpacing: "0.10em", background: `${phase.color}20`, border: `1px solid ${phase.color}40`, borderRadius: 2, padding: "1px 6px", flexShrink: 0 }}>{phase.id}</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: phase.color, letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{phase.label.toUpperCase()}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", flexShrink: 0 }}>{tasks.length} tasks</span>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: phase.color }}>{Math.round(pctComplete)}%</span>
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
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: dColor }}>{row.pctComplete}%</span>
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
                <div key={`del-${d.id}`} style={{ height: ROW_H, display: "grid", gridTemplateColumns: "50px 1fr 40px 68px 68px 48px 80px 72px 36px", alignItems: "center", padding: "0 12px", gap: 4, borderBottom: "1px solid var(--divider)", background: "transparent", borderLeft: isLate ? "3px solid #EF4444" : "3px solid transparent" }}
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
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap" }}>{d.weight_tons ? `${d.weight_tons}T` : "—"}</span>
                  {/* Scheduled date */}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isLate ? "#EF4444" : "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(d.scheduled_date)}</span>
                  {/* Required/actual date */}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(d.required_date || d.actual_date)}</span>
                  {/* Pieces */}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", textAlign: "center" }}>{d.pieces ? `${d.pieces}pc` : "—"}</span>
                  {/* Vendor */}
                  <span title={d.vendor || "—"} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.vendor || "—"}</span>
                  {/* Status */}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: dotColor, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.06em" }}>{d.status || "—"}</span>
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
            return (
              <div key={`task-${task.id}`}
                style={{ height: ROW_H, display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 4, borderBottom: "1px solid var(--divider)", background: leftHovered ? "rgba(200,155,32,0.07)" : parentRowBg, transition: "background 0.08s", cursor: "pointer", borderLeft: overdue ? "3px solid #EF4444" : "3px solid transparent" }}
                onClick={() => onTaskClick && onTaskClick(task)}
                onMouseEnter={() => setHoveredRowId(task.id)}
                onMouseLeave={() => setHoveredRowId(null)}
              >
                {/* WBS */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.wbs_code || "—"}</span>
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
                    {task._hasChildren && (
                      <button onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 9, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>
                        {collapsedTasks[task.id] ? "▶" : "▾"}
                      </button>
                    )}
                    {!task._hasChildren && task._depth > 0 && <span style={{ width: 14, flexShrink: 0 }} />}
                    {isMilestoneTask(task) && <span style={{ marginRight: 4, color: "var(--accent)" }}>◆</span>}
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: task._hasChildren ? 700 : 500, color: overdue ? "#EF4444" : task._hasChildren ? "var(--accent-light, var(--text-primary))" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sanitizeTaskName(task)}
                    </span>
                  </span>
                )}
                {/* Duration */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap" }}>
                  {task.duration ? `${task.duration}d` : calcDuration(task.start_date, task.end_date)}
                </span>
                {/* Start */}
                {isEditing ? (
                  <input type="date" value={editDraft.start_date} onChange={e => setEditDraft(d => ({ ...d, start_date: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px", width: "100%" }} />
                ) : (
                  <span
                    title={isShifted ? `Stored: ${fmtDate(task.start_date)}\nShifted by predecessors` : undefined}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isShifted ? "var(--accent)" : "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}
                  >
                    {fmtDate(dispStart)}{isShifted ? "*" : ""}
                  </span>
                )}
                {/* Finish */}
                {isEditing ? (
                  <input type="date" value={editDraft.end_date} onChange={e => setEditDraft(d => ({ ...d, end_date: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px", width: "100%" }} />
                ) : (
                  <span
                    title={isShifted ? `Stored: ${fmtDate(task.end_date)}\nShifted by predecessors` : undefined}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: overdue ? "#EF4444" : isShifted ? "var(--accent)" : "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}
                  >
                    {fmtDate(dispEnd)}{isShifted ? "*" : ""}
                  </span>
                )}
                {/* Predecessors */}
                <span title={depLabels || "—"} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{depLabels || "—"}</span>
                {/* Resources */}
                <span title={task.resource_names || task.assigned_to || "—"} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: task.resource_names || task.assigned_to ? "var(--text-secondary)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.resource_names || task.assigned_to || "—"}</span>
                {/* Status */}
                {isEditing ? (
                  <select value={editDraft.status} onChange={e => setEditDraft(d => ({ ...d, status: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px" }}>
                    {["Not Started","In Progress","Complete","Delayed","On Hold"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: statusColor(task.status), textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.06em" }}>{task.status || "—"}</span>
                )}
                {/* % or save/cancel */}
                {isEditing ? (
                  <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => commitEdit(task.id)} disabled={saving} style={{ background: "var(--accent)", border: "none", borderRadius: 3, color: "#000", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, padding: "2px 6px", cursor: "pointer" }}>{saving ? "…" : "✓"}</button>
                    <button onClick={cancelEdit} style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px", cursor: "pointer" }}>✕</button>
                  </div>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: statusColor(task.status), textAlign: "right" }}>{displayPct(task)}%</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Right gantt panel */}
        <div ref={rightBody} onScroll={() => { syncScroll("right"); syncHScroll(); }} style={{ flex: 1, overflowX: "auto", overflowY: "auto", background: "var(--bg-page)", position: "relative" }}>
          <div style={{ width: totalW, height: totalHeight, position: "relative" }}>

            {/* Today line */}
            {showToday && (
              <div style={{ position: "absolute", top: 0, bottom: 0, left: todayPx, width: 2, background: "#FF6B00", zIndex: 10 }}>
                <div style={{ position: "absolute", top: 0, left: -18, background: "#FF6B00", borderRadius: 2, padding: "1px 4px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>TODAY</div>
              </div>
            )}

            {/* Week grid lines */}
            {dateRange.weeks.map((w, i) => {
              const isMonthStart = w.getDate() <= 7;
              return (
                <div key={i} style={{
                  position: "absolute", top: 0, bottom: 0, left: i * WEEK_PX, width: 1,
                  background: isMonthStart ? "var(--border-strong)" : "var(--divider)",
                }} />
              );
            })}

            {/* Dependency arrows — SVG overlay */}
            {depArrows.length > 0 && (
              <svg style={{ position: "absolute", top: 0, left: 0, width: totalW, height: totalHeight, pointerEvents: "none", zIndex: 5 }}>
                <defs>
                  <marker id="depArrowHead" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280" />
                  </marker>
                </defs>
                {depArrows.map(({ key, fromX, fromY, toX, toY }) => {
                  // Finish-to-Start arrow: from end of predecessor to start of successor
                  const gap = 8;
                  const midX = fromX + gap;
                  const sameRow = Math.abs(fromY - toY) < 4;
                  if (sameRow) {
                    // Horizontal arrow
                    return (
                      <line key={key} x1={fromX} y1={fromY} x2={toX - 2} y2={toY}
                        stroke="#6B7280" strokeWidth="1.5" markerEnd="url(#depArrowHead)" />
                    );
                  }
                  // L-shaped connector: horizontal from pred end, then vertical, then horizontal to successor start
                  const goDown = toY > fromY;
                  const path = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX - 2} ${toY}`;
                  return (
                    <path key={key} d={path} fill="none" stroke="#6B7280" strokeWidth="1.5" markerEnd="url(#depArrowHead)" />
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
                const hovered = hoveredRowId === task.id;
                const parentBg = task._hasChildren ? "rgba(200,155,32,0.04)" : "transparent";
                const baseBg = overdue ? "rgba(239,68,68,0.04)" : zebra ? "var(--hover-bg)" : parentBg;
                const hoverBg = "rgba(200,155,32,0.07)";
                if (!task.start_date || !task.end_date) {
                  return <div key={`gr-${task.id}`} style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid var(--divider)", background: hovered ? hoverBg : baseBg }} />;
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
      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x + 12, top: tooltip.y - 10, zIndex: 9999, background: "var(--bg-surface)", border: "1px solid var(--accent-border)", borderRadius: 6, padding: "8px 12px", pointerEvents: "none", minWidth: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{sanitizeTaskName(tooltip.task)}</div>
          {tooltip.task.wbs_code && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 4 }}>WBS: {tooltip.task.wbs_code}</div>}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: statusColor(tooltip.task.status), fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>{tooltip.task.status || "—"}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{fmtDate(tooltip.task.start_date)} → {fmtDate(tooltip.task.end_date)}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", marginTop: 2 }}>{displayPct(tooltip.task)}% complete{isOverdue(tooltip.task) ? " · OVERDUE" : ""}</div>
          {(tooltip.task.resource_names || tooltip.task.assigned_to) && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 4 }}>Resources: {tooltip.task.resource_names || tooltip.task.assigned_to}</div>
          )}
          {onSave && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 6, opacity: 0.7 }}>Double-click row to edit inline</div>}
        </div>
      )}
    </div>
  );
}
