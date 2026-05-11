import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";

const IMPACT_TYPES = ["Schedule", "Cost", "Safety"];

const emptyForm = {
  mitigation_number: "",
  title: "",
  issue_source: "Manual",
  source_entity_ref: "",
  source_entity_id: "",
  identified_date: new Date().toISOString().split("T")[0],
  identified_by: "",
  status: "Open",
  cost_exposure: "",
  schedule_exposure_days: "",
  recovery_likelihood: "50",
  root_cause_category: "",
  responsible_party: "",
  impact_types: "",
  is_co_candidate: false,
  notice_sent_date: "",
  notice_sent_to: "",
  notice_method: "",
  internal_notes: "",
};

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

const sectionLabel = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-primary)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  paddingBottom: 6,
  borderBottom: "1px solid var(--divider)",
  marginBottom: 4,
};

export default function MitigationFormModal({
  projectId,
  mitigation = null,
  onClose,
  onSave,
  isSaving = false,
  prefill = null,
}) {
  const [formData, setFormData] = useState({ ...emptyForm, project_id: projectId || "" });
  const isEdit = !!mitigation;

  useEffect(() => {
    if (mitigation) {
      setFormData({
        ...emptyForm,
        ...mitigation,
        cost_exposure: String(mitigation.cost_exposure ?? ""),
        schedule_exposure_days: String(mitigation.schedule_exposure_days ?? ""),
        recovery_likelihood: String(mitigation.recovery_likelihood ?? "50"),
        is_co_candidate: !!mitigation.is_co_candidate,
        root_cause_category: mitigation.root_cause_category || "",
        responsible_party: mitigation.responsible_party || "",
        impact_types: mitigation.impact_types || "",
      });
    } else if (prefill) {
      setFormData({
        ...emptyForm,
        project_id: projectId || "",
        ...prefill,
      });
    } else {
      setFormData({ ...emptyForm, project_id: projectId || "" });
    }
  }, [mitigation, projectId, prefill]);

  // Auto-generate mitigation_number for new records
  useEffect(() => {
    if (isEdit || !projectId || formData.mitigation_number) return;
    let cancelled = false;
    getNextFormattedNumber({
      projectId,
      recordType: "mitigation",
      entityName: "MitigationLog",
      fieldName: "mitigation_number",
      prefix: "MIT-",
      padLength: 3,
    }).then((num) => {
      if (!cancelled) setFormData((prev) => ({ ...prev, mitigation_number: num }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isEdit, projectId, formData.mitigation_number]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const issueSources = [
    "Alert", "RFI", "Constraint", "Delivery", "Drawing",
    "WorkPackage", "ChangeOrder", "Manual",
  ];
  const statuses = ["Open", "Pending PM Review", "Noticed", "Action Taken", "Resolved", "Escalated"];
  const noticeMethods = ["Email", "Certified Letter", "Hand Delivered", "Verbal", "Portal Upload", "Other"];
  const rootCauseCategories = [
    "Design Error", "Site Readiness", "Material Delay", "Coordination Gap",
    "Scope Change", "Weather/Force Majeure", "Subcontractor", "Owner Decision", "Other",
  ];

  const setField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (isSaving) return;
    if (!formData.project_id || !formData.title?.trim()) return;
    const payload = {
      ...formData,
      cost_exposure: formData.cost_exposure ? parseFloat(formData.cost_exposure) : 0,
      schedule_exposure_days: formData.schedule_exposure_days ? parseInt(formData.schedule_exposure_days, 10) : 0,
      recovery_likelihood: formData.recovery_likelihood ? parseInt(formData.recovery_likelihood, 10) : 50,
      is_co_candidate: !!formData.is_co_candidate,
      root_cause_category: formData.root_cause_category || null,
      responsible_party: formData.responsible_party || null,
      impact_types: formData.impact_types || null,
    };
    onSave?.(payload);
  };

  const canSave = formData.project_id && formData.title?.trim() && !isSaving;

  // Expected value preview
  const exposure = parseFloat(formData.cost_exposure) || 0;
  const likelihood = parseInt(formData.recovery_likelihood, 10) || 50;
  const ev = exposure * (likelihood / 100);

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isSaving) onClose(); }}
    >
      <div style={{
        background: "var(--bg-surface-secondary)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)", padding: 24,
        maxWidth: 740, width: "92%", maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
        animation: "fadeIn 0.2s ease",
      }}>
        <h2 style={{
          fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700,
          color: "var(--text-primary)", margin: "0 0 20px 0",
          textTransform: "uppercase", letterSpacing: "0.10em",
        }}>
          {isEdit ? "Edit Mitigation" : "Log Issue"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ─── Section: Identification ─────────────────────────── */}
          <div style={sectionLabel}>Identification</div>

          {/* Project */}
          <div>
            <label style={labelStyle}>Project</label>
            <select
              value={formData.project_id}
              onChange={(e) => setField("project_id", e.target.value)}
              style={inputStyle}
            >
              <option value="">Select project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          {/* MIT # + Title */}
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Mitigation #</label>
              <input
                type="text" value={formData.mitigation_number}
                onChange={(e) => setField("mitigation_number", e.target.value)}
                style={{ ...inputStyle, fontFamily: "var(--font-mono)", color: "var(--accent)" }}
                readOnly={isEdit}
              />
            </div>
            <div>
              <label style={labelStyle}>Title *</label>
              <input
                type="text" value={formData.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Issue title"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Issue Source + Source Ref */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Issue Source</label>
              <select value={formData.issue_source} onChange={(e) => setField("issue_source", e.target.value)} style={inputStyle}>
                {issueSources.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Source Reference (e.g. RFI-012)</label>
              <input type="text" value={formData.source_entity_ref} onChange={(e) => setField("source_entity_ref", e.target.value)} placeholder="RFI-012" style={inputStyle} />
            </div>
          </div>

          {/* Source Entity ID */}
          <div>
            <label style={labelStyle}>Source Record ID (optional)</label>
            <input type="text" value={formData.source_entity_id} onChange={(e) => setField("source_entity_id", e.target.value)} placeholder="UUID of source record" style={inputStyle} />
          </div>

          {/* ─── Section: Classification & Accountability ─────── */}
          <div style={sectionLabel}>Classification &amp; Accountability</div>

          {/* Root Cause + Responsible Party + Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Root Cause Category</label>
              <select
                value={formData.root_cause_category}
                onChange={(e) => setField("root_cause_category", e.target.value)}
                style={inputStyle}
              >
                <option value="">Select...</option>
                {rootCauseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Responsible Party</label>
              <input
                type="text" value={formData.responsible_party}
                onChange={(e) => setField("responsible_party", e.target.value)}
                placeholder="Person or company"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={formData.status} onChange={(e) => setField("status", e.target.value)} style={inputStyle}>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Impact Type Tags */}
          <div>
            <label style={labelStyle}>Impact Type</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {IMPACT_TYPES.map((type) => {
                const active = (formData.impact_types || "").split(",").map(s => s.trim()).filter(Boolean);
                const isActive = active.includes(type);
                const colors = { Schedule: "#0EA5E9", Cost: "#FFB400", Safety: "#FF5C5C" };
                const color = colors[type] || "var(--text-muted)";
                return (
                  <button
                    key={type} type="button"
                    onClick={() => {
                      const tags = active.includes(type)
                        ? active.filter(t => t !== type)
                        : [...active, type];
                      setField("impact_types", tags.join(","));
                    }}
                    style={{
                      background: isActive ? `${color}20` : "var(--bg-surface)",
                      border: `1px solid ${isActive ? `${color}50` : "var(--border-default)"}`,
                      borderRadius: "var(--radius-btn)", padding: "5px 14px",
                      color: isActive ? color : "var(--text-muted)",
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                      cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em",
                      transition: "all 0.15s",
                    }}
                  >
                    {type === "Schedule" ? "\u23F1" : type === "Cost" ? "$" : "\u26A0"} {type}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Identified Date + Identified By */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Identified Date</label>
              <input type="date" value={formData.identified_date} onChange={(e) => setField("identified_date", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Identified By</label>
              <input type="text" value={formData.identified_by} onChange={(e) => setField("identified_by", e.target.value)} placeholder="Name" style={inputStyle} />
            </div>
          </div>

          {/* ─── Section: Financial Exposure ──────────────────── */}
          <div style={sectionLabel}>Financial Exposure</div>

          {/* Exposure + Schedule + Recovery Likelihood + CO Candidate */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>Cost Exposure ($)</label>
              <input type="number" value={formData.cost_exposure} onChange={(e) => setField("cost_exposure", e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Schedule Impact (days)</label>
              <input type="number" value={formData.schedule_exposure_days} onChange={(e) => setField("schedule_exposure_days", e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Recovery Likelihood (%)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range" min="0" max="100" step="5"
                  value={formData.recovery_likelihood || 50}
                  onChange={(e) => setField("recovery_likelihood", e.target.value)}
                  style={{ flex: 1, accentColor: "var(--accent)" }}
                />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)", minWidth: 36, textAlign: "right" }}>
                  {formData.recovery_likelihood || 50}%
                </span>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "8px 0" }}>
              <input
                type="checkbox" checked={formData.is_co_candidate}
                onChange={(e) => setField("is_co_candidate", e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                CO Candidate
              </span>
            </label>
          </div>

          {/* Expected Value Preview */}
          {exposure > 0 && (
            <div style={{
              padding: "8px 14px", borderRadius: "var(--radius-card)",
              background: "rgba(14,165,233,0.06)", border: "1px solid rgba(14,165,233,0.20)",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Expected Recovery:
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--status-info)" }}>
                ${Math.round(ev).toLocaleString()}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                = ${exposure.toLocaleString()} &times; {likelihood}%
              </span>
            </div>
          )}

          {/* ─── Section: Notice / Legal ──────────────────────── */}
          <div style={sectionLabel}>Notice / Legal Compliance</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Notice Sent Date</label>
              <input type="date" value={formData.notice_sent_date} onChange={(e) => setField("notice_sent_date", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Notice Sent To</label>
              <input type="text" value={formData.notice_sent_to} onChange={(e) => setField("notice_sent_to", e.target.value)} placeholder="Recipient" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Notice Method</label>
              <select value={formData.notice_method} onChange={(e) => setField("notice_method", e.target.value)} style={inputStyle}>
                <option value="">Select...</option>
                {noticeMethods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Internal Notes */}
          <div>
            <label style={labelStyle}>Internal Notes</label>
            <textarea
              value={formData.internal_notes}
              onChange={(e) => setField("internal_notes", e.target.value)}
              placeholder="Internal tracking notes (not shared externally)"
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
            />
          </div>

          {/* ─── Actions ──────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button
              type="button" onClick={onClose} disabled={isSaving}
              style={{
                background: "var(--bg-surface)", border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)", padding: "8px 16px",
                color: "var(--text-primary)", fontFamily: "var(--font-mono)",
                fontSize: 10, fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer",
                textTransform: "uppercase", letterSpacing: "0.08em",
                opacity: isSaving ? 0.6 : 1, minHeight: 40,
              }}
            >
              Cancel
            </button>
            <button
              type="button" onClick={handleSave} disabled={!canSave}
              style={{
                background: "var(--accent)", color: "#07090E", border: "none",
                borderRadius: "var(--radius-btn)", padding: "8px 16px",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800,
                cursor: !canSave ? "not-allowed" : "pointer",
                textTransform: "uppercase", letterSpacing: "0.08em",
                opacity: !canSave ? 0.5 : 1, minHeight: 40,
              }}
            >
              {isSaving ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Log Issue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
