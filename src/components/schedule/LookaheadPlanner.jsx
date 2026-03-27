import React, { useMemo } from "react";

export default function LookaheadPlanner({ tasks }) {
  const today = new Date();
  const weeks = useMemo(() => {
    const result = [];
    for (let i = 0; i < 6; i++) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() + i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      result.push({ start: weekStart, end: weekEnd, num: i + 1 });
    }
    return result;
  }, []);

  const getTasksForWeek = (weekStart, weekEnd) => {
    return tasks.filter((task) => {
      const taskStart = new Date(task.start_date);
      const taskEnd = new Date(task.end_date);
      return taskStart <= weekEnd && taskEnd >= weekStart;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {weeks.map((week) => {
        const weekTasks = getTasksForWeek(week.start, week.end);
        const complete = weekTasks.filter((t) => t.status === "Complete").length;
        const progress =
          weekTasks.length > 0
            ? Math.round((complete / weekTasks.length) * 100)
            : 0;

        return (
          <div
            key={week.num}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            {/* Week header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: 0,
                    textTransform: "uppercase",
                    letterSpacing: "0.10em",
                  }}
                >
                  Week {week.num}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: "var(--text-muted)",
                    margin: "2px 0 0 0",
                  }}
                >
                  {week.start.toLocaleDateString()} –{" "}
                  {week.end.toLocaleDateString()}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--accent)",
                  }}
                >
                  {weekTasks.length}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    color: "var(--text-muted)",
                    letterSpacing: "0.06em",
                  }}
                >
                  TASKS
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div
              style={{
                height: "5px",
                background: "var(--border-default)",
                borderRadius: "3px",
                overflow: "hidden",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "var(--status-success)",
                  width: `${progress}%`,
                  transition: "width 0.3s",
                }}
              />
            </div>

            {/* Tasks grid */}
            {weekTasks.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: "8px",
                }}
              >
                {weekTasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      background: "var(--bg-surface-secondary)",
                      border:
                        task.status === "Complete"
                          ? "1px solid var(--status-success)"
                          : task.status === "Delayed"
                          ? "1px solid var(--status-error)"
                          : "1px solid var(--border-default)",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      opacity: task.status === "Complete" ? 0.6 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {task.task_name}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "8px",
                        color: "var(--text-muted)",
                        marginTop: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {task.status === "Complete" && <span>✓</span>}
                      {task.status === "Delayed" && <span>⚠</span>}
                      {task.status}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                }}
              >
                No tasks scheduled
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}