import React, { useEffect, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFormValidation } from "@/hooks/useFormValidation";
import { localToday } from "@/utils/dates";
import { Modal, Button } from "@/components/design-system";

const emptyForm = {
  project_id: "",
  incident_type: "Hazard",
  severity: "Medium",
  incident_date: localToday(),
  incident_time: "",
  location: "",
  reported_by: "",
  description: "",
  injuries: "",
  root_cause: "",
  corrective_actions: "",
  responsible_party: "",
  action_due_date: "",
  status: "Open",
  investigation_completed: false,
  safety_trained: false,
  witnesses: "",
  notes: "",
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

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: "9px",
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: "4px",
};

export default function SafetyIncidentFormModal({ projectId, incident = null, onClose, onSave, isSaving = false }) {
  const { fieldErrors, runValidation, clearField } = useFormValidation("safety_incident");
  const [formData, setFormData] = useState({ ...emptyForm, project_id: projectId || "" });
  const isEditing = !!incident;

  useEffect(() => {
    setFormData(incident ? { ...emptyForm, ...incident } : { ...emptyForm, project_id: projectId || "" });
  }, [incident, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const handleSubmit = () => {
    if (isSaving) return;
    if (!runValidation(formData)) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    const {
      created_date: _cd, updated_date: _ud, created_at: _ca, updated_at: _ua,
      is_deleted: _id, deleted_at: _da,
      ...clean
    } = formData;
    onSave?.(clean);
  };

  const types = ["Injury", "Near Miss", "Hazard", "Property Damage", "Environmental", "Behavioral", "Equipment Failure", "Other"];

  return (
    <Modal
      open={true}
      onClose={isSaving ? undefined : onClose}
      title={isEditing ? "Edit Safety Incident" : "Report Safety Incident"}
      width={700}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSaving || !formData.project_id || !formData.incident_date || !formData.description?.trim()}>
            {isSaving ? (isEditing ? "Saving..." : "Reporting...") : (isEditing ? "Save Incident" : "Report Incident")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label style={labelStyle}>Project</label>
          <select value={formData.project_id} onChange={(e) => { setFormData({ ...formData, project_id: e.target.value }); clearField("project_id"); }} style={{ ...inputStyle, borderColor: fieldErrors.project_id ? "var(--status-error)" : undefined }}>
            <option value="">Select project...</option>
            {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          {fieldErrors.project_id && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", marginTop: 2, display: "block" }}>{fieldErrors.project_id}</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Type</label>
            <select value={formData.incident_type} onChange={(e) => setFormData({ ...formData, incident_type: e.target.value })} style={inputStyle}>
              {types.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Severity</label>
            <select value={formData.severity} onChange={(e) => setFormData({ ...formData, severity: e.target.value })} style={inputStyle}>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={formData.incident_date} onChange={(e) => setFormData({ ...formData, incident_date: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Time</label>
            <input type="time" value={formData.incident_time} onChange={(e) => setFormData({ ...formData, incident_time: e.target.value })} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Location</label>
          <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Where did this occur?" style={inputStyle} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Reported By</label>
            <input type="text" value={formData.reported_by} onChange={(e) => setFormData({ ...formData, reported_by: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Witnesses</label>
            <input type="text" value={formData.witnesses} onChange={(e) => setFormData({ ...formData, witnesses: e.target.value })} placeholder="Comma-separated names" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="What happened?" style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
        </div>

        {formData.incident_type === "Injury" && (
          <div>
            <label style={labelStyle}>Injury Details</label>
            <textarea value={formData.injuries} onChange={(e) => setFormData({ ...formData, injuries: e.target.value })} placeholder="Nature and extent of injuries..." style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>
        )}

        <div>
          <label style={labelStyle}>Root Cause</label>
          <textarea value={formData.root_cause} onChange={(e) => setFormData({ ...formData, root_cause: e.target.value })} placeholder="What caused this?" style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
        </div>

        <div>
          <label style={labelStyle}>Corrective Actions</label>
          <textarea value={formData.corrective_actions} onChange={(e) => setFormData({ ...formData, corrective_actions: e.target.value })} placeholder="What will be done to prevent recurrence?" style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Responsible Party</label>
            <input type="text" value={formData.responsible_party} onChange={(e) => setFormData({ ...formData, responsible_party: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input type="date" value={formData.action_due_date} onChange={(e) => setFormData({ ...formData, action_due_date: e.target.value })} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={!!formData.investigation_completed} onChange={(e) => setFormData({ ...formData, investigation_completed: e.target.checked })} style={{ cursor: "pointer" }} />
            Investigation Completed
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={!!formData.safety_trained} onChange={(e) => setFormData({ ...formData, safety_trained: e.target.checked })} style={{ cursor: "pointer" }} />
            Retraining Completed
          </label>
        </div>

        <div>
          <label style={labelStyle}>Notes</label>
          <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
        </div>
      </div>
    </Modal>
  );
}
