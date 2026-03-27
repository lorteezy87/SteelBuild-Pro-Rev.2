import React, { useState } from "react";
import { PHASES, PHASE_COLORS, sortByPhase, derivePhase } from "../../utils/phases";
import { formatDateShort } from "../shared/formatters";

const PRIORITY_COLORS = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Normal: "var(--status-info)",
  Low: "var(--text-muted)",
};

const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  Delayed: "var(--status-error)",
  "On Hold": "var(--status-info)",
};

const sortByDate = (a, b) => {
  if (!a.start_date) return 1;
  if (!b.start_date) return -1;
  return new Date(a.start_date) - new Date(b.start_date);
};

const fmtDate = (d) => formatDateShort(d);

export default function ScheduleTaskList({ tasks, onEdit, onDelete, selectedIds = new Set(), onToggleSelect }) {
  const [sortBy, setSortBy] = useState("start_date");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Apply filters first
  const filtered = tasks.filter((t) => {
    const prioMatch = filterPriority === "all" || t.priority === filterPriority;
    const statusMatch = filterStatus === "all" || t.status === filterStatus;
    return prioMatch && statusMatch;
  });

  // Apply sort within each group — also support top-level priority sort
  const sortTasks = (arr) => {
    if (sortBy === "phase") return sortByPhase(arr);
    if (sortBy === "priority") {
      const order = ["Critical", "High", "Normal", "Low"];
      return [...arr].sort(
        (a, b) => order.indexOf(a.priority) - order.indexOf(b.priority)
      );
    }
    return [...arr].sort(sortByDate);
  };

  // Build grouped structure from filtered tasks — use derivePhase for grouping
  const grouped = PHASES.map((phase) => ({
    phase,
    tasks: sortTasks(filtered.filter((t) => derivePhase(t) === phase)),
  })).filter((g) => g.tasks.length > 0);

  const selectStyle = {
    background: "var(--bg-input)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    outline: "none",
  };

  const GRID = "28px 2fr 90px 90px 1fr 80px 80px 110px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
          <option value="phase">Sort: Phase</option>
          <option value="start_date">Sort: Start Date</option>
          <option value="priority">Sort: Priority</option>
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={selectStyle}>
          <option value="all">Priority: All</option>
          <option value="Critical">Priority: Critical</option>
          <option value="High">Priority: High</option>
          <option value="Normal">Priority: Normal</option>
          <option value="Low">Priority: Low</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">Status: All</option>
          <option value="Not Started">Status: Not Started</option>
          <option value="In Progress">Status: In Progress</option>
          <option value="Complete">Status: Complete</option>
          <option value="Delayed">Status: Delayed</option>
        </select>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "40px 24px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}>
            No tasks match filters
          </div>
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.phase}>
            {/* Phase header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0 6px 0",
              marginTop: 8,
            }}>
              <div style={{
                width: 3,
                height: 16,
                background: PHASE_COLORS[group.phase] || "var(--accent)",
                borderRadius: 2,
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: PHASE_COLORS[group.phase] || "var(--accent)",
              }}>
                {group.phase}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--text-muted)",
                background: "var(--bg-surface-high)",
                padding: "1px 7px",
                borderRadius: 4,
              }}>
                {group.tasks.length} tasks
              </span>
              <div style={{ flex: 1, height: 1, background: "var(--divider)" }} />
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--text-muted)",
              }}>
                {group.tasks.filter((t) => t.status === "Complete").length}/
                {group.tasks.length} complete
              </span>
            </div>

            {/* Task panel */}
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              overflow: "hidden",
              marginBottom: 4,
            }}>
              {/* Column headers */}
              <div style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--divider)",
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 12,
                background: "var(--bg-surface-secondary)",
              }}>
                {["", "Task", "Start", "Finish", "Assigned To", "Priority", "Status", ""].map((col) => (
                  <div key={col} style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}>
                    {col}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {group.tasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    padding: "11px 16px",
                    borderBottom: "1px solid var(--divider)",
                    display: "grid",
                    gridTemplateColumns: GRID,
                    gap: 12,
                    alignItems: "center",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(task.id)}
                      onChange={() => onToggleSelect && onToggleSelect(task.id)}
                      style={{ width: 14, height: 14 }}
                    />
                  </div>
                  {/* Task name */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                      {task.task_name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                      {task.task_number}
                    </div>
                  </div>

                  {/* Start Date */}
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: task.start_date ? "var(--text-secondary)" : "var(--text-muted)" }}>
                    {task.start_date ? fmtDate(task.start_date) : "—"}
                  </div>

                  {/* Finish Date */}
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: task.end_date ? "var(--text-secondary)" : "var(--text-muted)" }}>
                    {task.end_date ? fmtDate(task.end_date) : "—"}
                  </div>

                  {/* Assigned To */}
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.assigned_to || "—"}
                  </div>

                  {/* Priority */}
                  <div style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "4px 8px",
                    background: `${PRIORITY_COLORS[task.priority]}20`,
                    border: `1px solid ${PRIORITY_COLORS[task.priority]}40`,
                    borderRadius: 6, width: "fit-content",
                  }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                      color: PRIORITY_COLORS[task.priority],
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      {task.priority}
                    </span>
                  </div>

                  {/* Status */}
                  <div style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "4px 8px",
                    background: `${STATUS_COLORS[task.status]}20`,
                    border: `1px solid ${STATUS_COLORS[task.status]}40`,
                    borderRadius: 6, width: "fit-content",
                  }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
                      color: STATUS_COLORS[task.status],
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      {task.status}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit && onEdit(task); }}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border-default)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        cursor: "pointer",
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                    >
                      EDIT
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete && onDelete(task);
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--danger-border)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        color: "var(--danger)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        cursor: "pointer",
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-muted)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      DEL
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
