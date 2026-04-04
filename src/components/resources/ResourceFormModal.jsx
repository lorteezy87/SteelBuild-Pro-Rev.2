import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const EMPTY_FORM = {
  project_id: "",
  name: "",
  resource_type: "Labor",
  role: "",
  budget_hours: "",
  actual_hours: "0",
  forecast_hours: "",
  hourly_rate: "",
  availability_status: "Available",
  notes: "",
};

const fieldLabel = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

function normalizePayload(data) {
  return {
    ...data,
    budget_hours: data.budget_hours ? parseFloat(data.budget_hours) : 0,
    actual_hours: data.actual_hours ? parseFloat(data.actual_hours) : 0,
    forecast_hours: data.forecast_hours ? parseFloat(data.forecast_hours) : 0,
    hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : 0,
  };
}

export default function ResourceFormModal({ projectId, onClose, resource = null, onSaved }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState(EMPTY_FORM);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  useEffect(() => {
    if (resource) {
      setFormData({
        ...EMPTY_FORM,
        ...resource,
        budget_hours: String(resource.budget_hours ?? ""),
        actual_hours: String(resource.actual_hours ?? 0),
        forecast_hours: String(resource.forecast_hours ?? ""),
        hourly_rate: String(resource.hourly_rate ?? ""),
      });
      return;
    }

    setFormData({
      ...EMPTY_FORM,
      project_id: projectId || "",
    });
  }, [projectId, resource]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === formData.project_id),
    [formData.project_id, projects]
  );

  const mutation = useMutation({
    mutationFn: async (data) => {
      const payload = normalizePayload(data);
      if (resource?.id) {
        return base44.entities.Resource.update(resource.id, payload);
      }
      return base44.entities.Resource.create(payload);
    },
    onSuccess: async (saved) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["resources"] }),
        qc.invalidateQueries({ queryKey: ["work-packages"] }),
      ]);
      toast.success(resource ? "Resource updated" : "Resource added");
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => toast.error(err?.message || "Failed to save resource"),
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "680px",
          width: "92%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
          <div>
            <h2
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "14px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 6px 0",
                textTransform: "uppercase",
                letterSpacing: "0.10em",
              }}
            >
              {resource ? "Edit Resource" : "Add Resource"}
            </h2>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>
              {selectedProject?.name || "Assign this resource to a project and keep its hours visible to the PM."}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={fieldLabel}>Project</label>
            <select
              value={formData.project_id}
              onChange={(event) => setFormData({ ...formData, project_id: event.target.value })}
              style={inputStyle}
              required
            >
              <option value="">Select project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={fieldLabel}>Type</label>
              <select
                value={formData.resource_type}
                onChange={(event) => setFormData({ ...formData, resource_type: event.target.value })}
                style={inputStyle}
              >
                <option value="Labor">Labor</option>
                <option value="Equipment">Equipment</option>
                <option value="Subcontractor">Subcontractor</option>
                <option value="Material">Material</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Role / Trade</label>
              <input
                type="text"
                value={formData.role}
                onChange={(event) => setFormData({ ...formData, role: event.target.value })}
                style={inputStyle}
                placeholder="Foreman, crane, detailing support..."
              />
            </div>
            <div>
              <label style={fieldLabel}>Availability Status</label>
              <select
                value={formData.availability_status}
                onChange={(event) => setFormData({ ...formData, availability_status: event.target.value })}
                style={inputStyle}
              >
                <option value="Available">Available</option>
                <option value="Allocated">Allocated</option>
                <option value="Over-Allocated">Over-Allocated</option>
                <option value="On Leave">On Leave</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={fieldLabel}>Budget Hrs</label>
              <input
                type="number"
                value={formData.budget_hours}
                onChange={(event) => setFormData({ ...formData, budget_hours: event.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabel}>Actual Hrs</label>
              <input
                type="number"
                value={formData.actual_hours}
                onChange={(event) => setFormData({ ...formData, actual_hours: event.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabel}>Forecast Hrs</label>
              <input
                type="number"
                value={formData.forecast_hours}
                onChange={(event) => setFormData({ ...formData, forecast_hours: event.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabel}>Hourly Rate</label>
              <input
                type="number"
                value={formData.hourly_rate}
                onChange={(event) => setFormData({ ...formData, hourly_rate: event.target.value })}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={fieldLabel}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
              style={{ ...inputStyle, minHeight: "74px", resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "8px 16px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                cursor: mutation.isPending ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: mutation.isPending ? 0.6 : 1,
              }}
            >
              {mutation.isPending ? "Saving..." : resource ? "Save Resource" : "Add Resource"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
