import React, { useState, useMemo, useCallback, useRef } from "react";
import {
  GANTT_GRADIENT,
  GANTT_PHASE_HEX,
  GANTT_STATUS_HEX,
  GANTT_TODAY_VAR,
} from "@/lib/ganttTheme";

export default function ScheduleTimeline({
  tasks,
  zoomLevel,
  onUpdateTask,
  selectedTask,
  onSelectTask,
  criticalPath,
  showCriticalPath,
}) {
  const svgRef = useRef(null);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);

  // Calculate timeline range
  const timelineRange = useMemo(() => {
    const allDates = tasks.flatMap((t) => [
      new Date(t.startDate),
      new Date(t.endDate),
    ]);
    const min = new Date(Math.min(...allDates));
    const max = new Date(Math.max(...allDates));
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 7);
    return { start: min, end: max };
  }, [tasks]);

  // Column width calculation
  const columnWidth = {
    week: 160,
    month: 40,
    quarter: 20,
  }[zoomLevel];

  // Generate date columns
  const dateColumns = useMemo(() => {
    const cols = [];
    const current = new Date(timelineRange.start);
    current.setDate(current.getDate() - current.getDay() + 1); // Start on Monday
    const weekStart = new Date(current);

    while (current < timelineRange.end) {
      cols.push({
        date: new Date(current),
        weekStart: new Date(current),
      });
      current.setDate(current.getDate() + 7);
    }

    return cols;
  }, [timelineRange, zoomLevel]);

  // Get position for date
  const getPositionForDate = useCallback(
    (date) => {
      const dateObj = new Date(date);
      dateObj.setHours(0, 0, 0, 0);
      const rangeStart = new Date(timelineRange.start);
      rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay() + 1);
      rangeStart.setHours(0, 0, 0, 0);
      const days = Math.floor((dateObj - rangeStart) / 86400000);
      return Math.round((days / 7) * columnWidth);
    },
    [timelineRange, columnWidth]
  );

  // Render Gantt bar
  const renderBar = (task) => {
    const isCritical = criticalPath.some((t) => t.id === task.id);
    const isSelected = selectedTask?.id === task.id;
    const isGroup = task.isGroup;
    const isDelayed = task.status === "DELAYED";
    const isComplete = task.status === "COMPLETE";

    if (isGroup) {
      // Phase group bar — thin bar spanning tasks
      const childTasks = tasks.filter((t) => t.parentId === task.id);
      if (childTasks.length === 0) return null;
      const childDates = childTasks.flatMap((t) => [
        new Date(t.startDate),
        new Date(t.endDate),
      ]);
      const minDate = new Date(Math.min(...childDates));
      const maxDate = new Date(Math.max(...childDates));

      const left = getPositionForDate(minDate);
      const width = getPositionForDate(maxDate) - left + columnWidth;

      return (
        <div
          key={task.id}
          style={{
            position: "absolute",
            left,
            width,
            height: 8,
            top: 18,
            background: GANTT_PHASE_HEX[task.phase] || GANTT_PHASE_HEX.Closeout,
            borderRadius: 4,
            pointerEvents: "none",
          }}
        />
      );
    }

    const left = getPositionForDate(task.startDate);
    const width = getPositionForDate(task.endDate) - left + columnWidth;

    if (task.type === "MILESTONE") {
      // Diamond milestone
      return (
        <div
          key={task.id}
          onClick={() => onSelectTask(task)}
          style={{
            position: "absolute",
            left: left + width / 2 - 8,
            width: 16,
            height: 16,
            top: 14,
            background: isCritical ? GANTT_STATUS_HEX.delayed : GANTT_TODAY_VAR,
            transform: "rotate(45deg)",
            cursor: "pointer",
            boxShadow: isCritical
              ? "0 0 12px color-mix(in srgb, var(--status-error) 50%, transparent)"
              : "0 0 8px var(--border-strong)",
            borderRadius: 1,
          }}
          title={task.name}
        />
      );
    }

    // Regular task bar
    let gradientColor = GANTT_GRADIENT.Detailing;
    if (task.phase === "Fabrication")
      gradientColor = GANTT_GRADIENT.Fabrication;
    else if (task.phase === "Delivery")
      gradientColor = GANTT_GRADIENT.Delivery;
    else if (task.phase === "Erection")
      gradientColor = GANTT_GRADIENT.Erection;

    const barStyle = {
      position: "absolute",
      left,
      width: Math.max(60, width),
      height: 26,
      top: 9,
      background: isDelayed
        ? "linear-gradient(135deg, var(--status-error), var(--status-warning))"
        : gradientColor,
      borderRadius: 4,
      cursor: "grab",
      opacity: showCriticalPath && !isCritical && !isSelected ? 0.4 : 1,
      boxShadow: isSelected
        ? `0 0 0 2px var(--accent), 0 0 12px var(--warning-muted)`
        : isCritical && showCriticalPath
          ? "0 0 0 2px var(--status-error-bright), 0 0 12px color-mix(in srgb, var(--status-error) 40%, transparent)"
          : "var(--shadow-sm)",
      border: isDelayed ? "1px dashed var(--status-error)" : "none",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      paddingLeft: 6,
      paddingRight: 6,
      fontSize: 10,
      color: "var(--on-accent)",
      fontFamily: "var(--font-mono)",
      fontWeight: 700,
      transition: "all 0.1s",
      userSelect: "none",
    };

    return (
      <div
        key={task.id}
        draggable
        onDragStart={(e) => {
          setDraggedTask(task);
          setDragStart(e.clientX);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => onSelectTask(task)}
        style={barStyle}
      >
        <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {task.name}
        </div>
        <div style={{ fontSize: 9, opacity: 0.8 }}>{task.percentComplete}%</div>
      </div>
    );
  };

  // Dependency arrows
  const renderDependencyArrows = () => {
    if (!svgRef.current) return null;

    return (
      <svg
        ref={svgRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="var(--border-strong)" />
          </marker>
          <marker
            id="arrowhead-critical"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="var(--status-error-bright)" />
          </marker>
        </defs>
        {tasks.map((task) => {
          if (!task.dependencies || task.dependencies.length === 0)
            return null;
          return task.dependencies.map((depId) => {
            const depTask = tasks.find((t) => t.id === depId);
            if (!depTask) return null;

            const isCritical =
              criticalPath.some((t) => t.id === task.id) &&
              criticalPath.some((t) => t.id === depTask.id);

            const x1 = getPositionForDate(depTask.endDate) + columnWidth;
            const y1 = tasks.indexOf(depTask) * 44 + 32;

            const x2 = getPositionForDate(task.startDate);
            const y2 = tasks.indexOf(task) * 44 + 32;

            const midX = (x1 + x2) / 2;

            return (
              <path
                key={`${depId}-${task.id}`}
                d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
                stroke={isCritical ? "var(--status-error-bright)" : "var(--border-strong)"}
                strokeWidth="1.5"
                fill="none"
                markerEnd={
                  isCritical ? "url(#arrowhead-critical)" : "url(#arrowhead)"
                }
              />
            );
          });
        })}
      </svg>
    );
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Date Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          display: "flex",
          background: "var(--sbd-gantt-header)",
          borderBottom: "1px solid var(--sbd-gantt-grid-strong)",
          zIndex: 20,
        }}
      >
        {/* Month row */}
        <div style={{ display: "flex" }}>
          {dateColumns.map((col, i) => {
            const isNewMonth =
              i === 0 ||
              dateColumns[i - 1].date.getMonth() !== col.date.getMonth();
            return isNewMonth ? (
              <div
                key={`month-${i}`}
                style={{
                  width: columnWidth,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  borderRight: "1px solid var(--sbd-gantt-grid)",
                  background:
                    col.date.getMonth() % 2 === 0
                      ? "var(--sbd-gantt-weekend)"
                      : "transparent",
                }}
              >
                {col.date.toLocaleDateString("en-US", {
                  month: "short",
                  year: "2-digit",
                })}
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Week header */}
      <div
        style={{
          position: "sticky",
          top: 20,
          display: "flex",
          background: "var(--sbd-gantt-header)",
          borderBottom: "1px solid var(--sbd-gantt-grid-strong)",
          zIndex: 15,
        }}
      >
        {dateColumns.map((col, i) => {
          const isToday = new Date().toDateString() === col.date.toDateString();
          return (
            <div
              key={`week-${i}`}
              style={{
                width: columnWidth,
                height: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: isToday ? 700 : 600,
                color: isToday ? GANTT_TODAY_VAR : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                borderRight: "1px solid var(--sbd-gantt-grid)",
                background: isToday
                  ? "var(--sbd-gantt-today-soft)"
                  : col.date.getDay() === 0 || col.date.getDay() === 6
                    ? "var(--hover-bg)"
                    : "transparent",
                borderTop: isToday ? `2px solid ${GANTT_TODAY_VAR}` : "none",
              }}
            >
              W{String(Math.ceil((col.date.getDate() + col.weekStart.getDay()) / 7)).padStart(2, "0")}
            </div>
          );
        })}
      </div>

      {/* Today line */}
      <div
        style={{
          position: "absolute",
          left: getPositionForDate(new Date()),
          top: 0,
          width: 2,
          height: "100%",
          background: GANTT_TODAY_VAR,
          boxShadow: `0 0 8px color-mix(in srgb, ${GANTT_TODAY_VAR} 45%, transparent)`,
          zIndex: 8,
          pointerEvents: "none",
        }}
      />

      {/* Task rows with bars */}
      {tasks.map((task, idx) => (
        <div
          key={task.id}
          style={{
            height: 44,
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--hover-bg)",
            background:
              selectedTask?.id === task.id
                ? "var(--warning-muted)"
                : idx % 2 === 0
                  ? "transparent"
                  : "var(--hover-bg)",
            position: "relative",
          }}
        >
          {renderBar(task)}
        </div>
      ))}

      {/* Dependency arrows */}
      {renderDependencyArrows()}
    </div>
  );
}
