import React, { useMemo, useRef, useCallback } from "react";
import { sortByPhase, derivePhase } from "../../utils/phases";

const PX_PER_DAY = 72;
const ROW_H      = 50;
const HEADER_H   = 48;
const LEFT_W     = 340;

const MONTH = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function fmtDay(d, todayStr) {
  const s = `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return d.toISOString().slice(0,10) === todayStr ? `${s} (T)` : s;
}

/** Returns true if today falls within the task's date range AND it's In Progress with low pct. */
function isHotTask(task, todayStr) {
  if (task.status !== "In Progress") return false;
  const pct = task.percent_complete || 0;
  if (pct >= 30) return false;           // already well underway → show as progress bar
  const s = task.start_date?.slice(0,10);
  const e = task.end_date?.slice(0,10);
  return s && e && todayStr >= s && todayStr <= e;
}

/* ── Task bar variants ─────────────────────────────────────────────────── */
function TaskBar({ task, leftPx, widthPx, todayStr }) {
  const pct = task.percent_complete || 0;
  const base = {
    position: "absolute",
    left: leftPx,
    top: "50%",
    transform: "translateY(-50%)",
    height: 22,
    borderRadius: 0,
  };

  /* COMPLETE — solid cyan */
  if (task.status === "Complete") {
    return (
      <div style={{ ...base, width: Math.max(widthPx, 48), background: "#00E5FF", boxShadow: "0 0 10px rgba(0,229,255,0.35)" }}>
        <span style={labelStyle("#050505")}>COMPLETE</span>
      </div>
    );
  }

  /* ACTIVE / HOT — orange bar + orange dot */
  if (isHotTask(task, todayStr)) {
    return (
      <div style={{ ...base, display: "flex", alignItems: "center" }}>
        <div style={{
          width: Math.max(widthPx, 90), height: 22,
          background: "#FF6B00",
          boxShadow: "0 0 14px rgba(255,107,0,0.45)",
          display: "flex", alignItems: "center",
        }}>
          <span style={labelStyle("#000")}>ACTIVE TASK</span>
        </div>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF6B00", marginLeft: 3, flexShrink: 0, boxShadow: "0 0 8px rgba(255,107,0,0.7)" }} />
      </div>
    );
  }

  /* IN PROGRESS — cyan fill + dark teal outline for remainder */
  if (task.status === "In Progress") {
    const fillW = Math.round(Math.max(widthPx, 60) * pct / 100);
    const remW  = Math.max(widthPx, 60) - fillW;
    return (
      <div style={{ ...base, width: Math.max(widthPx, 60), display: "flex", border: "1px solid rgba(0,229,255,0.35)", overflow: "hidden", background: "rgba(0,229,255,0.06)" }}>
        {/* filled portion */}
        <div style={{ width: fillW, height: "100%", background: "#00E5FF", display: "flex", alignItems: "center", overflow: "hidden", flexShrink: 0 }}>
          {fillW > 50 && <span style={labelStyle("#050505")}>{pct}% COMPLETE</span>}
        </div>
        {/* remaining */}
        <div style={{ width: remW, height: "100%", display: "flex", alignItems: "center", overflow: "hidden", flexShrink: 0 }}>
          {fillW <= 50 && <span style={{ ...labelStyle("rgba(0,229,255,0.9)"), paddingLeft: 6 }}>{pct}% COMPLETE</span>}
        </div>
      </div>
    );
  }

  /* DELAYED — red dashed */
  if (task.status === "Delayed") {
    return (
      <div style={{ ...base, width: Math.max(widthPx, 48), border: "2px dashed rgba(239,68,68,0.8)", background: "rgba(239,68,68,0.07)", display: "flex", alignItems: "center" }}>
        <span style={labelStyle("#EF4444")}>DELAYED</span>
      </div>
    );
  }

  /* ON HOLD */
  if (task.status === "On Hold") {
    return (
      <div style={{ ...base, width: Math.max(widthPx, 48), border: "1px solid rgba(221,183,255,0.5)", background: "rgba(221,183,255,0.07)", display: "flex", alignItems: "center" }}>
        <span style={labelStyle("#DDB7FF")}>ON HOLD</span>
      </div>
    );
  }

  /* NOT STARTED / SCHEDULED / default — dark navy PENDING */
  return (
    <div style={{ ...base, width: Math.max(widthPx, 48), background: "rgba(30,58,138,0.55)", border: "1px solid rgba(59,130,246,0.35)", display: "flex", alignItems: "center" }}>
      <span style={labelStyle("rgba(147,197,253,0.85)")}>PENDING</span>
    </div>
  );
}

function labelStyle(color) {
  return {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: "0.1em",
    color,
    padding: "0 8px",
    whiteSpace: "nowrap",
    userSelect: "none",
  };
}

/* ── Main component ────────────────────────────────────────────────────── */
export default function ScheduleGantt({ tasks: rawTasks, expandedTask, setExpandedTask, phaseFilter = 'all' }) {

  const leftScrollRef  = useRef(null);
  const rightBodyRef   = useRef(null);
  const rightHeaderRef = useRef(null);

  /* Sync vertical scroll between left and right body */
  const onLeftScroll = useCallback(() => {
    if (rightBodyRef.current) rightBodyRef.current.scrollTop = leftScrollRef.current.scrollTop;
  }, []);
  const onRightBodyScroll = useCallback(() => {
    if (leftScrollRef.current) leftScrollRef.current.scrollTop = rightBodyRef.current.scrollTop;
    if (rightHeaderRef.current) rightHeaderRef.current.scrollLeft = rightBodyRef.current.scrollLeft;
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().slice(0,10), []);

  const tasks = useMemo(() => {
    const filtered = phaseFilter === 'all'
      ? rawTasks
      : rawTasks.filter(t => derivePhase(t) === phaseFilter);
    return sortByPhase(filtered);
  }, [rawTasks, phaseFilter]);

  const { days, start: rangeStart } = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date(); now.setUTCHours(0,0,0,0);
      return { days: [now], start: now };
    }
    const dates = tasks.flatMap(t => [
      t.start_date ? new Date(t.start_date + "T00:00:00Z") : null,
      t.end_date   ? new Date(t.end_date   + "T00:00:00Z") : null,
    ]).filter(Boolean);
    const s = new Date(Math.min(...dates));
    const e = new Date(Math.max(...dates));
    s.setUTCDate(s.getUTCDate() - 4);
    e.setUTCDate(e.getUTCDate() + 4);
    const days = [];
    for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(new Date(d));
    }
    return { days, start: s };
  }, [tasks]);

  const totalW = days.length * PX_PER_DAY;

  const getPos = (task) => {
    const s = new Date(task.start_date + "T00:00:00Z");
    const e = new Date(task.end_date   + "T00:00:00Z");
    const startDay = (s - rangeStart) / 86400000;
    const widthDay = Math.max((e - s) / 86400000, 1);
    return { leftPx: Math.max(0, startDay) * PX_PER_DAY, widthPx: widthDay * PX_PER_DAY };
  };

  const todayDay = (new Date(todayStr + "T00:00:00Z") - rangeStart) / 86400000;
  const todayPx  = todayDay * PX_PER_DAY;
  const showToday = todayDay >= 0 && todayDay <= days.length;

  const activeTasks = tasks.filter(t => t.status === "In Progress").length;
  const totalTonnage = tasks.reduce((s, t) => s + (t.tonnage || 0), 0);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 180px)", minHeight: 500,
      background: "var(--bg-page)",
      border: "1px solid var(--border-default)",
      overflow: "hidden",
    }}>

      {/* ── HEADER ROW ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexShrink: 0, height: HEADER_H, borderBottom: "1px solid var(--border-default)" }}>

        {/* Left header */}
        <div style={{
          width: LEFT_W, minWidth: LEFT_W,
          background: "var(--bg-surface-low)",
          borderRight: "1px solid var(--border-default)",
          display: "flex", flexDirection: "column",
          justifyContent: "flex-end", padding: "0 16px 8px",
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, fontWeight: 700, letterSpacing: "0.18em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            PROJECT SEQUENCE MATRIX
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "76px 1fr 56px", gap: 8, marginTop: 5 }}>
            {["ID", "TASK NAME", "TRADE"].map(h => (
              <span key={h} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(107,114,128,0.55)", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>
        </div>

        {/* Timeline header (synced scroll) */}
        <div
          ref={rightHeaderRef}
          style={{ flex: 1, overflowX: "hidden", background: "var(--bg-surface-low)" }}
        >
          <div style={{ display: "flex", height: "100%", width: totalW }}>
            {days.map((day, i) => {
              const isT = day.toISOString().slice(0,10) === todayStr;
              return (
                <div key={i} style={{
                  minWidth: PX_PER_DAY, width: PX_PER_DAY,
                  borderRight: `1px solid ${isT ? "rgba(255,107,0,0.3)" : "rgba(30,64,175,0.12)"}`,
                  display: "flex", alignItems: "flex-end", justifyContent: "center",
                  paddingBottom: 8,
                  background: isT ? "rgba(255,107,0,0.07)" : "transparent",
                }}>
                  <span style={{
                    fontFamily: "'IBM Plex Mono',monospace",
                    fontSize: 8,
                    fontWeight: isT ? 900 : 600,
                    letterSpacing: "0.1em",
                    color: isT ? "#FF6B00" : "var(--text-muted)",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}>
                    {fmtDay(day, todayStr)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── BODY ROW ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left panel rows */}
        <div
          ref={leftScrollRef}
          onScroll={onLeftScroll}
          style={{
            width: LEFT_W, minWidth: LEFT_W,
            overflowY: "auto", overflowX: "hidden",
            borderRight: "1px solid var(--border-default)",
            background: "var(--bg-page)",
            flexShrink: 0,
          }}
        >
          {tasks.length === 0 ? (
            <div style={{ padding: "24px 16px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--text-muted)" }}>No tasks</div>
          ) : tasks.map(task => {
            const hot     = isHotTask(task, todayStr);
            const taskId  = task.wbs_code || task.task_number || `T-${String(task.id).slice(-4)}`;
            const trade   = (task.task_type || task.phase || "").slice(0, 4).toUpperCase();
            const idColor = hot ? "#FF6B00" : "var(--accent)";

            return (
              <div
                key={task.id}
                onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                style={{
                  height: ROW_H,
                  display: "grid",
                  gridTemplateColumns: "76px 1fr 56px",
                  gap: 8,
                  padding: "0 16px",
                  alignItems: "center",
                  borderBottom: "1px solid rgba(30,64,175,0.1)",
                  borderLeft: hot ? "3px solid #FF6B00" : "3px solid transparent",
                  background: hot ? "rgba(255,107,0,0.04)" : "transparent",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = hot ? "rgba(255,107,0,0.07)" : "rgba(255,255,255,0.02)"}
                onMouseLeave={e => e.currentTarget.style.background = hot ? "rgba(255,107,0,0.04)" : "transparent"}
              >
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: idColor, letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {taskId}
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 500, color: hot ? "#FF6B00" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.task_name}
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.1em" }}>
                  {trade}
                </span>
              </div>
            );
          })}
        </div>

        {/* Right Gantt canvas */}
        <div
          ref={rightBodyRef}
          onScroll={onRightBodyScroll}
          style={{ flex: 1, overflowX: "auto", overflowY: "auto", position: "relative", background: "var(--bg-page)" }}
        >
          <div style={{ width: totalW, position: "relative", minHeight: "100%" }}>

            {/* Vertical day grid lines (single pass, not per-row) */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
              {days.map((day, i) => {
                const isT = day.toISOString().slice(0,10) === todayStr;
                return (
                  <div key={i} style={{
                    position: "absolute",
                    left: i * PX_PER_DAY,
                    top: 0, bottom: 0,
                    width: 1,
                    background: isT ? "rgba(255,107,0,0.18)" : "rgba(30,64,175,0.08)",
                  }} />
                );
              })}
            </div>

            {/* Today orange line + LIVE label */}
            {showToday && (
              <div style={{ position: "absolute", left: todayPx, top: 0, bottom: 0, width: 2, background: "#FF6B00", zIndex: 10, boxShadow: "0 0 14px rgba(255,107,0,0.5)", pointerEvents: "none" }}>
                <div style={{
                  position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                  background: "#FF6B00", color: "#000",
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 8, fontWeight: 900, letterSpacing: "0.15em",
                  padding: "3px 7px",
                  whiteSpace: "nowrap",
                }}>
                  LIVE
                </div>
              </div>
            )}

            {/* Task rows */}
            {tasks.map(task => {
              const { leftPx, widthPx } = getPos(task);
              return (
                <div
                  key={task.id}
                  style={{
                    height: ROW_H,
                    borderBottom: "1px solid rgba(30,64,175,0.08)",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <TaskBar task={task} leftPx={leftPx} widthPx={widthPx} todayStr={todayStr} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <div style={{
        height: 30, background: "var(--bg-surface-low)",
        borderTop: "1px solid var(--border-default)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 16px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8 }}>
            <span style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>ACTIVE: </span>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>{activeTasks}</span>
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8 }}>
            <span style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>TONNAGE: </span>
            <span style={{ color: "#FF6B00", fontWeight: 700 }}>{totalTonnage.toFixed(1)} T</span>
          </span>
        </div>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
          UPDATED {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
