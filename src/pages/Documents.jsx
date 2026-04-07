import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44, resolveFileUrl } from "@/api/base44Client";
import { toast } from "sonner";
import { useProjectContext } from "../components/shared/useProjectContext";
import DocumentCard from "../components/dms/DocumentCard";
import DocumentFilters from "../components/dms/DocumentFilters";
import DocumentLeftPanel from "../components/dms/DocumentLeftPanel";
import DocumentDetailPanel from "../components/dms/DocumentDetailPanel";
import UploadModal from "../components/dms/UploadModal";
import DocumentEditModal from "../components/dms/DocumentEditModal";
import { Upload, Grid3x3, List, Folder, CloudUpload, FileDown } from "lucide-react";
import { generateTransmittal } from "../lib/generateTransmittal";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "Approved", label: "Approved" },
  { key: "Under Review", label: "Under Review" },
  { key: "Approved as Noted", label: "As Noted" },
  { key: "Revise & Resubmit", label: "Revise & Resubmit" },
  { key: "Rejected", label: "Rejected" },
];

function FolderSection({ name, docs, selectedIds, onToggleSelect, onViewDoc, onDownloadDoc, onEditDoc, onDeleteDoc }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
          background: "rgba(255,255,255,0.03)", cursor: "pointer",
          borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <span style={{ fontSize: 14, transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>{"\u25B6"}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{name}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>{docs.length} file{docs.length !== 1 ? "s" : ""}</span>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8, padding: 10 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ position: "relative" }}>
              <div
                onClick={(e) => { e.stopPropagation(); onToggleSelect(doc.id); }}
                style={{
                  position: "absolute", top: 8, left: 8, zIndex: 10,
                  width: 16, height: 16, borderRadius: 3,
                  background: selectedIds.has(doc.id) ? "#10B981" : "rgba(0,0,0,0.5)",
                  border: "2px solid " + (selectedIds.has(doc.id) ? "#10B981" : "rgba(255,255,255,0.25)"),
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, color: "#fff",
                }}
              >{selectedIds.has(doc.id) ? "\u2713" : ""}</div>
              <DocumentCard
                doc={doc}
                onView={onViewDoc}
                onDownload={onDownloadDoc}
                onEdit={onEditDoc}
                onDelete={onDeleteDoc}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Documents() {
  const { activeProject } = useProjectContext();
  const [viewMode, setViewMode] = useState("grid"); // grid, list, folder
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [statusTab, setStatusTab] = useState("all");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [transmittalOpen, setTransmittalOpen] = useState(false);
  const [transmittalForm, setTransmittalForm] = useState({ issuedTo: "", issuedBy: "", purpose: "For Review", notes: "", number: "" });
  const queryClient = useQueryClient();

  const { data: rawDocuments = [], isLoading } = useQuery({
    queryKey: ["documents", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? base44.entities.Document.filter({ project_id: activeProject.id })
        : [],
    enabled: !!activeProject?.id,
  });

  // Normalize snake_case / camelCase fields so UI renders regardless of backend casing
  const allDocuments = useMemo(() => {
    return (rawDocuments || []).map((d) => ({
      ...d,
      projectId: d.projectId ?? d.project_id,
      displayName: d.displayName ?? d.display_name ?? d.fileName ?? d.file_name,
      documentNumber: d.documentNumber ?? d.document_number,
      fileName: d.fileName ?? d.file_name,
      fileUrl: d.fileUrl ?? d.file_url,
      fileType: d.fileType ?? d.file_type ?? "other",
      fileSizeKb: d.fileSizeKb ?? d.file_size_kb,
      revisionNumber: d.revisionNumber ?? d.revision_number,
      revisionDate: d.revisionDate ?? d.revision_date,
      drawingNumber: d.drawingNumber ?? d.drawing_number,
      uploadedBy: d.uploadedBy ?? d.uploaded_by,
      uploadedDate: d.uploadedDate ?? d.uploaded_date,
      tags: d.tags || [],
    }));
  }, [rawDocuments]);

  // Filter documents
  const filteredDocs = useMemo(() => {
    let result = [...allDocuments];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.displayName?.toLowerCase().includes(q) ||
          d.documentNumber?.toLowerCase().includes(q) ||
          d.fileName?.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q) ||
          d.drawingNumber?.toLowerCase().includes(q) ||
          d.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (activeFilters.category?.length) {
      result = result.filter((d) => activeFilters.category.includes(d.category));
    }

    // Discipline filter
    if (activeFilters.discipline?.length) {
      result = result.filter((d) => activeFilters.discipline.includes(d.discipline));
    }

    // Status filter (tab takes priority over sidebar filter)
    if (statusTab !== "all") {
      result = result.filter((d) => d.status === statusTab);
    } else if (activeFilters.status?.length) {
      result = result.filter((d) => activeFilters.status.includes(d.status));
    }

    return result;
  }, [allDocuments, searchQuery, activeFilters, statusTab]);

  const handleFilterChange = (key, value) => {
    setActiveFilters((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleClearAllFilters = () => {
    setActiveFilters({});
    setSearchQuery("");
  };

  const handleViewDoc = (doc) => {
    setSelectedDoc(doc);
  };

  const handleDownloadDoc = async (doc) => {
    try {
      const url = await resolveFileUrl(doc.fileUrl || doc.file_url);
      if (!url) { toast.error("No file URL available"); return; }
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName || doc.file_name || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast.error("Download failed: " + (err?.message || "Unknown error"));
    }
  };

  const handleEditDoc = (doc) => {
    setEditingDoc(doc);
  };

  const handleLinkDoc = (doc) => {
    // Link handled via edit modal (work package / rfi / delivery IDs)
    setEditingDoc(doc);
  };
  const handleDeleteDoc = async (doc) => {
    try {
      await base44.entities.Document.delete(doc.id);
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      toast.success("Document deleted");
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete document");
    }
  };

  if (!activeProject) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "rgba(200,210,230,0.70)" }}>
          Select a project to view documents
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 16 }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "var(--bg-surface-low)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          padding: 12
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--status-warning)" }}>
            â—ˆ DOCUMENT REPOSITORY
          </div>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.10)" }} />
          <button
            onClick={() => setUploadOpen(true)}
            style={{
              padding: "6px 12px",
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
          >
            <Upload size={14} /> UPLOAD
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setTransmittalOpen(true)}
              style={{
                padding: "6px 12px",
                background: "rgba(16,185,129,0.10)",
                border: "1px solid rgba(16,185,129,0.35)",
                color: "#10B981",
                borderRadius: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <FileDown size={14} /> TRANSMITTAL ({selectedIds.size})
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
          {/* Search bar */}
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: 240,
              padding: "6px 10px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              borderRadius: 6,
              fontFamily: "var(--font-body)",
              fontSize: 12
            }}
          />

          {/* View mode toggle */}
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: 2 }}>
            {[
              { mode: "grid", icon: <Grid3x3 size={14} /> },
              { mode: "list", icon: <List size={14} /> },
              { mode: "folder", icon: <Folder size={14} /> }
            ].map((item) => (
              <button
                key={item.mode}
                onClick={() => setViewMode(item.mode)}
                style={{
                  padding: "4px 8px",
                  background: viewMode === item.mode ? "var(--accent-muted)" : "transparent",
                  border: "none",
                  color: viewMode === item.mode ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {item.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content with left panel */}
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* Left panel */}
        <DocumentLeftPanel
          documents={filteredDocs}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
        />

        {/* Main area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Status Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-default)", marginBottom: 12, flexShrink: 0 }}>
            {STATUS_TABS.map((tab) => {
              const count = tab.key === "all" ? allDocuments.length : allDocuments.filter((d) => d.status === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusTab(tab.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px",
                    background: "transparent",
                    color: statusTab === tab.key ? "var(--accent)" : "var(--text-muted)",
                    border: "none",
                    borderBottom: statusTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                    borderRadius: 0,
                    marginBottom: -1,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: statusTab === tab.key ? 700 : 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "color 0.15s, border-color 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                  {count > 0 && (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                      padding: "1px 5px", borderRadius: 3,
                      background: statusTab === tab.key ? "var(--accent-muted)" : "rgba(255,255,255,0.06)",
                      color: statusTab === tab.key ? "var(--accent)" : "var(--text-muted)",
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <DocumentFilters
            onFilterChange={handleFilterChange}
            activeFilters={activeFilters}
            onClearAll={handleClearAllFilters}
          />

          {/* Content */}
          {isLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "rgba(200,210,230,0.60)" }}>
              Loading documents...
            </div>
          ) : allDocuments.length === 0 ? (
            /* Hero empty state â€” drag & drop zone */
            <div
              onClick={() => setUploadOpen(true)}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setUploadOpen(true); }}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                margin: "12px 0",
                border: "2px dashed rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: "60px 24px",
                cursor: "pointer",
                transition: "border-color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.background = "var(--accent-muted)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "transparent"; }}
            >
              <CloudUpload size={52} style={{ color: "var(--accent)", opacity: 0.4 }} />
              <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--text-disabled)" }}>
                Upload Project Documents
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", maxWidth: 360, textAlign: "center", lineHeight: 1.7 }}>
                Drag drawings, specs, or submittals here, or click to browse. Files are organized by category, discipline, and revision automatically.
              </div>
              <div style={{
                marginTop: 8,
                padding: "8px 20px",
                background: "var(--accent-muted)",
                border: "1px solid var(--accent-border)",
                borderRadius: "var(--radius-btn)",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}>
                UPLOAD FIRST DOCUMENT
              </div>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "rgba(200,210,230,0.60)", fontFamily: "var(--font-body)", fontSize: 13 }}>
              No documents match the current filters.{" "}
              <button onClick={handleClearAllFilters} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700 }}>
                CLEAR FILTERS
              </button>
            </div>
          ) : viewMode === "grid" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
                overflowY: "auto"
              }}
            >
              {filteredDocs.map((doc) => (
                <div key={doc.id} style={{ position: "relative" }}>
                  {/* Selection checkbox */}
                  <div
                    onClick={() => setSelectedIds(prev => {
                      const next = new Set(prev);
                      next.has(doc.id) ? next.delete(doc.id) : next.add(doc.id);
                      return next;
                    })}
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      zIndex: 10,
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      background: selectedIds.has(doc.id) ? "#10B981" : "rgba(0,0,0,0.5)",
                      border: selectedIds.has(doc.id) ? "2px solid #10B981" : "2px solid rgba(255,255,255,0.25)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selectedIds.has(doc.id) && <span style={{ color: "white", fontSize: 11, lineHeight: 1 }}>âœ“</span>}
                  </div>
                  <DocumentCard
                    doc={doc}
                    onView={handleViewDoc}
                    onDownload={handleDownloadDoc}
                    onEdit={handleEditDoc}
                    onLink={handleLinkDoc}
                    onDelete={handleDeleteDoc}
                  />
                </div>
              ))}
            </div>
          ) : viewMode === "list" ? (
            /* ── List View ─────────────────────────────────────── */
            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* Header row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 100px 80px 70px 80px 90px 100px",
                gap: 8, padding: "6px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                position: "sticky", top: 0, background: "var(--bg-surface-low)", zIndex: 1,
              }}>
                <div onClick={() => {
                  if (selectedIds.size === filteredDocs.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(filteredDocs.map(d => d.id)));
                }} style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: 3,
                    border: "2px solid " + (selectedIds.size === filteredDocs.length && filteredDocs.length > 0 ? "#10B981" : "rgba(255,255,255,0.25)"),
                    background: selectedIds.size === filteredDocs.length && filteredDocs.length > 0 ? "#10B981" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff",
                  }}>{selectedIds.size === filteredDocs.length && filteredDocs.length > 0 ? "\u2713" : ""}</div>
                </div>
                {["Name", "Doc #", "Rev", "Type", "Status", "Size", "Date"].map(h => (
                  <div key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>{h}</div>
                ))}
              </div>
              {/* Rows */}
              {filteredDocs.map(doc => {
                const isSelected = selectedIds.has(doc.id);
                const fsk = doc.fileSizeKb ?? doc.file_size_kb ?? 0;
                const sizeMB = fsk ? (fsk / 1024).toFixed(1) + " MB" : "\u2014";
                const rawDate = doc.uploadedDate ?? doc.uploaded_date ?? doc.created_at;
                const dateStr = rawDate ? new Date(rawDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014";
                return (
                  <div key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr 100px 80px 70px 80px 90px 100px",
                      gap: 8, padding: "8px 12px", cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background: isSelected ? "rgba(16,185,129,0.06)" : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--hover-bg)"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div onClick={e => { e.stopPropagation(); setSelectedIds(prev => { const next = new Set(prev); next.has(doc.id) ? next.delete(doc.id) : next.add(doc.id); return next; }); }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: 3,
                        border: "2px solid " + (isSelected ? "#10B981" : "rgba(255,255,255,0.25)"),
                        background: isSelected ? "#10B981" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff",
                      }}>{isSelected ? "\u2713" : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--text-muted)", flexShrink: 0 }}>
                        {(doc.fileType || "file").toUpperCase().slice(0,4)}
                      </span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {doc.displayName || doc.fileName || "Untitled"}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", display: "flex", alignItems: "center" }}>{doc.documentNumber || "\u2014"}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>R{doc.revisionNumber || "0"}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", display: "flex", alignItems: "center", textTransform: "uppercase" }}>{doc.fileType || "\u2014"}</div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px", borderRadius: 3,
                        background: doc.status === "Approved" ? "rgba(0,214,143,0.15)" : doc.status === "Rejected" ? "rgba(255,61,61,0.15)" : "rgba(255,176,32,0.15)",
                        color: doc.status === "Approved" ? "#00D68F" : doc.status === "Rejected" ? "#FF3D3D" : "#FFB020",
                      }}>{doc.status || "Draft"}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>{sizeMB}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>{dateStr}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Folder View ─────────────────────────────────── */
            (() => {
              const folders = {};
              filteredDocs.forEach(doc => {
                const cat = doc.category || "Uncategorized";
                if (!folders[cat]) folders[cat] = [];
                folders[cat].push(doc);
              });
              const folderNames = Object.keys(folders).sort();
              return (
                <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                  {folderNames.map(folder => (
                    <FolderSection
                      key={folder}
                      name={folder}
                      docs={folders[folder]}
                      selectedIds={selectedIds}
                      onToggleSelect={(id) => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
                      onViewDoc={handleViewDoc}
                      onDownloadDoc={handleDownloadDoc}
                      onEditDoc={handleEditDoc}
                      onDeleteDoc={handleDeleteDoc}
                    />
                  ))}
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* Document detail panel */}
      {selectedDoc && (
        <DocumentDetailPanel doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}

      {/* Edit modal */}
      {editingDoc && (
        <DocumentEditModal
          projectId={activeProject?.id}
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
        />
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <UploadModal
          projectId={activeProject.id}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {/* Transmittal modal */}
      {transmittalOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }}
          onClick={() => setTransmittalOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--bg-surface-low)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTop: "3px solid #10B981",
              borderRadius: 12,
              width: 520,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#10B981", letterSpacing: "0.06em" }}>GENERATE TRANSMITTAL</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{selectedIds.size} document{selectedIds.size !== 1 ? "s" : ""} selected</div>
              </div>
              <button onClick={() => setTransmittalOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>Ã—</button>
            </div>

            {/* Form */}
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
              {[
                { key: "number",   label: "Transmittal #",  placeholder: "e.g. T-001" },
                { key: "issuedTo", label: "Issued To",       placeholder: "Company / Contact name" },
                { key: "issuedBy", label: "Issued By",       placeholder: "Your name" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={transmittalForm[key]}
                    onChange={e => setTransmittalForm(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-primary)", borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 12, boxSizing: "border-box" }}
                  />
                </div>
              ))}
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>Purpose</div>
                <select
                  value={transmittalForm.purpose}
                  onChange={e => setTransmittalForm(prev => ({ ...prev, purpose: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-primary)", borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 12 }}
                >
                  {["For Review", "For Approval", "For Construction", "For Record", "For Information", "Resubmitted"].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>Notes (optional)</div>
                <textarea
                  rows={3}
                  placeholder="Any remarks or special instructions..."
                  value={transmittalForm.notes}
                  onChange={e => setTransmittalForm(prev => ({ ...prev, notes: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-primary)", borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
                />
              </div>

              {/* Doc list preview */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>Documents Included</div>
                {allDocuments.filter(d => selectedIds.has(d.id)).map(d => (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)" }}>{d.displayName || d.display_name || d.fileName || d.file_name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>R{d.revisionNumber || d.revision_number || "0"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setTransmittalOpen(false)} style={{ padding: "8px 16px", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-muted)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                CANCEL
              </button>
              <button
                onClick={() => {
                  generateTransmittal({
                    project: activeProject || {},
                    docs: allDocuments.filter(d => selectedIds.has(d.id)),
                    issuedTo: transmittalForm.issuedTo,
                    issuedBy: transmittalForm.issuedBy,
                    purpose: transmittalForm.purpose,
                    notes: transmittalForm.notes,
                    transmittalNumber: transmittalForm.number,
                  });
                  setTransmittalOpen(false);
                  setTransmittalForm({ issuedTo: "", issuedBy: "", purpose: "For Review", notes: "", number: "" });
                  setSelectedIds(new Set());
                }}
                style={{ padding: "8px 20px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.40)", color: "#10B981", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}
              >
                â†“ GENERATE PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

