import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getNextFormattedNumber } from "../shared/numberSequencing";

const iStyle = {
  width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)",
  borderRadius: 2, padding: "8px 12px", color: "var(--text-primary)",
  fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box",
};
const labelStyle = {
  fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
  letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 4,
};
const SectionLabel = ({ children }) => (
  <div style={{ gridColumn: "span 3", borderLeft: "3px solid var(--accent)", paddingLeft: 8, marginTop: 16, marginBottom: 8 }}>
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase", fontWeight: 700 }}>{children}</span>
  </div>
);
const Field = ({ label, span = 1, children }) => (
  <div style={{ gridColumn: `span ${span}` }}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

export default function RFIFormModal({ projectId, onClose, rfi = null }) {
  const qc = useQueryClient();

  const empty = {
    project_id: projectId || "",
    title: "", description: "", question: "", answer: "",
    drawing_reference: "", spec_section: "",
    priority: "Medium", status: "Open",
    submitted_by: "", submitted_date: new Date().toISOString().split("T")[0],
    date_required: "", date_answered: "",
    assigned_to: "", answered_by: "",
    ball_in_court: "Contractor",
    cost_impact: false, cost_impact_amount: "",
    schedule_impact: false, schedule_impact_days: "",
    distribution_list: "",
  };

  const [formData, setFormData] = useState(rfi ? { ...empty, ...rfi } : empty);

  useEffect(() => {
    setFormData(rfi ? { ...empty, ...rfi } : { ...empty, project_id: projectId || "" });
  }, [rfi, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (data) => {
      // Coerce empty-string numeric fields to null so Postgres doesn't reject them
      const clean = {
        ...data,
        cost_impact_amount:   data.cost_impact_amount   === "" ? null : data.cost_impact_amount   !== undefined ? Number(data.cost_impact_amount)   : null,
        schedule_impact_days: data.schedule_impact_days === "" ? null : data.schedule_impact_days !== undefined ? Number(data.schedule_impact_days) : null,
      };
      if (rfi) {
        return base44.entities.RFI.update(rfi.id, clean);
      }
      const rfiNumber = clean.project_id
        ? await getNextFormattedNumber({
            projectId: data.project_id,
            recordType: "RFI",
            entityName: "RFI",
            fieldName: "rfi_number",
            prefix: "RFI #",
          })
        : `RFI #${String(Date.now()).slice(-3)}`;
      return base44.entities.RFI.create({
        ...clean,
        rfi_number: rfiNumber,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfis"] });
      toast.success(rfi ? "RFI updated" : "RFI created");
      onClose();
    },
    onError: (err) =>
      toast.error("Failed to save RFI: " + (err?.message || "Unknown error")),
  });

  const quickStatusMut = useMutation({
    mutationFn: (status) => base44.entities.RFI.update(rfi.id, { status }),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ["rfis"] });
      toast.success(`Status set to ${status}`);
      setFormData((f) => ({ ...f, status }));
    },
    onError: () => toast.error("Status update failed"),
  });

  const set = (k, v) => setFormData((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title?.trim()) return toast.error("Title is required");
    mutation.mutate(formData);
  };

  const statusBtnStyle = (s) => ({
    background: formData.status === s ? "var(--accent)" : "var(--bg-surface)",
    color: formData.status === s ? "white" : "var(--text-muted)",
    border: `1px solid ${formData.status === s ? "var(--accent)" : "var(--border-default)"}`,
    borderRadius: 6, padding: "4px 10px", fontFamily: "var(--font-mono)",
    fontSize: 8, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
    textTransform: "uppercase", letterSpacing: "0.06em",
  });

  const title = rfi
    ? `${rfi.rfi_number || "RFI"} — ${(rfi.title || "").slice(0, 30)}${(rfi.title || "").length > 30 ? "…" : ""}`
    : "New RFI";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", maxWidth: 780, width: "96%", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 24px 12px", borderBottom: "1px solid var(--divider)", background: "var(--bg-sidebar)", flexShrink: 0 }}>
          <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.10em" }}>{title}</h2>
          {rfi && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["Open", "Under Review", "Answered", "Closed"].map((s) => (
                <button key={s} style={statusBtnStyle(s)} onClick={() => quickStatusMut.mutate(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <form id="rfi-form" onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", padding: "0 24px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

            {/* Section 1 — Identity */}
            <SectionLabel>Identity</SectionLabel>
            <Field label="Project" span={3}>
              <select style={iStyle} value={formData.project_id} onChange={(e) => set("project_id", e.target.value)}>
                <option value="">Select project...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Title *" span={3}>
              <input style={iStyle} value={formData.title} onChange={(e) => set("title", e.target.value)} required />
            </Field>

            {/* Section 2 — Details */}
            <SectionLabel>Details</SectionLabel>
            <Field label="RFI #">
              <input
                style={{ ...iStyle, opacity: 0.7, cursor: "not-allowed" }}
                value={rfi ? (rfi.rfi_number || "—") : "Auto-assigned on save"}
                disabled
                readOnly
              />
            </Field>
            <Field label="Drawing Reference" span={2}>
              <input style={iStyle} value={formData.drawing_reference} onChange={(e) => set("drawing_reference", e.target.value)} placeholder="e.g. Sheet A-2.3" />
            </Field>
            <Field label="Spec Section" span={1}>
              <input style={iStyle} value={formData.spec_section} onChange={(e) => set("spec_section", e.target.value)} placeholder="e.g. 05120" />
            </Field>
            <Field label="Description" span={3}>
              <textarea style={{ ...iStyle, minHeight: 70, resize: "vertical" }} value={formData.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label="Question / Issue" span={3}>
              <textarea style={{ ...iStyle, minHeight: 70, resize: "vertical" }} value={formData.question} onChange={(e) => set("question", e.target.value)} />
            </Field>

            {/* Section 3 — Routing */}
            <SectionLabel>Routing</SectionLabel>
            <Field label="Priority">
              <select style={iStyle} value={formData.priority} onChange={(e) => set("priority", e.target.value)}>
                {["Critical", "High", "Medium", "Low"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select style={iStyle} value={formData.status} onChange={(e) => set("status", e.target.value)}>
                {["Open", "Under Review", "Answered", "Closed"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Ball in Court">
              <select style={iStyle} value={formData.ball_in_court} onChange={(e) => set("ball_in_court", e.target.value)}>
                {["Contractor", "GC", "Engineer", "Architect", "Owner"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Submitted By">
              <input style={iStyle} value={formData.submitted_by} onChange={(e) => set("submitted_by", e.target.value)} />
            </Field>
            <Field label="Submitted Date">
              <input type="date" style={iStyle} value={formData.submitted_date} onChange={(e) => set("submitted_date", e.target.value)} />
            </Field>
            <Field label="Date Required">
              <input type="date" style={iStyle} value={formData.date_required} onChange={(e) => set("date_required", e.target.value)} />
            </Field>

            {/* Section 4 — Response */}
            <SectionLabel>Response</SectionLabel>
            <Field label="Assigned To">
              <input style={iStyle} value={formData.assigned_to} onChange={(e) => set("assigned_to", e.target.value)} />
            </Field>
            <Field label="Distribution List" span={2}>
              <input style={iStyle} value={formData.distribution_list} onChange={(e) => set("distribution_list", e.target.value)} placeholder="Names or emails, comma-separated" />
            </Field>
            <Field label="Response / Answer" span={3}>
              <textarea style={{ ...iStyle, minHeight: 70, resize: "vertical" }} value={formData.answer} onChange={(e) => set("answer", e.target.value)} />
            </Field>
            <Field label="Answered By">
              <input style={iStyle} value={formData.answered_by} onChange={(e) => set("answered_by", e.target.value)} />
            </Field>
            <Field label="Date Answered" span={2}>
              <input type="date" style={iStyle} value={formData.date_answered} onChange={(e) => set("date_answered", e.target.value)} />
            </Field>

            {/* Section 5 — Impact */}
            <SectionLabel>Impact</SectionLabel>
            <div style={{ gridColumn: "span 3", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={formData.cost_impact} onChange={(e) => set("cost_impact", e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer" }} />
                  Cost Impact
                </label>
                {formData.cost_impact && (
                  <input
                    type="number"
                    placeholder="Amount $"
                    style={{ ...iStyle, width: 160 }}
                    value={formData.cost_impact_amount}
                    onChange={(e) => set("cost_impact_amount", e.target.value)}
                  />
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={formData.schedule_impact} onChange={(e) => set("schedule_impact", e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer" }} />
                  Schedule Impact
                </label>
                {formData.schedule_impact && (
                  <input
                    type="number"
                    placeholder="Days"
                    style={{ ...iStyle, width: 120 }}
                    value={formData.schedule_impact_days}
                    onChange={(e) => set("schedule_impact_days", e.target.value)}
                  />
                )}
              </div>
            </div>

          </div>

        </form>
        {/* Footer */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 24px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface)", flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Cancel
          </button>
          <button type="submit" form="rfi-form" disabled={mutation.isPending} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: 4, padding: "8px 20px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: mutation.isPending ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.08em", opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving..." : rfi ? "Update RFI" : "Submit RFI"}
          </button>
        </div>
      </div>
    </div>
  );
}
