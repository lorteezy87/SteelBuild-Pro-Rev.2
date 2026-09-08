import React from "react";
import {
  GANTT_GRID_STRONG_VAR,
  GANTT_GRID_VAR,
  GANTT_PHASE_VAR,
  GANTT_ROW_ALT_VAR,
  GANTT_ROW_HOVER_VAR,
  GANTT_STATUS_HEX,
} from "@/lib/ganttTheme";
import { fmtDate, calcDuration } from "./scheduleDateUtils";
import { parseDeps, formatPredecessorLabels } from "./scheduleDependencies";
import {
  percentCompleteOrNull,
  isMilestoneTask,
  sanitizeTaskName,
  statusColor,
} from "./scheduleTaskUtils";
import {
  StatusChip,
  SummaryBar,
  StageGateMilestones,
  TaskBar,
  BaselineGhostBar,
  SubmittalBar,
  DeliveryBar,
} from "./scheduleGanttBars";
import {
  shiftDateOnly,
  getTaskBaseline,
  isCriticalTask,
  pluralize,
  isSummaryScheduleTask,
  isActionableScheduleTask,
  isUnassignedTask,
  hasLogicGapTask,
} from "./scheduleGanttHelpers";
import { GANTT_ROW_H, GANTT_SUM_H } from "./scheduleGanttDerive";

const DELIVERY_STATUS_DOT: Record<string, string> = {
  "Scheduled":  GANTT_PHASE_VAR.Procurement,
  "In Transit": GANTT_STATUS_HEX.inProgress,
  "Delivered":  GANTT_STATUS_HEX.complete,
  "Partial":    GANTT_STATUS_HEX.delayed,
  "Rejected":   GANTT_STATUS_HEX.delayed,
  "Delayed":    GANTT_STATUS_HEX.delayed,
};

const ROW_H   = GANTT_ROW_H;
const SUM_H   = GANTT_SUM_H;
const tint = (color: any, percent: any) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

const DETAILING_STAGES = ["IFA", "OFA", "BFA", "OFS", "IFC", "Released"];
const STAGE_DISPLAY: Record<string, any> = {};

