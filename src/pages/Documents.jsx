/**
 * Documents — Document Management System (DMS) page.
 *
 * Presentation is a two-pane file browser (folder tree + contents table) in
 * ./documents/DocumentsControlCenter.tsx.
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
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { presentRemoteFile, presentRemoteFiles } from "@/lib/native/fileExport";
import DocumentDetailPanel from "@/components/dms/DocumentDetailPanel";
import FolderPicker, { collectFolderAndDescendants } from "@/components/dms/FolderPicker";
import { batchProcess } from "@/utils/batchProcess";
import DocumentsControlCenter from "./documents/DocumentsControlCenter";
import { filterDocuments, planFolderDeletion } from "./documents/documentsControlCenter.derive";
import { quickViewDocs, restorePatch } from "./documents/documentsBrowser.derive";

import { normalizeDocument, exportDocsCsv } from "./documents/utils";
import BatchActionBar from "./documents/BatchActionBar";
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

export default function Documents() {
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery]     = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [selectedDoc, setSelectedDoc]     = useState(null);
  const [uploadOpen, setUploadOpen]       = useState(false);
  const [editingDoc, setEditingDoc]       = useState(null);
  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [isDragOver, setIsDragOver]       = useState(false);
  // Which list the browser shows: the open folder, or a project-wide quick
  // view. Owned here so selection, export and filters act on the same rows
  // the table displays.
  const [docView, setDocView]             = useState("folder");
  // The recycle bin is only read once the user opens it.
  const recycleOpen = docView === "recycle";
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
  React.useEffect(() => { setCurrentFolderId(null); setDocView("folder"); }, [activeProject?.id]);

  /* ── Data ── */
  const { data: rawDocuments = [], isLoading, isError: docsError, error: docsErrorDetail, refetch: refetchDocs } = useQuery({
    queryKey: ["documents", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        // Complete read: a folder tree built from a capped page would drop
        // documents past the server row ceiling without saying so.
        ? entities.Document.filterAll({ project_id: activeProject.id })
        : [],
    enabled: !!activeProject?.id,
  });

  const allDocuments = useMemo(() => (rawDocuments || []).map(normalizeDocument), [rawDocuments]);

  /* ── Folders ── */
  const { data: folders = [] } = useQuery({
    queryKey: ["document-folders", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? entities.DocumentFolder.filterAll({ project_id: activeProject.id })
        : [],
    enabled: !!activeProject?.id,
  });

  /* ── Recycle bin (soft-deleted documents) ── */
  const {
    data: rawDeletedDocs = [],
    isLoading: deletedLoading,
    isError: deletedIsError,
    error: deletedErrorDetail,
  } = useQuery({
    queryKey: ["documents-deleted", activeProject?.id],
    // Complete read: a capped page would hide older tombstones with no way
    // to reach or restore them.
    queryFn: () =>
      entities.Document.filterAll({ project_id: activeProject.id, is_deleted: true }, "-deleted_at"),
    enabled: !!activeProject?.id && recycleOpen,
  });
  const deletedDocs = useMemo(() => (rawDeletedDocs || []).map(normalizeDocument), [rawDeletedDocs]);

  const restoreDocMut = useMutation({
    // A document whose folder has since been deleted would come back inside a
    // hidden folder and still be invisible, so it returns to the project root.
    mutationFn: async (doc) => {
      const { patch, folderGone } = restorePatch(doc, folders);
      await entities.Document.update(doc.id, patch);
      return { folderGone };
    },
    onSuccess: ({ folderGone }) => {
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      queryClient.invalidateQueries({ queryKey: ["documents-deleted", activeProject?.id] });
      toast.success(folderGone ? "Document restored to the project root (its folder was deleted)" : "Document restored");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Restore failed")),
  });

  const createFolderMut = useMutation({
    mutationFn: ({ name, parentFolderId }) =>
      entities.DocumentFolder.create(
        withProjectId({
          parent_folder_id: parentFolderId,
          name,
        }, activeProject?.id),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-folders", activeProject?.id] });
      toast.success("Folder created");
    },
    onError: (err) => {
      const msg = toUserErrorMessage(err, "Failed to create folder");
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
      const msg = toUserErrorMessage(err, "Failed to rename folder");
      if (/document_folders_unique_name_per_parent/.test(msg)) {
        toast.error("Another folder at this level already uses that name.");
      } else {
        toast.error(msg);
      }
    },
  });

  /**
   * Delete folders, promoting their contents first.
   *
   * `document_folders` is a soft-delete table, so the FK's ON DELETE CASCADE
   * never fires. Left alone, a deleted folder's documents and sub-folders keep
   * pointing at a hidden row: they match neither the root view (folder_id IS
   * NULL) nor any visible folder, and silently disappear from the UI. So we
   * reparent every survivor to the nearest ancestor that isn't being deleted
   * BEFORE tombstoning the folders — and abort the delete if that fails, so a
   * partial run can never strand documents.
   */
  const deleteFoldersWithReparent = useCallback(
    async (folderIds) => {
      const plan = planFolderDeletion(folders, allDocuments, folderIds);

      const folderMoves = await batchProcess(plan.folderReparents, (r) =>
        entities.DocumentFolder.update(r.id, { parent_folder_id: r.parent_folder_id }),
      );
      const docMoves = await batchProcess(plan.docReparents, (r) =>
        entities.Document.update(r.id, { folder_id: r.folder_id }),
      );
      if (folderMoves.failed.length > 0 || docMoves.failed.length > 0) {
        throw new Error("Could not move the folder's contents out — nothing was deleted.");
      }

      const { succeeded, failed } = await batchProcess(plan.deleteIds, (id) =>
        entities.DocumentFolder.delete(id),
      );
      if (failed.length > 0 && succeeded.length === 0) {
        throw new Error(`All ${failed.length} folder deletes failed.`);
      }
      return { succeeded, failed, promoted: plan.docReparents.length };
    },
    [folders, allDocuments],
  );

  const invalidateFolders = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["document-folders", activeProject?.id] });
    queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
  }, [queryClient, activeProject?.id]);

  const deleteFolderMut = useMutation({
    mutationFn: (id) => deleteFoldersWithReparent([id]),
    onSuccess: ({ promoted }) => {
      invalidateFolders();
      toast.success(
        promoted > 0
          ? `Folder deleted — ${promoted} document${promoted === 1 ? "" : "s"} moved up`
          : "Folder deleted",
      );
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Failed to delete folder")),
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
    onError: (err) => toast.error(toUserErrorMessage(err, "Move failed")),
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
    onError: (err) => toast.error(toUserErrorMessage(err, "Folder move failed")),
  });

  /**
   * Bulk-delete a set of folders. Same contents-promotion contract as
   * deleteFolderMut; an ancestor and its own child may both be in the set,
   * which planFolderDeletion resolves by skipping doomed ancestors.
   */
  const bulkDeleteFoldersMut = useMutation({
    mutationFn: (folderIds) => deleteFoldersWithReparent(folderIds),
    onSuccess: ({ succeeded, failed }) => {
      invalidateFolders();
      const total = succeeded.length + failed.length;
      if (failed.length === 0) {
        toast.success(`Deleted ${succeeded.length} folder${succeeded.length === 1 ? "" : "s"}`);
      } else {
        toast.warning(`Deleted ${succeeded.length} of ${total} — ${failed.length} failed`);
      }
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Bulk delete failed")),
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
        const row = await entities.DocumentFolder.create(
          withProjectId({
            parent_folder_id: parentId,
            name: item.name,
          }, activeProject?.id),
        );
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

  /* ── Filter (sorting lives in the browser) ── */
  // `filteredDocs` is exactly what the table shows for the active view.
  const filteredDocs = useMemo(() => {
    if (docView === "recycle") {
      return filterDocuments({ docs: deletedDocs, search: "", category: "All", statusTab: "all", currentFolderId: null, scope: "all", activeFilters });
    }
    if (docView === "recent" || docView === "review") {
      return filterDocuments({ docs: quickViewDocs(allDocuments, docView), search: "", category: "All", statusTab: "all", currentFolderId: null, scope: "all", activeFilters });
    }
    return filterDocuments({ docs: allDocuments, search: searchQuery, category: "All", statusTab: "all", currentFolderId, activeFilters });
  }, [docView, deletedDocs, allDocuments, searchQuery, activeFilters, currentFolderId]);

  React.useEffect(() => {
    const allowedIds = new Set(filteredDocs.map((doc) => doc.id));
    setSelectedIds((previous) => {
      const next = new Set([...previous].filter((id) => allowedIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [filteredDocs]);

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
    onError: (err) => toast.error(toUserErrorMessage(err, "Bulk status update failed")),
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
    onError: (err) => toast.error(toUserErrorMessage(err, "Bulk delete failed")),
  });

  /* ── Handlers ── */
  const handleFilterChange    = (key, value) => setActiveFilters((prev) => ({ ...prev, [key]: value }));
  const handleClearAllFilters = () => { setActiveFilters({}); setSearchQuery(""); };
  const handleEditDoc         = (doc) => setEditingDoc(doc);

  const handleDownloadDoc = async (doc) => {
    try {
      const url = await resolveFileUrl(doc.fileUrl || doc.file_url);
      if (!url) { toast.error("No file URL available"); return; }
      return await presentRemoteFile({
        url,
        filename: doc.fileName || doc.file_name || "download",
        title: doc.displayName || doc.title || "Document",
      });
    } catch (err) {
      toast.error(`Download failed: ${toUserErrorMessage(err, "Unknown error")}`);
    }
  };

  const handleDeleteDoc = async (doc) => {
    try {
      await entities.Document.delete(doc.id);
      queryClient.invalidateQueries({ queryKey: ["documents", activeProject?.id] });
      setSelectedIds((previous) => {
        if (!previous.has(doc.id)) return previous;
        const next = new Set(previous);
        next.delete(doc.id);
        return next;
      });
      toast.success("Document deleted");
    } catch (err) {
      toast.error(toUserErrorMessage(err, "Failed to delete document"));
    }
  };

  const handleBulkDownload = async () => {
    const docs = allDocuments.filter((d) => selectedIds.has(d.id));
    if (docs.length === 0) return;
    toast.info(`Preparing ${docs.length} file(s)...`);
    const { succeeded, failed } = await batchProcess(docs, async (doc) => {
      const url = await resolveFileUrl(doc.fileUrl || doc.file_url);
      if (!url) throw new Error("No file URL available");
      return {
        url,
        filename: doc.fileName || doc.file_name || "download",
      };
    }, 3);
    if (succeeded.length === 0) {
      toast.error(`Could not prepare ${failed.length} file(s).`);
      return;
    }
    const presentation = await presentRemoteFiles({
      files: succeeded.map(({ value }) => value),
      title: "Selected documents",
      errorLabel: "selected documents",
    });
    if (presentation !== "downloaded" && presentation !== "shared") return;
    if (failed.length > 0) {
      toast.warning(`${succeeded.length} ${presentation}, ${failed.length} failed`);
      return;
    }
    toast.success(`${succeeded.length} document(s) ${presentation}`);
  };

  const handleExportCsv = async () => {
    const presentation = await exportDocsCsv(filteredDocs, activeProject?.name);
    if (presentation !== "downloaded" && presentation !== "shared") return;
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

  const handleConfirmBulkDeleteDocs = () => {
    const n = selectedIds.size;
    if (n === 0) return;
    const ok = window.confirm(`Delete ${n} document${n === 1 ? "" : "s"}? This cannot be undone from the UI.`);
    if (ok) bulkDeleteMut.mutate();
  };

  /* ── Drag & drop ── */
  const onDragEnter = (e) => { e.preventDefault(); dragCounter.current++; setIsDragOver(true); };
  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragOver(false); }
  };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onDrop     = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setIsDragOver(false); setUploadOpen(true); };

  /* ── Render guard ── */
  if (!activeProject) {
    return (
      <div className="docs-empty-state" style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)" }}>
          Select a project to view documents
        </div>
      </div>
    );
  }

    const batchActions = (
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
    );

    const modals = (
      <>
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
              ? new Set(pickerFor.ids.flatMap((id) => [...collectFolderAndDescendants(folders, id)]))
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
        {/* One transmittal modal. It used to be rendered twice (here and
            again after the page), which stacked two copies when opened. */}
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
      </>
    );
    return (
      <>
        <DocumentsControlCenter
          projectName={activeProject?.name || ""}
          allDocuments={allDocuments}
          filteredDocs={filteredDocs}
          search={searchQuery}
          onSearch={setSearchQuery}
          onOpenDoc={setSelectedDoc}
          onExport={handleExportCsv}
          onUpload={() => setUploadOpen(true)}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={(checked) =>
            checked
              ? setSelectedIds(new Set(filteredDocs.map((d) => d.id)))
              : deselectAll()
          }
          folders={folders}
          currentFolderId={currentFolderId}
          onNavigateFolder={setCurrentFolderId}
          onCreateFolder={(name, parentFolderId) => createFolderMut.mutate({ name, parentFolderId })}
          onRenameFolder={(folder, name) => renameFolderMut.mutate({ id: folder.id, name })}
          onDeleteFolder={(folder) => deleteFolderMut.mutate(folder.id)}
          onBulkDeleteFolders={(ids) => bulkDeleteFoldersMut.mutate(ids)}
          onBulkMoveFolders={(ids) => setPickerFor({ kind: "folders", ids })}
          onOpenBulkCreateFolders={() => setBulkCreateOpen(true)}
          onMoveSelectedDocs={() => setPickerFor({ kind: "docs", ids: [...selectedIds] })}
          onDeleteSelectedDocs={handleConfirmBulkDeleteDocs}
          onClearSelection={deselectAll}
          onDownloadDoc={handleDownloadDoc}
          onEditDoc={handleEditDoc}
          onMoveDoc={(d) => setPickerFor({ kind: "docs", ids: [d.id] })}
          onDeleteDoc={handleDeleteDoc}
          onTransmittal={() => setTransmittalOpen(true)}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearAllFilters}
          isLoading={isLoading}
          loadError={docsError ? toUserErrorMessage(docsErrorDetail, "Something went wrong. Try again.") : null}
          onRetry={() => refetchDocs()}
          deletedDocs={deletedDocs}
          deletedLoading={recycleOpen && deletedLoading}
          deletedError={deletedIsError ? toUserErrorMessage(deletedErrorDetail, "Couldn’t read the recycle bin.") : null}
          view={docView}
          onViewChange={(v) => { setDocView(v); setSelectedIds(new Set()); }}
          onOpenRecycleBin={() => setDocView("recycle")}
          onRestoreDoc={(d) => restoreDocMut.mutate(d)}
          batchActions={batchActions}
          isDragOver={isDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
        {modals}
      </>
    );
  }
