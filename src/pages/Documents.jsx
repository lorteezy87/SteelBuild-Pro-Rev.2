/**
 * Documents — Document Management System (DMS) page.
 *
 * After the carve-up this shell owns:
 *   1. React-Query fetch + mutations (bulk status + bulk delete).
 *   2. Derived data — normalized documents list, filtered/sorted
 *      view, review-queue count, filter state.
 *   3. Drag-and-drop wiring for the whole page.
 *   4. Composition of feature-folder components in `./documents/`.
 *
 * Visual blocks live under `src/pages/documents/`:
 *   constants / utils / FolderSection / Toolbar / BatchActionBar /
 *   ListView / EmptyState / TransmittalModal.
 */

import React, { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44, resolveFileUrl } from "@/api/base44Client";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/useProjectContext";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import DocumentCard from "@/components/dms/DocumentCard";
import DocumentFilters from "@/components/dms/DocumentFilters";
import DocumentLeftPanel from "@/components/dms/DocumentLeftPanel";
import DocumentDetailPanel from "@/components/dms/DocumentDetailPanel";
import UploadModal from "@/components/dms/UploadModal";
import DocumentEditModal from "@/components/dms/DocumentEditModal";
import { batchProcess } from "@/utils/batchProcess";

import { STATUS_TABS } from "./documents/constants";
import { normalizeDocument, exportDocsCsv } from "./documents/utils";
import FolderSection from "./documents/FolderSection";
import Toolbar from "./documents/Toolbar";
import BatchActionBar from "./documents/BatchActionBar";
import ListView from "./documents/ListView";
import EmptyState from "./documents/EmptyState";
import TransmittalModal from "./documents/TransmittalModal";

const SORT_FNS = {
  "name-asc":   (a, b) => (a.displayName || "").localeCompare(b.displayName || ""),
  "name-desc":  (a, b) => (b.displayName || "").localeCompare(a.displayName || ""),
  "date-desc":  (a, b) => new Date(b.uploadedDate || b.created_at || 0) - new Date(a.uploadedDate || a.created_at || 0),
  "date-asc":   (a, b) => new Date(a.uploadedDate || a.created_at || 0) - new Date(b.uploadedDate || b.created_at || 0),
  "status":     (a, b) => (a.status || "").localeCompare(b.status || ""),
  "size-desc":  (a, b) => (Number(b.fileSizeKb) || 0) - (Number(a.fileSizeKb) || 0),
  "size-asc":   (a, b) => (Number(a.fileSizeKb) || 0) - (Number(b.fileSizeKb) || 0),
  "doc-num":    (a, b) => (a.documentNumber || "").localeCompare(b.documentNumber || "", undefined, { numeric: true }),
};

