import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ContactFormModal({ projectId, contact = null, onClose, onSave }) {
  const qc = useQueryClient();
  const isEdit = !!contact;

  const emptyForm = {
    project_id: projectId || "",
    first_name: "",
    last_name: "",
    company: "",
    role: "",
    contact_type: "GC",
    email: "",
    phone: "",
    notes: "",
  };

  const [formData, setFormData] = useState(contact ? { ...emptyForm, ...contact } : emptyForm);

  useEffect(() => {
    setFormData(contact ? { ...emptyForm, ...contact } : { ...emptyForm, project_id: projectId || "" });
  }, [contact, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Contact.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!formData.project_id) {
      toast.error("Select a project");
      return;
    }
    if (!formData.first_name.trim()) {
      toast.error("First name is required");
      return;
    }

    if (isEdit) {
      onSave && onSave(formData);
      onClose();
    } else {
      createMut.mutate(formData);
    }
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

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 24,
          maxWidth: 560,
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
            }}
          >
            {isEdit ? `Edit — ${contact.first_name} ${contact.last_name}` : "New Contact"}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Project */}
          <div>
            <label style={labelStyle}>Project</label>
            <select
              value={formData.project_id}
              onChange={(e) => handleChange("project_id", e.target.value)}
              style={inputStyle}
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                value={formData.first_name}
                onChange={(e) => handleChange("first_name", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                value={formData.last_name}
                onChange={(e) => handleChange("last_name", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Company / Role */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Company</label>
              <input
                value={formData.company}
                onChange={(e) => handleChange("company", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <input
                value={formData.role}
                onChange={(e) => handleChange("role", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Contact type */}
          <div>
            <label style={labelStyle}>Contact Type</label>
            <select
              value={formData.contact_type}
              onChange={(e) => handleChange("contact_type", e.target.value)}
              style={inputStyle}
            >
              {["Owner", "GC", "Engineer", "Subcontractor", "Supplier", "Inspector", "Internal"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Email / Phone */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                style={inputStyle}
                type="email"
              />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input
                value={formData.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
            />
          </div>

          {/* Footer */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "8px 16px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createMut.isPending}
              style={{
                background: "var(--accent)",
                color: "var(--accent-text)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "8px 20px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: createMut.isPending ? "not-allowed" : "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: createMut.isPending ? 0.5 : 1,
              }}
            >
              {createMut.isPending ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create Contact")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
