import React, { useEffect, useMemo, useState } from "react";
import { sortByPhase, PHASES, PHASE_ORDER, derivePhase } from "../../utils/phases";
import { getTaskHierarchyDepth, sortTasksHierarchically } from "./scheduleUtils";

const STATUS_OPTIONS = ["Not Started", "In Progress", "Complete", "Delayed", "On Hold"];
const WEEK_PX = 260;
const ROW_H = 78;
const HEADER_H = 52;
const LEFT_GRID_TEMPLATE = "minmax(240px,1.35fr) 136px 136px 84px 124px 124px 84px";

const PHASE_BADGE = {
  "Pre-Construction": { bg: "rgba(255,107,0,0.12)", color: "var(--accent)" },
  Detailing: { bg: "rgba(0,229,255,0.12)", color: "var(--phase-detailing)" },
  Procurement: { bg: "rgba(0,229,255,0.10)", color: "var(--secondary)" },
  Fabrication: { bg: "rgba(255,107,0,0.14)", color: "var(--phase-fab)" },
  Delivery: { bg: "rgba(255,214,0,0.12)", color: "var(--warning)" },
  Installation: { bg: "rgba(255,214,0,0.12)", color: "var(--phase-erection)" },
  Closeout: { bg: "rgba(107,114,128,0.14)", color: "var(--phase-closeout)" },
};

const STATUS_ICON = {
  Complete: { icon: "OK", color: "var(--status-success)" },
  Delayed: { icon: "!", color: "var(--status-error)" },
  "In Progress": { icon: "*", color: "var(--accent)" },
  "On Hold": { icon: "||", color: "var(--secondary)" },
  "Not Started": { icon: "-", color: "var(--text-muted)" },
};

const ROW_BG = {
  Delayed: "rgba(213,0,0,0.05)",
  "On Hold": "rgba(0,229,255,0.04)",
};

function formatCellDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function pctColor(status) {
  if (status === "Complete") return "var(--status-success)";
  if (status === "Delayed") return "var(--status-error)";
  if (status === "On Hold") return "var(--secondary)";
  return "var(--text-primary)";
}

function subLabelColor(status) {
  if (status === "Delayed") return "var(--status-error)";
  if (status === "Complete") return "var(--status-success)";
  if (status === "On Hold") return "var(--secondary)";
  return "var(--text-muted)";
}

function getHierarchyDepth(task, tasks = []) {
  if (isSummaryLike(task) && task.summaryDepth != null) return task.summaryDepth;
  return getTaskHierarchyDepth(task, tasks) + 1;
}

function isSummaryLike(task) {
  return Boolean(task.isSummary || task.task_type === "Summary");
}

