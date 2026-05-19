import React, { useEffect, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

const emptyForm = {
  project_id: "",
  test_type: "Material Certificate",
  test_date: new Date().toISOString().split("T")[0],
  material_or_component: "",
  location: "",
  test_lab_or_inspector: "",
  specification: "",
  result: "Pass",
  test_value: "",
  acceptance_criteria: "",
  quantity_tested: "1",
  quantity_passed: "1",
  notes: "",
  status: "Pending",
};

/**
 * Modal for create + edit of a quality_control_records row. Prior
 * version only supported create and had its own inline mutation;
 * the parent (QualityControl.jsx) was already passing `record` and
 * `onSave`, so we now honour those to line up with the
 * Inspections / Safety form pattern.
 */
export default function QCFormModal({
  projectId,
  record = null,        // when provided: edit mode
  onClose,
  onSave,               // parent's save handler — handles create vs update
  isSaving = false,     // parent's mutation pending state
}) {
  const trapRef = useFocusTrap(true);
  const isEditing = !!record;
  const [formData, setFormData] = useState({ ...emptyForm, project_id: projectId || "" });

  useEffect(() => {
    setFormData(
      record
        ? { ...emptyForm, ...record,
            quantity_tested: String(record.quantity_tested ?? "1"),
            quantity_passed: String(record.quantity_passed ?? "1"),
          }
        : { ...emptyForm, project_id: projectId || "" }
    );
  }, [record, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSaving) return;
    // Explicit toasts so the user sees why a save was blocked —
    // matches the Inspections / Safety form pattern.
    if (!formData.project_id)            { toast.error("Select a project first."); return; }
    if (!formData.test_date)             { toast.error("Test date is required.");   return; }
    if (!formData.material_or_component?.trim()) { toast.error("Material / component is required."); return; }
    const {
      created_date: _cd, updated_date: _ud, created_at: _ca, updated_at: _ua,
      is_deleted: _id, deleted_at: _da,
      ...clean
    } = formData;
    onSave?.({
      ...clean,
      quantity_tested: parseFloat(clean.quantity_tested) || 1,
      quantity_passed: parseFloat(clean.quantity_passed) || 1,
    });
  };

  const types = [
    "Material Certificate",
    "Tensile Test",
    "Hardness Test",
    "Impact Test",
    "NDT - Ultrasonic",
    "NDT - Radiography",
    "NDT - Magnetic Particle",
    "Weld Test",
    "Coating Test",
    "Connection Test",
    "Dimensional Inspection",
    "Torque Verification",
    "Other",
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={trapRef} style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: "24px", maxWidth: "700px", width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 20px 0", textTransform: "uppercase", letterSpacing: "0.10em" }}>{isEditing ? "Edit Test Record" : "Add Test Record"}</h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Project</label>
            <select value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required>
              <option value="">Select project...</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Test Type</label>
              <select value={formData.test_type} onChange={(e) => setFormData({ ...formData, test_type: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
                {types.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Test Date</label>
              <input type="date" value={formData.test_date} onChange={(e) => setFormData({ ...formData, test_date: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required />
            </div>
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Material/Component</label>
            <input type="text" value={formData.material_or_component} onChange={(e) => setFormData({ ...formData, material_or_component: e.target.value })} placeholder="What was tested?" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Location</label>
              <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Grid/Area" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Lab/Inspector</label>
              <input type="text" value={formData.test_lab_or_inspector} onChange={(e) => setFormData({ ...formData, test_lab_or_inspector: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Specification</label>
              <input type="text" value={formData.specification} onChange={(e) => setFormData({ ...formData, specification: e.target.value })} placeholder="e.g. ASTM A992" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Result</label>
              <select value={formData.result} onChange={(e) => setFormData({ ...formData, result: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
                <option value="Conditional Pass">Conditional Pass</option>
                <option value="Inconclusive">Inconclusive</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Test Value</label>
              <input type="text" value={formData.test_value} onChange={(e) => setFormData({ ...formData, test_value: e.target.value })} placeholder="e.g. 50,000 PSI" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Acceptance Criteria</label>
              <input type="text" value={formData.acceptance_criteria} onChange={(e) => setFormData({ ...formData, acceptance_criteria: e.target.value })} placeholder="Required value" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Qty Tested</label>
              <input type="number" value={formData.quantity_tested} onChange={(e) => setFormData({ ...formData, quantity_tested: e.target.value })} min="1" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Qty Passed</label>
              <input type="number" value={formData.quantity_passed} onChange={(e) => setFormData({ ...formData, quantity_passed: e.target.value })} min="0" style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving ? 0.5 : 1 }}>{isSaving ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save Changes" : "Add Record")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}