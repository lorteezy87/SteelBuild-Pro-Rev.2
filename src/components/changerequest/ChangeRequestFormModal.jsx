import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const emptyForm = {
  project_id: "",
  title: "",
  description: "",
  requested_by: "",
  request_date: new Date().toISOString().split("T")[0],
  reason: "Other",
  affected_areas: "",
  estimated_cost_impact: "0",
  estimated_schedule_impact_days: "0",
  priority: "Medium",
  status: "Submitted",
  scope_impact: "",
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

export default function ChangeRequestFormModal({
  projectId,
  changeRequest = null,
  onClose,
  onSave,
  isSaving = false,
}) {
  const [formData, setFormData] = useState({ ...emptyForm, project_id: projectId || "" });
  const isEdit = !!changeRequest;

  useEffect(() => {
    setFormData(
      changeRequest
        ? {
            ...emptyForm,
            ...changeRequest,
            estimated_cost_impact: String(changeRequest.estimated_cost_impact ?? "0"),
            estimated_schedule_impact_days: String(changeRequest.estimated_schedule_impact_days ?? "0"),
          }
        : { ...emptyForm, project_id: projectId || "" }
    );
  }, [changeRequest, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const reasons = [
    "Owner Request",
    "Design Change",
    "Differing Site Conditions",
    "Constructability Issue",
    "Scope Gap",
    "Error/Omission",
    "Safety/Compliance",
    "Value Engineering",
    "Schedule Optimization",
    "Other",
  ];

  const setField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (isSaving) return;
    if (!formData.project_id || !formData.title?.trim() || !formData.description?.trim()) return;
    onSave?.({
      ...formData,
      estimated_cost_impact: parseFloat(formData.estimated_cost_impact) || 0,
      estimated_schedule_impact_days: parseFloat(formData.estimated_schedule_impact_days) || 0,
    });
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
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 24,
          maxWidth: 700,
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 20px 0",
            textTransform: "uppercase",
            letterSpacing: "0.10em",
          }}
        >
          {isEdit ? "Edit Change Request" : "Create Request"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Project</label>
            <select
              value={formData.project_id}
              onChange={(e) => setField("project_id", e.target.value)}
              style={inputStyle}
            >
              <option value="">Select project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Change request title"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Detailed description of the change"
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Reason</label>
              <select value={formData.reason} onChange={(e) => setField("reason", e.target.value)} style={inputStyle}>
                {reasons.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={formData.priority} onChange={(e) => setField("priority", e.target.value)} style={inputStyle}>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Estimated Cost Impact ($)</label>
              <input
                type="number"
                value={formData.estimated_cost_impact}
                onChange={(e) => setField("estimated_cost_impact", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Schedule Impact (Days)</label>
              <input
                type="number"
                value={formData.estimated_schedule_impact_days}
                onChange={(e) => setField("estimated_schedule_impact_days", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Affected Areas</label>
            <input
              type="text"
              value={formData.affected_areas}
              onChange={(e) => setField("affected_areas", e.target.value)}
              placeholder="Areas/systems affected by change"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Scope Impact</label>
            <textarea
              value={formData.scope_impact}
              onChange={(e) => setField("scope_impact", e.target.value)}
              placeholder="Impact on project scope"
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "8px 16px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !formData.project_id || !formData.title?.trim() || !formData.description?.trim()}
              style={{
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "8px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: isSaving || !formData.project_id || !formData.title?.trim() || !formData.description?.trim() ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: isSaving || !formData.project_id || !formData.title?.trim() || !formData.description?.trim() ? 0.5 : 1,
              }}
            >
              {isSaving ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create Request")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
