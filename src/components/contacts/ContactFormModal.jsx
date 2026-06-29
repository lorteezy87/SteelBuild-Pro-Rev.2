import React, { useEffect, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Modal, Button } from "@/components/design-system";

const INITIAL_FORM = {
  first_name: "",
  last_name: "",
  company: "",
  role: "",
  contact_type: "GC",
  email: "",
  phone: "",
  notes: "",
};

export default function ContactFormModal({ projectId, contact = null, onClose, onSave }) {
  const qc = useQueryClient();
  const isEdit = !!contact;

  const [formData, setFormData] = useState(() => {
    if (!contact) return { ...INITIAL_FORM, project_id: projectId || "" };
    const { projects, id, created_at, updated_at, created_date, updated_date, is_deleted, deleted_at, ...fields } = contact;
    return { ...INITIAL_FORM, project_id: projectId || "", ...fields };
  });

  useEffect(() => {
    if (!contact) {
      setFormData({ ...INITIAL_FORM, project_id: projectId || "" });
      return;
    }
    const { projects, id, created_at, updated_at, created_date, updated_date, is_deleted, deleted_at, ...fields } = contact;
    setFormData({ ...INITIAL_FORM, project_id: projectId || "", ...fields });
  }, [contact, projectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const createMut = useMutation({
    mutationFn: (data) => entities.Contact.create(data),
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
    <Modal
      open={true}
      onClose={onClose}
      title={isEdit ? `Edit — ${contact.first_name} ${contact.last_name}` : "New Contact"}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create Contact")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Project — locked to the active project when one is in context, so a
            contact added from a project's Contacts page always saves to (and
            shows up in) THAT project. The free picker only appears in
            portfolio mode (no active project) where the list isn't scoped. */}
        <div>
          <label style={labelStyle}>Project</label>
          <select
            value={formData.project_id}
            onChange={(e) => handleChange("project_id", e.target.value)}
            style={projectId ? { ...inputStyle, opacity: 0.7, cursor: "not-allowed" } : inputStyle}
            disabled={!!projectId}
          >
            <option value="">Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {projectId ? (
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              Adding to the current project. Switch projects to add a contact elsewhere.
            </div>
          ) : null}
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
      </div>
    </Modal>
  );
}
