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

import React, { useState, useMemo, useCallback, useRef, Suspense, lazy } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entities, resolveFileUrl } from "@/api/supabaseClient";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { lazyWithRetry } from "@/lib/lazyRetry";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import DocumentCard from "@/components/dms/DocumentCard";
import DocumentFilters from "@/components/dms/DocumentFilters";
import DocumentLeftPanel from "@/components/dms/DocumentLeftPanel";
import DocumentDetailPanel from "@/components/dms/DocumentDetailPanel";
import FolderPicker, { collectFolderAndDescendants } from "@/components/dms/FolderPicker";
import { batchProcess } from "@/utils/batchProcess";
import EmptyStateAction from "@/components/shared/EmptyStateAction";

import { STATUS_TABS } from "./documents/constants";
import { normalizeDocument, exportDocsCsv } from "./documents/utils";
import FolderSection from "./documents/FolderSection";
import FolderBar from "./documents/FolderBar";
import Toolbar from "./documents/Toolbar";
import BatchActionBar from "./documents/BatchActionBar";
import ListView from "./documents/ListView";
import EmptyState from "./documents/EmptyState";
// Lazily loaded: generateTransmittal pulls in jspdf. Keeping the modal out of
// the static graph means the Documents page does not download the PDF export
// libs until the user actually generates a transmittal.
const TransmittalModal = lazy(() => import("./documents/TransmittalModal"));

