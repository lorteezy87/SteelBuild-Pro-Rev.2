import React, { useMemo } from "react";
import { sortByPhase, derivePhase } from "../../utils/phases";

const PHASE_BADGE = {
  'Pre-Construction': { bg: "rgba(139,92,246,0.12)",  color: "#8B5CF6" },
  Fabrication:        { bg: "rgba(173,198,255,0.12)", color: "#ADC6FF" },
  Delivery:           { bg: "rgba(74,225,118,0.12)",  color: "#4AE176" },
  Detailing:          { bg: "rgba(99,102,241,0.12)",  color: "#6366F1" },
  Installation:       { bg: "rgba(245,158,11,0.12)",  color: "#F59E0B" },
  Erection:           { bg: "rgba(74,225,118,0.12)",  color: "#4AE176" },
  Closeout:           { bg: "rgba(107,114,128,0.12)", color: "#9CA3AF" },
};

const STATUS_ICON = {
  Complete:    { icon: "✓", color: "var(--status-success)" },
  Delayed:     { icon: "⚠", color: "var(--status-error)" },
  "In Progress":{ icon: "●", color: "var(--accent)" },
};

const ROW_BG = {
  Delayed:     "rgba(239,68,68,0.04)",
  "On Hold":   "rgba(245,158,11,0.04)",
};

function SubLabelColor(status) {
  if (status === "Delayed")  return "var(--status-error)";
  if (status === "Complete") return "var(--status-success)";
  return "var(--text-muted)";
}

function PctColor(status) {
  if (status === "Complete") return "var(--status-success)";
  if (status === "Delayed")  return "var(--status-error)";
  return "var(--text-primary)";
}

