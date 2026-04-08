import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ScopeItemFormModal({ projectId, editing, onClose, onSave }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState(editing ? { ...editing } : {
    project_id: projectId,
    item_type: "Scope",
    category: "Structural",
    description: "",
    added_by: "",
    notes: "",
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ScopeItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scope-items"] });
      toast.success("Scope item created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editing && onSave) {
      onSave(formData);
    } else {
      createMut.mutate(formData);
    }
  };

  const saving = createMut.isPending;

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
          {editing ? "Edit Scope Item" : "New Scope Item"}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Project */}
          <div>
            <label
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "var(--text-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Project
            </label>
            <select
              value={formData.project_id}
              onChange={(e) =>
                setFormData({ ...formData, project_id: e.target.value })
              }
              style={{
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
              }}
              required
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type & Category */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Type
              </label>
              <select
                value={formData.item_type}
                onChange={(e) =>
                  setFormData({ ...formData, item_type: e.target.value })
                }
                style={{
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
                }}
              >
                <option value="Scope">Scope</option>
                <option value="Exclusion">Exclusion</option>
                <option value="Clarification">Clarification</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                style={{
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
                }}
              >
                <option value="Structural">Structural</option>
                <option value="Misc Metals">Misc Metals</option>
                <option value="Connections">Connections</option>
                <option value="Coatings">Coatings</option>
                <option value="Erection">Erection</option>
                <option value="Engineering">Engineering</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "var(--text-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              style={{
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
                minHeight: "100px",
                resize: "vertical",
              }}
              required
            />
          </div>

          {/* Added By & Notes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Added By
              </label>
              <input
                type="text"
                value={formData.added_by}
                onChange={(e) =>
                  setFormData({ ...formData, added_by: e.target.value })
                }
                style={{
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
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                style={{
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
                  minHeight: "60px",
                  resize: "vertical",
                }}
              />
            </div>
          </div>

          {/* Actions */}
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
                transition: "background 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? "Saving..." : editing ? "Save" : "Create Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}