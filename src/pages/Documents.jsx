import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "../components/shared/useProjectContext";
import DocumentCard from "../components/dms/DocumentCard";
import DocumentFilters from "../components/dms/DocumentFilters";
import DocumentLeftPanel from "../components/dms/DocumentLeftPanel";
import DocumentDetailPanel from "../components/dms/DocumentDetailPanel";
import UploadModal from "../components/dms/UploadModal";
import DocumentEditModal from "../components/dms/DocumentEditModal";
import { Upload, Grid3x3, List, Folder, CloudUpload } from "lucide-react";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "Approved", label: "Approved" },
  { key: "Under Review", label: "Under Review" },
  { key: "Approved as Noted", label: "As Noted" },
  { key: "Revise & Resubmit", label: "Revise & Resubmit" },
  { key: "Rejected", label: "Rejected" },
];

export default function Documents() {
  const { activeProject } = useProjectContext();
  const [viewMode, setViewMode] = useState("grid"); // grid, list, folder
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [statusTab, setStatusTab] = useState("all");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);

  const { data: rawDocuments = [], isLoading } = useQuery({
    queryKey: ["documents", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? base44.entities.Document.filter({ project_id: activeProject.id })
        : [],
    enabled: !!activeProject?.id,
    initialData: []
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

  const handleDownloadDoc = (doc) => {
    // Trigger file download
    const a = document.createElement("a");
    a.href = doc.fileUrl;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleEditDoc = (doc) => {
    setEditingDoc(doc);
  };

  const handleLinkDoc = (doc) => {
    // Link handled via edit modal (work package / rfi / delivery IDs)
    setEditingDoc(doc);
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
            ◈ DOCUMENT REPOSITORY
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
            /* Hero empty state — drag & drop zone */
            <div
              onClick={() => setUploadOpen(true)}
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
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onView={handleViewDoc}
                  onDownload={handleDownloadDoc}
                  onEdit={handleEditDoc}
                  onLink={handleLinkDoc}
                />
              ))}
            </div>
          ) : (
            <div style={{ padding: 32, textAlign: "center", color: "rgba(200,210,230,0.60)" }}>
              {viewMode === "list" ? "List view coming soon" : "Folder view coming soon"}
            </div>
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
    </div>
  );
}