function TaskBar({ task, leftPx, widthPx }) {
  const label = task.task_name;
  const pct   = task.percent_complete || 0;

  if (task.status === "Complete") {
    return (
      <div style={{
        position: "absolute",
        left: leftPx,
        width: Math.max(widthPx, 4),
        height: 24,
        top: "50%",
        transform: "translateY(-50%)",
        background: "#4AE176",
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        overflow: "hidden",
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: "#003915", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </div>
    );
  }

  if (task.status === "In Progress") {
    return (
      <div style={{
        position: "absolute",
        left: leftPx,
        width: Math.max(widthPx, 4),
        height: 24,
        top: "50%",
        transform: "translateY(-50%)",
        border: "2px solid var(--accent)",
        borderRadius: 2,
        overflow: "hidden",
        background: "rgba(59,130,246,0.08)",
      }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`,
          height: "100%",
          background: "var(--accent)",
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          overflow: "hidden",
        }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: "#fff", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
        </div>
      </div>
    );
  }

  if (task.status === "Delayed") {
    return (
      <div style={{
        position: "absolute",
        left: leftPx,
        width: Math.max(widthPx, 4),
        height: 24,
        top: "50%",
        transform: "translateY(-50%)",
        border: "2px dashed var(--status-error)",
        borderRadius: 2,
        background: "rgba(239,68,68,0.05)",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        overflow: "hidden",
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: "var(--status-error)", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </div>
    );
  }

  if (task.status === "On Hold") {
    return (
      <div style={{
        position: "absolute",
        left: leftPx,
        width: Math.max(widthPx, 4),
        height: 24,
        top: "50%",
        transform: "translateY(-50%)",
        border: "1px solid rgba(221,183,255,0.6)",
        borderRadius: 2,
        background: "rgba(221,183,255,0.08)",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        overflow: "hidden",
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: "#DDB7FF", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </div>
    );
  }

  // Not Started / Scheduled / default
  return (
    <div style={{
      position: "absolute",
      left: leftPx,
      width: Math.max(widthPx, 4),
      height: 24,
      top: "50%",
      transform: "translateY(-50%)",
      border: "1px solid rgba(77,142,255,0.6)",
      borderRadius: 2,
      background: "rgba(77,142,255,0.08)",
      display: "flex",
      alignItems: "center",
      padding: "0 10px",
      overflow: "hidden",
    }}>
      <span style={{ fontSize: 9, fontWeight: 900, color: "#4D8EFF", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </div>
  );
}

const WEEK_PX = 280;

export default function ScheduleGantt({ tasks: rawTasks, expandedTask, setExpandedTask, phaseFilter = 'all' }) {

  // Apply phase filter + sort by phase
  const tasks = useMemo(() => {
    const filtered = phaseFilter === 'all'
      ? rawTasks
      : rawTasks.filter(t => derivePhase(t) === phaseFilter);
    return sortByPhase(filtered);
  }, [rawTasks, phaseFilter]);

  // ── Date range + week columns (unchanged logic) ────────────────
  const dateRange = useMemo(() => {
    if (tasks.length === 0) return { start: new Date(), end: new Date(), weeks: [] };

    const dates = tasks.flatMap((t) => [
      t.start_date ? new Date(t.start_date + "T00:00:00Z") : null,
      t.end_date   ? new Date(t.end_date   + "T00:00:00Z") : null,
    ]).filter(Boolean);
    const start = new Date(Math.min(...dates));
    const end   = new Date(Math.max(...dates));

    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + (6 - end.getDay()));

    const weeks = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
      weeks.push(new Date(d));
    }

    return { start, end, weeks };
  }, [tasks]);

  const dayCount = Math.ceil(
    (dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24)
  );

  const PX_PER_DAY = WEEK_PX / 7;
  const totalTimelineWidth = dayCount * PX_PER_DAY;

  const getTaskPosition = (task) => {
    const taskStart = new Date(task.start_date + "T00:00:00Z");
    const taskEnd   = new Date(task.end_date   + "T00:00:00Z");
    const start = Math.max(
      0,
      (taskStart - dateRange.start) / (1000 * 60 * 60 * 24)
    );
    const width = (taskEnd - taskStart) / (1000 * 60 * 60 * 24);
    return { start, width };
  };

  // Today line position
  const today = new Date();
  const todayOffset = (today - dateRange.start) / (1000 * 60 * 60 * 24);
  const todayPx = todayOffset * PX_PER_DAY;
  const showToday = todayOffset >= 0 && todayOffset <= dayCount;

  // Stats for footer
  const totalTonnage = tasks.reduce((s, t) => s + (t.tonnage || 0), 0);
  const activeTasks  = tasks.filter(t => t.status === "In Progress").length;

  // Current week check
  const nowWeekStart = new Date(today);
  nowWeekStart.setDate(today.getDate() - today.getDay());
  const isCurrentWeek = (w) => w.toDateString() === nowWeekStart.toDateString();

  const formatWeekRange = (weekStart) => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `${fmt(weekStart)} – ${fmt(end)}`;
  };

  const ROW_H = 65;
  const HEADER_H = 40;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 180px)",
      minHeight: 500,
      background: "var(--bg-surface)",
      borderRadius: "var(--radius-card)",
      overflow: "hidden",
      border: "none",
    }}>

      {/* ── Main panels ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT PANEL ── */}
        <div style={{
          width: "30%",
          minWidth: 320,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--divider)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            position: "sticky",
            top: 0,
            zIndex: 5,
            background: "var(--bg-sidebar)",
            padding: "0 16px",
            height: HEADER_H,
            display: "grid",
            gridTemplateColumns: "1fr auto auto 40px",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            borderBottom: "1px solid var(--divider)",
          }}>
            {["TASK / PIECE MARK", "PHASE", "STAT", "%"].map((h, i) => (
              <span key={i} style={{
                fontFamily: "var(--font-body)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                textAlign: i === 3 ? "right" : "left",
                whiteSpace: "nowrap",
              }}>{h}</span>
            ))}
          </div>

          {/* Task rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {tasks.length === 0 ? (
              <div style={{ padding: "24px 16px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                No tasks
              </div>
            ) : tasks.map((task) => {
              const statusIcon = STATUS_ICON[task.status] || { icon: "–", color: "var(--text-muted)" };
              const phaseBadge = PHASE_BADGE[task.phase] || { bg: "rgba(255,255,255,0.06)", color: "var(--text-muted)" };
              const rowBg = ROW_BG[task.status] || "transparent";

              return (
                <div
                  key={task.id}
                  onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  style={{
                    height: ROW_H,
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto 40px",
                    padding: "0 16px",
                    alignItems: "center",
                    gap: 8,
                    borderBottom: "1px solid var(--divider)",
                    background: expandedTask === task.id ? "var(--bg-row-hover)" : rowBg,
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-row-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = expandedTask === task.id ? "var(--bg-row-hover)" : rowBg}
                >
                  {/* Task name + sub-label */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {task.task_name}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: SubLabelColor(task.status),
                      textTransform: "uppercase",
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {task.task_type || task.wbs_code || task.task_number}
                    </div>
                  </div>

                  {/* Phase badge */}
                  <span style={{
                    background: phaseBadge.bg,
                    color: phaseBadge.color,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    whiteSpace: "nowrap",
                    fontFamily: "var(--font-body)",
                  }}>
                    {task.phase || "—"}
                  </span>

                  {/* Status icon */}
                  <span style={{
                    fontSize: 16,
                    color: statusIcon.color,
                    lineHeight: 1,
                    width: 16,
                    textAlign: "center",
                  }}>
                    {statusIcon.icon}
                  </span>

                  {/* Percent */}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    textAlign: "right",
                    color: PctColor(task.status),
                  }}>
                    {task.percent_complete ?? 0}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{
          flex: 1,
          background: "var(--bg-page)",
          overflowX: "auto",
          overflowY: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Timeline header */}
          <div style={{
            height: HEADER_H,
            background: "var(--bg-surface-low)",
            borderBottom: "1px solid var(--divider)",
            display: "flex",
            flexShrink: 0,
            width: Math.max(totalTimelineWidth, dateRange.weeks.length * WEEK_PX),
            position: "sticky",
            top: 0,
            zIndex: 4,
          }}>
            {dateRange.weeks.map((week, i) => {
              const current = isCurrentWeek(week);
              return (
                <div key={i} style={{
                  minWidth: WEEK_PX,
                  borderRight: "1px solid var(--divider)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "4px 0",
                  background: current ? "rgba(59,130,246,0.06)" : "transparent",
                }}>
                  <div style={{
                    fontSize: 9,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: current ? "var(--accent)" : "var(--text-muted)",
                    fontFamily: "var(--font-body)",
                  }}>
                    {week.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: current ? "var(--accent)" : "var(--text-muted)",
                    marginTop: 2,
                  }}>
                    {formatWeekRange(week)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gantt rows + today line */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            position: "relative",
            width: Math.max(totalTimelineWidth, dateRange.weeks.length * WEEK_PX),
          }}>
            {/* Today line */}
            {showToday && (
              <div style={{
                position: "absolute",
                left: todayPx,
                top: 0,
                bottom: 0,
                width: 1,
                background: "var(--accent)",
                zIndex: 10,
                boxShadow: "0 0 8px rgba(59,130,246,0.5)",
              }}>
                <div style={{
                  position: "absolute",
                  top: -5,
                  left: -4,
                  width: 10,
                  height: 10,
                  background: "var(--accent)",
                  transform: "rotate(45deg)",
                }} />
              </div>
            )}

            {tasks.length === 0 ? (
              <div style={{ padding: "24px 20px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                No tasks to display
              </div>
            ) : tasks.map((task) => {
              const { start, width } = getTaskPosition(task);
              const leftPx  = start * PX_PER_DAY;
              const widthPx = Math.max(width * PX_PER_DAY, 4);

              return (
                <div
                  key={task.id}
                  className="gantt-grid"
                  style={{
                    height: ROW_H,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    position: "relative",
                  }}
                >
                  <TaskBar
                    task={task}
                    leftPx={leftPx}
                    widthPx={widthPx}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── FOOTER BAR ── */}
      <div style={{
        height: 32,
        background: "var(--bg-sidebar)",
        borderTop: "1px solid var(--divider)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 16px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>
            <span style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>TOTAL TONNAGE: </span>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>{totalTonnage.toFixed(1)} T</span>
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>
            <span style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>ACTIVE TASKS: </span>
            <span style={{ color: "var(--status-success)", fontWeight: 700 }}>{activeTasks}</span>
          </span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
          LAST UPDATED {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}