export function GanttLeftPanelRows(props: any) {
  const {
  virtualRows,
  collapsed,
  togglePhase,
  collapsedDeliveries,
  setCollapsedDeliveries,
  GRID,
  today,
  setHoveredRowId,
  taskById,
  successorCountById,
  effectiveDates,
  editingId,
  editDraft,
  setEditDraft,
  hoveredRowId,
  focusedTaskId,
  dropTarget,
  dragId,
  onDragStart,
  onDragOverRow,
  onDropRow,
  onDragEnd,
  onTaskClick,
  commitEdit,
  cancelEdit,
  onSave,
  startInlineEdit,
  toggleTask,
  collapsedTasks,
  weatherRiskByTask,
  weatherRisk,
  saving,
  effStart,
  effEnd,
  isOverdue,
  floatMap,
  } = props;
  return virtualRows.map(({ row, index: i }: any) => {
    if (row.type === "summary") {
      const { phase, tasks, pctComplete } = row;
      const isOpen = !collapsed[phase.key];
      // Summary/parent rows must never be counted as overdue — their
      // window merely spans their children, so a late child already
      // shows up on its own row. Counting the parent too would
      // double-count and inflate the phase's overdue badge.
      const phaseOverdue = tasks.filter((t: any) => !isSummaryScheduleTask(t) && isOverdue(t)).length;
      const phaseCritical = tasks.filter((t: any) => isCriticalTask(t, floatMap)).length;
      const phaseTbd = tasks.filter((t: any) => !effStart(t) || !effEnd(t)).length;
      const phaseMeta = [
        `${pluralize(tasks.length, "task")}`,
        phaseCritical ? `${phaseCritical} critical` : null,
        phaseOverdue ? `${phaseOverdue} overdue` : null,
        phaseTbd ? `${phaseTbd} TBD` : null,
      ].filter(Boolean).join(" / ");
      return (
        <div
          key={`sum-${phase.key}`}
          onClick={() => togglePhase(phase.key)}
          // Whole row is the click target (chevron + label + count
          // + percent), with a subtle background-shift on hover so
          // it's obviously interactive — the audit flagged the
          // previous render as ambiguous about the hit area.
          onMouseEnter={(e) => { e.currentTarget.style.background = `${phase.color}1f`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${phase.color}12`; }}
          title={`${isOpen ? "Collapse" : "Expand"} ${phase.label}`}
          role="button"
          aria-expanded={isOpen}
          style={{ height: SUM_H, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", padding: "0 12px", gap: 8, borderBottom: `1px solid var(--divider)`, background: `${phase.color}12`, cursor: "pointer", userSelect: "none", transition: "background 0.12s" }}
        >
          <span style={{ color: phase.color, fontSize: 10, transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", display: "inline-block", lineHeight: 1 }}>▾</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: phase.color, letterSpacing: "0.10em", background: `${phase.color}20`, border: `1px solid ${phase.color}40`, borderRadius: 2, padding: "1px 6px", flexShrink: 0 }}>{phase.id}.0</span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: phase.color, letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{phase.label.toUpperCase()}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: phaseOverdue ? GANTT_STATUS_HEX.delayed : phaseCritical ? GANTT_PHASE_VAR.Procurement : "var(--text-muted)", flexShrink: 0 }}>{phaseMeta}</span>
          </div>
          <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: phase.color }}>{Math.round(pctComplete)}%</span>
        </div>
      );
    }
    // ── Delivery summary row ──
    if (row.type === "delivery-summary") {
      const isOpen = !collapsedDeliveries;
      const dColor = GANTT_PHASE_VAR.Delivery;
      return (
        <div key="delivery-summary" onClick={() => setCollapsedDeliveries((v: any) => !v)} style={{ height: SUM_H, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", padding: "0 12px", gap: 8, borderBottom: "1px solid var(--divider)", background: `color-mix(in srgb, ${dColor} 7%, transparent)`, cursor: "pointer", userSelect: "none" }}>
          <span style={{ color: dColor, fontSize: 10, transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", display: "inline-block", lineHeight: 1 }}>▾</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: dColor, letterSpacing: "0.10em", background: `color-mix(in srgb, ${dColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${dColor} 35%, transparent)`, borderRadius: 2, padding: "1px 6px", flexShrink: 0 }}>🚛</span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: dColor, letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>DELIVERIES</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", flexShrink: 0 }}>{row.deliveryCount} items</span>
          </div>
          <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: dColor }}>{row.pctComplete}%</span>
        </div>
      );
    }
    // ── Delivery item row ──
    if (row.type === "delivery") {
      const d = row.delivery;
      const dotColor = DELIVERY_STATUS_DOT[d.status] || GANTT_PHASE_VAR.Delivery;
      const isLate = d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered";
      const label = d.description || d.vendor || "Delivery";
      return (
        <div key={`del-${d.id}`} style={{ height: ROW_H, display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 4, borderBottom: "1px solid var(--divider)", background: "transparent", borderLeft: isLate ? `3px solid ${GANTT_STATUS_HEX.delayed}` : "3px solid transparent" }}
          onMouseEnter={() => setHoveredRowId(`del-${d.id}`)}
          onMouseLeave={() => setHoveredRowId(null)}
        >
          {/* WBS placeholder */}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>—</span>
          {/* Name + vendor */}
          <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
            <span style={{ fontSize: 10, flexShrink: 0 }}>🚛</span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 500, color: isLate ? GANTT_STATUS_HEX.delayed : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          </span>
          {/* Tonnage instead of duration */}
          <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap" }}>{d.weight_tons ? `${d.weight_tons}T` : "—"}</span>
          {/* Scheduled date */}
          <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isLate ? GANTT_STATUS_HEX.delayed : "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(d.scheduled_date)}</span>
          {/* Required/actual date */}
          <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDate(d.required_date || d.actual_date)}</span>
          {/* Pieces */}
          <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", textAlign: "center" }}>{d.pieces ? `${d.pieces}pc` : "—"}</span>
          {/* Vendor */}
          <span title={d.vendor || "—"} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.vendor || "—"}</span>
          {/* Status */}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: dotColor, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.06em" }}>{d.status || "—"}</span>
          {/* Stage — deliveries don't have a detailing stage */}
          <span />
          {/* No % for deliveries */}
          <span />
        </div>
      );
    }
    // Task row
    const { task, phase } = row;
    const deps = parseDeps(task.dependencies);
    // Orphaned dependencies (predecessor task deleted) are skipped so
    // the cell never renders the literal "undefined…".
    const depLabels = formatPredecessorLabels(deps, (dId) => taskById.get(dId));
    const predecessorCount = deps.length;
    const successorCount = successorCountById[task.id] || 0;
    const logicGap = hasLogicGapTask(task, successorCountById);
    const unassigned = isUnassignedTask(task);
    const overdue = isOverdue(task);
    // Show *effective* start/finish in the left columns so the date
    // text matches the bar position. If a task slipped because of a
    // dependency cascade we mark it with "*" so users know it's
    // shifted vs the stored value — clicking the row reveals the raw
    // dates in the detail panel.
    const dispStart = effStart(task);
    const dispEnd   = effEnd(task);
    const isShifted = !!effectiveDates[task.id]?.shifted;
    const isEditing = editingId === task.id;
    // Summary/parent rows have trigger-derived start/end (see the
    // schedule_summary_rollup migration), so the inline date editor must
    // show them read-only — any typed value is overwritten on the next
    // child change. Matches TaskDetailDrawer. The Gantt already enriches
    // rows with _hasChildren/_isRolledUpSummary, so the flag-based
    // predicate is sufficient here.
    const isSummaryRow = isSummaryScheduleTask(task);
    const leftHovered = hoveredRowId === task.id;
    const parentRowBg = task._hasChildren ? tint(GANTT_STATUS_HEX.inProgress, 4) : "transparent";
    const critical = isCriticalTask(task, floatMap);
    // "—" for unknown, never "0%". A task reopened from Complete has a
    // deliberately cleared percent, and printing 0% would assert that none of
    // the work was ever done (§4.3).
    const pctComplete = percentCompleteOrNull(task);
    const isFocused = focusedTaskId && String(task.id) === String(focusedTaskId);
    return (
      <div key={`task-${task.id}`}
        draggable={!isEditing}
        onDragStart={(e) => {
          // Don't start a row drag when the gesture begins on an
          // interactive control (inline-edit input, expand caret,
          // status menu) — let those keep their native behaviour.
          const t = e.target as HTMLElement | null;
          const tag = t && t.tagName;
          if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON" || (t && t.isContentEditable)) {
            e.preventDefault();
            return;
          }
          onDragStart(e, task);
        }}
        onDragOver={(e) => onDragOverRow(e, task)}
        onDrop={(e) => onDropRow(e, task)}
        onDragEnd={onDragEnd}
        style={{ height: ROW_H, display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "0 12px", gap: 4, borderBottom: "1px solid var(--divider)", background: isFocused ? tint(GANTT_STATUS_HEX.inProgress, 14) : leftHovered ? tint(GANTT_STATUS_HEX.inProgress, 7) : critical ? `color-mix(in srgb, ${GANTT_PHASE_VAR.Procurement} 5%, transparent)` : parentRowBg, transition: "background 0.08s", cursor: "pointer", borderLeft: isFocused ? `3px solid ${GANTT_STATUS_HEX.inProgress}` : overdue ? `3px solid ${GANTT_STATUS_HEX.delayed}` : critical ? `3px solid ${GANTT_PHASE_VAR.Procurement}` : "3px solid transparent", boxShadow: dropTarget?.id === task.id && dropTarget.zone === "nest" ? "inset 0 0 0 2px var(--accent)" : isFocused ? `inset 0 0 0 1px ${tint(GANTT_STATUS_HEX.inProgress, 33)}` : "none", opacity: dragId === task.id ? 0.4 : 1, borderTop: dropTarget?.id === task.id && dropTarget.zone === "before" ? "2px solid var(--accent)" : undefined, borderBottomColor: dropTarget?.id === task.id && dropTarget.zone === "after" ? "var(--accent)" : undefined, borderBottomWidth: dropTarget?.id === task.id && dropTarget.zone === "after" ? 2 : undefined }}
        onClick={() => onTaskClick && onTaskClick(task)}
        onMouseEnter={() => setHoveredRowId(task.id)}
        onMouseLeave={() => setHoveredRowId(null)}
      >
        {/* WBS */}
        <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.wbs_code || "—"}</span>
        {/* Task name — with hierarchy indentation and expand/collapse */}
        {isEditing ? (
          <input
            autoFocus
            value={editDraft.task_name}
            onChange={e => setEditDraft((d: any) => ({ ...d, task_name: e.target.value }))}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === "Enter") commitEdit(task.id); if (e.key === "Escape") cancelEdit(); }}
            style={{ fontFamily: "var(--font-body)", fontSize: 11, background: "var(--bg-input)", border: "1px solid var(--accent)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 6px", width: "100%" }}
          />
        ) : (
          <span
            title={sanitizeTaskName(task)}
            onDoubleClick={e => onSave && startInlineEdit(task, e)}
            style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: (task._depth || 0) * 16, overflow: "hidden" }}
          >
            {/* Hierarchy is edited by dragging this row onto
                another (nest) or into the gap between rows
                (reorder) — see useTaskRowDnD. The old inline
                ▲▼◂▸ move/indent buttons + Tab/Alt-arrow keys
                were removed in favour of drag-and-drop. */}
            {task._hasChildren && (
              <button onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 9, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>
                {collapsedTasks[task.id] ? "▶" : "▾"}
              </button>
            )}
            {!task._hasChildren && task._depth > 0 && <span style={{ width: 14, flexShrink: 0 }} />}
            {isMilestoneTask(task) && <span style={{ marginRight: 4, color: "var(--accent)" }}>◆</span>}
            {/* Weather-risk chip — only on Installation/Delivery
                rows whose window overlaps rough forecast days.
                Tooltip lists specific dates + drivers so the
                super can plan around them. */}
            {weatherRiskByTask[task.id] && (() => {
              const hits = weatherRiskByTask[task.id];
              const worst = hits.reduce((m: any, h: any) => (h.severity > m ? h.severity : m), 0);
              const color = worst >= 3 ? GANTT_STATUS_HEX.delayed : GANTT_PHASE_VAR.Procurement;
              const label = hits.length === 1 ? hits[0].date.slice(5) : `${hits.length} days`;
              const tipLines = hits.slice(0, 5).map((h: any) => `${h.date}: ${h.summary}`);
              if (hits.length > 5) tipLines.push(`…${hits.length - 5} more`);
              return (
                <span
                  title={`Weather risk:\n${tipLines.join("\n")}\n(${weatherRisk?.source || "Open-Meteo"})`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    color,
                    border: `1px solid ${color}`,
                    borderRadius: 2,
                    padding: "0 4px",
                    marginRight: 5,
                    flexShrink: 0,
                    lineHeight: 1.4,
                  }}
                >
                  ⚠ {label}
                </span>
              );
            })()}
            {logicGap && (
              <span
                title={`${predecessorCount === 0 ? "Missing predecessor" : ""}${predecessorCount === 0 && successorCount === 0 ? " / " : ""}${successorCount === 0 ? "Missing successor" : ""}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 7,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  color: "var(--status-warning)",
                  border: "1px solid color-mix(in srgb, var(--status-warning) 50%, transparent)",
                  background: "var(--warning-muted)",
                  borderRadius: 2,
                  padding: "1px 4px",
                  marginRight: 5,
                  flexShrink: 0,
                  lineHeight: 1.35,
                }}
              >
                LOGIC
              </span>
            )}
            {unassigned && (
              <span
                title="No assigned resource or owner"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 7,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  color: "var(--status-error)",
                  border: "1px solid color-mix(in srgb, var(--status-error) 50%, transparent)",
                  background: "var(--danger-muted)",
                  borderRadius: 2,
                  padding: "1px 4px",
                  marginRight: 5,
                  flexShrink: 0,
                  lineHeight: 1.35,
                }}
              >
                NO OWNER
              </span>
            )}
            <span style={{
              fontFamily: "var(--font-body)",
              // Slight WBS-level type ramp: parent tasks read as
              // headers, leaf rows stay at the base weight. Depth
              // also drops the size by 0.5px per level (max 2)
              // so a glance can tell parent from grandchild.
              fontSize: task._hasChildren ? 11.5 : Math.max(10, 11 - Math.min(task._depth || 0, 2) * 0.5),
              fontWeight: task._hasChildren ? 800 : 500,
              letterSpacing: task._hasChildren ? "0.01em" : 0,
              textTransform: task._hasChildren ? "uppercase" : "none",
              color: overdue
                ? GANTT_STATUS_HEX.delayed
                : task._hasChildren
                  ? "var(--text-primary)"
                  : (task._depth || 0) > 0
                    ? "var(--text-secondary)"
                    : "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {sanitizeTaskName(task)}
            </span>
          </span>
        )}
        {/* Duration — always derive from start/end so a stale stored
            `duration` from an old MS Project import (or a manual edit
            that touched dates without touching the duration column)
            can't display "1d" on a 140-day task. The schedule_tasks
            table still has a `duration` column, but it is no longer
            a source of truth for display. */}
        <span className="sbd-num" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap" }}>
          {/* Derived from the DISPLAYED dates, not the stored ones. START and
              FINISH in this same row render effStart/effEnd, so computing DUR
              from task.start_date/end_date put a contradictory number next to
              them for any cascaded row. */}
          {calcDuration(dispStart, dispEnd)}
        </span>
        {/* Start */}
        {isEditing ? (
          <input type="date" value={editDraft.start_date} disabled={isSummaryRow} title={isSummaryRow ? "Derived from children — not editable" : undefined} onChange={e => setEditDraft((d: any) => ({ ...d, start_date: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px", width: "100%", ...(isSummaryRow ? { opacity: 0.5, cursor: "not-allowed" } : {}) }} />
        ) : (
          <span
            className="sbd-num"
            title={isShifted ? `Stored: ${fmtDate(task.start_date)}\nShifted by predecessors` : undefined}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: !dispStart ? "var(--status-warning)" : isShifted ? "var(--accent)" : "var(--text-secondary)", fontWeight: !dispStart ? 700 : 400, textAlign: "center", whiteSpace: "nowrap" }}
          >
            {fmtDate(dispStart)}{isShifted ? "*" : ""}
          </span>
        )}
        {/* Finish */}
        {isEditing ? (
          <input type="date" value={editDraft.end_date} disabled={isSummaryRow} title={isSummaryRow ? "Derived from children — not editable" : undefined} onChange={e => setEditDraft((d: any) => ({ ...d, end_date: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px", width: "100%", ...(isSummaryRow ? { opacity: 0.5, cursor: "not-allowed" } : {}) }} />
        ) : (
          <span
            className="sbd-num"
            title={isShifted ? `Stored: ${fmtDate(task.end_date)}\nShifted by predecessors` : undefined}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: !dispEnd ? GANTT_PHASE_VAR.Procurement : overdue ? GANTT_STATUS_HEX.delayed : isShifted ? GANTT_STATUS_HEX.inProgress : "var(--text-secondary)", fontWeight: !dispEnd ? 700 : 400, textAlign: "center", whiteSpace: "nowrap" }}
          >
            {fmtDate(dispEnd)}{isShifted ? "*" : ""}
          </span>
        )}
        {/* Predecessors */}
        <span title={depLabels || "—"} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{depLabels || "—"}</span>
        {/* Resources */}
        <span title={task.resource_names || task.assigned_to || "—"} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: task.resource_names || task.assigned_to ? "var(--text-secondary)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.resource_names || task.assigned_to || "—"}</span>
        {/* Status — chip rendering, tinted background + dot for
            quick visual scan. Overdue rows promote to the
            Delayed palette so an "Overdue" row visually
            matches its red border-left strip. */}
        {isEditing ? (
          <select value={editDraft.status} onChange={e => setEditDraft((d: any) => ({ ...d, status: e.target.value }))} onClick={e => e.stopPropagation()} style={{ fontFamily: "var(--font-mono)", fontSize: 8, background: "var(--bg-input)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-primary)", padding: "2px 2px" }}>
            {["Not Started","In Progress","Complete","Delayed","On Hold"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
            <StatusChip status={task.status} overdue={overdue} />
          </div>
        )}
        {/* Stage — only rendered with a picker on Detailing-phase
            rows. `phase` here is the PHASES config object from the
            row (not a string), so we check phase.key. For other
            phases we emit an em-dash so the grid layout stays
            aligned. Stage persists in
            schedule_tasks.metadata.detailing_stage; onSave is the
            parent Schedule page's ScheduleTask.update callback.
            stopPropagation on mousedown + click so the row's
            onTaskClick doesn't fire while the select is open. */}
        {phase?.key === "Detailing" ? (
          <select
            value={task.metadata?.detailing_stage || ""}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const newStage = e.target.value || null;
              if (onSave) {
                onSave({
                  id: task.id,
                  metadata: { ...(task.metadata || {}), detailing_stage: newStage },
                });
              }
            }}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              background: "var(--bg-input)",
              border: `1px solid ${task.metadata?.detailing_stage ? "var(--accent-border)" : "var(--divider)"}`,
              borderRadius: 3,
              color: task.metadata?.detailing_stage ? "var(--accent)" : "var(--text-muted)",
              padding: "2px 2px",
              width: "100%",
              letterSpacing: "0.04em",
              cursor: "pointer",
            }}
          >
            <option value="">—</option>
            {DETAILING_STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_DISPLAY[s] || s}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>—</span>
        )}
        {/* % or save/cancel */}
        {isEditing ? (
          <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => commitEdit(task.id)} disabled={saving} style={{ background: "var(--accent)", border: "none", borderRadius: 3, color: "var(--on-accent)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, padding: "2px 6px", cursor: "pointer" }}>{saving ? "…" : "✓"}</button>
            <button onClick={cancelEdit} style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: 3, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px", cursor: "pointer" }}>✕</button>
          </div>
        ) : (
          <span className="sbd-num" title={pctComplete === null ? "Progress not recorded" : undefined} style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: pctComplete === null ? "var(--text-muted)" : statusColor(task.status), textAlign: "right" }}>{pctComplete === null ? "—" : `${pctComplete}%`}</span>
        )}
      </div>
    );
  });
}

