import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Map between UI field names and the actual DB columns on the `resources` table.
// DB schema: name, resource_type, role, capacity, unit, cost_rate, availability, notes, metadata (JSONB)
// We store budget_hours→capacity, hourly_rate→cost_rate, availability_status→availability,
// and keep actual_hours / forecast_hours inside metadata.

function fromEntity(e) {
  const meta = typeof e.metadata === "object" && e.metadata !== null ? e.metadata : {};
  return {
    project_id: e.project_id || "",
    name: e.name || "",
    resource_type: e.resource_type || "Labor",
    role: e.role || "",
    budget_hours: e.capacity ?? "",
    actual_hours: meta.actual_hours ?? "0",
    forecast_hours: meta.forecast_hours ?? "",
    hourly_rate: e.cost_rate ?? "",
    availability_status: e.availability || "Available",
    notes: e.notes || "",
    parent_resource_id: e.parent_resource_id || "",
  };
}

function toEntity(form, projectId) {
  return {
    project_id: form.project_id || projectId,
    name: form.name,
    resource_type: form.resource_type,
    role: form.role,
    capacity: form.budget_hours ? parseFloat(form.budget_hours) : 0,
    unit: "hours",
    cost_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : 0,
    availability: form.availability_status || "Available",
    notes: form.notes,
    parent_resource_id: form.parent_resource_id || null,
    metadata: {
      actual_hours: parseFloat(form.actual_hours) || 0,
      forecast_hours: form.forecast_hours ? parseFloat(form.forecast_hours) : 0,
    },
  };
}

export default function ResourceFormModal({ projectId, editing, onClose, onSave }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState(
    editing ? fromEntity(editing) : {
      project_id: projectId,
      name: "",
      resource_type: "Labor",
      role: "",
      budget_hours: "",
      actual_hours: "0",
      forecast_hours: "",
      hourly_rate: "",
      availability_status: "Available",
      notes: "",
      parent_resource_id: "",
    }
  );

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  // Load resources in the selected project to populate the Parent Crew
  // dropdown. Only show resources that could reasonably be a parent
  // (i.e., have no parent themselves or are of type Crew). Exclude the
  // resource being edited to prevent a self-parent cycle.
  const { data: projectResources = [] } = useQuery({
    queryKey: ["resources", formData.project_id],
    queryFn: () => formData.project_id
      ? base44.entities.Resource.filter({ project_id: formData.project_id })
      : Promise.resolve([]),
    enabled: !!formData.project_id,
    staleTime: 30 * 1000,
  });
  const parentCandidates = projectResources.filter(r =>
    r.id !== editing?.id && !r.parent_resource_id
  );

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Resource.create(toEntity(data, projectId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Resource added");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editing && onSave) {
      // Pass the DB-mapped payload up so the parent doesn't need to remap
      onSave(toEntity(formData, projectId));
    } else {
      mutation.mutate(formData);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: "24px", maxWidth: "600px", width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 20px 0", textTransform: "uppercase", letterSpacing: "0.10em" }}>{editing ? "Edit Resource" : "Add Resource"}</h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Project</label>
            <select value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required>
              <option value="">Select project...</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Name</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Type</label>
              <select value={formData.resource_type} onChange={(e) => setFormData({ ...formData, resource_type: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
                <option value="Labor">Labor</option>
                <option value="Equipment">Equipment</option>
                <option value="Subcontractor">Subcontractor</option>
                <option value="Material">Material</option>
                <option value="Crew">Crew</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Role/Trade</label>
              <input type="text" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Budget Hrs</label>
              <input type="number" value={formData.budget_hours} onChange={(e) => setFormData({ ...formData, budget_hours: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Actual Hrs</label>
              <input type="number" value={formData.actual_hours} onChange={(e) => setFormData({ ...formData, actual_hours: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Hourly Rate</label>
              <input type="number" value={formData.hourly_rate} onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })} placeholder="0.00" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Parent Crew</label>
            <select
              value={formData.parent_resource_id}
              onChange={(e) => setFormData({ ...formData, parent_resource_id: e.target.value })}
              style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}
            >
              <option value="">— None (top-level) —</option>
              {parentCandidates.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.resource_type ? ` · ${p.resource_type}` : ""}
                </option>
              ))}
            </select>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.06em" }}>
              Assign this resource to a crew. Crews roll up member capacities on the scheduling board.
            </div>
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Availability Status</label>
            <select value={formData.availability_status} onChange={(e) => setFormData({ ...formData, availability_status: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
              <option value="Available">Available</option>
              <option value="Allocated">Allocated</option>
              <option value="Over-Allocated">Over-Allocated</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cancel</button>
            <button type="submit" disabled={mutation.isPending} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: mutation.isPending ? "not-allowed" : "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em", opacity: mutation.isPending ? 0.5 : 1 }}>{mutation.isPending ? "Saving..." : editing ? "Save" : "Add Resource"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
