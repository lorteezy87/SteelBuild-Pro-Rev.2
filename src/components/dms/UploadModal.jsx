import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function UploadModal({ projectId, onClose }) {
  const [files, setFiles] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [scheduleLink, setScheduleLink] = useState({ linkedWpId: "", reviewLeadTime: 14, isSubmittal: false });
  const fileInputRef = useRef(null);
  const qc = useQueryClient();

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload) => {
      const created = [];
      for (const file of filesToUpload) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        const meta = metadata[file.name] || {};
        // Calculate due date from lead time if this is a submittal
        const today = new Date();
        const dueDate = scheduleLink.isSubmittal
          ? new Date(today.getTime() + scheduleLink.reviewLeadTime * 86400000).toISOString().split("T")[0]
          : undefined;

        const doc = await base44.entities.Document.create({
          project_id: projectId,
          display_name: meta.displayName || file.name,
          description: meta.description || "",
          file_name: file.name,
          file_url,
          file_type: meta.fileType || (() => { const ext = file.name.split(".").pop()?.toLowerCase(); return ["pdf","dwg","dxf","ifc","rvt","jpg","jpeg","png","xlsx","xls","docx","doc"].includes(ext) ? ext : "other"; })(),
          file_size_kb: Math.round(file.size / 1024),
          mime_type: file.type,
          category: meta.category || "Other",
          discipline: meta.discipline || "Other",
          status: scheduleLink.isSubmittal ? "Under Review" : "Draft",
          revision_number: meta.revisionNumber || "0",
          revision_date: today.toISOString().split("T")[0],
          tags: meta.tags || [],
          uploaded_by: (await base44.auth.me?.())?.email || "Unknown",
          uploaded_date: today.toISOString(),
          // Schedule integration fields
          is_submittal: scheduleLink.isSubmittal,
          ...(scheduleLink.isSubmittal && scheduleLink.linkedWpId ? { linked_wp_id: scheduleLink.linkedWpId } : {}),
          ...(scheduleLink.isSubmittal ? { review_lead_time: scheduleLink.reviewLeadTime, due_date: dueDate } : {}),
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
          border: "1px solid var(--divider)",
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
            borderBottom: "1px solid var(--divider)",
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
              color: "var(--text-secondary)",
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
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
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
                      border: "1px solid var(--divider)",
                      borderRadius: 8,
                      padding: 12
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                          📄 {file.name}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(file.name)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-secondary)",
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
                          background: "var(--hover-bg)",
                          border: "1px solid var(--border-default)",
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
                          background: "var(--hover-bg)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-primary)",
                          borderRadius: 4,
                          fontFamily: "var(--font-body)",
                          fontSize: 11
                        }}
                      >
                        <option value="">Category</option>
                        {["Blueprint","Shop Drawing","IFC Model","Specification","Submittal","Transmittal","RFI Response","Change Order","Contract","Photo","Report","Correspondence","Permit","Inspection Report","Other"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select
                        value={meta.discipline || ""}
                        onChange={(e) => updateMetadata(file.name, "discipline", e.target.value)}
                        style={{
                          padding: "6px 8px",
                          background: "var(--hover-bg)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-primary)",
                          borderRadius: 4,
                          fontFamily: "var(--font-body)",
                          fontSize: 11
                        }}
                      >
                        <option value="">Discipline</option>
                        {["Structural","Architectural","MEP","Civil","Misc Metals","Geotechnical","General","Other"].map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <input
                        type="text"
                        placeholder="Drawing # (optional)"
                        value={meta.drawingNumber || ""}
                        onChange={(e) => updateMetadata(file.name, "drawingNumber", e.target.value)}
                        style={{
                          padding: "6px 8px",
                          background: "var(--hover-bg)",
                          border: "1px solid var(--border-default)",
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

        {/* Schedule Integration */}
        {files.length > 0 && (
          <div style={{
            margin: "0 16px 16px",
            borderTop: "1px solid var(--divider)",
            paddingTop: 14,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <input
                type="checkbox"
                id="isSubmittal"
                checked={scheduleLink.isSubmittal}
                onChange={(e) => setScheduleLink(prev => ({ ...prev, isSubmittal: e.target.checked }))}
                style={{ accentColor: "var(--accent)", width: 14, height: 14, cursor: "pointer" }}
              />
              <label htmlFor="isSubmittal" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-warning)", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>
                Track as Submittal — Link to Schedule
              </label>
            </div>

            {scheduleLink.isSubmittal && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, paddingLeft: 24 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
                    Target Gantt Activity (Work Package)
                  </div>
                  <select
                    value={scheduleLink.linkedWpId}
                    onChange={(e) => setScheduleLink(prev => ({ ...prev, linkedWpId: e.target.value }))}
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      background: "var(--hover-bg)",
                      border: "1px solid var(--accent-border)",
                      color: scheduleLink.linkedWpId ? "var(--text-primary)" : "var(--text-muted)",
                      borderRadius: 6,
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                    }}
                  >
                    <option value="">— Select Activity —</option>
                    {workPackages.map(wp => (
                      <option key={wp.id} value={wp.id}>
                        {wp.wp_number ? `${wp.wp_number} · ` : ""}{wp.name} ({wp.phase || "—"})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ minWidth: 110 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
                    Review Lead Time
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={scheduleLink.reviewLeadTime}
                      onChange={(e) => setScheduleLink(prev => ({ ...prev, reviewLeadTime: Number(e.target.value) || 14 }))}
                      style={{
                        width: 60,
                        padding: "7px 8px",
                        background: "var(--hover-bg)",
                        border: "1px solid var(--accent-border)",
                        color: "var(--text-primary)",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        textAlign: "right",
                      }}
                    />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>days</span>
                  </div>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 4 }}>
                    Planned approval date:{" "}
                    <span style={{ color: "var(--accent)" }}>
                      {new Date(Date.now() + scheduleLink.reviewLeadTime * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    {" · "}A review bar will appear on the Gantt chart preceding the selected activity.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: 16,
            borderTop: "1px solid var(--divider)",
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
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
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
