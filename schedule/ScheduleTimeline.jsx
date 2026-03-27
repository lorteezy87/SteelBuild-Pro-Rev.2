import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";

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
            background: "rgba(255,255,255,0.12)",
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
            background: isCritical ? "#FF3D3D" : "#F2F4F8",
            transform: "rotate(45deg)",
            cursor: "pointer",
            boxShadow: isCritical
              ? "0 0 12px rgba(255,61,61,0.5)"
              : "0 0 8px rgba(255,255,255,0.2)",
            borderRadius: 1,
          }}
          title={task.name}
        />
      );
    }

    // Regular task bar
    let gradientColor = "linear-gradient(135deg, #8B5CF6, #6D40D4)";
    if (task.phase === "Fabrication")
      gradientColor = "var(--accent)";
    else if (task.phase === "Delivery")
      gradientColor = "var(--status-success)";
    else if (task.phase === "Erection")
      gradientColor = "linear-gradient(135deg, #00B8D9, #0090B8)";

    const barStyle = {
      position: "absolute",
      left,
      width: Math.max(60, width),
      height: 26,
      top: 9,
      background: isDelayed
        ? "linear-gradient(135deg, #FF3D3D, #FF6B2B)"
        : gradientColor,
      borderRadius: 4,
      cursor: "grab",
      opacity: showCriticalPath && !isCritical && !isSelected ? 0.4 : 1,
      boxShadow: isSelected
        ? `0 0 0 2px var(--accent), 0 0 12px var(--warning-muted)`
        : isCritical && showCriticalPath
          ? `0 0 0 2px #FF3D3D, 0 0 12px rgba(255,61,61,0.4)`
          : "0 2px 8px rgba(0,0,0,0.3)",
      border: isDelayed ? "1px dashed rgba(255,61,61,0.6)" : "none",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      paddingLeft: 6,
      paddingRight: 6,
      fontSize: 10,
      color: "#fff",
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
            <polygon points="0 0, 10 3, 0 6" fill="rgba(255,255,255,0.20)" />
          </marker>
          <marker
            id="arrowhead-critical"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#FF3D3D" />
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
                stroke={isCritical ? "#FF3D3D" : "rgba(255,255,255,0.20)"}
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
          background: "var(--bg-surface-low)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
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
                  borderRight: "1px solid rgba(255,255,255,0.05)",
                  background:
                    col.date.getMonth() % 2 === 0
                      ? "rgba(255,255,255,0.01)"
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
          background: "var(--bg-page)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
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
                color: isToday ? "var(--accent)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                borderRight: "1px solid rgba(255,255,255,0.05)",
                background: isToday
                  ? "var(--warning-muted)"
                  : col.date.getDay() === 0 || col.date.getDay() === 6
                    ? "rgba(255,255,255,0.02)"
                    : "transparent",
                borderTop: isToday ? "2px solid var(--accent)" : "none",
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
          background: "var(--accent)",
          boxShadow: "0 0 8px var(--warning-muted)",
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
            borderBottom: "1px solid rgba(255,255,255,0.03)",
            background:
              selectedTask?.id === task.id
                ? "var(--warning-muted)"
                : idx % 2 === 0
                  ? "transparent"
                  : "rgba(255,255,255,0.01)",
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