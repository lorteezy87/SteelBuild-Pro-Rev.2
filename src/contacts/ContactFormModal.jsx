import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ContactFormModal({ projectId, onClose }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState({
    project_id: projectId,
    first_name: "",
    last_name: "",
    company: "",
    role: "",
    contact_type: "Supplier",
    email: "",
    phone: "",
    notes: "",
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "600px",
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
          New Contact
        </h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Project */}
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Project</label>
            <select value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required>
              <option value="">Select project...</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>

          {/* Name */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>First Name</label>
              <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Last Name</label>
              <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} required />
            </div>
          </div>

          {/* Company & Role */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Company</label>
              <input type="text" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Role/Title</label>
              <input type="text" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Type */}
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Type</label>
            <select value={formData.contact_type} onChange={(e) => setFormData({ ...formData, contact_type: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }}>
              <option value="Owner">Owner</option>
              <option value="GC">General Contractor</option>
              <option value="Engineer">Engineer</option>
              <option value="Subcontractor">Subcontractor</option>
              <option value="Supplier">Supplier</option>
              <option value="Inspector">Inspector</option>
              <option value="Internal">Internal</option>
            </select>
          </div>

          {/* Email & Phone */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Email</label>
              <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Phone</label>
              <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: "60px", resize: "vertical" }} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "8px 16px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cancel</button>
            <button type="submit" disabled={mutation.isPending} style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, cursor: mutation.isPending ? "not-allowed" : "pointer", transition: "background 0.15s", textTransform: "uppercase", letterSpacing: "0.08em", opacity: mutation.isPending ? 0.5 : 1 }}>{mutation.isPending ? "Creating..." : "Create Contact"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}