function InlineEditor({ value, onCommit, type = "text", options = [], width = "100%", textAlign = "left" }) {
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = (nextValue = draft) => {
    if ((nextValue ?? "") === (value ?? "")) return;
    onCommit?.(nextValue);
  };

  const baseStyle = {
    width,
    minWidth: 0,
    background: "rgba(12,14,17,0.92)",
    border: "1px solid rgba(51,53,56,0.9)",
    borderRadius: 4,
    padding: "5px 6px",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-primary)",
    textAlign,
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
  };

  if (type === "select") {
    return (
      <select
        value={draft || ""}
        onChange={(e) => {
          const nextValue = e.target.value;
          setDraft(nextValue);
          commit(nextValue);
        }}
        style={baseStyle}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={type}
      value={draft ?? ""}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(type === "number" ? Number(draft || 0) : draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      style={baseStyle}
    />
  );
}

function TaskBar({ task, leftPx, widthPx }) {
  const pct = task.percent_complete || 0;
  const common = {
    position: "absolute",
    left: leftPx,
    width: Math.max(widthPx, 8),
    top: "50%",
    transform: "translateY(-50%)",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.04)",
  };

  if (isSummaryLike(task)) {
    return (
      <div
        style={{
          ...common,
          height: 18,
          borderRadius: 3,
          background: "linear-gradient(90deg, rgba(255,107,0,0.95), rgba(0,229,255,0.85))",
          clipPath: "polygon(0 50%, 10px 0, 100% 0, calc(100% - 10px) 100%, 10px 100%)",
          boxShadow: "0 0 18px rgba(255,107,0,0.18)",
          padding: "0 14px",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 900,
            color: "#000",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "0.08em",
          }}
        >
          {task.wbs_code} {task.phase}
        </span>
      </div>
    );
  }

  if (task.status === "Complete") {
    return (
      <div
        style={{
          ...common,
          height: 22,
          borderRadius: 4,
          background: "linear-gradient(90deg, rgba(0,200,83,0.95), rgba(82,255,148,0.92))",
          padding: "0 10px",
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 800, color: "#02160a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {task.wbs_code}
        </span>
      </div>
    );
  }

  if (task.status === "In Progress") {
    return (
      <div
        style={{
          ...common,
          height: 24,
          borderRadius: 4,
          background: "rgba(255,107,0,0.10)",
          border: "1px solid rgba(255,107,0,0.45)",
        }}
      >
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: "100%",
            background: "linear-gradient(90deg, rgba(255,107,0,1), rgba(255,140,56,0.95))",
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            boxShadow: "0 0 18px rgba(255,107,0,0.22)",
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 900, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {task.wbs_code}
          </span>
        </div>
      </div>
    );
  }

  if (task.status === "Delayed") {
    return (
      <div
        style={{
          ...common,
          height: 22,
          borderRadius: 4,
          border: "1px dashed rgba(255,68,68,0.9)",
          background:
            "repeating-linear-gradient(135deg, rgba(255,68,68,0.16), rgba(255,68,68,0.16) 8px, rgba(255,68,68,0.06) 8px, rgba(255,68,68,0.06) 16px)",
          padding: "0 10px",
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 800, color: "var(--status-error)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {task.wbs_code}
        </span>
      </div>
    );
  }

  if (task.status === "On Hold") {
    return (
      <div
        style={{
          ...common,
          height: 22,
          borderRadius: 4,
          border: "1px solid rgba(0,229,255,0.4)",
          background: "linear-gradient(90deg, rgba(0,229,255,0.12), rgba(0,229,255,0.05))",
          padding: "0 10px",
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 800, color: "var(--secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {task.wbs_code}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        ...common,
        height: 20,
        borderRadius: 4,
        border: "1px solid rgba(184,191,204,0.2)",
        background: "linear-gradient(90deg, rgba(31,33,37,0.98), rgba(40,42,45,0.94))",
        padding: "0 10px",
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {task.wbs_code}
      </span>
    </div>
  );
}

export default function ScheduleGantt({
  tasks: rawTasks,
  expandedTask,
  setExpandedTask,
  phaseFilter = "all",
  onInlineUpdate,
  formatPredecessorWbs,
}) {
  const tasks = useMemo(() => {
    const filtered = phaseFilter === "all" ? rawTasks : rawTasks.filter((task) => derivePhase(task) === phaseFilter);
    const groupedByPhase = PHASES.flatMap((phase) =>
      sortTasksHierarchically(filtered.filter((task) => derivePhase(task) === phase))
    );
    return groupedByPhase.length ? groupedByPhase : sortByPhase(filtered);
  }, [rawTasks, phaseFilter]);

  const predecessorLabels = useMemo(() => {
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    return new Map(
      tasks.map((task) => {
        const ids = String(task.predecessor_ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);

        if (!ids.length) return [task.id, "-"];

        const labels = ids.map((id) => {
          const predecessor = taskMap.get(id);
          return predecessor?.wbs_code || "-";
        });

        return [task.id, labels.join(", ")];
      })
    );
  }, [tasks]);

  const displayRows = useMemo(() => {
    const rows = [];

    PHASES.forEach((phase) => {
      const phaseTasks = tasks.filter((task) => derivePhase(task) === phase);
      if (!phaseTasks.length) return;

      const datedTasks = phaseTasks.filter((task) => task.start_date && task.end_date);
      const startDate = datedTasks.length
        ? datedTasks.reduce((min, task) => (task.start_date < min ? task.start_date : min), datedTasks[0].start_date)
        : "";
      const endDate = datedTasks.length
        ? datedTasks.reduce((max, task) => (task.end_date > max ? task.end_date : max), datedTasks[0].end_date)
        : startDate;
      const avgPercent = phaseTasks.length
        ? Math.round(phaseTasks.reduce((sum, task) => sum + (Number(task.percent_complete) || 0), 0) / phaseTasks.length)
        : 0;

      rows.push({
        id: `summary-${phase}`,
        isSummary: true,
        summaryDepth: 0,
        task_name: `${phase} Summary`,
        task_type: "Summary",
        wbs_code: `${(PHASE_ORDER[phase] ?? 0) + 1}.0`,
        phase,
        start_date: startDate,
        end_date: endDate,
        status: avgPercent >= 100 ? "Complete" : avgPercent > 0 ? "In Progress" : "Not Started",
        percent_complete: avgPercent,
        predecessor_ids: "",
        task_count: phaseTasks.length,
        complete_count: phaseTasks.filter((task) => task.status === "Complete").length,
      });

      rows.push(...phaseTasks);
    });

    return rows;
  }, [tasks]);

  const dateRange = useMemo(() => {
    if (tasks.length === 0) return { start: new Date(), end: new Date(), weeks: [] };

    const dates = tasks
      .flatMap((task) => [
        task.start_date ? new Date(`${task.start_date}T00:00:00Z`) : null,
        task.end_date ? new Date(`${task.end_date}T00:00:00Z`) : null,
      ])
      .filter(Boolean);

    const start = new Date(Math.min(...dates));
    const end = new Date(Math.max(...dates));

    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + (6 - end.getDay()));

    const weeks = [];
    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 7)) {
      weeks.push(new Date(day));
    }

    return { start, end, weeks };
  }, [tasks]);

  const dayCount = Math.ceil((dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24));
  const pxPerDay = WEEK_PX / 7;
  const totalTimelineWidth = dayCount * pxPerDay;

  const getTaskPosition = (task) => {
    if (!task.start_date || !task.end_date) return { start: 0, width: 0 };
    const taskStart = new Date(`${task.start_date}T00:00:00Z`);
    const taskEnd = new Date(`${task.end_date}T00:00:00Z`);
    const start = Math.max(0, (taskStart - dateRange.start) / (1000 * 60 * 60 * 24));
    const width = (taskEnd - taskStart) / (1000 * 60 * 60 * 24);
    return { start, width };
  };

  const today = new Date();
  const todayOffset = (today - dateRange.start) / (1000 * 60 * 60 * 24);
  const todayPx = todayOffset * pxPerDay;
  const showToday = todayOffset >= 0 && todayOffset <= dayCount;

  const totalTonnage = tasks.reduce((sum, task) => sum + (task.tonnage || 0), 0);
  const activeTasks = tasks.filter((task) => task.status === "In Progress").length;

  const dependencyLines = useMemo(() => {
    const rowIndexMap = new Map(displayRows.map((task, index) => [task.id, index]));
    const taskMap = new Map(tasks.map((task) => [task.id, task]));

    return tasks.flatMap((task) => {
      if (!task.predecessor_ids || !rowIndexMap.has(task.id) || !task.start_date || !task.end_date) {
        return [];
      }

      const targetRowIndex = rowIndexMap.get(task.id);
      const targetPosition = getTaskPosition(task);
      const targetX = targetPosition.start * pxPerDay;
      const targetY = targetRowIndex * ROW_H + ROW_H / 2;

      return String(task.predecessor_ids)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => taskMap.get(id))
        .filter((predecessor) => predecessor && rowIndexMap.has(predecessor.id) && predecessor.start_date && predecessor.end_date)
        .map((predecessor) => {
          const sourceRowIndex = rowIndexMap.get(predecessor.id);
          const sourcePosition = getTaskPosition(predecessor);
          const sourceX = (sourcePosition.start + sourcePosition.width) * pxPerDay;
          const sourceY = sourceRowIndex * ROW_H + ROW_H / 2;
          const elbowX = Math.max(sourceX + 14, targetX - 18);
          return {
            id: `${predecessor.id}-${task.id}`,
            path: `M ${sourceX} ${sourceY} L ${elbowX} ${sourceY} L ${elbowX} ${targetY} L ${targetX - 6} ${targetY}`,
          };
        });
    });
  }, [displayRows, tasks, pxPerDay]);

  const nowWeekStart = new Date(today);
  nowWeekStart.setDate(today.getDate() - today.getDay());
  const isCurrentWeek = (week) => week.toDateString() === nowWeekStart.toDateString();

  const formatWeekRange = (weekStart) => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const fmt = (date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `${fmt(weekStart)} - ${fmt(end)}`;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 180px)",
        minHeight: 540,
        background:
          "radial-gradient(circle at top left, rgba(255,107,0,0.06), transparent 28%), radial-gradient(circle at top right, rgba(0,229,255,0.05), transparent 24%), var(--bg-surface)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "rgba(17,19,22,0.78)",
          borderBottom: "1px solid var(--divider)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)" }}>
            Steel Execution Timeline
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
            Inline-editable schedule control with live WBS, predecessor, and phase state.
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            <span style={{ color: "var(--text-secondary)" }}>Tasks:</span> <span style={{ color: "var(--text-primary)" }}>{tasks.length}</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            <span style={{ color: "var(--text-secondary)" }}>Active:</span> <span style={{ color: "var(--status-success)" }}>{activeTasks}</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            <span style={{ color: "var(--text-secondary)" }}>Tonnage:</span> <span style={{ color: "var(--accent)" }}>{totalTonnage.toFixed(1)} T</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div
          style={{
            width: "56%",
            minWidth: 1020,
            background: "rgba(17,19,22,0.92)",
            borderRight: "1px solid var(--divider)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 5,
              background: "rgba(12,14,17,0.96)",
              padding: "0 14px",
              height: HEADER_H,
              display: "grid",
              gridTemplateColumns: LEFT_GRID_TEMPLATE,
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
              borderBottom: "1px solid var(--divider)",
              boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
            }}
          >
            {["Task / WBS", "Start", "Finish", "Pred", "Phase", "Status", "%"].map((heading, index) => (
              <span
                key={heading}
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  textAlign: index === 6 ? "right" : "left",
                  whiteSpace: "nowrap",
                }}
              >
                {heading}
              </span>
            ))}
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {displayRows.length === 0 ? (
              <div style={{ padding: "24px 16px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                No tasks
              </div>
            ) : (
              displayRows.map((task) => {
                const summaryLike = isSummaryLike(task);
                const depth = getHierarchyDepth(task, displayRows);
                const statusIcon = STATUS_ICON[task.status] || STATUS_ICON["Not Started"];
                const phaseValue = derivePhase(task);
                const phaseBadge = PHASE_BADGE[phaseValue] || { bg: "rgba(255,255,255,0.06)", color: "var(--text-muted)" };
                const rowBg = ROW_BG[task.status] || "transparent";
                const predecessors = predecessorLabels.get(task.id) || "-";

                return (
                  <div
                    key={task.id}
                    onClick={() => !summaryLike && setExpandedTask(expandedTask === task.id ? null : task.id)}
                    style={{
                      height: ROW_H,
                      display: "grid",
                      gridTemplateColumns: LEFT_GRID_TEMPLATE,
                      padding: "0 14px",
                      alignItems: "center",
                      gap: 8,
                      borderBottom: "1px solid rgba(51,53,56,0.72)",
                      background: summaryLike ? "rgba(255,107,0,0.07)" : expandedTask === task.id ? "rgba(255,107,0,0.04)" : rowBg,
                      cursor: summaryLike ? "default" : "pointer",
                      transition: "background 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!summaryLike) e.currentTarget.style.background = "rgba(255,107,0,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      if (!summaryLike) e.currentTarget.style.background = expandedTask === task.id ? "rgba(255,107,0,0.04)" : rowBg;
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: summaryLike ? 800 : 500,
                          color: summaryLike ? "var(--accent)" : "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          letterSpacing: summaryLike ? "0.04em" : "normal",
                          textTransform: summaryLike ? "uppercase" : "none",
                          paddingLeft: `${depth * 18}px`,
                        }}
                      >
                        {task.task_name}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: summaryLike ? "var(--text-secondary)" : subLabelColor(task.status),
                          textTransform: "uppercase",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          paddingLeft: `${depth * 18}px`,
                        }}
                      >
                        {summaryLike ? `${task.wbs_code} | ${task.complete_count}/${task.task_count} complete` : task.wbs_code || "WBS Pending"}
                      </div>
                      {!summaryLike && (
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            color: "var(--text-muted)",
                            marginTop: 2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            paddingLeft: `${depth * 18}px`,
                          }}
                        >
                          {task.task_type || "Task"}
                        </div>
                      )}
                    </div>

                    {summaryLike ? (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: task.start_date ? "var(--text-secondary)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {formatCellDate(task.start_date)}
                      </div>
                    ) : (
                      <InlineEditor type="date" value={task.start_date || ""} onCommit={(nextValue) => onInlineUpdate?.(task.id, { start_date: nextValue })} />
                    )}

                    {summaryLike ? (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: task.end_date ? "var(--text-secondary)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {formatCellDate(task.end_date)}
                      </div>
                    ) : (
                      <InlineEditor type="date" value={task.end_date || ""} onCommit={(nextValue) => onInlineUpdate?.(task.id, { end_date: nextValue })} />
                    )}

                    {summaryLike ? (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>-</div>
                    ) : (
                      <InlineEditor
                        value={formatPredecessorWbs ? formatPredecessorWbs(task.predecessor_ids) : predecessors}
                        onCommit={(nextValue) => onInlineUpdate?.(task.id, { predecessor_wbs: nextValue })}
                      />
                    )}

                    {summaryLike ? (
                      <span
                        style={{
                          background: phaseBadge.bg,
                          color: phaseBadge.color,
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 9999,
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        {task.phase || "-"}
                      </span>
                    ) : (
                      <InlineEditor type="select" value={task.phase || derivePhase(task)} options={PHASES} onCommit={(nextValue) => onInlineUpdate?.(task.id, { phase: nextValue })} />
                    )}

                    {summaryLike ? (
                      <span style={{ fontSize: 14, color: statusIcon.color, lineHeight: 1, width: 16, textAlign: "center" }}>{statusIcon.icon}</span>
                    ) : (
                      <InlineEditor type="select" value={task.status || "Not Started"} options={STATUS_OPTIONS} onCommit={(nextValue) => onInlineUpdate?.(task.id, { status: nextValue })} />
                    )}

                    {summaryLike ? (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          fontWeight: 700,
                          textAlign: "right",
                          color: pctColor(task.status),
                        }}
                      >
                        {task.percent_complete ?? 0}%
                      </span>
                    ) : (
                      <InlineEditor type="number" value={task.percent_complete ?? 0} onCommit={(nextValue) => onInlineUpdate?.(task.id, { percent_complete: Number(nextValue || 0) })} width="56px" textAlign="right" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            background:
              "linear-gradient(180deg, rgba(12,14,17,0.96), rgba(17,19,22,0.98))",
            overflowX: "auto",
            overflowY: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              height: HEADER_H,
              background: "rgba(12,14,17,0.96)",
              borderBottom: "1px solid var(--divider)",
              display: "flex",
              flexShrink: 0,
              width: Math.max(totalTimelineWidth, dateRange.weeks.length * WEEK_PX),
              position: "sticky",
              top: 0,
              zIndex: 4,
              boxShadow: "0 8px 18px rgba(0,0,0,0.24)",
            }}
          >
            {dateRange.weeks.map((week) => {
              const current = isCurrentWeek(week);
              return (
                <div
                  key={week.toISOString()}
                  style={{
                    minWidth: WEEK_PX,
                    borderRight: "1px solid rgba(51,53,56,0.72)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px 0",
                    background: current ? "rgba(255,107,0,0.08)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      color: current ? "var(--accent)" : "var(--text-secondary)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {week.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: current ? "var(--accent)" : "var(--text-muted)", marginTop: 2 }}>
                    {formatWeekRange(week)}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              position: "relative",
              width: Math.max(totalTimelineWidth, dateRange.weeks.length * WEEK_PX),
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)",
              backgroundSize: `${WEEK_PX / 7}px 100%, 100% ${ROW_H}px`,
            }}
          >
            {showToday && (
              <div
                style={{
                  position: "absolute",
                  left: todayPx,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: "linear-gradient(180deg, rgba(0,229,255,0.95), rgba(255,107,0,0.95))",
                  zIndex: 10,
                  boxShadow: "0 0 16px rgba(0,229,255,0.35)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    left: -4,
                    width: 10,
                    height: 10,
                    background: "var(--secondary)",
                    transform: "rotate(45deg)",
                    boxShadow: "0 0 14px rgba(0,229,255,0.4)",
                  }}
                />
              </div>
            )}

            {displayRows.length === 0 ? (
              <div style={{ padding: "24px 20px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                No tasks to display
              </div>
            ) : (
              <>
                <svg
                  width={Math.max(totalTimelineWidth, dateRange.weeks.length * WEEK_PX)}
                  height={displayRows.length * ROW_H}
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 2,
                    overflow: "visible",
                  }}
                >
                  <defs>
                    <marker id="schedule-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" fill="var(--secondary)" />
                    </marker>
                  </defs>
                  {dependencyLines.map((line) => (
                    <path
                      key={line.id}
                      d={line.path}
                      fill="none"
                      stroke="var(--secondary)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd="url(#schedule-arrowhead)"
                      opacity="0.9"
                    />
                  ))}
                </svg>
                {displayRows.map((task) => {
                  const summaryLike = isSummaryLike(task);
                  const { start, width } = getTaskPosition(task);
                  const leftPx = start * pxPerDay;
                  const widthPx = Math.max(width * pxPerDay, 4);

                  return (
                    <div
                      key={task.id}
                      style={{
                        height: ROW_H,
                        borderBottom: "1px solid rgba(51,53,56,0.55)",
                        position: "relative",
                        background: summaryLike ? "rgba(255,107,0,0.03)" : "transparent",
                        zIndex: 3,
                      }}
                    >
                      <TaskBar task={task} leftPx={leftPx} widthPx={widthPx} />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          height: 34,
          background: "rgba(12,14,17,0.96)",
          borderTop: "1px solid var(--divider)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 16px",
          flexShrink: 0,
        }}
      >
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
          LIVE CONTROL SURFACE
        </span>
      </div>
    </div>
  );
}
