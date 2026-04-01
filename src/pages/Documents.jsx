import React, { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "../components/shared/useProjectContext";
import DocumentCard from "../components/dms/DocumentCard";
import DocumentFilters from "../components/dms/DocumentFilters";
import DocumentLeftPanel from "../components/dms/DocumentLeftPanel";
import DocumentDetailPanel from "../components/dms/DocumentDetailPanel";
import UploadModal from "../components/dms/UploadModal";
import DocumentEditModal from "../components/dms/DocumentEditModal";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Upload, Grid3x3, List, Folder } from "lucide-react";
import { toast } from "sonner";

function getFolderKey(doc) {
  const category = doc.category || "Other";
  const discipline = doc.discipline || "General";
  return `${category}__${discipline}`;
}

function getFolderLabel(doc) {
  const category = doc.category || "Other";
  const discipline = doc.discipline || "General";
  return `${category} / ${discipline}`;
}

export default function Documents() {
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState("grid"); // grid, list, folder
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

    // Status filter
    if (activeFilters.status?.length) {
      result = result.filter((d) => activeFilters.status.includes(d.status));
    }

    return result;
  }, [allDocuments, searchQuery, activeFilters]);

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

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Document.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      if (selectedDoc?.id === deletedId) setSelectedDoc(null);
      if (editingDoc?.id === deletedId) setEditingDoc(null);
      setDeleteTarget(null);
      toast.success("Document deleted");
    },
    onError: (err) => toast.error(err?.message || "Failed to delete document"),
  });

  const folderGroups = useMemo(() => {
    const groups = filteredDocs.reduce((acc, doc) => {
      const key = getFolderKey(doc);
      if (!acc[key]) {
        acc[key] = { key, label: getFolderLabel(doc), docs: [] };
      }
      acc[key].docs.push(doc);
      return acc;
    }, {});

    return Object.values(groups)
      .map((group) => ({
        ...group,
        docs: group.docs.sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || ""), undefined, { sensitivity: "base", numeric: true })),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }));
  }, [filteredDocs]);

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
          ) : filteredDocs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "rgba(200,210,230,0.60)" }}>
              No documents found
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
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          ) : viewMode === "list" ? (
            <div className="sbp-panel" style={{ overflow: "hidden" }}>
              <table className="sbp-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Document No.</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Revision</th>
                    <th>Uploaded</th>
                    <th>Links</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc) => {
                    const linkedCount =
                      (doc.linkedWorkPackages?.length || 0) +
                      (doc.linkedDeliveries?.length || 0) +
                      (doc.linkedRFIs?.length || 0) +
                      (doc.linkedSubmittals?.length || 0) +
                      (doc.linkedDrawings?.length || 0) +
                      (doc.linkedChangeOrders?.length || 0);
                    return (
                      <tr key={doc.id} onClick={() => handleViewDoc(doc)} style={{ cursor: "pointer" }}>
                        <td>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{doc.displayName || doc.fileName || "Untitled"}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{doc.fileType?.toUpperCase() || "FILE"} · {doc.discipline || "General"}</div>
                        </td>
                        <td className="mono">{doc.documentNumber || "—"}</td>
                        <td>{doc.category || "Other"}</td>
                        <td>
                          <span className={doc.status === "Approved" ? "badge badge-success" : doc.status === "Under Review" ? "badge badge-info" : doc.status === "Draft" ? "badge badge-warning" : "badge badge-neutral"}>
                            {doc.status || "Unspecified"}
                          </span>
                        </td>
                        <td className="mono">{doc.revisionNumber || "—"}</td>
                        <td>{doc.uploadedDate ? new Date(doc.uploadedDate).toLocaleDateString("en-US") : "—"}</td>
                        <td className="mono-num">{linkedCount}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={() => handleViewDoc(doc)}>Open</button>
                            <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={() => handleEditDoc(doc)}>Edit</button>
                            <button
                              className="btn-ghost"
                              style={{ padding: "6px 10px", fontSize: 9, color: "var(--danger)", borderColor: "var(--danger-border)" }}
                              onClick={() => setDeleteTarget(doc)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {folderGroups.map((group) => (
                <div key={group.key} className="sbp-panel">
                  <div className="sbp-panel-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "var(--radius-btn)", display: "grid", placeItems: "center", background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
                        <Folder size={14} />
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{group.label}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{group.docs.length} file{group.docs.length === 1 ? "" : "s"}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 12, display: "grid", gap: 8 }}>
                    {group.docs.map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => handleViewDoc(doc)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5fr 120px 120px 120px auto",
                          gap: 12,
                          alignItems: "center",
                          padding: "10px 12px",
                          border: "1px solid var(--border-default)",
                          borderRadius: "var(--radius-card)",
                          background: "var(--bg-surface-low)",
                          cursor: "pointer",
                        }}
                      >
                        <div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{doc.displayName || doc.fileName || "Untitled"}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{doc.documentNumber || "—"} · {doc.fileType?.toUpperCase() || "FILE"}</div>
                        </div>
                        <div className="mono">{doc.status || "—"}</div>
                        <div className="mono">{doc.revisionNumber ? `Rev ${doc.revisionNumber}` : "—"}</div>
                        <div className="mono">{doc.uploadedDate ? new Date(doc.uploadedDate).toLocaleDateString("en-US") : "—"}</div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={(e) => { e.stopPropagation(); handleEditDoc(doc); }}>Edit</button>
                          <button
                            className="btn-ghost"
                            style={{ padding: "6px 10px", fontSize: 9, color: "var(--danger)", borderColor: "var(--danger-border)" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(doc);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && deleteMut.mutate(deleteTarget.id)}
        title="Delete Document"
        description={`Delete "${deleteTarget?.displayName || deleteTarget?.fileName || "this document"}"? This cannot be undone.`}
      />
    </div>
  );
}
