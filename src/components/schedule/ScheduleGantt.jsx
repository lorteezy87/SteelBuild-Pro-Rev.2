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

const WEEK_PX = 240;
const ROW_H   = 40;
const SUM_H   = 36;
const HEAD_H  = 40;
// Left panel column layout
const LEFT_W  = 600;
// grid: WBS | TASK NAME | START | FINISH | PRED | STATUS | %
const GRID = "56px 1fr 72px 72px 56px 78px 42px";

export default function ScheduleGantt({ tasks: rawTasks, expandedTask, setExpandedTask, phaseFilter = "all" }) {
  const [collapsed, setCollapsed] = useState({});
  const leftRef   = useRef(null);
  const rightHead = useRef(null);
  const rightBody = useRef(null);

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

  const px = (dateStr) => {
    if (!dateStr) return 0;
    const d = new Date(dateStr + "T00:00:00Z");
    return Math.max(0, (d - dateRange.start) / 86400000 * PX_PER_DAY);
  };
  const spanPx = (start, end) => {
    if (!start || !end) return 0;
    return Math.max(4, (new Date(end + "T00:00:00Z") - new Date(start + "T00:00:00Z")) / 86400000 * PX_PER_DAY);
  };

  const today = new Date();
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-page)", overflow: "hidden" }}>

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
            return (
              <div key={`task-${task.id}`} style={{ height: ROW_H, display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 6, borderBottom: "1px solid rgba(255,255,255,0.04)", background: "transparent", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg-row-hover)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {/* WBS */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.wbs_code || task.task_number || "—"}</span>
                {/* Task name */}
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.task_name}</span>
                {/* Start */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(task.start_date)}</span>
                {/* Finish */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(task.end_date)}</span>
                {/* Predecessor */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{String(predecessor).slice(0, 8)}</span>
                {/* Status */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: statusColor(task.status), textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.06em" }}>{task.status || "—"}</span>
                {/* % */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: statusColor(task.status), textAlign: "right" }}>{task.percent_complete ?? 0}%</span>
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

            {/* Week grid lines */}
            {dateRange.weeks.map((w, i) => (
              <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: i * WEEK_PX, width: 1, background: "rgba(255,255,255,0.04)" }} />
            ))}

            {/* Rows */}
            {(() => {
              let top = 0;
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
                top += ROW_H;
                const { task } = row;
                if (!task.start_date || !task.end_date) {
                  return <div key={`gr-${task.id}`} style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid rgba(255,255,255,0.04)" }} />;
                }
                return (
                  <div key={`gr-${task.id}`} style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <TaskBar task={task} leftPx={px(task.start_date)} widthPx={spanPx(task.start_date, task.end_date)} />
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
