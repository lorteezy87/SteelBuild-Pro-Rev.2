/**
 * ScheduleImportStaging.jsx — Preview table for schedule imports.
 *
 * When a user imports an MS Project XML (or CSV), this modal shows all
 * tasks that WILL be created before writing anything to the database.
 * Highlights:
 *   - Conflict detection (tasks with same name already exist)
 *   - Date-range warnings (tasks outside the project's date window)
 *   - Full preview: task name, start, end, duration, dependencies, WBS, resources
 *   - Confirm / Cancel — only creates tasks after explicit user approval
 *
 * Integrates into the existing import flow: parseMsProjectXml runs first,
 * then this modal displays the results. On "Confirm Import", the parent
 * component runs the actual creation logic.
 */

import React, { useMemo, useState } from "react";
import { Modal, Button } from "@/components/design-system";
import { PHASES } from "@/utils/phases";

// ── Conflict detection helpers ──────────────────────────────────────────

function detectConflicts(parsedTasks, existingTasks, projectInfo) {
  const existingNames = new Set(
    existingTasks.map((t) => (t.task_name || "").toLowerCase().trim())
  );

  const projStart = projectInfo?.start_date
    ? new Date(projectInfo.start_date + "T00:00:00")
    : null;
  const projEnd = projectInfo?.end_date
    ? new Date(projectInfo.end_date + "T00:00:00")
    : null;

  return parsedTasks.map((task) => {
    const conflicts = [];

    // Name collision
    if (existingNames.has((task.name || "").toLowerCase().trim())) {
      conflicts.push("duplicate");
    }

    // Date outside project range
    if (task.start) {
      const s = new Date(task.start + "T00:00:00");
      if (projStart && s < projStart) conflicts.push("before-project");
      if (projEnd && s > projEnd) conflicts.push("after-project");
    }
    if (task.finish) {
      const e = new Date(task.finish + "T00:00:00");
      if (projEnd && e > projEnd) conflicts.push("after-project");
    }

    return { ...task, _conflicts: conflicts };
  });
}

// ── Component ───────────────────────────────────────────────────────────

export default function ScheduleImportStaging({
  open,
  onClose,
  onConfirm,
  parsedTasks = [],
  existingTasks = [],
  projectInfo = {},
  isImporting = false,
  sourceFileName = "",
}) {
  const [hideCompleted, setHideCompleted] = useState(false);

  const tasksWithConflicts = useMemo(
    () => detectConflicts(parsedTasks, existingTasks, projectInfo),
    [parsedTasks, existingTasks, projectInfo]
  );

  const displayTasks = useMemo(() => {
    if (!hideCompleted) return tasksWithConflicts;
    return tasksWithConflicts.filter((t) => t.pct < 100);
  }, [tasksWithConflicts, hideCompleted]);

  const conflictCount = tasksWithConflicts.filter((t) => t._conflicts.length > 0).length;
  const summaryCount = tasksWithConflicts.filter((t) => t.isSummary).length;
  const milestoneCount = tasksWithConflicts.filter((t) => t.milestone).length;

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Preview"
      eyebrow={sourceFileName ? `FILE: ${sourceFileName.toUpperCase()}` : "SCHEDULE IMPORT"}
      width={1100}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            {parsedTasks.length} tasks ({summaryCount} summary, {milestoneCount} milestones)
            {conflictCount > 0 && (
              <span style={{ color: "var(--status-warning)", marginLeft: 8 }}>
                {conflictCount} conflict{conflictCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={onClose} disabled={isImporting}>
              CANCEL
            </Button>
            <Button
              variant="primary"
              onClick={() => onConfirm(parsedTasks)}
              disabled={isImporting || parsedTasks.length === 0}
            >
              {isImporting ? "IMPORTING..." : `CONFIRM IMPORT (${parsedTasks.length})`}
            </Button>
          </div>
        </div>
      }
    >
      {/* Controls */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(e) => setHideCompleted(e.target.checked)}
          />
          Hide completed tasks
        </label>

        {conflictCount > 0 && (
          <div style={{
            background: "var(--warning-muted)",
            border: "1px solid var(--warning-border)",
            borderRadius: 6,
            padding: "4px 10px",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--status-warning)",
            fontWeight: 700,
          }}>
            {conflictCount} CONFLICT{conflictCount !== 1 ? "S" : ""} DETECTED — REVIEW HIGHLIGHTED ROWS
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-body)", fontSize: 11, marginTop: 12 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, zIndex: 2 }}>
              {["#", "Task Name", "Start", "End", "Duration", "WBS", "Dependencies", "Resources", "Status"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "8px 6px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    background: "var(--bg-surface-low)",
                    borderBottom: "1px solid var(--border-default)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayTasks.map((task, idx) => {
              const hasConflict = task._conflicts.length > 0;
              const isDuplicate = task._conflicts.includes("duplicate");
              const isOutOfRange = task._conflicts.includes("before-project") || task._conflicts.includes("after-project");

              return (
                <tr
                  key={task.uid || idx}
                  style={{
                    background: hasConflict
                      ? isDuplicate
                        ? "var(--warning-muted)"
                        : "rgba(234,179,8,0.05)"
                      : idx % 2 === 0
                        ? "var(--bg-surface)"
                        : "var(--bg-surface-low)",
                    borderLeft: hasConflict ? "3px solid var(--status-warning)" : "3px solid transparent",
                  }}
                >
                  <td style={cellStyle}>
                    <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                      {idx + 1}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, fontWeight: task.isSummary ? 700 : 400, paddingLeft: `${(task.outlineLevel || 1) * 12}px` }}>
                    {task.isSummary && <span style={{ color: "var(--accent)", marginRight: 4 }}>&#9654;</span>}
                    {task.milestone && <span style={{ color: "var(--status-warning)", marginRight: 4 }}>&#9670;</span>}
                    {task.name || "Untitled"}
                    {isDuplicate && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)", marginLeft: 6, fontWeight: 700 }}>
                        DUPLICATE
                      </span>
                    )}
                    {isOutOfRange && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)", marginLeft: 6, fontWeight: 700 }}>
                        OUT OF RANGE
                      </span>
                    )}
                  </td>
                  <td style={monoCell}>{task.start || "--"}</td>
                  <td style={monoCell}>{task.finish || "--"}</td>
                  <td style={monoCell}>{task.durationDays ? `${task.durationDays}d` : "--"}</td>
                  <td style={monoCell}>{task.outlineNumber || "--"}</td>
                  <td style={{ ...cellStyle, fontSize: 10, color: "var(--text-secondary)" }}>
                    {task.preds && task.preds.length > 0
                      ? task.preds.map((p) => `#${p.predUid}`).join(", ")
                      : "--"}
                  </td>
                  <td style={{ ...cellStyle, fontSize: 10 }}>
                    {task.resources.length > 0 ? task.resources.join(", ") : "--"}
                  </td>
                  <td style={monoCell}>
                    {task.pct >= 100 ? (
                      <span style={{ color: "var(--status-success)" }}>Complete</span>
                    ) : task.pct > 0 ? (
                      <span style={{ color: "var(--status-warning)" }}>{task.pct}%</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>0%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {displayTasks.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            No tasks to display
          </div>
        )}
      </div>
    </Modal>
  );
}

const cellStyle = {
  padding: "6px 6px",
  borderBottom: "1px solid var(--border-default)",
  verticalAlign: "top",
};

const monoCell = {
  ...cellStyle,
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  whiteSpace: "nowrap",
};
