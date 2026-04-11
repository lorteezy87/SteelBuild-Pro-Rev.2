import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function PhotoUploadModal({ projectId, onClose }) {
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    project_id: projectId,
    category: "Progress",
    title: "",
    description: "",
    location: "",
    taken_date: new Date().toISOString().split("T")[0],
    file: null,
    fileName: "",
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (data) => {
      if (!data.file) throw new Error("No file selected");
      const fileData = await base44.integrations.Core.UploadFile({ file: data.file });
      return base44.entities.Photo.create({
        project_id: data.project_id,
        category: data.category,
        title: data.title,
        description: data.description,
        location: data.location,
        taken_date: data.taken_date,
        file_url: fileData.file_url,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      toast.success("Photo uploaded");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({
        ...formData,
        file,
        fileName: file.name,
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    uploadMutation.mutate(formData);
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
          Upload Photo
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

          {/* File Upload */}
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
              Photo
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
              required
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100%",
                background: "var(--bg-input)",
                border: "2px dashed var(--border-default)",
                borderRadius: "8px",
                padding: "24px",
                color: formData.file ? "var(--accent)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.background = "var(--accent-muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-default)";
                e.currentTarget.style.background = "var(--bg-input)";
              }}
            >
              {formData.file ? (
                <>📷 {formData.fileName}</>
              ) : (
                <>Click to select photo</>
              )}
            </button>
          </div>

          {/* Category & Date */}
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
                <option value="Progress">Progress</option>
                <option value="Safety">Safety</option>
                <option value="Issue">Issue</option>
                <option value="Delivery">Delivery</option>
                <option value="Punchlist">Punchlist</option>
                <option value="Other">Other</option>
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
                Date Taken
              </label>
              <input
                type="date"
                value={formData.taken_date}
                onChange={(e) =>
                  setFormData({ ...formData, taken_date: e.target.value })
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
              />
            </div>
          </div>

          {/* Title */}
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
              Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
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

          {/* Description & Location */}
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
                  minHeight: "60px",
                  resize: "vertical",
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
                Location/Area
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                placeholder="e.g., North Wing, Floor 3"
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
              disabled={uploadMutation.isPending || !formData.file}
              style={{
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 700,
                cursor: uploadMutation.isPending || !formData.file ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: uploadMutation.isPending || !formData.file ? 0.5 : 1,
              }}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}