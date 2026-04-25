import React, { useMemo } from "react";

// Schedule audit fix (bug class 5): the previous implementation
// constructed week boundaries in local time but compared against task
// dates parsed as UTC, which silently shifted up to a full day on
// either side depending on the user's timezone. It also concatenated
// raw `task.start_date + "T00:00:00Z"`, which produces "nullT00:00:00Z"
// (Invalid Date) for any task that's missing one of its dates and
// drops it from the panel entirely.
//
// New semantics:
//   - Today is UTC midnight, matching how Gantt and the task table
//     parse YYYY-MM-DD date-only columns.
//   - Week 1 is the calendar week (Mon-Sun) containing today, and Week 6
//     is the 6th calendar week starting from there. Tasks intersecting
//     [weekStart, weekEnd] (closed on both ends) appear under that week.
//   - A task with only one date (start OR end) is treated as a 1-day
//     window on the supplied date so it still surfaces.
function parseTaskDate(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
  const str = String(s).trim();
  if (!str) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : str;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export default function LookaheadPlanner({ tasks }) {
  const todayUtc = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }, []);

  const weeks = useMemo(() => {
    // Anchor week 1 at the Monday on/before todayUtc. getUTCDay(): Sun=0..Sat=6.
    // For Monday-start weeks, offset = (day + 6) % 7.
    const offset = (todayUtc.getUTCDay() + 6) % 7;
    const week1Start = new Date(todayUtc);
    week1Start.setUTCDate(week1Start.getUTCDate() - offset);
    const result = [];
    for (let i = 0; i < 6; i++) {
      const start = new Date(week1Start);
      start.setUTCDate(start.getUTCDate() + i * 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      result.push({ start, end, num: i + 1 });
    }
    return result;
  }, [todayUtc]);

  const getTasksForWeek = (weekStart, weekEnd) => {
    return tasks.filter((task) => {
      const s = parseTaskDate(task.start_date);
      const e = parseTaskDate(task.end_date);
      const taskStart = s || e; // single-date tasks degenerate to a point
      const taskEnd   = e || s;
      if (!taskStart || !taskEnd) return false;
      // Closed-interval intersection: [taskStart, taskEnd] ∩ [weekStart, weekEnd]
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
                  {week.start.toLocaleDateString(undefined, { timeZone: "UTC" })} –{" "}
                  {week.end.toLocaleDateString(undefined, { timeZone: "UTC" })}
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