import React, { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44, resolveFileUrl } from "@/api/base44Client";
import { toast } from "sonner";
import { useProjectContext } from "../components/shared/useProjectContext";
import DocumentCard from "../components/dms/DocumentCard";
import DocumentFilters from "../components/dms/DocumentFilters";
import DocumentLeftPanel from "../components/dms/DocumentLeftPanel";
import DocumentDetailPanel from "../components/dms/DocumentDetailPanel";
import UploadModal from "../components/dms/UploadModal";
import DocumentEditModal from "../components/dms/DocumentEditModal";
import {
  Upload, Grid3x3, List, Folder, CloudUpload, FileDown,
  Download, Trash2, ArrowUpDown, FileSpreadsheet, CheckSquare,
  XCircle, AlertCircle, ChevronDown,
  FileText, FileImage, FileCode, File, FileArchive,
} from "lucide-react";
import { generateTransmittal } from "../lib/generateTransmittal";

/* ── constants ──────────────────────────────────────────────────────── */

const STATUS_TABS = [
  { key: "all",                label: "All" },
  { key: "Approved",           label: "Approved" },
  { key: "Under Review",       label: "Under Review" },
  { key: "Approved as Noted",  label: "As Noted" },
  { key: "Revise & Resubmit",  label: "Revise & Resubmit" },
  { key: "Rejected",           label: "Rejected" },
];

const SORT_OPTIONS = [
  { key: "name-asc",   label: "Name A-Z",       fn: (a, b) => (a.displayName || "").localeCompare(b.displayName || "") },
  { key: "name-desc",  label: "Name Z-A",       fn: (a, b) => (b.displayName || "").localeCompare(a.displayName || "") },
  { key: "date-desc",  label: "Newest First",   fn: (a, b) => new Date(b.uploadedDate || b.created_at || 0) - new Date(a.uploadedDate || a.created_at || 0) },
  { key: "date-asc",   label: "Oldest First",   fn: (a, b) => new Date(a.uploadedDate || a.created_at || 0) - new Date(b.uploadedDate || b.created_at || 0) },
  { key: "status",     label: "Status",         fn: (a, b) => (a.status || "").localeCompare(b.status || "") },
  { key: "size-desc",  label: "Largest First",  fn: (a, b) => (b.fileSizeKb || 0) - (a.fileSizeKb || 0) },
  { key: "size-asc",   label: "Smallest First", fn: (a, b) => (a.fileSizeKb || 0) - (b.fileSizeKb || 0) },
  { key: "doc-num",    label: "Document #",      fn: (a, b) => (a.documentNumber || "").localeCompare(b.documentNumber || "") },
];

const BATCH_STATUS_OPTIONS = [
  "Draft", "Under Review", "Approved", "Approved with Comments",
  "Revise & Resubmit", "Rejected", "Issued", "Superseded", "Archived", "Void",
];

/* ── Folder section sub-component ───────────────────────────────────── */

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

/* ── CSV export helper ──────────────────────────────────────────────── */

