import React, { useEffect, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const emptyForm = {
  project_id: "",
  warranty_type: "Material",
  component_description: "",
  vendor_name: "",
  vendor_contact: "",
  vendor_phone: "",
  vendor_email: "",
  warranty_term_years: "1",
  coverage_percentage: "100",
  start_date: new Date().toISOString().split("T")[0],
  expiration_date: "",
  exclusions: "",
  is_active: true,
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

export default function WarrantyFormModal({ projectId, warranty = null, onClose, onSave, isSaving = false }) {
  const trapRef = useFocusTrap(true);
  const [formData, setFormData] = useState({ ...emptyForm, project_id: projectId || "" });
  const isEditing = !!warranty;

  useEffect(() => {
    setFormData(
      warranty
        ? {
            ...emptyForm,
            ...warranty,
            warranty_term_years: String(warranty.warranty_term_years ?? "1"),
            coverage_percentage: String(warranty.coverage_percentage ?? "100"),
          }
        : { ...emptyForm, project_id: projectId || "" }
    );
  }, [warranty, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!formData.start_date || !formData.warranty_term_years) return;
    const start = new Date(formData.start_date);
    const years = parseInt(formData.warranty_term_years) || 1;
    const expiry = new Date(start);
    expiry.setFullYear(expiry.getFullYear() + years);
    const computed = expiry.toISOString().split("T")[0];
    if (formData.expiration_date !== computed) {
      setFormData((prev) => ({ ...prev, expiration_date: computed }));
    }
  }, [formData.start_date, formData.warranty_term_years, formData.expiration_date]);

  const handleSubmit = () => {
    if (isSaving || !formData.project_id || !formData.component_description?.trim() || !formData.vendor_name?.trim()) return;
    onSave?.({
      ...formData,
      warranty_term_years: parseFloat(formData.warranty_term_years) || 1,
      coverage_percentage: parseFloat(formData.coverage_percentage) || 100,
    });
  };

  const types = ["Material", "Structural Steel", "Connections", "Coating", "Welds", "Installation", "Equipment", "Other"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget && !isSaving) onClose(); }}>
      <div ref={trapRef} style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: "16px", padding: "24px", maxWidth: "700px", width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 20px 0", textTransform: "uppercase", letterSpacing: "0.10em" }}>{isEditing ? "Edit Warranty" : "Add Warranty"}</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelStyle}>Project</label>
            <select value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} style={inputStyle}>
              <option value="">Select project...</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={formData.warranty_type} onChange={(e) => setFormData({ ...formData, warranty_type: e.target.value })} style={inputStyle}>
                {types.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Coverage %</label>
              <input type="number" value={formData.coverage_percentage} onChange={(e) => setFormData({ ...formData, coverage_percentage: e.target.value })} min="0" max="100" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Component Description</label>
            <textarea value={formData.component_description} onChange={(e) => setFormData({ ...formData, component_description: e.target.value })} placeholder="What does this warranty cover?" style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Vendor Name</label>
              <input type="text" value={formData.vendor_name} onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Contact</label>
              <input type="text" value={formData.vendor_contact} onChange={(e) => setFormData({ ...formData, vendor_contact: e.target.value })} placeholder="Contact person" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input type="tel" value={formData.vendor_phone} onChange={(e) => setFormData({ ...formData, vendor_phone: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={formData.vendor_email} onChange={(e) => setFormData({ ...formData, vendor_email: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Term (Years)</label>
              <input type="number" value={formData.warranty_term_years} onChange={(e) => setFormData({ ...formData, warranty_term_years: e.target.value })} min="1" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Expiration Date</label>
            <input type="date" value={formData.expiration_date} readOnly style={{ ...inputStyle, color: "var(--text-muted)" }} />
          </div>

          <div>
            <label style={labelStyle}>Exclusions</label>
            <textarea value={formData.exclusions} onChange={(e) => setFormData({ ...formData, exclusions: e.target.value })} placeholder="What is not covered?" style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }} />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={!!formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} style={{ cursor: "pointer" }} />
            Active Warranty
          </label>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={isSaving} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving ? 0.5 : 1 }}>Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={isSaving || !formData.project_id || !formData.component_description?.trim() || !formData.vendor_name?.trim()} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: isSaving || !formData.project_id || !formData.component_description?.trim() || !formData.vendor_name?.trim() ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "0.08em", opacity: isSaving || !formData.project_id || !formData.component_description?.trim() || !formData.vendor_name?.trim() ? 0.5 : 1 }}>{isSaving ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save Warranty" : "Add Warranty")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
