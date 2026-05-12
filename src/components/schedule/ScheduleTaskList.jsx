import React, { useState, useRef, useEffect, useMemo } from "react";
import { PHASES, PHASE_COLORS, PHASE_NUMBER, derivePhase } from "../../utils/phases";
import { formatDateShort } from "../shared/formatters";
import DateOrTbdInput from "./DateOrTbdInput";
import { buildTreeOrder } from "./scheduleTree";

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

const STATUSES = ["Not Started", "In Progress", "Complete", "Delayed", "On Hold", "Cancelled"];
const PRIORITIES = ["Critical", "High", "Normal", "Low"];

const sortByDate = (a, b) => {
  if (!a.start_date) return 1;
  if (!b.start_date) return -1;
  return new Date(a.start_date) - new Date(b.start_date);
};

const fmtDate = (d) => {
  if (!d) return "TBD";
  return formatDateShort(d);
};

const INLINE_INPUT = {
  background: "rgba(200,155,32,0.08)",
  border: "1px solid rgba(200,155,32,0.4)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  padding: "2px 6px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const INLINE_SELECT = {
  background: "rgba(200,155,32,0.08)",
  border: "1px solid rgba(200,155,32,0.4)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  padding: "2px 4px",
  outline: "none",
  width: "100%",
  cursor: "pointer",
};

export default function ScheduleTaskList({ tasks, onEdit, onDelete, onSave, selectedIds = new Set(), onToggleSelect }) {
  const [sortBy, setSortBy] = useState("start_date");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [collapsedTasks, setCollapsedTasks] = useState({});
  const nameRef = useRef(null);

  // Focus name input when entering edit mode
  useEffect(() => {
    if (editingId && nameRef.current) nameRef.current.focus();
  }, [editingId]);

  const startEdit = (task, e) => {
    // Don't activate if clicking a button/checkbox/select
    if (e?.target?.closest("button,input[type='checkbox'],select")) return;
    // Summary rows display child-derived dates/duration/progress. Keep inline
    // editing on leaf rows so users do not accidentally edit stale stored dates.
    if (task._hasChildren) return;
    if (editingId === task.id) return;
    setEditingId(task.id);
    // Seed inline-edit drafts from STORED values, not the effective
    // overlay. If `applyEffectiveDates` overwrote start_date / end_date
    // with cascade results, _stored_* holds the user-entered values —
    // which is what we want them to edit. Falling back to the visible
    // dates handles the case where no overlay was applied (legacy code
    // paths or tests).
    setEditDraft({
      task_name:   task.task_name   || "",
      start_date:  task._stored_start_date ?? task.start_date ?? "",
      end_date:    task._stored_end_date   ?? task.end_date   ?? "",
      assigned_to: task.assigned_to || "",
      priority:    task.priority    || "Normal",
      status:      task.status      || "Not Started",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const commitEdit = async (taskId) => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave({ id: taskId, ...editDraft });
      setEditingId(null);
      setEditDraft({});
    } catch (err) {
      // toast is shown by the caller's onSave; keep form open so user can retry
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e, taskId) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(taskId); }
    if (e.key === "Escape") cancelEdit();
  };

  const patch = (key, val) => setEditDraft((prev) => ({ ...prev, [key]: val }));
  const toggleTask = (taskId) => {
    setCollapsedTasks((current) => ({ ...current, [taskId]: !current[taskId] }));
  };

  // Apply filters
  const filtered = tasks.filter((t) => {
    const prioMatch = filterPriority === "all" || t.priority === filterPriority;
    const statusMatch = filterStatus === "all" || t.status === filterStatus;
    return prioMatch && statusMatch;
  });

  const grouped = useMemo(() => {
    const priorityOrder = ["Critical", "High", "Normal", "Low"];
    const orderSource = [...filtered];

    if (sortBy === "priority") {
      orderSource.sort((a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));
    } else if (sortBy === "start_date") {
      orderSource.sort(sortByDate);
    }

    return PHASES.map((phase) => {
      const ordered = buildTreeOrder(
        orderSource.filter((t) => derivePhase(t) === phase),
        { rootPrefix: PHASE_NUMBER[phase] ?? null }
      );
      const taskById = new Map(ordered.map((task) => [task.id, task]));
      const visibleTasks = ordered.filter((task) => {
        let parentId = task.parent_task_id;
        while (parentId) {
          if (collapsedTasks[parentId]) return false;
          const parent = taskById.get(parentId);
          if (!parent) break;
          parentId = parent.parent_task_id;
        }
        return true;
      });

      return { phase, tasks: visibleTasks, totalTasks: ordered.length };
    }).filter((g) => g.tasks.length > 0);
  }, [collapsedTasks, filtered, sortBy]);

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

  const GRID = "28px 70px 2fr 90px 90px 1fr 80px 90px 130px";

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
          <option value="Not Started">Not Started</option>
          <option value="In Progress">In Progress</option>
          <option value="Complete">Complete</option>
          <option value="Delayed">Delayed</option>
        </select>
        {editingId && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.08em" }}>
            ✎ EDITING — ENTER to save · ESC to cancel
          </div>
        )}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "40px 24px",
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            No tasks match filters
          </div>
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.phase}>
            {/* Phase header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0 6px 0", marginTop: 8 }}>
              <div style={{ width: 3, height: 16, background: PHASE_COLORS[group.phase] || "var(--accent)", borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: PHASE_COLORS[group.phase] || "var(--accent)" }}>
                {group.phase}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", background: "var(--bg-surface-high)", padding: "1px 7px", borderRadius: 4 }}>
                {group.totalTasks} tasks
              </span>
              <div style={{ flex: 1, height: 1, background: "var(--divider)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                {group.tasks.filter((t) => t.status === "Complete").length}/{group.tasks.length} complete
              </span>
            </div>

            {/* Task panel */}
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)", overflow: "hidden", marginBottom: 4,
            }}>
              {/* Column headers */}
              <div style={{
                padding: "10px 16px", borderBottom: "1px solid var(--divider)",
                display: "grid", gridTemplateColumns: GRID, gap: 12,
                background: "var(--bg-surface-secondary)",
              }}>
                {["", "WBS", "Task", "Start", "Finish", "Assigned To", "Priority", "Status", ""].map((col) => (
                  <div key={col} style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    {col}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {group.tasks.map((task) => {
                const isEditing = editingId === task.id;
                return (
                  <div
                    key={task.id}
                    onClick={(e) => startEdit(task, e)}
                    style={{
                      padding: "9px 16px",
                      borderBottom: "1px solid var(--divider)",
                      display: "grid",
                      gridTemplateColumns: GRID,
                      gap: 12,
                      alignItems: "center",
                      transition: "background 0.1s",
                      background: isEditing ? "rgba(200,155,32,0.04)" : "transparent",
                      cursor: isEditing ? "default" : "pointer",
                      outline: isEditing ? "1px solid rgba(200,155,32,0.25)" : "none",
                    }}
                    onMouseEnter={(e) => { if (!isEditing) e.currentTarget.style.background = "var(--hover-bg)"; }}
                    onMouseLeave={(e) => { if (!isEditing) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Checkbox */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(task.id)}
                        onChange={() => onToggleSelect && onToggleSelect(task.id)}
                        style={{ width: 14, height: 14 }}
                      />
                    </div>

                    {/* WBS */}
                    <div
                      className="sbd-num"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: task._hasChildren ? 800 : 600,
                        color: task._hasChildren ? "var(--accent)" : "var(--text-muted)",
                        whiteSpace: "nowrap",
                      }}
                      title={task._stored_wbs_code && task._stored_wbs_code !== task.wbs_code ? `Stored WBS: ${task._stored_wbs_code}` : undefined}
                    >
                      {task.wbs_code || "-"}
                    </div>

                    {/* Task name */}
                    <div>
                      {isEditing ? (
                        <input
                          ref={nameRef}
                          value={editDraft.task_name}
                          onChange={(e) => patch("task_name", e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, task.id)}
                          style={INLINE_INPUT}
                          placeholder="Task name"
                        />
                      ) : (
                        <>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: task._hasChildren ? 800 : 600,
                              color: "var(--text-primary)",
                              paddingLeft: `${Math.min(task._depth || 0, 4) * 14}px`,
                              textTransform: task._hasChildren ? "uppercase" : "none",
                            }}
                          >
                            {task._hasChildren ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                                aria-label={collapsedTasks[task.id] ? "Expand summary task" : "Collapse summary task"}
                                style={{
                                  width: 18,
                                  height: 18,
                                  marginRight: 6,
                                  border: "1px solid var(--border-default)",
                                  borderRadius: 5,
                                  background: "var(--bg-surface-high)",
                                  color: "var(--accent)",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 10,
                                  fontWeight: 800,
                                  lineHeight: "14px",
                                  cursor: "pointer",
                                }}
                              >
                                {collapsedTasks[task.id] ? "+" : "-"}
                              </button>
                            ) : null}
                            {task.task_name}
                          </div>
                          {task._hasChildren && (
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 2, letterSpacing: "0.08em", paddingLeft: `${Math.min(task._depth || 0, 4) * 14}px`, textTransform: "uppercase" }}>
                              Rollup · {task._directChildrenCount || 0} direct · {task._summaryTaskCount || 0} total
                            </div>
                          )}
                          {task.task_number && (
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{task.task_number}</div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Start Date */}
                    <div>
                      {isEditing ? (
                        <DateOrTbdInput
                          compact
                          value={editDraft.start_date}
                          onChange={(v) => patch("start_date", v)}
                          inputStyle={{ ...INLINE_INPUT, fontSize: 10, colorScheme: "dark" }}
                        />
                      ) : (
                        <span
                          style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: task.start_date ? "var(--text-secondary)" : "var(--accent)", fontWeight: task.start_date ? 400 : 700 }}
                          title={task._shifted ? `Stored: ${task._stored_start_date || "—"}\nShifted ${task._shifted_by || 0}d by predecessors` : undefined}
                        >
                          {fmtDate(task.start_date)}
                          {task._shifted ? <span style={{ color: "var(--accent)", marginLeft: 2 }} aria-hidden>*</span> : null}
                        </span>
                      )}
                    </div>

                    {/* Finish Date */}
                    <div>
                      {isEditing ? (
                        <DateOrTbdInput
                          compact
                          value={editDraft.end_date}
                          onChange={(v) => patch("end_date", v)}
                          inputStyle={{ ...INLINE_INPUT, fontSize: 10, colorScheme: "dark" }}
                        />
                      ) : (
                        <span
                          style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: task.end_date ? "var(--text-secondary)" : "var(--accent)", fontWeight: task.end_date ? 400 : 700 }}
                          title={task._shifted ? `Stored: ${task._stored_end_date || "—"}\nShifted ${task._shifted_by || 0}d by predecessors` : undefined}
                        >
                          {fmtDate(task.end_date)}
                          {task._shifted ? <span style={{ color: "var(--accent)", marginLeft: 2 }} aria-hidden>*</span> : null}
                        </span>
                      )}
                    </div>

                    {/* Assigned To */}
                    <div>
                      {isEditing ? (
                        <input
                          value={editDraft.assigned_to}
                          onChange={(e) => patch("assigned_to", e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, task.id)}
                          placeholder="Name or initials…"
                          style={INLINE_INPUT}
                        />
                      ) : (
                        <span style={{ fontSize: 11, color: task.assigned_to ? "var(--text-secondary)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {task.assigned_to || <em style={{ fontStyle: "italic", opacity: 0.5 }}>Unassigned</em>}
                        </span>
                      )}
                    </div>

                    {/* Priority */}
                    <div>
                      {isEditing ? (
                        <select value={editDraft.priority} onChange={(e) => patch("priority", e.target.value)} onKeyDown={(e) => handleKeyDown(e, task.id)} style={INLINE_SELECT}>
                          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <div style={{
                          display: "inline-flex", alignItems: "center", padding: "4px 8px",
                          background: `${PRIORITY_COLORS[task.priority]}20`, border: `1px solid ${PRIORITY_COLORS[task.priority]}40`,
                          borderRadius: 6, width: "fit-content",
                        }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600, color: PRIORITY_COLORS[task.priority], textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {task.priority}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status */}
                    <div>
                      {isEditing ? (
                        <select value={editDraft.status} onChange={(e) => patch("status", e.target.value)} onKeyDown={(e) => handleKeyDown(e, task.id)} style={INLINE_SELECT}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <div style={{
                          display: "inline-flex", alignItems: "center", padding: "4px 8px",
                          background: `${STATUS_COLORS[task.status]}20`, border: `1px solid ${STATUS_COLORS[task.status]}40`,
                          borderRadius: 6, width: "fit-content",
                        }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600, color: STATUS_COLORS[task.status], textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {task.status}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {isEditing ? (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); commitEdit(task.id); }}
                            disabled={saving}
                            style={{
                              background: "var(--accent)", border: "none", borderRadius: 5,
                              padding: "4px 9px", color: "#fff",
                              fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                              cursor: saving ? "not-allowed" : "pointer", letterSpacing: "0.06em",
                            }}
                          >
                            {saving ? "…" : "SAVE"}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                            style={{
                              background: "transparent", border: "1px solid var(--border-default)", borderRadius: 5,
                              padding: "4px 7px", color: "var(--text-muted)",
                              fontFamily: "var(--font-mono)", fontSize: 8, cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); onEdit && onEdit(task); }}
                            style={{
                              background: "transparent", border: "1px solid var(--border-default)", borderRadius: 6,
                              padding: "4px 10px", color: "var(--text-muted)",
                              fontFamily: "var(--font-mono)", fontSize: 8, cursor: "pointer", transition: "all 0.1s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                          >
                            EDIT
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete && onDelete(task); }}
                            style={{
                              background: "transparent", border: "1px solid var(--danger-border)", borderRadius: 6,
                              padding: "4px 10px", color: "var(--danger)",
                              fontFamily: "var(--font-mono)", fontSize: 8, cursor: "pointer", transition: "all 0.1s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-muted)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          >
                            DEL
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
