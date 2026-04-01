import React, { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function UploadModal({ projectId, onClose }) {
  const [files, setFiles] = useState([]);
  const [metadata, setMetadata] = useState({});
  const fileInputRef = useRef(null);
  const qc = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload) => {
      const created = [];
      for (const file of filesToUpload) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        const meta = metadata[file.name] || {};
        const doc = await base44.entities.Document.create({
          project_id: projectId,
          projectId,
          display_name: meta.displayName || file.name,
          displayName: meta.displayName || file.name,
          description: meta.description || "",
          file_name: file.name,
          fileName: file.name,
          file_url,
          fileUrl: file_url,
          file_type: meta.fileType || "other",
          fileType: meta.fileType || "other",
          file_size_kb: Math.round(file.size / 1024),
          fileSizeKb: Math.round(file.size / 1024),
          mime_type: file.type,
          mimeType: file.type,
          category: meta.category || "Other",
          discipline: meta.discipline || "Other",
          status: "Draft",
          revision_number: meta.revisionNumber || "0",
          revisionNumber: meta.revisionNumber || "0",
          revision_date: new Date().toISOString().split("T")[0],
          revisionDate: new Date().toISOString().split("T")[0],
          tags: meta.tags || [],
          uploaded_by: "Current User",
          uploadedBy: "Current User",
          uploaded_date: new Date().toISOString(),
          uploadedDate: new Date().toISOString()
        });
        created.push(doc);
      }
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", projectId] });
      toast.success(`${files.length} document${files.length !== 1 ? "s" : ""} uploaded`);
          onClose();
    },
    onError: (err) => {
      toast.error("Upload failed: " + (err?.message || "Unknown error"));
    }
  });

  const handleFilesAdded = (newFiles) => {
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  };

  const handleRemoveFile = (fileName) => {
    setFiles((prev) => prev.filter((f) => f.name !== fileName));
    setMetadata((prev) => {
      const updated = { ...prev };
      delete updated[fileName];
      return updated;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateMetadata = (fileName, key, value) => {
    setMetadata((prev) => ({
      ...prev,
      [fileName]: { ...prev[fileName], [key]: value }
    }));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleFilesAdded(e.dataTransfer.files);
  };

  return (
    <>
      {/* Hidden file input — always mounted */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => handleFilesAdded(e.target.files)}
        style={{ display: "none" }}
      />
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.70)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3000
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface-low)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderTop: "2px solid var(--accent-border)",
          borderRadius: 12,
          width: "90%",
          maxWidth: 600,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.75)"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              UPLOAD DOCUMENTS
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              Project ID: {projectId}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "rgba(220,225,240,0.60)",
              cursor: "pointer",
              fontSize: 20
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {/* Drop zone */}
          {files.length === 0 ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed var(--accent-border)",
                borderRadius: 8,
                padding: 32,
                textAlign: "center",
                background: "var(--accent-muted)",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>↑</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>
                Drop files here or click to browse
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(160,175,210,0.50)" }}>
                PDF · DWG · IFC · GLTF · XLSX · DOCX · PNG · JPG · ZIP
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  padding: "6px 12px",
                  background: "var(--accent-muted)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent)",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                BROWSE FILES
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {files.map((file) => {
                const meta = metadata[file.name] || {};
                return (
                  <div
                    key={file.name}
                    style={{
                      background: "var(--bg-surface-mid)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      padding: 12
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                          📄 {file.name}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(160,175,210,0.50)" }}>
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(file.name)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "rgba(220,225,240,0.60)",
                          cursor: "pointer",
                          fontSize: 16
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Display Name"
                        value={meta.displayName || ""}
                        onChange={(e) => updateMetadata(file.name, "displayName", e.target.value)}
                        style={{
                          padding: "6px 8px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "var(--text-primary)",
                          borderRadius: 4,
                          fontFamily: "var(--font-body)",
                          fontSize: 11
                        }}
                      />
                      <select
                        value={meta.category || ""}
                        onChange={(e) => updateMetadata(file.name, "category", e.target.value)}
                        style={{
                          padding: "6px 8px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "var(--text-primary)",
                          borderRadius: 4,
                          fontFamily: "var(--font-body)",
                          fontSize: 11
                        }}
                      >
                        <option value="">Category</option>
                        <option value="Blueprint">Blueprint</option>
                        <option value="Shop Drawing">Shop Drawing</option>
                        <option value="IFC Model">IFC Model</option>
                        <option value="Photo">Photo</option>
                        <option value="Other">Other</option>
                      </select>
                      <select
                        value={meta.discipline || ""}
                        onChange={(e) => updateMetadata(file.name, "discipline", e.target.value)}
                        style={{
                          padding: "6px 8px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "var(--text-primary)",
                          borderRadius: 4,
                          fontFamily: "var(--font-body)",
                          fontSize: 11
                        }}
                      >
                        <option value="">Discipline</option>
                        <option value="Structural">Structural</option>
                        <option value="Arch">Arch</option>
                        <option value="MEP">MEP</option>
                        <option value="Civil">Civil</option>
                        <option value="Misc Metals">Misc Metals</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Drawing # (optional)"
                        value={meta.drawingNumber || ""}
                        onChange={(e) => updateMetadata(file.name, "drawingNumber", e.target.value)}
                        style={{
                          padding: "6px 8px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "var(--text-primary)",
                          borderRadius: 4,
                          fontFamily: "var(--font-body)",
                          fontSize: 11
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 16,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            gap: 8,
            justifyContent: "flex-end"
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(220,225,240,0.70)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            CANCEL
          </button>
          <button
            onClick={() => {
              if (!uploadMutation.isPending && files.length > 0) {
                uploadMutation.mutate(files);
              }
            }}
            disabled={files.length === 0 || uploadMutation.isPending}
            style={{
              padding: "8px 16px",
              background: uploadMutation.isPending ? "var(--bg-surface-high)" : "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              color: uploadMutation.isPending ? "var(--text-muted)" : "var(--accent)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              cursor: (files.length === 0 || uploadMutation.isPending) ? "not-allowed" : "pointer",
              opacity: (files.length === 0 || uploadMutation.isPending) ? 0.6 : 1,
              transition: "all 0.15s",
            }}
          >
            {uploadMutation.isPending
              ? `UPLOADING ${files.length} FILE${files.length !== 1 ? "S" : ""}...`
              : `UPLOAD ${files.length} FILE${files.length !== 1 ? "S" : ""}`}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