export function GanttTimelineRows(props: any) {
  const {
  virtualRows,
  effStart,
  effEnd,
  px,
  spanPx,
  today,
  hoveredRowId,
  setHoveredRowId,
  focusedTaskId,
  suppressTaskClickRef,
  onTaskClick,
  taskDrag,
  onSave,
  saving,
  startTaskBarDrag,
  showBaseline,
  baselineMap,
  floatMap,
  showSubmittals,
  submittals,
  setTooltip,
  isOverdue,
  } = props;
  let top = 0;
  let taskIdx = 0;
  return virtualRows.map(({ row, top: rowTop, index: i }: any) => {
    if (row.type === "summary") {
      top += SUM_H;
      // Use effective dates for the summary span as well
      const phaseEffStarts = row.tasks.map((t: any) => effStart(t)).filter(Boolean).sort();
      const phaseEffEnds   = row.tasks.map((t: any) => effEnd(t)).filter(Boolean).sort();
      const sumStart = phaseEffStarts[0] || row.start;
      const sumEnd   = phaseEffEnds[phaseEffEnds.length - 1] || row.end;
      const startPx = px(sumStart);
      const w = spanPx(sumStart, sumEnd);
      return (
        <div key={`gs-${row.phase.key}`} style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: SUM_H, background: `${row.phase.color}08`, borderBottom: `1px solid var(--divider)` }}>
          <SummaryBar phase={row.phase} leftPx={startPx} widthPx={w} pctComplete={row.pctComplete} />
        </div>
      );
    }
    // ── Delivery summary bar ──
    if (row.type === "delivery-summary") {
      top += SUM_H;
      const startPx2 = px(row.start);
      const w2 = spanPx(row.start, row.end);
      const dColor = GANTT_PHASE_VAR.Delivery;
      const pct2 = row.pctComplete || 0;
      return (
        <div key="gs-deliveries" style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: SUM_H, background: `color-mix(in srgb, ${dColor} 4%, transparent)`, borderBottom: "1px solid var(--divider)" }}>
          {/* Summary bar spanning all deliveries */}
          <div style={{
            position: "absolute", left: startPx2, width: Math.max(w2, 6), height: 14, top: "50%", transform: "translateY(-50%)",
            background: `color-mix(in srgb, ${dColor} 25%, transparent)`, borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(pct2, 100)}%`, background: dColor, borderRadius: 2, transition: "width 0.3s" }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: 4, height: "100%", background: dColor, borderRadius: "2px 0 0 2px" }} />
            <div style={{ position: "absolute", right: 0, top: 0, width: 4, height: "100%", background: dColor, borderRadius: "0 2px 2px 0" }} />
            {w2 > 40 && (
              <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: "var(--on-accent)", fontFamily: "var(--font-mono)" }}>{pct2}%</span>
            )}
          </div>
        </div>
      );
    }
    // ── Delivery item bar ──
    if (row.type === "delivery") {
      const zebra2 = taskIdx++ % 2 === 1;
      top += ROW_H;
      const d = row.delivery;
      const hovered = hoveredRowId === `del-${d.id}`;
      const isLate = d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered";
      const baseBg2 = isLate ? "var(--danger-muted)" : zebra2 ? GANTT_ROW_ALT_VAR : "transparent";
      const startIso = (d.scheduled_date || "").split("T")[0];
      const endIso = (d.required_date || d.actual_date || d.scheduled_date || "").split("T")[0];
      if (!startIso) {
        return <div key={`gd-${d.id}`} style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: `1px solid ${GANTT_GRID_VAR}`, background: hovered ? "var(--warning-muted)" : baseBg2 }} />;
      }
      return (
        <div key={`gd-${d.id}`}
          style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: `1px solid ${GANTT_GRID_VAR}`, background: hovered ? "var(--warning-muted)" : baseBg2, transition: "background 0.08s" }}
          onMouseEnter={() => setHoveredRowId(`del-${d.id}`)}
          onMouseLeave={() => setHoveredRowId(null)}
        >
          <DeliveryBar delivery={d} leftPx={px(startIso)} widthPx={spanPx(startIso, endIso)} />
        </div>
      );
    }
    const zebra = taskIdx++ % 2 === 1;
    top += ROW_H;
    const { task } = row;
    const overdue = isOverdue(task);
    const critical = isCriticalTask(task, floatMap);
    const hovered = hoveredRowId === task.id;
    const isFocused = focusedTaskId && String(task.id) === String(focusedTaskId);
    const parentBg = task._hasChildren ? tint(GANTT_STATUS_HEX.inProgress, 4) : "transparent";
    const baseBg = overdue ? "var(--danger-muted)" : critical ? "var(--warning-muted)" : zebra ? GANTT_ROW_ALT_VAR : parentBg;
    const hoverBg = tint(GANTT_STATUS_HEX.inProgress, 7);
    const focusedBg = tint(GANTT_STATUS_HEX.inProgress, 13);
    const handleTaskRowClick = () => {
      if (suppressTaskClickRef.current) {
        suppressTaskClickRef.current = false;
        return;
      }
      onTaskClick?.(task);
    };
    if (!task.start_date || !task.end_date) {
      const tbdLeft = px(today.toISOString().slice(0, 10));
      return (
        <div key={`gr-${task.id}`}
          style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: `1px solid ${GANTT_GRID_VAR}`, background: isFocused ? focusedBg : hovered ? hoverBg : baseBg, cursor: "pointer", boxShadow: isFocused ? `inset 0 0 0 1px ${tint(GANTT_STATUS_HEX.inProgress, 33)}` : "none" }}
          onClick={handleTaskRowClick}
          onMouseEnter={() => setHoveredRowId(task.id)}
          onMouseLeave={() => setHoveredRowId(null)}
        >
          <div
            title="Date TBD — task is tracked but not yet scheduled"
            style={{
              position: "absolute",
              left: Math.max(tbdLeft - 20, 4),
              top: "50%",
              transform: "translateY(-50%)",
              padding: "2px 8px",
              border: "1px dashed var(--status-warning)",
              borderRadius: 4,
              background: "var(--warning-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--status-warning)",
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}
          >
            TBD
          </div>
        </div>
      );
    }
    const taskEffS = effStart(task);
    const taskEffE = effEnd(task);
    const isDraggingTask = taskDrag?.taskId === task.id;
    const dragDays = isDraggingTask ? taskDrag.daysDelta : 0;
    const dragMode = isDraggingTask ? (taskDrag.mode || "move") : "move";
    const startDelta = dragMode === "resize-end" ? 0 : dragDays;
    const endDelta = dragMode === "resize-start" ? 0 : dragDays;
    const displayStart = startDelta ? shiftDateOnly(taskEffS, startDelta) : taskEffS;
    const displayEnd = endDelta ? shiftDateOnly(taskEffE, endDelta) : taskEffE;
    const barLeft = px(displayStart);
    const barWidth = spanPx(displayStart, displayEnd);
    const canDragTaskBar = Boolean(onSave && !saving && isActionableScheduleTask(task));
    const isMilestone = isMilestoneTask(task);
    const dragTargetLeft = isMilestone ? barLeft - 12 : barLeft;
    const dragTargetWidth = isMilestone ? 24 : Math.max(barWidth, 18);
    return (
      <div key={`gr-${task.id}`}
        style={{ position: "absolute", top: rowTop, left: 0, right: 0, height: ROW_H, borderBottom: `1px solid ${GANTT_GRID_VAR}`, background: isFocused ? focusedBg : hovered ? hoverBg : baseBg, cursor: canDragTaskBar ? (isDraggingTask ? "grabbing" : "grab") : "pointer", transition: "background 0.08s", boxShadow: isFocused ? `inset 0 0 0 1px ${tint(GANTT_STATUS_HEX.inProgress, 33)}` : "none" }}
        onClick={handleTaskRowClick}
        onMouseEnter={e => { setHoveredRowId(task.id); if (!taskDrag) setTooltip({ task, x: e.clientX, y: e.clientY }); }}
        onMouseMove={e => { if (!taskDrag) setTooltip((t: any) => t ? { ...t, x: e.clientX, y: e.clientY } : null); }}
        onMouseLeave={() => { setHoveredRowId(null); setTooltip(null); }}
      >
        {/* Baseline ghost bar — rendered behind the current bar */}
        {showBaseline && !task._hasChildren && (() => {
          const baseline = getTaskBaseline(task, baselineMap);
          if (!baseline) return null;
          const taskStart = displayStart;
          const taskEnd = displayEnd;
          if (baseline.start === taskStart && baseline.end === taskEnd) return null;
          const ghostLeft = px(baseline.start);
          const ghostWidth = spanPx(baseline.start, baseline.end);
          const direction = baseline.start && taskStart && baseline.start < taskStart ? "right"
            : baseline.start && taskStart && baseline.start > taskStart ? "left" : null;
          return <BaselineGhostBar leftPx={ghostLeft} widthPx={ghostWidth} direction={direction} />;
        })()}
        {task._hasChildren ? (
          <SummaryBar phase={row.phase} leftPx={barLeft} widthPx={barWidth} pctComplete={task.percent_complete || 0} />
        ) : (
          <>
            <TaskBar task={task} leftPx={barLeft} widthPx={barWidth} />
            {canDragTaskBar && (
              <div
                title="Drag to move this task's start and finish dates"
                role="button"
                aria-label={`Drag ${sanitizeTaskName(task)} to move start and finish dates`}
                onPointerDown={(event) => startTaskBarDrag(event, task, taskEffS, taskEffE)}
                onClick={(event) => {
                  event.stopPropagation();
                  handleTaskRowClick();
                }}
                style={{
                  position: "absolute",
                  left: dragTargetLeft,
                  width: dragTargetWidth,
                  height: 26,
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: isDraggingTask ? "grabbing" : "grab",
                  zIndex: 9,
                  touchAction: "none",
                  borderRadius: 6,
                  background: isDraggingTask ? GANTT_ROW_HOVER_VAR : "transparent",
                  boxShadow: isDraggingTask ? `0 0 0 1px ${GANTT_GRID_STRONG_VAR} inset` : "none",
                }}
              />
            )}
            {/* Edge resize handles — drag an edge to change the
                task's duration (left = start, right = finish). Sit
                above the move zone (zIndex 10) so an edge grab
                resizes while the bar body still moves. Hidden on
                milestones and bars too narrow to grab safely. */}
            {canDragTaskBar && !isMilestone && barWidth >= 24 && (
              <>
                <div
                  title="Drag to change this task's start date (duration)"
                  role="button"
                  aria-label={`Resize start of ${sanitizeTaskName(task)}`}
                  onPointerDown={(event) => startTaskBarDrag(event, task, taskEffS, taskEffE, "resize-start")}
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    position: "absolute", left: barLeft - 1, width: 9, height: 24,
                    top: "50%", transform: "translateY(-50%)",
                    cursor: "ew-resize", zIndex: 10, touchAction: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <div style={{ width: 2, height: 14, borderRadius: 2, background: "var(--accent)", opacity: (hovered || isDraggingTask) ? 0.85 : 0, transition: "opacity 0.1s" }} />
                </div>
                <div
                  title="Drag to change this task's finish date (duration)"
                  role="button"
                  aria-label={`Resize finish of ${sanitizeTaskName(task)}`}
                  onPointerDown={(event) => startTaskBarDrag(event, task, taskEffS, taskEffE, "resize-end")}
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    position: "absolute", left: barLeft + barWidth - 8, width: 9, height: 24,
                    top: "50%", transform: "translateY(-50%)",
                    cursor: "ew-resize", zIndex: 10, touchAction: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <div style={{ width: 2, height: 14, borderRadius: 2, background: "var(--accent)", opacity: (hovered || isDraggingTask) ? 0.85 : 0, transition: "opacity 0.1s" }} />
                </div>
              </>
            )}
          </>
        )}
        {/* Detailing stage-gate milestones — color-coded
            diamonds (IFA / OFA / BFA / OFS / IFC / Released) overlayed
            on the task bar at each filled date. Purely
            decorative; bar placement comes from the
            derived start/end. Component short-circuits
            for non-Detailing rows. */}
        <StageGateMilestones task={task} px={px} />

        {/* Submittal review bars linked to this WP */}
        {showSubmittals && submittals
          .filter((s: any) => s.is_submittal && s.linked_wp_id === task.id && s.due_date)
          .map((s: any) => {
            const uploadIso = (s.uploaded_date || s.revision_date || task.start_date || "").split("T")[0];
            const dueIso = s.due_date;
            if (!uploadIso || !dueIso) return null;
            return (
              <SubmittalBar key={s.id} submittal={s} leftPx={px(uploadIso)} widthPx={spanPx(uploadIso, dueIso)} />
            );
          })
        }
      </div>
    );
  });

}
