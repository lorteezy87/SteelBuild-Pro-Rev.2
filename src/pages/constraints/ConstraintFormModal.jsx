/**
 * ConstraintFormModal — the create/edit dialog. Grid of 11 type-picker
 * tiles at the top, then the usual text/select/date fields, priority
 * tiles with colored dots, and Cancel/Save footer.
 *
 * Validation is minimal (title is required); harder rules live on the
 * mutation / server side.
 */

import React, { useState } from "react";
import { toast } from "sonner";
import {
  CONSTRAINT_TYPES,
  TYPE_COLORS,
  TYPE_ICONS,
  PRIORITY_CONFIG,
  PRIORITIES,
  inputStyle,
  labelStyle,
} from "./constants";

const STATUS_OPTIONS = ["Open", "In Progress", "Resolved", "Closed"];

export default function ConstraintFormModal({ projectId, constraint, wps, onClose, onSave }) {
  const isEdit = !!constraint;
  const [form, setForm] = useState(
    constraint
      ? { ...constraint }
      : {
          title: "",
          constraint_type: "Other",
          description: "",
          project_area: "",
          work_package_id: "",
          assigned_to: "",
          due_date: "",
          status: "Open",
          priority: "High",
          project_id: projectId || "",
        }
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    onSave(form);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 24,
          maxWidth: 580,
          width: "95%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              textTransform: "uppercase",
              letterSpacing: "0.10em",
            }}
          >
            {isEdit ? `Edit · ${constraint.title}` : "New Constraint"}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
          {CONSTRAINT_TYPES.map((type) => {
            const active = form.constraint_type === type;
            const color = TYPE_COLORS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => set("constraint_type", type)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: active ? `${color}18` : "var(--bg-surface-low)",
                  border: `1px solid ${active ? color : "var(--border-default)"}`,
                  borderRadius: "var(--radius-btn)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.1s",
                }}
              >
                <span style={{ fontSize: 14, color: active ? color : "var(--text-muted)", flexShrink: 0 }}>
                  {TYPE_ICONS[type] || "•"}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    color: active ? color : "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    lineHeight: 1.3,
                  }}
                >
                  {type}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              style={inputStyle}
              value={form.title}
              placeholder="Brief description of what is blocking progress"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Details</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              value={form.description}
              placeholder="What is blocking? What is needed to resolve? Any relevant context."
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Project Area / Grid</label>
              <input
                style={inputStyle}
                value={form.project_area}
                onChange={(e) => set("project_area", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Work Package</label>
              <select
                style={inputStyle}
                value={form.work_package_id || ""}
                onChange={(e) => set("work_package_id", e.target.value)}
              >
                <option value="">None</option>
                {wps.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wp_number} · {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Assigned To</label>
              <input
                style={inputStyle}
                value={form.assigned_to}
                onChange={(e) => set("assigned_to", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input
                style={inputStyle}
                type="date"
                value={form.due_date || ""}
                onChange={(e) => set("due_date", e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                style={inputStyle}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <div style={{ display: "flex", gap: 6 }}>
                {PRIORITIES.map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  const active = form.priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set("priority", p)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        background: active ? cfg.bg : "var(--bg-surface-low)",
                        border: `1px solid ${active ? cfg.border : "var(--border-default)"}`,
                        borderRadius: "var(--radius-btn)",
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 700,
                        color: active ? cfg.color : "var(--text-muted)",
                        textTransform: "uppercase",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        transition: "all 0.1s",
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? cfg.dot : "var(--text-muted)" }} />
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "8px 16px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              style={{
                background: "var(--status-error)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "8px 20px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {isEdit ? "Save Changes" : "Log Constraint"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
