/**
 * RiskFormModal — create / edit a row in the `risks` table.
 *
 * Shared by every Risk report (list, dashboard, matrix, top-10) so the
 * single source of truth for "what fields does a risk have" lives in one
 * place. Probability + impact are 1..5 button selectors with a live
 * preview tile that mirrors the DB-side severity band (Critical / High /
 * Medium / Low) the same way the schema's GENERATED column does.
 *
 * Severity colour bands match what each report renders in its table /
 * matrix / cards so a user dragging probability up to 5 sees the same
 * red they'll see on the row after they save.
 */

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Modal, Button } from "@/components/design-system";
import {
  RISK_CATEGORIES,
  RISK_STATUSES,
  computeScore,
  computeSeverity,
  severityColor,
} from "@/pages/reports/risks/severity";

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyForm = (projectId) => ({
  project_id: projectId || "",
  title: "",
  description: "",
  category: "Schedule",
  probability: 3,
  impact: 3,
  status: "Open",
  mitigation_plan: "",
  contingency_plan: "",
  owner: "",
  identified_date: todayISO(),
  target_close_date: "",
  trigger_event: "",
});

function ScaleSelector({ value, onChange, label }) {
  return (
    <div>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              style={{
                flex: 1,
                padding: "8px 0",
                background: active ? "var(--accent)" : "var(--bg-input)",
                color: active ? "var(--bg-base)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "var(--radius-input)",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                transition: "background 0.12s, color 0.12s, border-color 0.12s",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function RiskFormModal({
  open,
  onClose,
  initial,            // existing row to edit, or null for create
  projectId,          // required for create
  onSaved,
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm(projectId));
  const [error, setError] = useState(null);
  const isEdit = Boolean(initial?.id);

  // Project list — used to lock or display the project on the row.
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        project_id:        initial.project_id || projectId || "",
        title:             initial.title || "",
        description:       initial.description || "",
        category:          initial.category || "Schedule",
        probability:       Number(initial.probability) || 3,
        impact:            Number(initial.impact) || 3,
        status:            initial.status || "Open",
        mitigation_plan:   initial.mitigation_plan || "",
        contingency_plan:  initial.contingency_plan || "",
        owner:             initial.owner || "",
        identified_date:   initial.identified_date || todayISO(),
        target_close_date: initial.target_close_date || "",
        trigger_event:     initial.trigger_event || "",
      });
    } else {
      setForm(emptyForm(projectId));
    }
    setError(null);
  }, [open, initial, projectId]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const score = computeScore(form.probability, form.impact);
  const severity = computeSeverity(form.probability, form.impact);
  const sevColor = severityColor(severity);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required.");
      if (!form.project_id) throw new Error("A project must be selected.");
      const payload = {
        ...form,
        title: form.title.trim(),
        target_close_date: form.target_close_date || null,
      };
      if (isEdit) {
        return base44.entities.Risk.update(initial.id, payload);
      }
      return base44.entities.Risk.create(payload);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["risks"] });
      qc.invalidateQueries({ queryKey: ["risks-by-project", form.project_id] });
      onSaved?.(saved);
      onClose?.();
    },
    onError: (err) => setError(err?.message || "Failed to save risk."),
  });

  const handleDelete = useMutation({
    mutationFn: async () => {
      if (!isEdit) return null;
      return base44.entities.Risk.delete(initial.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risks"] });
      qc.invalidateQueries({ queryKey: ["risks-by-project", form.project_id] });
      onClose?.();
    },
    onError: (err) => setError(err?.message || "Failed to delete risk."),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="RISK REGISTER"
      title={isEdit ? "Edit Risk" : "New Risk"}
      width={760}
      footer={
        <>
          {isEdit && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this risk? This can be undone via the database.")) {
                  handleDelete.mutate();
                }
              }}
              disabled={handleDelete.isPending}
              style={{
                marginRight: "auto",
                background: "transparent",
                border: "1px solid var(--border-default)",
                color: "var(--status-error)",
                padding: "8px 12px",
                borderRadius: "var(--radius-btn)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              {handleDelete.isPending ? "Deleting…" : "Delete"}
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create risk"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && (
          <div
            style={{
              background: "var(--status-error-muted, rgba(220,60,60,0.12))",
              border: "1px solid var(--status-error)",
              color: "var(--status-error)",
              padding: "8px 12px",
              borderRadius: "var(--radius-input)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label style={labelStyle}>Title *</label>
          <input
            value={form.title}
            onChange={(e) => set("title")(e.target.value)}
            placeholder="Short, plain-English risk statement"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set("description")(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Project *</label>
            <select
              value={form.project_id}
              onChange={(e) => set("project_id")(e.target.value)}
              disabled={isEdit}
              style={inputStyle}
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number ? `${p.project_number} — ` : ""}{p.name || "Untitled"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select
              value={form.category}
              onChange={(e) => set("category")(e.target.value)}
              style={inputStyle}
            >
              {RISK_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ScaleSelector
            label="Probability (1-5)"
            value={form.probability}
            onChange={set("probability")}
          />
          <ScaleSelector
            label="Impact (1-5)"
            value={form.impact}
            onChange={set("impact")}
          />
        </div>

        {/* Live severity preview */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 14px",
            background: "var(--bg-surface-low)",
            border: `1px solid ${sevColor}`,
            borderLeft: `4px solid ${sevColor}`,
            borderRadius: "var(--radius-card)",
          }}
        >
          <div>
            <div style={{ ...labelStyle, marginBottom: 2 }}>Score</div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1,
              }}
            >
              {score}
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>/ 25</span>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--divider)" }} />
          <div>
            <div style={{ ...labelStyle, marginBottom: 2 }}>Severity</div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                fontWeight: 700,
                color: sevColor,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {severity}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-muted)",
              maxWidth: 240,
              textAlign: "right",
            }}
          >
            Severity bands match the DB stored column. Critical ≥ 20, High ≥ 12, Medium ≥ 6, Low &lt; 6.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={form.status}
              onChange={(e) => set("status")(e.target.value)}
              style={inputStyle}
            >
              {RISK_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Owner</label>
            <input
              value={form.owner}
              onChange={(e) => set("owner")(e.target.value)}
              placeholder="Free text or contact name"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Identified Date</label>
            <input
              type="date"
              value={form.identified_date || ""}
              onChange={(e) => set("identified_date")(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Target Close Date</label>
            <input
              type="date"
              value={form.target_close_date || ""}
              onChange={(e) => set("target_close_date")(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Trigger Event</label>
          <input
            value={form.trigger_event}
            onChange={(e) => set("trigger_event")(e.target.value)}
            placeholder="What event would tip this from a risk into reality?"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Mitigation Plan</label>
          <textarea
            value={form.mitigation_plan}
            onChange={(e) => set("mitigation_plan")(e.target.value)}
            rows={3}
            placeholder="Steps the team is taking to reduce the probability or impact."
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div>
          <label style={labelStyle}>Contingency Plan</label>
          <textarea
            value={form.contingency_plan}
            onChange={(e) => set("contingency_plan")(e.target.value)}
            rows={3}
            placeholder="What we'll do if this risk materialises despite mitigation."
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
      </div>
    </Modal>
  );
}