// Upload / edit / bulk-folder modals only render when their dialog is open, so
// keep them off the Documents route chunk. lazyWithRetry survives stale-chunk
// 404s after a deploy (matches the app-wide route/modal split pattern).
const UploadModal = lazyWithRetry(() => import("@/components/dms/UploadModal"));
const DocumentEditModal = lazyWithRetry(() => import("@/components/dms/DocumentEditModal"));
const BulkCreateFoldersModal = lazyWithRetry(() => import("./documents/BulkCreateFoldersModal"));

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
  // null = root of the project's repo. Folder IDs are uuid strings from
  // document_folders. Switching projects resets to root via the effect
  // below.
  const [currentFolderId, setCurrentFolderId]     = useState(null);
  const [bulkCreateOpen, setBulkCreateOpen]       = useState(false);
  // Move dialog state. `pickerFor` = either `{ kind: 'docs', ids: [] }`
  // or `{ kind: 'folders', ids: [] }`. Drives a single FolderPicker
  // instance that handles both cases.
  const [pickerFor, setPickerFor]                 = useState(null);
  const dragCounter = useRef(0);

  // Reset folder navigation when the user switches projects so we never
  // accidentally show a folder from a different project.
  React.useEffect(() => { setCurrentFolderId(null); }, [activeProject?.id]);

  /* ── Data ── */
  const { data: rawDocuments = [], isLoading } = useQuery({
    queryKey: ["documents", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? entities.Document.filter({ project_id: activeProject.id })
        : [],
    enabled: !!activeProject?.id,
  });

  const allDocuments = useMemo(() => (rawDocuments || []).map(normalizeDocument), [rawDocuments]);

  /* ── Folders ── */
  const { data: folders = [] } = useQuery({
    queryKey: ["document-folders", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? entities.DocumentFolder.filter({ project_id: activeProject.id })
        : [],
    enabled: !!activeProject?.id,
  });

  const createFolderMut = useMutation({
    mutationFn: ({ name, parentFolderId }) =>
      entities.DocumentFolder.create({
        project_id: activeProject.id,
        parent_folder_id: parentFolderId,
        name,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-folders", activeProject?.id] });
      toast.success("Folder created");
    },
    onError: (err) => {
      const msg = err?.message || "Failed to create folder";
      // Surface the unique-name-per-parent collision in plain English.
      if (/document_folders_unique_name_per_parent/.test(msg)) {
        toast.error("A folder with that name already exists here.");
      } else {
        toast.error(msg);
      }
    },
  });

  const renameFolderMut = useMutation({
    mutationFn: ({ id, name }) => entities.DocumentFolder.update(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-folders", activeProject?.id] });
      toast.success("Folder renamed");
    },
    onError: (err) => {
      const msg = err?.message || "Failed to rename folder";
      if (/document_folders_unique_name_per_parent/.test(msg)) {
        toast.error("Another folder at this level already uses that name.");
      } else {
        toast.error(msg);
      }
    },
  });

  // Soft-delete the folder (is_deleted=true via the DrawingSet/Comment-style
  // soft-delete pattern in supabaseClient). Documents inside keep their
  // folder_id pointing at a now-hidden row, so they fall back to "root"
  // visually because the active-folder filter won't match any visible
  // folder. A future commit can either reparent docs to the deleted
  // folder's parent OR null their folder_id; for now the simple path is
  // good enough.
  const deleteFolderMut = useMutation({
    mutationFn: (id) => entities.DocumentFolder.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-folders", activeProject?.id] });
      // Also invalidate documents so the list re-renders without the
      // deleted folder's contents in case the user is browsing it.
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      toast.success("Folder deleted");
    },
    onError: (err) => toast.error(err?.message || "Failed to delete folder"),
  });

  /**
   * Move documents to a folder (or to root). The picker confirms the
   * destination; we batch-update each doc's folder_id and surface
   * partial-failure toasts so a single permission glitch doesn't
   * silently lose the whole batch.
   */
  const moveDocsMut = useMutation({
    mutationFn: async ({ docIds, destFolderId }) => {
      const { succeeded, failed } = await batchProcess(docIds, (id) =>
        entities.Document.update(id, { folder_id: destFolderId }),
      );
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      setSelectedIds(new Set());
      const total = succeeded.length + failed.length;
      if (failed.length === 0) {
        toast.success(`Moved ${succeeded.length} document${succeeded.length === 1 ? "" : "s"}`);
      } else {
        toast.warning(`Moved ${succeeded.length} of ${total} — ${failed.length} failed`);
      }
    },
    onError: (err) => toast.error(err?.message || "Move failed"),
  });

  /**
   * Reparent a set of folders. Same semantics as moveDocsMut but on
   * document_folders.parent_folder_id. Cycle prevention happens in the
   * FolderPicker UI via collectFolderAndDescendants — destinations
   * inside the moved sub-tree are disabled before the user can submit.
   */
  const moveFoldersMut = useMutation({
    mutationFn: async ({ folderIds, destFolderId }) => {
      const { succeeded, failed } = await batchProcess(folderIds, (id) =>
        entities.DocumentFolder.update(id, { parent_folder_id: destFolderId }),
      );
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["document-folders", activeProject?.id] });
      const total = succeeded.length + failed.length;
      if (failed.length === 0) {
        toast.success(`Moved ${succeeded.length} folder${succeeded.length === 1 ? "" : "s"}`);
      } else {
        toast.warning(`Moved ${succeeded.length} of ${total} — ${failed.length} failed`);
      }
    },
    onError: (err) => toast.error(err?.message || "Folder move failed"),
  });

  /**
   * Bulk-delete a set of folders. Mirrors deleteFolderMut but accepts
   * an array. Documents inside detach to root visually because the
   * filter won't match a hidden folder; cleanup pass to null
   * folder_id is a follow-up.
   */
  const bulkDeleteFoldersMut = useMutation({
    mutationFn: async (folderIds) => {
      const { succeeded, failed } = await batchProcess(folderIds, (id) =>
        entities.DocumentFolder.delete(id),
      );
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["document-folders", activeProject?.id] });
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      const total = succeeded.length + failed.length;
      if (failed.length === 0) {
        toast.success(`Deleted ${succeeded.length} folder${succeeded.length === 1 ? "" : "s"}`);
      } else {
        toast.warning(`Deleted ${succeeded.length} of ${total} — ${failed.length} failed`);
      }
    },
    onError: (err) => toast.error(err?.message || "Bulk delete failed"),
  });

  /**
   * Bulk-create folders from the textarea modal. The modal hands us a
   * parsed list of `{ name, depth, lineIndex }`; we walk it sequentially
   * (because children need their parent's id) and track a stack of
   * recently-created ancestor ids by depth. The first line in the list
   * with depth=0 becomes a child of `currentFolderId`.
   */
  const handleBulkCreateFolders = async (parsed) => {
    const stack = []; // index = depth, value = parent id (or null for root)
    let created = 0;
    const failed = [];
    for (const item of parsed) {
      const parentId = item.depth === 0
        ? (currentFolderId ?? null)
        : (stack[item.depth - 1] ?? currentFolderId ?? null);
      try {
        const row = await entities.DocumentFolder.create({
          project_id: activeProject.id,
          parent_folder_id: parentId,
          name: item.name,
        });
        stack[item.depth] = row?.id ?? null;
        // Truncate stack so deeper-level entries from a sibling don't
        // leak into the next branch.
        stack.length = item.depth + 1;
        created++;
      } catch (err) {
        const msg = (err?.message || "").includes("document_folders_unique_name_per_parent")
          ? "Duplicate name at this level."
          : (err?.message || "Create failed");
        failed.push({ ...item, error: msg });
        // Don't push anything on the stack for failed creates so children
        // of this line root to the same parent the failed line was going
        // to use — best-effort recovery.
      }
    }
    queryClient.invalidateQueries({ queryKey: ["document-folders", activeProject?.id] });
    if (failed.length === 0) {
      toast.success(`Created ${created} folder${created === 1 ? "" : "s"}`);
    } else {
      toast.warning(`Created ${created}, failed ${failed.length}`);
    }
    return { created, failed };
  };

  /* ── Filter + sort ── */
  const filteredDocs = useMemo(() => {
    let result = [...allDocuments];

    // Folder scoping. We compare against the raw column (folder_id) which
    // normalizeDocument carries through. Search overrides the folder
    // filter so users don't have to remember which folder they were in
    // when they search globally.
    if (!searchQuery.trim()) {
      result = result.filter((d) => (d.folder_id ?? null) === (currentFolderId ?? null));
    }

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
  }, [allDocuments, searchQuery, activeFilters, statusTab, sortKey, currentFolderId]);

  const reviewCount = useMemo(
    () => allDocuments.filter((d) => d.status === "Under Review" || d.status === "Revise & Resubmit").length,
    [allDocuments]
  );

  /* ── Mutations ── */
  const bulkStatusMut = useMutation({
    mutationFn: async (newStatus) => {
      const ids = [...selectedIds];
      const { succeeded, failed } = await batchProcess(ids, (id) =>
        entities.Document.update(id, { status: newStatus })
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
        entities.Document.delete(id)
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
      await entities.Document.delete(doc.id);
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
      <div className="sb-dashboard-reference-page" style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)" }}>
          Select a project to view documents
        </div>
      </div>
    );
  }

  return (
    <div
      className="sb-dashboard-reference-page"
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
        onBulkMove={() => setPickerFor({ kind: "docs", ids: [...selectedIds] })}
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

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ marginBottom: 12 }}>
            <FolderBar
              folders={folders}
              currentFolderId={currentFolderId}
              onNavigate={setCurrentFolderId}
              onCreate={(name, parentFolderId) => createFolderMut.mutate({ name, parentFolderId })}
              onRename={(folder, name) => renameFolderMut.mutate({ id: folder.id, name })}
              onDelete={(folder) => deleteFolderMut.mutate(folder.id)}
              onBulkDelete={(ids) => bulkDeleteFoldersMut.mutate(ids)}
              onBulkMove={(ids) => setPickerFor({ kind: "folders", ids })}
              onOpenBulkCreate={() => setBulkCreateOpen(true)}
            />
          </div>

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
            <EmptyStateAction
              icon="⊘"
              message={
                statusTab !== "all"
                  ? `No documents with status "${statusTab}" in this ${currentFolderId ? "folder" : "view"}`
                  : searchQuery.trim()
                    ? `No documents matching "${searchQuery.trim()}"`
                    : "No documents match the current filters"
              }
              actions={[
                { label: "Clear Filters", onClick: handleClearAllFilters },
                { label: "+ Upload Document", onClick: () => setUploadOpen(true), secondary: true },
              ]}
            />
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
                    onMove={(d) => setPickerFor({ kind: "docs", ids: [d.id] })}
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
        <Suspense fallback={null}>
          <DocumentEditModal
            projectId={activeProject?.id}
            doc={editingDoc}
            onClose={() => setEditingDoc(null)}
          />
        </Suspense>
      )}
      {uploadOpen && (
        <Suspense fallback={null}>
          <UploadModal
            projectId={activeProject.id}
            folderId={currentFolderId}
            onClose={() => setUploadOpen(false)}
          />
        </Suspense>
      )}

      {transmittalOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* Bulk-create folders dialog — mounted only while open so its lazy chunk
          loads on demand. */}
      {bulkCreateOpen && (
        <Suspense fallback={null}>
          <BulkCreateFoldersModal
            open={bulkCreateOpen}
            parentLabel={
              currentFolderId
                ? folders.find((f) => f.id === currentFolderId)?.name || "Current folder"
                : "(Root)"
            }
            onClose={() => setBulkCreateOpen(false)}
            onSubmit={handleBulkCreateFolders}
          />
        </Suspense>
      )}

      {/* Folder picker — reused for both moving documents and folders.
          When moving folders, the picker disables the moved folders +
          their entire descendant sub-trees so the user can't create a
          cycle (folder X → child of itself or one of its children). */}
      <FolderPicker
        open={!!pickerFor}
        title={
          pickerFor?.kind === "folders"
            ? `Move ${pickerFor.ids.length} folder${pickerFor.ids.length === 1 ? "" : "s"} to…`
            : `Move ${pickerFor?.ids?.length ?? 0} document${pickerFor?.ids?.length === 1 ? "" : "s"} to…`
        }
        folders={folders}
        initialFolderId={currentFolderId}
        disabledIds={
          pickerFor?.kind === "folders"
            // Disable the moved folders + every descendant of each.
            ? new Set(
                pickerFor.ids.flatMap((id) => [...collectFolderAndDescendants(folders, id)])
              )
            : new Set()
        }
        confirmLabel="Move"
        onClose={() => setPickerFor(null)}
        onConfirm={(destFolderId) => {
          if (!pickerFor) return;
          if (pickerFor.kind === "folders") {
            moveFoldersMut.mutate({ folderIds: pickerFor.ids, destFolderId });
          } else {
            moveDocsMut.mutate({ docIds: pickerFor.ids, destFolderId });
          }
          setPickerFor(null);
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
