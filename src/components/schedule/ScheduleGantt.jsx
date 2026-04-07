import React, { useMemo, useState, useRef, useEffect } from "react";
import { derivePhase } from "../../utils/phases";

// ── Phase definition — ordered 1-7 ──────────────────────────────────────
const PHASES = [
  { id: 1, label: "Pre-Construction",    key: "Pre-Construction",  color: "#64748B" },
  { id: 2, label: "Detailing",           key: "Detailing",         color: "#0EA5E9" },
  { id: 3, label: "Procurement",         key: "Procurement",       color: "#F59E0B" },
  { id: 4, label: "Fabrication",         key: "Fabrication",       color: "#E8650A" },
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

// ── Summary gantt bar ─────────────────────────────────────────────────────
function SummaryBar({ phase, leftPx, widthPx }) {
  const ph = PHASE_BY_KEY[phase.key];
  const color = ph?.color || "#888";
  return (
    <div style={{
      position: "absolute",
      left: leftPx,
      width: Math.max(widthPx, 6),
      height: 14,
      top: "50%",
      transform: "translateY(-50%)",
      background: color,
      borderRadius: 2,
      opacity: 0.85,
    }}>
      {/* end caps */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: "100%", background: color, filter: "brightness(1.3)", borderRadius: "2px 0 0 2px" }} />
      <div style={{ position: "absolute", right: 0, top: 0, width: 4, height: "100%", background: color, filter: "brightness(1.3)", borderRadius: "0 2px 2px 0" }} />
    </div>
  );
}

