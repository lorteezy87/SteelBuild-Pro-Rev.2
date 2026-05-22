import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFormValidation } from "@/hooks/useFormValidation";

export default function InspectionFormModal({ projectId, inspection = null, onClose, onSave, isSaving = false }) {
  const { fieldErrors, runValidation, clearField } = useFormValidation("inspection");
  const [formData, setFormData] = useState({
    project_id: projectId,
    inspection_type: "Steel Fabrication",
    inspection_date: new Date().toISOString().split("T")[0],
    location: "",
    inspector_name: "",
    inspector_role: "",
    description: "",
    status: "Scheduled",
    findings: "",
    deficiencies_count: "0",
    corrective_actions: "",
    sign_off_status: "Pending",
    notes: "",
  });
  const isEdit = !!inspection;

  useEffect(() => {
    setFormData(
      inspection
        ? {
            ...inspection,
            deficiencies_count: String(inspection.deficiencies_count ?? "0"),
          }
        : {
            project_id: projectId,
            inspection_type: "Steel Fabrication",
            inspection_date: new Date().toISOString().split("T")[0],
            location: "",
            inspector_name: "",
            inspector_role: "",
            description: "",
            status: "Scheduled",
            findings: "",
            deficiencies_count: "0",
            corrective_actions: "",
            sign_off_status: "Pending",
            notes: "",
          }
    );
  }, [inspection, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const handleSubmit = () => {
    if (isSaving) return;
    const validationPayload = {
      ...formData,
      scheduled_date: formData.inspection_date,
    };
    if (!runValidation(validationPayload)) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    const {
      created_date: _cd, updated_date: _ud, created_at: _ca, updated_at: _ua,
      is_deleted: _id, deleted_at: _da,
      ...clean
    } = formData;
    onSave?.({
      ...clean,
      deficiencies_count: parseInt(formData.deficiencies_count, 10) || 0,
    });
  };

  const types = [
    "Steel Fabrication",
    "Welds",
    "Material",
    "Dimensional",
    "Surface Prep",
    "Coating",
    "Installation",
    "Connections",
    "Field Verification",
    "Other",
  ];

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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        className="sbd-card-strong"
        role="dialog"
        aria-modal="true"
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "700px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 20px 0",
            textTransform: "uppercase",
            letterSpacing: "0.10em",
          }}
        >
          {isEdit ? "Edit Inspection" : "New Inspection"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Project */}
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Project</label>
            <select value={formData.project_id} onChange={(e) => { setFormData({ ...formData, project_id: e.target.value }); clearField("project_id"); }} style={{ width: "100%", background: "var(--bg-input)", border: fieldErrors.project_id ? "1px solid var(--status-error)" : "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required>
              <option value="">Select project...</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            {fieldErrors.project_id && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", marginTop: 2, display: "block" }}>{fieldErrors.project_id}</span>}
          </div>

          {/* Type & Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Type</label>
              <select value={formData.inspection_type} onChange={(e) => { setFormData({ ...formData, inspection_type: e.target.value }); clearField("inspection_type"); }} style={{ width: "100%", background: "var(--bg-input)", border: fieldErrors.inspection_type ? "1px solid var(--status-error)" : "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
                {types.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
              {fieldErrors.inspection_type && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", marginTop: 2, display: "block" }}>{fieldErrors.inspection_type}</span>}
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Date</label>
              <input type="date" value={formData.inspection_date} onChange={(e) => setFormData({ ...formData, inspection_date: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required />
            </div>
          </div>

          {/* Location */}
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Location</label>
            <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="e.g., North Bay, 3rd Floor" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Inspector */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Inspector Name</label>
              <input type="text" value={formData.inspector_name} onChange={(e) => setFormData({ ...formData, inspector_name: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Role</label>
              <input type="text" value={formData.inspector_role} onChange={(e) => setFormData({ ...formData, inspector_role: e.target.value })} placeholder="e.g., QA Inspector" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Scope</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }} />
          </div>

          {/* Status & Deficiencies */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Status</label>
              <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
                <option value="Scheduled">Scheduled</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Deficiencies</label>
              <input type="number" value={formData.deficiencies_count} onChange={(e) => setFormData({ ...formData, deficiencies_count: e.target.value })} min="0" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Findings & Corrective Actions */}
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Findings</label>
            <textarea value={formData.findings} onChange={(e) => setFormData({ ...formData, findings: e.target.value })} placeholder="What was found during inspection..." style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }} />
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Corrective Actions</label>
            <textarea value={formData.corrective_actions} onChange={(e) => setFormData({ ...formData, corrective_actions: e.target.value })} placeholder="Required corrective actions..." style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }} />
          </div>

          {/* Sign-off */}
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Sign-off Status</label>
            <select value={formData.sign_off_status} onChange={(e) => setFormData({ ...formData, sign_off_status: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Conditional Approval">Conditional Approval</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={isSaving} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving ? 0.5 : 1 }}>Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={isSaving || !formData.project_id || !formData.inspection_date} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: isSaving || !formData.project_id || !formData.inspection_date ? "not-allowed" : "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving || !formData.project_id || !formData.inspection_date ? 0.5 : 1 }}>{isSaving ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Inspection" : "Create Inspection")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
