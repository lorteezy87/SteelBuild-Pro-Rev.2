import React, { useState, useEffect, useRef, useCallback } from "react";
import { PHASES } from "../../utils/phases";
import DateOrTbdInput from "./DateOrTbdInput";
import { addDays, daysBetween, emptyBulkTaskRow } from "./bulkAddTaskHelpers";
import {
  TASK_TYPES,
  BULK_STATUSES as STATUSES,
  BULK_PRIORITIES as PRIORITIES,
  CELL,
  INPUT_STYLE,
  SELECT_STYLE,
  COL_WIDTHS,
  GRID_MIN_WIDTH,
  ROW_BG,
  ROW_ALT_BG,
  ROW_ERROR_BG,
  PANEL_BG,
} from "./bulkAddTaskStyleHelpers";

export default function BulkAddTaskModal({ open, onClose, onSubmit, projectName, isSaving, existingTasks }) {
  const [rows, setRows] = useState(() => [emptyBulkTaskRow(1), emptyBulkTaskRow(2), emptyBulkTaskRow(3)]);
  const [nextId, setNextId] = useState(4);
  const [errors, setErrors] = useState({});
  const gridRef = useRef(null);

  // Reset form state every time the modal opens so stale rows from a
  // previous bulk-add session are never carried over.
  useEffect(() => {
    if (open) {
      setRows([emptyBulkTaskRow(1), emptyBulkTaskRow(2), emptyBulkTaskRow(3)]);
      setNextId(4);
      setErrors({});
    }
  }, [open]);

  const updateRow = (id, key, val) => {
    setRows((prev) => prev.map((r) => {
      if (r._id !== id) return r;
      const next = { ...r, [key]: val };

      // ── Duration ↔ date coupling ──────────────────────────────
      if (key === "duration") {
        // Duration edited → recompute end_date from start + duration
        const days = parseInt(val, 10);
        if (Number.isFinite(days) && days >= 0 && next.start_date) {
          next.end_date = addDays(next.start_date, days);
        }
        next.duration = Number.isFinite(days) && days >= 0 ? days : val;
      } else if (key === "start_date") {
        // Start moved → if duration is set, recompute end_date
        const dur = parseInt(next.duration, 10);
        if (Number.isFinite(dur) && dur >= 0 && val) {
          next.end_date = addDays(val, dur);
        }
      } else if (key === "end_date") {
        // End date edited directly → recompute duration from the two dates
        const diff = daysBetween(next.start_date, val);
        if (diff != null && diff >= 0) next.duration = diff;
      }

      return next;
    }));
    setErrors((prev) => { const e = { ...prev }; delete e[id]; return e; });
  };

  // ── Keyboard navigation ─────────────────────────────────────────
  // Enter        → same column, next row (auto-adds row if on last)
  // Shift+Enter  → same column, previous row
  // Works on every input and select in the grid.
  const handleCellKeyDown = useCallback((e) => {
    if (e.key !== "Enter") return;
    const el = e.target;
    const row = el.getAttribute("data-row");
    const col = el.getAttribute("data-col");
    if (row == null || col == null) return;

    e.preventDefault();
    e.stopPropagation();

    const currentRow = parseInt(row, 10);
    const targetRow = e.shiftKey ? currentRow - 1 : currentRow + 1;

    // If going past the last row, add one first
    if (!e.shiftKey && targetRow >= rows.length) {
      setRows((prev) => [...prev, emptyBulkTaskRow(nextId)]);
      setNextId((n) => n + 1);
      // Focus after React re-renders the new row
      requestAnimationFrame(() => {
        const next = gridRef.current?.querySelector(`[data-row="${targetRow}"][data-col="${col}"]`);
        next?.focus();
      });
      return;
    }

    if (targetRow < 0) return;

    const next = gridRef.current?.querySelector(`[data-row="${targetRow}"][data-col="${col}"]`);
    next?.focus();
  }, [rows.length, nextId]);

  const addRow = () => {
    setRows((prev) => [...prev, emptyBulkTaskRow(nextId)]);
    setNextId((n) => n + 1);
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r._id !== id));
  };

  const duplicateRow = (id) => {
    const src = rows.find((r) => r._id === id);
    if (!src) return;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r._id === id);
      const newRow = { ...src, _id: nextId, task_name: src.task_name ? src.task_name + " (copy)" : "" };
      const next = [...prev];
      next.splice(idx + 1, 0, newRow);
      return next;
    });
    setNextId((n) => n + 1);
  };

  const handleSave = () => {
    const errs = {};
    rows.forEach((r) => {
      if (!r.task_name.trim()) errs[r._id] = "Name required";
    });
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const filled = rows.filter((r) => r.task_name.trim());
    if (!filled.length) return;
    const payload = filled.map(({ _id, ...rest }) => ({
      ...rest,
      start_date: rest.start_date || null,
      end_date: rest.end_date || null,
      duration: Number.isFinite(parseInt(rest.duration, 10)) ? parseInt(rest.duration, 10) : null,
      resource_names: rest.resource_names || null,
      parent_task_id: rest.parent_task_id || null,
    }));
    onSubmit(payload);
  };

  const handleClose = () => {
    setRows([emptyBulkTaskRow(1), emptyBulkTaskRow(2), emptyBulkTaskRow(3)]);
    setNextId(4);
    setErrors({});
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--sbd-gantt-bg) 74%, transparent)", backdropFilter: "blur(6px)", zIndex: 998 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(1720px, 97vw)", maxHeight: "88vh",
        background: PANEL_BG, border: "1px solid var(--accent-border)",
        borderRadius: 2, boxShadow: "var(--shadow-lg)", zIndex: 999,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--bg-surface-high)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.04em" }}>
                BULK ADD TASKS
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 3, letterSpacing: "0.10em" }}>
                {projectName ? `PROJECT: ${projectName.toUpperCase()}` : "NO PROJECT SELECTED"} · {rows.length} ROWS
              </div>
            </div>
            <button onClick={handleClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: "grid", gridTemplateColumns: COL_WIDTHS,
          minWidth: GRID_MIN_WIDTH,
          gap: 0, padding: "0 16px",
          height: 32, background: "var(--bg-surface-low)",
          borderBottom: "1px solid var(--divider)",
          flexShrink: 0, alignItems: "center",
        }}>
          <div />
          {["TASK NAME", "TYPE", "PHASE", "START DATE", "DAYS", "END DATE", "STATUS", "PRIORITY", "RESOURCES", "PARENT TASK", ""].map((h, headerIndex) => (
            <div key={`${h || "actions"}-${headerIndex}`} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", padding: "0 7px", whiteSpace: "nowrap" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows — scrollable */}
        <div ref={gridRef} style={{ flex: 1, overflow: "auto" }}>
          {rows.map((row, idx) => {
            const hasErr = !!errors[row._id];
            return (
              <div
                key={row._id}
                style={{
                  display: "grid", gridTemplateColumns: COL_WIDTHS,
                  minWidth: GRID_MIN_WIDTH,
                  alignItems: "center", height: 46,
                  borderBottom: "1px solid var(--hover-bg)",
                  background: hasErr ? ROW_ERROR_BG : idx % 2 === 1 ? ROW_ALT_BG : ROW_BG,
                  border: hasErr ? "1px solid var(--danger-border)" : undefined,
                  padding: "0 16px",
                }}
              >
                {/* Row number */}
                <div style={{ ...CELL, justifyContent: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{idx + 1}</span>
                </div>

                {/* Task name */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)", position: "relative" }}>
                  <input
                    value={row.task_name}
                    onChange={(e) => updateRow(row._id, "task_name", e.target.value)}
                    onFocus={(e) => e.target.style.background = "var(--bg-surface-high)"}
                    onBlur={(e) => e.target.style.background = INPUT_STYLE.background}
                    onKeyDown={handleCellKeyDown}
                    data-row={idx}
                    data-col="task_name"
                    placeholder={hasErr ? "Required" : "Task name…"}
                    style={{ ...INPUT_STYLE, color: hasErr && !row.task_name ? "var(--status-error)" : "var(--text-primary)" }}
                  />
                </div>

                {/* Task type */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)" }}>
                  <select value={row.task_type} onChange={(e) => updateRow(row._id, "task_type", e.target.value)} onKeyDown={handleCellKeyDown} data-row={idx} data-col="task_type" style={SELECT_STYLE}>
                    {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Phase */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)" }}>
                  <select value={row.phase} onChange={(e) => updateRow(row._id, "phase", e.target.value)} onKeyDown={handleCellKeyDown} data-row={idx} data-col="phase" style={SELECT_STYLE}>
                    {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {/* Start date */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)" }}>
                  <DateOrTbdInput
                    compact
                    value={row.start_date}
                    onChange={(v) => updateRow(row._id, "start_date", v)}
                    onKeyDown={handleCellKeyDown}
                    data-row={idx}
                    data-col="start_date"
                    inputStyle={{ ...INPUT_STYLE, fontSize: 12, padding: "7px 6px" }}
                  />
                </div>

                {/* Duration (days) */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)" }}>
                  <input
                    type="number"
                    min="0"
                    value={row.duration ?? ""}
                    onChange={(e) => updateRow(row._id, "duration", e.target.value)}
                    onKeyDown={handleCellKeyDown}
                    data-row={idx}
                    data-col="duration"
                    placeholder="0"
                    style={{ ...INPUT_STYLE, fontSize: 11, textAlign: "center", padding: "7px 4px", fontFamily: "var(--font-mono)" }}
                  />
                </div>

                {/* End date */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)" }}>
                  <DateOrTbdInput
                    compact
                    value={row.end_date}
                    onChange={(v) => updateRow(row._id, "end_date", v)}
                    onKeyDown={handleCellKeyDown}
                    data-row={idx}
                    data-col="end_date"
                    inputStyle={{ ...INPUT_STYLE, fontSize: 12, padding: "7px 6px" }}
                  />
                </div>

                {/* Status */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)" }}>
                  <select value={row.status} onChange={(e) => updateRow(row._id, "status", e.target.value)} onKeyDown={handleCellKeyDown} data-row={idx} data-col="status" style={SELECT_STYLE}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Priority */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)" }}>
                  <select value={row.priority} onChange={(e) => updateRow(row._id, "priority", e.target.value)} onKeyDown={handleCellKeyDown} data-row={idx} data-col="priority" style={SELECT_STYLE}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {/* Resources */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)" }}>
                  <input
                    value={row.resource_names}
                    onChange={(e) => updateRow(row._id, "resource_names", e.target.value)}
                    onKeyDown={handleCellKeyDown}
                    data-row={idx}
                    data-col="resources"
                    placeholder="e.g. Fab A, John"
                    style={{ ...INPUT_STYLE, fontSize: 10 }}
                  />
                </div>

                {/* Parent Task */}
                <div style={{ ...CELL, borderRight: "1px solid var(--hover-bg)" }}>
                  <select
                    value={row.parent_task_id || ""}
                    onChange={(e) => updateRow(row._id, "parent_task_id", e.target.value || null)}
                    onKeyDown={handleCellKeyDown}
                    data-row={idx}
                    data-col="parent_task"
                    style={SELECT_STYLE}
                  >
                    <option value="">— None —</option>
                    {(existingTasks || []).map(t => (
                      <option key={t.id} value={t.id}>{t.wbs_code ? `${t.wbs_code} — ` : ""}{t.task_name}</option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div style={{ ...CELL, gap: 4, justifyContent: "center" }}>
                  <button
                    onClick={() => duplicateRow(row._id)}
                    title="Duplicate row"
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, padding: 2, lineHeight: 1 }}
                  >⧉</button>
                  <button
                    onClick={() => removeRow(row._id)}
                    title="Remove row"
                    style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13, padding: 2, lineHeight: 1 }}
                  >✕</button>
                </div>
              </div>
            );
          })}

          {/* Add row button */}
          <div
            onClick={addRow}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 24px", cursor: "pointer",
              color: "color-mix(in srgb, var(--accent) 50%, transparent)", fontFamily: "var(--font-mono)", fontSize: 10,
              letterSpacing: "0.08em", fontWeight: 700,
              borderBottom: "1px solid var(--hover-bg)",
              background: "var(--bg-surface-low)",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "color-mix(in srgb, var(--accent) 50%, transparent)"}
          >
            + ADD ROW
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 24px", borderTop: "1px solid var(--bg-surface-high)",
          background: "var(--bg-surface-low)", flexShrink: 0,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            {rows.filter((r) => r.task_name.trim()).length} of {rows.length} rows ready to save
            <span style={{ marginLeft: 12, opacity: 0.6 }}>ENTER ↓ · SHIFT+ENTER ↑</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleClose}
              style={{
                background: "transparent", border: "1px solid var(--border-default)",
                borderRadius: 2, padding: "7px 18px", color: "var(--text-muted)",
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, cursor: "pointer",
                letterSpacing: "0.09em", textTransform: "uppercase",
              }}
            >
              CANCEL
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                background: isSaving ? "color-mix(in srgb, var(--accent) 50%, transparent)" : "var(--accent)",
                border: "none", borderRadius: 2, padding: "7px 22px",
                color: "var(--on-accent)", fontFamily: "var(--font-mono)", fontSize: 10,
                fontWeight: 800, cursor: isSaving ? "not-allowed" : "pointer",
                letterSpacing: "0.09em", textTransform: "uppercase",
                transition: "background 0.15s",
              }}
            >
              {isSaving ? "SAVING…" : `SAVE ${rows.filter((r) => r.task_name.trim()).length} TASKS`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
