import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip, Upload, X as XIcon } from "lucide-react";

export default function ScopeItemFormModal({ projectId, editing, onClose, onSave }) {
  const qc = useQueryClient();
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState(editing ? { ...editing } : {
    project_id: projectId,
    item_type: "Scope",
    category: "Structural",
    description: "",
    added_by: "",
    notes: "",
    file_url: "",
    storage_path: "",
    file_name: "",
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
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

  const handleAttachFile = async (file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast.error("Attachment must be a PDF.");
      return;
    }
    if (file.size > 32 * 1024 * 1024) {
      toast.error("PDF exceeds 32 MB limit.");
      return;
    }
    setUploading(true);
    try {
      const { file_url, path } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, file_url, storage_path: path || "", file_name: file.name }));
      toast.success("PDF attached");
    } catch (err) {
      toast.error("Upload failed: " + (err?.message || "Unknown error"));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = () => {
    setFormData(prev => ({ ...prev, file_url: "", storage_path: "", file_name: "" }));
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

          {/* PDF Attachment */}
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
              PDF Attachment
            </label>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
            }}>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                style={{ display: "none" }}
                onChange={(e) => handleAttachFile(e.target.files?.[0])}
              />
              {formData.file_url ? (
                <>
                  <Paperclip size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <a
                    href={formData.file_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1, minWidth: 0,
                      color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12,
                      textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {formData.file_name || "Attached PDF"}
                  </a>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                    style={{
                      background: "transparent", border: "1px solid var(--border-default)",
                      borderRadius: 4, padding: "4px 10px",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
                    }}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={removeAttachment}
                    aria-label="Remove attachment"
                    style={{
                      background: "transparent", border: "none",
                      color: "var(--status-error)", cursor: "pointer", display: "flex", alignItems: "center", padding: 2,
                    }}
                  >
                    <XIcon size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                    style={{
                      background: "transparent", border: "1px solid var(--border-default)",
                      borderRadius: 4, padding: "6px 12px",
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <Upload size={12} strokeWidth={2.5} />
                    {uploading ? "Uploading…" : "Attach PDF"}
                  </button>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                    Bid scope page, contract excerpt, clarification letter, etc. (32 MB max)
                  </span>
                </>
              )}
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