// ── Task gantt bar ────────────────────────────────────────────────────────
function TaskBar({ task, leftPx, widthPx }) {
  const pct = task.percent_complete || 0;

  if (task.status === "Complete") {
    return (
      <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", background: "#10B981", borderRadius: 2, overflow: "hidden", display: "flex", alignItems: "center", padding: "0 8px" }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: "#003915", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.task_name}</span>
      </div>
    );
  }
  if (task.status === "In Progress") {
    return (
      <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", border: "1.5px solid var(--accent)", borderRadius: 2, overflow: "hidden", background: "rgba(200,155,32,0.08)" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: "var(--accent)", display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden" }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: "#000", whiteSpace: "nowrap" }}>{task.task_name}</span>
        </div>
      </div>
    );
  }
  if (task.status === "Delayed") {
    return (
      <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", border: "1.5px dashed #EF4444", borderRadius: 2, background: "rgba(239,68,68,0.06)", display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden" }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: "#EF4444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.task_name}</span>
      </div>
    );
  }
  // Not Started / default
  return (
    <div style={{ position: "absolute", left: leftPx, width: Math.max(widthPx, 4), height: 20, top: "50%", transform: "translateY(-50%)", border: "1px solid rgba(136,136,136,0.4)", borderRadius: 2, background: "rgba(136,136,136,0.06)", display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden" }}>
      <span style={{ fontSize: 8, fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.task_name}</span>
    </div>
  );
}

const ROW_H   = 40;
const SUM_H   = 36;
const HEAD_H  = 40;
// Left panel column layout
const LEFT_W  = 600;
// grid: WBS | TASK NAME | START | FINISH | PRED | STATUS | %
const GRID = "56px 1fr 72px 72px 56px 78px 42px";

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
      position: "absolute",
      left: leftPx,
      width: Math.max(widthPx, 4),
      height: 18,
      top: "50%",
      transform: "translateY(-50%)",
      background: c.bg,
      border: `1.5px dashed ${isLate ? "#EF4444" : c.border}`,
      borderRadius: 3,
      display: "flex",
      alignItems: "center",
      padding: "0 6px",
      overflow: "hidden",
      gap: 4,
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

export default function ScheduleGantt({ tasks: rawTasks, submittals = [], expandedTask, setExpandedTask, onTaskClick, onSave, phaseFilter = "all" }) {
  const [collapsed, setCollapsed] = useState({});
  const [zoom, setZoom] = useState("week"); // "week" | "month"
  const [showSubmittals, setShowSubmittals] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [tooltip, setTooltip] = useState(null); // { task, x, y }
  const [hoveredRowId, setHoveredRowId] = useState(null);
  const leftRef   = useRef(null);
  const rightHead = useRef(null);
  const rightBody = useRef(null);
  const containerRef = useRef(null);

  const WEEK_PX = zoom === "month" ? 80 : 240;

  const today = new Date();

  const isOverdue = (task) => {
    if (!task.end_date || task.status === "Complete") return false;
    return new Date(task.end_date + "T00:00:00Z") < today;
  };

  const startInlineEdit = (task, e) => {
    e.stopPropagation();
    setEditingId(task.id);
    setEditDraft({
      task_name: task.task_name || "",
      start_date: task.start_date || "",
      end_date: task.end_date || "",
      status: task.status || "Not Started",
      percent_complete: task.percent_complete ?? 0,
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

  const scrollToToday = () => {
    if (rightBody.current) {
      const todayOffset = (today - dateRange.start) / 86400000 * (WEEK_PX / 7);
      rightBody.current.scrollLeft = Math.max(0, todayOffset - 200);
    }
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

    // Order by PHASES array, uncategorized last
    const ordered = [];
    PHASES.forEach(ph => {
      if (map[ph.key]) ordered.push({ phase: ph, tasks: map[ph.key] });
    });
    if (map["Uncategorized"]) {
      ordered.push({ phase: { id: 99, key: "Uncategorized", label: "Uncategorized", color: "#888" }, tasks: map["Uncategorized"] });
    }
    return ordered;
  }, [rawTasks, phaseFilter]);

  // ── Date range ─────────────────────────────────────────────────────
  const allTasks = grouped.flatMap(g => g.tasks);

  const dateRange = useMemo(() => {
    if (allTasks.length === 0) return { start: new Date(), end: new Date(), weeks: [] };
    const dates = allTasks.flatMap(t => [
      t.start_date ? new Date(t.start_date + "T00:00:00Z") : null,
      t.end_date   ? new Date(t.end_date   + "T00:00:00Z") : null,
    ]).filter(Boolean);
    const start = new Date(Math.min(...dates));
    const end   = new Date(Math.max(...dates));
    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + (6 - end.getDay()) + 7);
    const weeks = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) weeks.push(new Date(d));
    return { start, end, weeks };
  }, [allTasks]);

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

  // Build flat row list for synchronized scroll
  const rows = useMemo(() => {
    const list = [];
    grouped.forEach(({ phase, tasks }) => {
      // Phase summary row
      const starts = tasks.map(t => t.start_date).filter(Boolean).sort();
      const ends   = tasks.map(t => t.end_date).filter(Boolean).sort();
      list.push({ type: "summary", phase, tasks, start: starts[0], end: ends[ends.length - 1] });
      if (!collapsed[phase.key]) {
        tasks.forEach(t => list.push({ type: "task", task: t, phase }));
      }
    });
    return list;
  }, [grouped, collapsed]);

  const totalHeight = rows.reduce((h, r) => h + (r.type === "summary" ? SUM_H : ROW_H), 0);

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
              padding: "4px 10px",
              borderRadius: 4,
              border: showSubmittals ? "1px solid #3B82F6" : "1px solid var(--divider)",
              background: showSubmittals ? "rgba(59,130,246,0.10)" : "transparent",
              color: showSubmittals ? "#3B82F6" : "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            📂 Submittals ({submittals.filter(s => s.is_submittal && s.linked_wp_id).length})
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
        <div style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, background: "var(--bg-sidebar)", borderRight: "1px solid var(--divider)", display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 6 }}>
          {["WBS", "TASK NAME", "START", "FINISH", "PRED", "STATUS", "%"].map((h, i) => (
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
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: cur ? "var(--accent)" : "rgba(136,136,136,0.4)", marginTop: 2 }}>
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
              const { phase, tasks } = row;
              const isOpen = !collapsed[phase.key];
              return (
                <div key={`sum-${phase.key}`} onClick={() => togglePhase(phase.key)} style={{ height: SUM_H, display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", padding: "0 12px", gap: 8, borderBottom: `1px solid var(--divider)`, background: `${phase.color}12`, cursor: "pointer", userSelect: "none" }}>
                  <span style={{ color: phase.color, fontSize: 10, transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", display: "inline-block", lineHeight: 1 }}>▾</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: phase.color, letterSpacing: "0.10em", background: `${phase.color}20`, border: `1px solid ${phase.color}40`, borderRadius: 2, padding: "1px 6px", flexShrink: 0 }}>{phase.id}</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: phase.color, letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{phase.label.toUpperCase()}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", flexShrink: 0 }}>{tasks.length} tasks</span>
                  </div>
                </div>
              );
            }
            // Task row
            const { task, phase } = row;
            const predecessor = task.predecessor_wbs || task.predecessor_task_id || task.predecessors || "—";
            const overdue = isOverdue(task);
            const isEditing = editingId === task.id;
            const leftHovered = hoveredRowId === task.id;
            return (
              <div key={`task-${task.id}`}
                style={{ height: ROW_H, display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 6, borderBottom: "1px solid rgba(255,255,255,0.04)", background: leftHovered ? "rgba(200,155,32,0.07)" : "transparent", transition: "background 0.08s", cursor: "pointer", borderLeft: overdue ? "3px solid #EF4444" : "3px solid transparent" }}
                onClick={() => onTaskClick && onTaskClick(task)}
                onMouseEnter={() => setHoveredRowId(task.id)}
                onMouseLeave={() => setHoveredRowId(null)}
              >
                {/* WBS */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.wbs_code || task.task_number || "—"}</span>
                {/* Task name — inline edit or display */}
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
                    title={task.task_name}
                    onDoubleClick={e => onSave && startInlineEdit(task, e)}
                    style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: overdue ? "#EF4444" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >{task.task_name}</span>
                )}
                {/* Start */}
                {isEditing ? (
                  <input type="date" value={editDraft.start_date} onChange={e => setEditDraft(d => ({ ...d, start_date: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 4px", width: "100%" }} />
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(task.start_date)}</span>
                )}
                {/* Finish */}
                {isEditing ? (
                  <input type="date" value={editDraft.end_date} onChange={e => setEditDraft(d => ({ ...d, end_date: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 4px", width: "100%" }} />
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: overdue ? "#EF4444" : "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(task.end_date)}</span>
                )}
                {/* Predecessor */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{String(predecessor).slice(0, 8)}</span>
                {/* Status */}
                {isEditing ? (
                  <select value={editDraft.status} onChange={e => setEditDraft(d => ({ ...d, status: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px" }}>
                    {["Not Started","In Progress","Complete","Delayed","On Hold"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: statusColor(task.status), textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.06em" }}>{task.status || "—"}</span>
                )}
                {/* % or save/cancel */}
                {isEditing ? (
                  <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => commitEdit(task.id)} disabled={saving} style={{ background: "var(--accent)", border: "none", borderRadius: 3, color: "#000", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, padding: "2px 6px", cursor: "pointer" }}>{saving ? "…" : "✓"}</button>
                    <button onClick={cancelEdit} style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px", cursor: "pointer" }}>✕</button>
                  </div>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: statusColor(task.status), textAlign: "right" }}>{task.percent_complete ?? 0}%</span>
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
                <div style={{ position: "absolute", top: 0, left: -18, background: "#FF6B00", borderRadius: 2, padding: "1px 4px", fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: "#fff", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>TODAY</div>
              </div>
            )}

            {/* Week grid lines — brighter at month boundaries */}
            {dateRange.weeks.map((w, i) => {
              const isMonthStart = w.getDate() <= 7; // first week of month
              return (
                <div key={i} style={{
                  position: "absolute", top: 0, bottom: 0, left: i * WEEK_PX, width: isMonthStart ? 1 : 1,
                  background: isMonthStart ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                }} />
              );
            })}

            {/* Rows */}
            {(() => {
              let top = 0;
              let taskIdx = 0;
              return rows.map((row, i) => {
                const rowTop = top;
                if (row.type === "summary") {
                  top += SUM_H;
                  const startPx = px(row.start);
                  const w = spanPx(row.start, row.end);
                  return (
                    <div key={`gs-${row.phase.key}`} style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: SUM_H, background: `${row.phase.color}08`, borderBottom: `1px solid var(--divider)` }}>
                      <SummaryBar phase={row.phase} leftPx={startPx} widthPx={w} />
                    </div>
                  );
                }
                const zebra = taskIdx++ % 2 === 1;
                top += ROW_H;
                const { task } = row;
                const overdue = isOverdue(task);
                const hovered = hoveredRowId === task.id;
                const baseBg = overdue ? "rgba(239,68,68,0.04)" : zebra ? "rgba(255,255,255,0.015)" : "transparent";
                const hoverBg = "rgba(200,155,32,0.07)";
                if (!task.start_date || !task.end_date) {
                  return <div key={`gr-${task.id}`} style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid rgba(255,255,255,0.04)", background: hovered ? hoverBg : baseBg }} />;
                }
                return (
                  <div key={`gr-${task.id}`}
                    style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid rgba(255,255,255,0.04)", background: hovered ? hoverBg : baseBg, cursor: "pointer", transition: "background 0.08s" }}
                    onClick={() => onTaskClick && onTaskClick(task)}
                    onMouseEnter={e => { setHoveredRowId(task.id); setTooltip({ task, x: e.clientX, y: e.clientY }); }}
                    onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                    onMouseLeave={() => { setHoveredRowId(null); setTooltip(null); }}
                  >
                    <TaskBar task={task} leftPx={px(task.start_date)} widthPx={spanPx(task.start_date, task.end_date)} />
                    {/* Submittal review bars linked to this WP */}
                    {showSubmittals && submittals
                      .filter(s => s.is_submittal && s.linked_wp_id === task.id && s.due_date)
                      .map(s => {
                        // Submittal bar spans: upload date → due date (before the WP start)
                        const uploadIso = (s.uploaded_date || s.revision_date || task.start_date || "").split("T")[0];
                        const dueIso = s.due_date;
                        if (!uploadIso || !dueIso) return null;
                        const leftPx2 = px(uploadIso);
                        const w2 = spanPx(uploadIso, dueIso);
                        return (
                          <SubmittalBar
                            key={s.id}
                            submittal={s}
                            leftPx={leftPx2}
                            widthPx={w2}
                          />
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
        <div style={{ position: "fixed", left: tooltip.x + 12, top: tooltip.y - 10, zIndex: 9999, background: "var(--bg-surface)", border: "1px solid var(--accent-border)", borderRadius: 6, padding: "8px 12px", pointerEvents: "none", minWidth: 180, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{tooltip.task.task_name}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: statusColor(tooltip.task.status), fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>{tooltip.task.status || "—"}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{fmtDate(tooltip.task.start_date)} → {fmtDate(tooltip.task.end_date)}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", marginTop: 2 }}>{tooltip.task.percent_complete ?? 0}% complete{isOverdue(tooltip.task) ? " · OVERDUE" : ""}</div>
          {onSave && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 6, opacity: 0.7 }}>Double-click row to edit inline</div>}
        </div>
      )}
    </div>
  );
}