export default function Documents() {
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode]           = useState("grid");
  const [searchQuery, setSearchQuery]     = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [statusTab, setStatusTab]         = useState("all");
  const [selectedDoc, setSelectedDoc]     = useState(null);
  const [uploadOpen, setUploadOpen]       = useState(false);
  const [editingDoc, setEditingDoc]       = useState(null);
  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [sortKey, setSortKey]             = useState("date-desc");
  const [isDragOver, setIsDragOver]       = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [transmittalOpen, setTransmittalOpen]     = useState(false);
  const [transmittalForm, setTransmittalForm]     = useState({ issuedTo: "", issuedBy: "", purpose: "For Review", notes: "", number: "" });
  const dragCounter = useRef(0);

  /* ── Data ── */
  const { data: rawDocuments = [], isLoading } = useQuery({
    queryKey: ["documents", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? base44.entities.Document.filter({ project_id: activeProject.id })
        : [],
    enabled: !!activeProject?.id,
  });

  const allDocuments = useMemo(() => (rawDocuments || []).map(normalizeDocument), [rawDocuments]);

  /* ── Filter + sort ── */
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

    if (activeFilters.category?.length)   result = result.filter((d) => activeFilters.category.includes(d.category));
    if (activeFilters.discipline?.length) result = result.filter((d) => activeFilters.discipline.includes(d.discipline));
    if (statusTab !== "all")              result = result.filter((d) => d.status === statusTab);
    else if (activeFilters.status?.length) result = result.filter((d) => activeFilters.status.includes(d.status));

    const fn = SORT_FNS[sortKey];
    if (fn) result.sort(fn);

    return result;
  }, [allDocuments, searchQuery, activeFilters, statusTab, sortKey]);

  const reviewCount = useMemo(
    () => allDocuments.filter((d) => d.status === "Under Review" || d.status === "Revise & Resubmit").length,
    [allDocuments]
  );

  /* ── Mutations ── */
  const bulkStatusMut = useMutation({
    mutationFn: async (newStatus) => {
      const ids = [...selectedIds];
      const { succeeded, failed } = await batchProcess(ids, (id) =>
        base44.entities.Document.update(id, { status: newStatus })
      );
      if (failed.length > 0 && succeeded.length === 0) {
        throw new Error(`All ${failed.length} updates failed.`);
      }
      return { succeeded, failed };
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      setSelectedIds(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success(`Updated ${results.succeeded.length} document(s)`);
      }
    },
    onError: (err) => toast.error(err?.message || "Bulk status update failed"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async () => {
      const ids = [...selectedIds];
      const { succeeded, failed } = await batchProcess(ids, (id) =>
        base44.entities.Document.delete(id)
      );
      if (failed.length > 0 && succeeded.length === 0) {
        throw new Error(`All ${failed.length} deletes failed.`);
      }
      return { succeeded, failed };
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      const count = results.succeeded.length;
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      if (results.failed.length > 0) {
        toast.warning(`${count} deleted, ${results.failed.length} failed`);
      } else {
        toast.success(`Deleted ${count} document(s)`);
      }
    },
    onError: (err) => toast.error(err?.message || "Bulk delete failed"),
  });

  /* ── Handlers ── */
  const handleFilterChange    = (key, value) => setActiveFilters((prev) => ({ ...prev, [key]: value }));
  const handleClearAllFilters = () => { setActiveFilters({}); setSearchQuery(""); setStatusTab("all"); };
  const handleViewDoc         = (doc) => setSelectedDoc(doc);
  const handleEditDoc         = (doc) => setEditingDoc(doc);
  const handleLinkDoc         = (doc) => setEditingDoc(doc);

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
    } catch {
      toast.error("Failed to delete document");
    }
  };

  const handleBulkDownload = async () => {
    const docs = allDocuments.filter((d) => selectedIds.has(d.id));
    toast.info(`Downloading ${docs.length} file(s)...`);
    const { failed } = await batchProcess(docs, (doc) => handleDownloadDoc(doc), 3);
    if (failed.length > 0) {
      toast.warning(`${docs.length - failed.length} downloaded, ${failed.length} failed`);
    }
  };

  const handleExportCsv = () => {
    exportDocsCsv(filteredDocs, activeProject?.name);
    toast.success(`Exported ${filteredDocs.length} documents to CSV`);
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => setSelectedIds(new Set(filteredDocs.map((d) => d.id)));
  const deselectAll = () => setSelectedIds(new Set());

  /* ── Drag & drop ── */
  const onDragEnter = (e) => { e.preventDefault(); dragCounter.current++; setIsDragOver(true); };
  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragOver(false); }
  };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onDrop     = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setIsDragOver(false); setUploadOpen(true); };

  /* ── Render guards ── */
  if (!activeProject) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)" }}>
          Select a project to view documents
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", gap: 16, position: "relative" }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 2500,
          background: "rgba(200,155,32,0.08)",
          border: "3px dashed var(--accent)",
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "var(--accent)", marginTop: 12, letterSpacing: "0.06em" }}>
              DROP FILES TO UPLOAD
            </div>
          </div>
        </div>
      )}

      <Toolbar
        allDocumentsCount={allDocuments.length}
        reviewCount={reviewCount}
        selectedCount={selectedIds.size}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortKey={sortKey}
        onSortChange={setSortKey}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onUploadOpen={() => setUploadOpen(true)}
        onExportCsv={handleExportCsv}
        onReviewQueueClick={() => { setStatusTab("Under Review"); setActiveFilters({}); }}
        onTransmittalOpen={() => setTransmittalOpen(true)}
      />

      <BatchActionBar
        selectedCount={selectedIds.size}
        filteredCount={filteredDocs.length}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        onSetStatus={(s) => bulkStatusMut.mutate(s)}
        isSettingStatus={bulkStatusMut.isPending}
        onBulkDownload={handleBulkDownload}
        onBulkDelete={() => setConfirmBulkDelete(true)}
        isBulkDeleting={bulkDeleteMut.isPending}
        confirmBulkDelete={confirmBulkDelete}
        onConfirmBulkDelete={() => bulkDeleteMut.mutate()}
        onCancelBulkDelete={() => setConfirmBulkDelete(false)}
      />

      {/* Main content area */}
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        <DocumentLeftPanel
          documents={allDocuments}
          filteredCount={filteredDocs.length}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
        />

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Status tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-default)", marginBottom: 12, flexShrink: 0 }}>
            {STATUS_TABS.map((tab) => {
              const count = tab.key === "all"
                ? allDocuments.length
                : allDocuments.filter((d) => d.status === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusTab(tab.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
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
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: statusTab === tab.key ? "var(--accent-muted)" : "var(--bg-surface-high)",
                      color: statusTab === tab.key ? "var(--accent)" : "var(--text-muted)",
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <DocumentFilters
            onFilterChange={handleFilterChange}
            activeFilters={activeFilters}
            onClearAll={handleClearAllFilters}
          />

          {isLoading ? (
            <div style={{ padding: 16 }}>
              <LoadingSkeleton variant="table" rows={6} />
            </div>
          ) : allDocuments.length === 0 ? (
            <EmptyState onUploadOpen={() => setUploadOpen(true)} />
          ) : filteredDocs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: 13 }}>
              No documents match the current filters.{" "}
              <button
                onClick={handleClearAllFilters}
                style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700 }}
              >
                CLEAR FILTERS
              </button>
            </div>
          ) : viewMode === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, overflowY: "auto" }}>
              {filteredDocs.map((doc) => (
                <div key={doc.id} style={{ position: "relative" }}>
                  <div
                    onClick={(e) => { e.stopPropagation(); toggleSelect(doc.id); }}
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      zIndex: 10,
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      background: selectedIds.has(doc.id) ? "#10B981" : "rgba(0,0,0,0.5)",
                      border: selectedIds.has(doc.id) ? "2px solid #10B981" : "2px solid var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selectedIds.has(doc.id) && (
                      <span style={{ color: "white", fontSize: 11, lineHeight: 1 }}>{"\u2714"}</span>
                    )}
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
            <ListView
              filteredDocs={filteredDocs}
              selectedIds={selectedIds}
              sortKey={sortKey}
              onSortChange={setSortKey}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onSelectDoc={setSelectedDoc}
            />
          ) : (
            /* Folder view */
            <FolderView
              filteredDocs={filteredDocs}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onViewDoc={handleViewDoc}
              onDownloadDoc={handleDownloadDoc}
              onEditDoc={handleEditDoc}
              onDeleteDoc={handleDeleteDoc}
            />
          )}
        </div>
      </div>

      {/* Detail / edit / upload modals */}
      {selectedDoc && (
        <DocumentDetailPanel
          doc={selectedDoc}
          allDocuments={allDocuments}
          onClose={() => setSelectedDoc(null)}
          onEdit={handleEditDoc}
          onDelete={handleDeleteDoc}
        />
      )}
      {editingDoc && (
        <DocumentEditModal
          projectId={activeProject?.id}
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
        />
      )}
      {uploadOpen && (
        <UploadModal
          projectId={activeProject.id}
          onClose={() => setUploadOpen(false)}
        />
      )}

      <TransmittalModal
        open={transmittalOpen}
        project={activeProject}
        selectedDocs={allDocuments.filter((d) => selectedIds.has(d.id))}
        form={transmittalForm}
        onFormChange={(key, value) => setTransmittalForm((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setTransmittalOpen(false)}
        onGenerated={() => {
          setTransmittalOpen(false);
          setTransmittalForm({ issuedTo: "", issuedBy: "", purpose: "For Review", notes: "", number: "" });
          setSelectedIds(new Set());
        }}
      />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function FolderView({ filteredDocs, selectedIds, onToggleSelect, onViewDoc, onDownloadDoc, onEditDoc, onDeleteDoc }) {
  const folders = {};
  filteredDocs.forEach((doc) => {
    const cat = doc.category || "Uncategorized";
    if (!folders[cat]) folders[cat] = [];
    folders[cat].push(doc);
  });
  const folderNames = Object.keys(folders).sort();

  return (
    <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
      {folderNames.map((folder) => (
        <FolderSection
          key={folder}
          name={folder}
          docs={folders[folder]}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onViewDoc={onViewDoc}
          onDownloadDoc={onDownloadDoc}
          onEditDoc={onEditDoc}
          onDeleteDoc={onDeleteDoc}
        />
      ))}
    </div>
  );
}