function exportDocsCsv(docs, projectName) {
  const headers = [
    "Document #", "Name", "Category", "Discipline", "Status",
    "Revision", "File Type", "Size (KB)", "Uploaded By", "Upload Date", "Description", "Tags",
  ];
  const rows = docs.map(d => [
    d.documentNumber || "",
    (d.displayName || d.fileName || "").replace(/"/g, '""'),
    d.category || "",
    d.discipline || "",
    d.status || "",
    d.revisionNumber || "0",
    (d.fileType || "").toUpperCase(),
    d.fileSizeKb || "",
    d.uploadedBy || "",
    d.uploadedDate || d.created_at || "",
    (d.description || "").replace(/"/g, '""'),
    Array.isArray(d.tags) ? d.tags.join("; ") : (d.tags || ""),
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(projectName || "project").replace(/\s+/g, "_")}_documents_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                     */
/* ════════════════════════════════════════════════════════════════════ */

export default function Documents() {
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();

  /* ── state ───────────────────────────────────────────────────────── */
  const [viewMode, setViewMode]           = useState("grid");
  const [searchQuery, setSearchQuery]     = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [statusTab, setStatusTab]         = useState("all");
  const [selectedDoc, setSelectedDoc]     = useState(null);
  const [uploadOpen, setUploadOpen]       = useState(false);
  const [editingDoc, setEditingDoc]       = useState(null);
  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [sortKey, setSortKey]             = useState("date-desc");
  const [showSortMenu, setShowSortMenu]   = useState(false);
  const [isDragOver, setIsDragOver]       = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [batchStatusOpen, setBatchStatusOpen]     = useState(false);
  const [transmittalOpen, setTransmittalOpen]     = useState(false);
  const [transmittalForm, setTransmittalForm]     = useState({ issuedTo: "", issuedBy: "", purpose: "For Review", notes: "", number: "" });
  const dragCounter = useRef(0);

  /* ── data ─────────────────────────────────────────────────────────── */
  const { data: rawDocuments = [], isLoading } = useQuery({
    queryKey: ["documents", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? base44.entities.Document.filter({ project_id: activeProject.id })
        : [],
    enabled: !!activeProject?.id,
  });

  const allDocuments = useMemo(() => {
    return (rawDocuments || []).map((d) => ({
      ...d,
      projectId:      d.projectId      ?? d.project_id,
      displayName:    d.displayName    ?? d.display_name ?? d.fileName ?? d.file_name ?? d.title,
      documentNumber: d.documentNumber ?? d.document_number,
      fileName:       d.fileName       ?? d.file_name,
      fileUrl:        d.fileUrl        ?? d.file_url,
      fileType:       d.fileType       ?? d.file_type ?? "other",
      fileSizeKb:     d.fileSizeKb     ?? d.file_size_kb ?? d.file_size,
      revisionNumber: d.revisionNumber ?? d.revision_number ?? d.revision ?? "0",
      revisionDate:   d.revisionDate   ?? d.revision_date,
      drawingNumber:  d.drawingNumber  ?? d.drawing_number,
      uploadedBy:     d.uploadedBy     ?? d.uploaded_by,
      uploadedDate:   d.uploadedDate   ?? d.uploaded_date ?? d.created_at,
      tags:           Array.isArray(d.tags) ? d.tags : d.tags ? String(d.tags).split(",").map(t => t.trim()).filter(Boolean) : [],
    }));
  }, [rawDocuments]);

  /* ── filtered + sorted ────────────────────────────────────────────── */
  const filteredDocs = useMemo(() => {
    let result = [...allDocuments];

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

    if (activeFilters.category?.length) {
      result = result.filter((d) => activeFilters.category.includes(d.category));
    }
    if (activeFilters.discipline?.length) {
      result = result.filter((d) => activeFilters.discipline.includes(d.discipline));
    }
    if (statusTab !== "all") {
      result = result.filter((d) => d.status === statusTab);
    } else if (activeFilters.status?.length) {
      result = result.filter((d) => activeFilters.status.includes(d.status));
    }

    const sortOpt = SORT_OPTIONS.find(o => o.key === sortKey);
    if (sortOpt) result.sort(sortOpt.fn);

    return result;
  }, [allDocuments, searchQuery, activeFilters, statusTab, sortKey]);

  /* ── review queue count (badge) ─────────────────────────────────── */
  const reviewCount = useMemo(() =>
    allDocuments.filter(d => d.status === "Under Review" || d.status === "Revise & Resubmit").length,
    [allDocuments]
  );

  /* ── batch mutations ─────────────────────────────────────────────── */
  const bulkStatusMut = useMutation({
    mutationFn: async (newStatus) => {
      const ids = [...selectedIds];
      for (const id of ids) {
        await base44.entities.Document.update(id, { status: newStatus });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      setSelectedIds(new Set());
      setBatchStatusOpen(false);
      toast.success(`Updated ${selectedIds.size} document(s)`);
    },
    onError: (err) => toast.error(err?.message || "Bulk status update failed"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async () => {
      const ids = [...selectedIds];
      for (const id of ids) {
        await base44.entities.Document.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      const count = selectedIds.size;
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      toast.success(`Deleted ${count} document(s)`);
    },
    onError: (err) => toast.error(err?.message || "Bulk delete failed"),
  });

  /* ── handlers ─────────────────────────────────────────────────────── */
  const handleFilterChange = (key, value) => setActiveFilters(prev => ({ ...prev, [key]: value }));
  const handleClearAllFilters = () => { setActiveFilters({}); setSearchQuery(""); setStatusTab("all"); };
  const handleViewDoc   = (doc) => setSelectedDoc(doc);
  const handleEditDoc   = (doc) => setEditingDoc(doc);
  const handleLinkDoc   = (doc) => setEditingDoc(doc);

  const handleDownloadDoc = async (doc) => {
    try {
      const url = await resolveFileUrl(doc.fileUrl || doc.file_url);
      if (!url) { toast.error("No file URL available"); return; }
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName || doc.file_name || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error("Download failed: " + (err?.message || "Unknown error"));
    }
  };

  const handleDeleteDoc = async (doc) => {
    try {
      await base44.entities.Document.delete(doc.id);
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      toast.success("Document deleted");
    } catch (err) {
      toast.error("Failed to delete document");
    }
  };

  const handleBulkDownload = async () => {
    const docs = allDocuments.filter(d => selectedIds.has(d.id));
    toast.info(`Downloading ${docs.length} file(s)...`);
    for (const doc of docs) {
      await handleDownloadDoc(doc);
    }
  };

  const handleExportCsv = () => {
    exportDocsCsv(filteredDocs, activeProject?.name);
    toast.success(`Exported ${filteredDocs.length} documents to CSV`);
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => setSelectedIds(new Set(filteredDocs.map(d => d.id)));
  const deselectAll = () => setSelectedIds(new Set());

  /* ── drag & drop ──────────────────────────────────────────────────── */
  const onDragEnter = (e) => { e.preventDefault(); dragCounter.current++; setIsDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragOver(false); } };
  const onDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onDrop      = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setIsDragOver(false); setUploadOpen(true); };

  /* ── render guards ───────────────────────────────────────────────── */
  if (!activeProject) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "rgba(200,210,230,0.70)" }}>
          Select a project to view documents
        </div>
      </div>
    );
  }

  const hasActiveFilters = Object.keys(activeFilters).some(k => activeFilters[k]?.length > 0) || searchQuery.trim();
  const sortLabel = SORT_OPTIONS.find(o => o.key === sortKey)?.label || "Sort";

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", gap: 16, position: "relative" }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* ── Drag overlay ─────────────────────────────────── */}
      {isDragOver && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 2500,
          background: "rgba(200,155,32,0.08)",
          border: "3px dashed var(--accent)",
          borderRadius: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{ textAlign: "center" }}>
            <CloudUpload size={56} style={{ color: "var(--accent)", opacity: 0.7 }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "var(--accent)", marginTop: 12, letterSpacing: "0.06em" }}>
              DROP FILES TO UPLOAD
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
        borderRadius: 12, padding: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--status-warning)" }}>
            {"\u25C8"} DOCUMENT REPOSITORY
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
            {allDocuments.length} DOC{allDocuments.length !== 1 ? "S" : ""}
          </span>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.10)" }} />
          <button
            onClick={() => setUploadOpen(true)}
            style={{
              padding: "6px 12px", background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)", color: "var(--accent)",
              borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10,
              fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Upload size={14} /> UPLOAD
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            title="Export filtered list as CSV"
            style={{
              padding: "6px 12px", background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.25)", color: "#3b82f6",
              borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10,
              fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <FileSpreadsheet size={14} /> EXPORT
          </button>

          {/* Review Queue badge */}
          {reviewCount > 0 && (
            <button
              onClick={() => { setStatusTab("Under Review"); setActiveFilters({}); }}
              style={{
                padding: "6px 12px", background: "rgba(234,179,8,0.10)",
                border: "1px solid rgba(234,179,8,0.30)", color: "#eab308",
                borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10,
                fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <AlertCircle size={14} /> REVIEW QUEUE ({reviewCount})
            </button>
          )}

          {/* Transmittal button (selection) */}
          {selectedIds.size > 0 && (
            <button
              onClick={() => setTransmittalOpen(true)}
              style={{
                padding: "6px 12px", background: "rgba(16,185,129,0.10)",
                border: "1px solid rgba(16,185,129,0.35)", color: "#10B981",
                borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10,
                fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <FileDown size={14} /> TRANSMITTAL ({selectedIds.size})
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search documents, drawings, revisions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: 240, padding: "6px 10px", background: "var(--bg-input)",
              border: "1px solid var(--border-default)", color: "var(--text-primary)",
              borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 12,
            }}
          />

          {/* Sort dropdown */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowSortMenu(o => !o)}
              style={{
                padding: "6px 10px", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-secondary)",
                borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <ArrowUpDown size={12} /> {sortLabel} <ChevronDown size={10} />
            </button>
            {showSortMenu && (
              <>
                <div onClick={() => setShowSortMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 100,
                  background: "var(--bg-surface)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8, padding: 4, minWidth: 160,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.60)",
                }}>
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setSortKey(opt.key); setShowSortMenu(false); }}
                      style={{
                        width: "100%", textAlign: "left", padding: "6px 10px",
                        background: sortKey === opt.key ? "var(--accent-muted)" : "transparent",
                        border: "none", borderRadius: 4, cursor: "pointer",
                        fontFamily: "var(--font-mono)", fontSize: 10,
                        color: sortKey === opt.key ? "var(--accent)" : "var(--text-secondary)",
                        fontWeight: sortKey === opt.key ? 700 : 400,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* View mode toggle */}
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: 2 }}>
            {[
              { mode: "grid",   icon: <Grid3x3 size={14} /> },
              { mode: "list",   icon: <List size={14} /> },
              { mode: "folder", icon: <Folder size={14} /> },
            ].map(item => (
              <button
                key={item.mode}
                onClick={() => setViewMode(item.mode)}
                style={{
                  padding: "4px 8px",
                  background: viewMode === item.mode ? "var(--accent-muted)" : "transparent",
                  border: "none",
                  color: viewMode === item.mode ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer", borderRadius: 4,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {item.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Batch Action Bar ─────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
          background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.20)",
          borderRadius: 10, animation: "fadeIn 0.15s ease-out",
        }}>
          <CheckSquare size={16} style={{ color: "#10B981" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "#10B981" }}>
            {selectedIds.size} SELECTED
          </span>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />

          {/* Select all / Deselect */}
          <button onClick={selectAll} style={batchBtnStyle("rgba(255,255,255,0.06)", "rgba(255,255,255,0.12)", "var(--text-secondary)")}>
            SELECT ALL ({filteredDocs.length})
          </button>
          <button onClick={deselectAll} style={batchBtnStyle("rgba(255,255,255,0.06)", "rgba(255,255,255,0.12)", "var(--text-secondary)")}>
            <XCircle size={12} /> DESELECT
          </button>

          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />

          {/* Batch status change */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setBatchStatusOpen(o => !o)}
              disabled={bulkStatusMut.isPending}
              style={batchBtnStyle("rgba(59,130,246,0.10)", "rgba(59,130,246,0.25)", "#3b82f6")}
            >
              SET STATUS <ChevronDown size={10} />
            </button>
            {batchStatusOpen && (
              <>
                <div onClick={() => setBatchStatusOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                <div style={{
                  position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
                  background: "var(--bg-surface)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8, padding: 4, minWidth: 180,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.60)",
                }}>
                  {BATCH_STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => bulkStatusMut.mutate(s)}
                      style={{
                        width: "100%", textAlign: "left", padding: "6px 10px",
                        background: "transparent", border: "none", borderRadius: 4,
                        cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10,
                        color: "var(--text-secondary)",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bulk download */}
          <button onClick={handleBulkDownload} style={batchBtnStyle("rgba(139,92,246,0.10)", "rgba(139,92,246,0.25)", "#8b5cf6")}>
            <Download size={12} /> DOWNLOAD
          </button>

          {/* Bulk delete */}
          {!confirmBulkDelete ? (
            <button onClick={() => setConfirmBulkDelete(true)} style={batchBtnStyle("rgba(239,68,68,0.08)", "rgba(239,68,68,0.25)", "#ef4444")}>
              <Trash2 size={12} /> DELETE
            </button>
          ) : (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#ef4444", fontWeight: 700 }}>
                DELETE {selectedIds.size}?
              </span>
              <button
                onClick={() => bulkDeleteMut.mutate()}
                disabled={bulkDeleteMut.isPending}
                style={batchBtnStyle("rgba(239,68,68,0.20)", "rgba(239,68,68,0.40)", "#ef4444")}
              >
                {bulkDeleteMut.isPending ? "..." : "CONFIRM"}
              </button>
              <button onClick={() => setConfirmBulkDelete(false)} style={batchBtnStyle("rgba(255,255,255,0.06)", "rgba(255,255,255,0.12)", "var(--text-muted)")}>
                CANCEL
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Main content with left panel ─────────────────── */}
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* Left panel */}
        <DocumentLeftPanel
          documents={allDocuments}
          filteredCount={filteredDocs.length}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
        />

        {/* Main area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Status tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-default)", marginBottom: 12, flexShrink: 0 }}>
            {STATUS_TABS.map(tab => {
              const count = tab.key === "all" ? allDocuments.length : allDocuments.filter(d => d.status === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusTab(tab.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", background: "transparent",
                    color: statusTab === tab.key ? "var(--accent)" : "var(--text-muted)",
                    border: "none",
                    borderBottom: statusTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                    borderRadius: 0, marginBottom: -1,
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    fontWeight: statusTab === tab.key ? 700 : 500,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    cursor: "pointer", transition: "color 0.15s, border-color 0.15s",
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
            /* Hero empty state with dashed drop zone and document type icons */
            <div
              onClick={() => setUploadOpen(true)}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 16,
                margin: "12px 0", border: "2px dashed rgba(255,255,255,0.12)",
                borderRadius: 16, padding: "60px 24px", cursor: "pointer",
                transition: "border-color 0.2s, background 0.2s",
                backgroundImage: "radial-gradient(circle at 50% 50%, rgba(200,155,32,0.03) 0%, transparent 70%)",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.background = "var(--accent-muted)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "transparent"; }}
            >
              {/* Document type icons row */}
              <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                {[
                  { Icon: FileText, label: "PDF", color: "#F87171" },
                  { Icon: FileCode, label: "DWG", color: "#38BDF8" },
                  { Icon: File,     label: "IFC", color: "#A78BFA" },
                  { Icon: FileImage, label: "IMG", color: "#2DD4BF" },
                  { Icon: FileArchive, label: "ZIP", color: "#FBBF24" },
                ].map(({ Icon, label, color }) => (
                  <div key={label} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    opacity: 0.45,
                  }}>
                    <Icon size={24} style={{ color }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color, letterSpacing: "0.08em" }}>{label}</span>
                  </div>
                ))}
              </div>

              <CloudUpload size={52} style={{ color: "var(--accent)", opacity: 0.4 }} />
              <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--text-secondary)" }}>
                Drag files here or click Upload
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", maxWidth: 380, textAlign: "center", lineHeight: 1.7 }}>
                Drop drawings, specs, submittals, or any project document. Files are organized by category, discipline, and revision automatically.
              </div>
              <div style={{
                marginTop: 8, padding: "8px 20px",
                background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                borderRadius: "var(--radius-btn)", color: "var(--accent)",
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
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
            /* ── Grid View ──────────────────────────── */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, overflowY: "auto" }}>
              {filteredDocs.map(doc => (
                <div key={doc.id} style={{ position: "relative" }}>
                  <div
                    onClick={(e) => { e.stopPropagation(); toggleSelect(doc.id); }}
                    style={{
                      position: "absolute", top: 8, left: 8, zIndex: 10,
                      width: 18, height: 18, borderRadius: 4,
                      background: selectedIds.has(doc.id) ? "#10B981" : "rgba(0,0,0,0.5)",
                      border: selectedIds.has(doc.id) ? "2px solid #10B981" : "2px solid rgba(255,255,255,0.25)",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {selectedIds.has(doc.id) && <span style={{ color: "white", fontSize: 11, lineHeight: 1 }}>{"\u2714"}</span>}
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
            /* ── List View with sortable sticky headers ──────── */
            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* Sticky sortable header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 100px 80px 70px 80px 90px 100px",
                gap: 8, padding: "8px 12px",
                borderBottom: "2px solid rgba(255,255,255,0.10)",
                position: "sticky", top: 0, background: "var(--bg-surface-low)", zIndex: 2,
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}>
                <div onClick={() => {
                  if (selectedIds.size === filteredDocs.length) deselectAll();
                  else selectAll();
                }} style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: 3,
                    border: "2px solid " + (selectedIds.size === filteredDocs.length && filteredDocs.length > 0 ? "#10B981" : "rgba(255,255,255,0.25)"),
                    background: selectedIds.size === filteredDocs.length && filteredDocs.length > 0 ? "#10B981" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff",
                  }}>{selectedIds.size === filteredDocs.length && filteredDocs.length > 0 ? "\u2713" : ""}</div>
                </div>
                {[
                  { label: "Name",   sort: "name-asc",  sortAlt: "name-desc" },
                  { label: "Doc #",  sort: "doc-num",    sortAlt: null },
                  { label: "Rev",    sort: null,         sortAlt: null },
                  { label: "Type",   sort: null,         sortAlt: null },
                  { label: "Status", sort: "status",     sortAlt: null },
                  { label: "Size",   sort: "size-desc",  sortAlt: "size-asc" },
                  { label: "Date",   sort: "date-desc",  sortAlt: "date-asc" },
                ].map(col => {
                  const isSortable = col.sort !== null;
                  const isActive = sortKey === col.sort || sortKey === col.sortAlt;
                  return (
                    <div
                      key={col.label}
                      onClick={isSortable ? () => {
                        if (sortKey === col.sort && col.sortAlt) setSortKey(col.sortAlt);
                        else setSortKey(col.sort);
                      } : undefined}
                      style={{
                        fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                        color: isActive ? "var(--accent)" : "var(--text-muted)",
                        letterSpacing: "0.10em", textTransform: "uppercase",
                        cursor: isSortable ? "pointer" : "default",
                        display: "flex", alignItems: "center", gap: 3,
                        userSelect: "none", transition: "color 0.15s",
                      }}
                    >
                      {col.label}
                      {isSortable && (
                        <ArrowUpDown size={9} style={{
                          opacity: isActive ? 1 : 0.3,
                          color: isActive ? "var(--accent)" : "var(--text-muted)",
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Rows */}
              {filteredDocs.map(doc => {
                const isSelected = selectedIds.has(doc.id);
                const fsk = doc.fileSizeKb || 0;
                const sizeMB = fsk ? (fsk / 1024).toFixed(1) + " MB" : "\u2014";
                const rawDate = doc.uploadedDate || doc.created_at;
                const dateStr = rawDate ? new Date(rawDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014";

                /* Vibrant file type badge in list view */
                const listFileTypeCfg = {
                  pdf:  { bg: "rgba(239,68,68,0.18)",   color: "#F87171" },
                  dwg:  { bg: "rgba(56,189,248,0.18)",  color: "#38BDF8" },
                  ifc:  { bg: "rgba(167,139,250,0.18)", color: "#A78BFA" },
                  gltf: { bg: "rgba(167,139,250,0.18)", color: "#A78BFA" },
                  xlsx: { bg: "rgba(52,211,153,0.18)",  color: "#34D399" },
                  docx: { bg: "rgba(96,165,250,0.18)",  color: "#60A5FA" },
                  img:  { bg: "rgba(45,212,191,0.18)",  color: "#2DD4BF" },
                  zip:  { bg: "rgba(251,191,36,0.18)",  color: "#FBBF24" },
                }[doc.fileType] || { bg: "rgba(160,175,210,0.12)", color: "#A0AED2" };

                /* Status colors for list view */
                const listStatusCfg = {
                  "Approved":               { bg: "rgba(52,211,153,0.18)",  color: "#34D399" },
                  "Approved with Comments":  { bg: "rgba(52,211,153,0.12)", color: "#34D399" },
                  "Under Review":           { bg: "rgba(251,191,36,0.18)",  color: "#FBBF24" },
                  "Revise & Resubmit":       { bg: "rgba(251,146,60,0.18)", color: "#FB923C" },
                  "Rejected":               { bg: "rgba(248,113,113,0.18)", color: "#F87171" },
                  "Draft":                  { bg: "rgba(160,175,210,0.12)", color: "#A0AED2" },
                  "Issued":                 { bg: "rgba(96,165,250,0.18)",  color: "#60A5FA" },
                  "Superseded":             { bg: "rgba(100,116,139,0.12)", color: "#94A3B8" },
                  "Archived":               { bg: "rgba(100,116,139,0.08)", color: "#64748B" },
                  "Void":                   { bg: "rgba(248,113,113,0.10)", color: "#F87171" },
                }[doc.status] || { bg: "rgba(160,175,210,0.12)", color: "#A0AED2" };

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
                    <div onClick={e => { e.stopPropagation(); toggleSelect(doc.id); }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: 3,
                        border: "2px solid " + (isSelected ? "#10B981" : "rgba(255,255,255,0.25)"),
                        background: isSelected ? "#10B981" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff",
                      }}>{isSelected ? "\u2713" : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800,
                        padding: "2px 6px", borderRadius: 4,
                        background: listFileTypeCfg.bg, color: listFileTypeCfg.color,
                        flexShrink: 0, letterSpacing: "0.04em",
                      }}>
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
                        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                        padding: "2px 6px", borderRadius: 10,
                        background: listStatusCfg.bg, color: listStatusCfg.color,
                      }}>{doc.status || "Draft"}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>{sizeMB}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>{dateStr}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Folder View ────────────────────────── */
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
                      onToggleSelect={toggleSelect}
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

      {/* ── Document detail panel ────────────────────────── */}
      {selectedDoc && (
        <DocumentDetailPanel
          doc={selectedDoc}
          allDocuments={allDocuments}
          onClose={() => setSelectedDoc(null)}
          onEdit={handleEditDoc}
          onDelete={handleDeleteDoc}
        />
      )}

      {/* ── Edit modal ───────────────────────────────────── */}
      {editingDoc && (
        <DocumentEditModal
          projectId={activeProject?.id}
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
        />
      )}

      {/* ── Upload modal ─────────────────────────────────── */}
      {uploadOpen && (
        <UploadModal
          projectId={activeProject.id}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {/* ── Transmittal modal ────────────────────────────── */}
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
              borderRadius: 12, width: 520, maxHeight: "85vh",
              display: "flex", flexDirection: "column",
              boxShadow: "0 24px 60px rgba(0,0,0,0.75)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#10B981", letterSpacing: "0.06em" }}>GENERATE TRANSMITTAL</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{selectedIds.size} document{selectedIds.size !== 1 ? "s" : ""} selected</div>
              </div>
              <button onClick={() => setTransmittalOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>{"\u00D7"}</button>
            </div>

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

              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>Documents Included</div>
                {allDocuments.filter(d => selectedIds.has(d.id)).map(d => (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)" }}>{d.displayName || d.fileName}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>R{d.revisionNumber || "0"}</span>
                  </div>
                ))}
              </div>
            </div>

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
                {"\u2193"} GENERATE PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

/* ── batch button helper ────────────────────────────────────────────── */
function batchBtnStyle(bg, border, color) {
  return {
    padding: "5px 10px", background: bg, border: `1px solid ${border}`,
    color, borderRadius: 5, fontFamily: "var(--font-mono)", fontSize: 9,
    fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em",
    display: "flex", alignItems: "center", gap: 4,
  };
}
