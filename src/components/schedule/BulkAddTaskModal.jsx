import React, { useState } from "react";
import { PHASES } from "../../utils/phases";

const TASK_TYPES = ["Task", "Fabrication", "Delivery", "Install", "Submittal", "RFI", "Milestone"];
const STATUSES   = ["Not Started", "In Progress", "Complete", "On Hold", "Cancelled"];
const PRIORITIES = ["Low", "Normal", "High", "Critical"];

const today = () => new Date().toISOString().split("T")[0];

function emptyRow(id) {
  return {
    _id:        id,
    task_name:  "",
    task_type:  "Task",
    phase:      "Fabrication",
    start_date: today(),
    end_date:   today(),
    status:     "Not Started",
    priority:   "Normal",
  };
}

const CELL = {
  padding: "0 6px",
  height: "100%",
  display: "flex",
  alignItems: "center",
};

const INPUT_STYLE = {
  width: "100%",
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  padding: "0 2px",
};

const SELECT_STYLE = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 3,
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  padding: "2px 4px",
  cursor: "pointer",
  outline: "none",
};

export default function BulkAddTaskModal({ open, onClose, onSubmit, projectName, isSaving }) {
  const [rows, setRows] = useState(() => [emptyRow(1), emptyRow(2), emptyRow(3)]);
  const [nextId, setNextId] = useState(4);
  const [errors, setErrors] = useState({});

  const updateRow = (id, key, val) => {
    setRows((prev) => prev.map((r) => r._id === id ? { ...r, [key]: val } : r));
    setErrors((prev) => { const e = { ...prev }; delete e[id]; return e; });
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(nextId)]);
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
    const payload = filled.map(({ _id, ...rest }) => rest);
    onSubmit(payload);
  };

  const handleClose = () => {
    setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
    setNextId(4);
    setErrors({});
    onClose();
  };

  if (!open) return null;

  const COL_WIDTHS = "32px 1fr 110px 120px 100px 100px 90px 80px 44px";

  return (
    <>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 998 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(1060px, 96vw)", maxHeight: "88vh",
        background: "var(--bg-surface)", border: "1px solid rgba(232,101,10,0.30)",
        borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.80)", zIndex: 999,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
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
          gap: 0, padding: "0 16px",
          height: 28, background: "rgba(0,0,0,0.25)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0, alignItems: "center",
        }}>
          <div />
          {["TASK NAME", "TYPE", "PHASE", "START DATE", "END DATE", "STATUS", "PRIORITY", ""].map((h) => (
            <div key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "rgba(160,175,210,0.35)", letterSpacing: "0.12em", padding: "0 6px" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows — scrollable */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {rows.map((row, idx) => {
            const hasErr = !!errors[row._id];
            return (
              <div
                key={row._id}
                style={{
                  display: "grid", gridTemplateColumns: COL_WIDTHS,
                  alignItems: "center", height: 36,
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: hasErr ? "rgba(255,59,59,0.06)" : idx % 2 === 1 ? "rgba(255,255,255,0.01)" : "transparent",
                  border: hasErr ? "1px solid rgba(255,59,59,0.25)" : undefined,
                  padding: "0 16px",
                }}
              >
                {/* Row number */}
                <div style={{ ...CELL, justifyContent: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(160,175,210,0.25)" }}>{idx + 1}</span>
                </div>

                {/* Task name */}
                <div style={{ ...CELL, borderRight: "1px solid rgba(255,255,255,0.04)", position: "relative" }}>
                  <input
                    value={row.task_name}
                    onChange={(e) => updateRow(row._id, "task_name", e.target.value)}
                    onFocus={(e) => e.target.style.background = "rgba(232,101,10,0.05)"}
                    onBlur={(e) => e.target.style.background = "transparent"}
                    placeholder={hasErr ? "Required" : "Task name…"}
                    style={{ ...INPUT_STYLE, color: hasErr && !row.task_name ? "#FF7A7A" : "var(--text-primary)" }}
                  />
                </div>

                {/* Task type */}
                <div style={{ ...CELL, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                  <select value={row.task_type} onChange={(e) => updateRow(row._id, "task_type", e.target.value)} style={SELECT_STYLE}>
                    {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Phase */}
                <div style={{ ...CELL, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                  <select value={row.phase} onChange={(e) => updateRow(row._id, "phase", e.target.value)} style={SELECT_STYLE}>
                    {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {/* Start date */}
                <div style={{ ...CELL, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                  <input
                    type="date"
                    value={row.start_date}
                    onChange={(e) => updateRow(row._id, "start_date", e.target.value)}
                    style={{ ...INPUT_STYLE, fontSize: 11, colorScheme: "dark" }}
                  />
                </div>

                {/* End date */}
                <div style={{ ...CELL, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                  <input
                    type="date"
                    value={row.end_date}
                    onChange={(e) => updateRow(row._id, "end_date", e.target.value)}
                    style={{ ...INPUT_STYLE, fontSize: 11, colorScheme: "dark" }}
                  />
                </div>

                {/* Status */}
                <div style={{ ...CELL, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                  <select value={row.status} onChange={(e) => updateRow(row._id, "status", e.target.value)} style={SELECT_STYLE}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Priority */}
                <div style={{ ...CELL, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
                  <select value={row.priority} onChange={(e) => updateRow(row._id, "priority", e.target.value)} style={SELECT_STYLE}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {/* Actions */}
                <div style={{ ...CELL, gap: 4, justifyContent: "center" }}>
                  <button
                    onClick={() => duplicateRow(row._id)}
                    title="Duplicate row"
                    style={{ background: "none", border: "none", color: "rgba(160,175,210,0.30)", cursor: "pointer", fontSize: 11, padding: 2, lineHeight: 1 }}
                  >⧉</button>
                  <button
                    onClick={() => removeRow(row._id)}
                    title="Remove row"
                    style={{ background: "none", border: "none", color: "rgba(255,80,80,0.35)", cursor: "pointer", fontSize: 13, padding: 2, lineHeight: 1 }}
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
              color: "rgba(232,101,10,0.50)", fontFamily: "var(--font-mono)", fontSize: 10,
              letterSpacing: "0.08em", fontWeight: 700,
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "rgba(232,101,10,0.50)"}
          >
            + ADD ROW
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 24px", borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(0,0,0,0.20)", flexShrink: 0,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            {rows.filter((r) => r.task_name.trim()).length} of {rows.length} rows ready to save
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleClose}
              style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 6, padding: "7px 18px", color: "var(--text-muted)",
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
                background: isSaving ? "rgba(232,101,10,0.5)" : "var(--accent)",
                border: "none", borderRadius: 6, padding: "7px 22px",
                color: "#fff", fontFamily: "var(--font-mono)", fontSize: 10,
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
