/**
 * FolderBar — sits above the documents list and renders:
 *   - Breadcrumb showing the path from "All Documents" → … → current folder
 *   - Grid of child folders inside the current folder (click to enter)
 *   - "+ New Folder" / "Bulk Create" / "Rename" / "Delete" / "Move To" controls
 *
 * Folders live on the `document_folders` table (migration 060). NULL
 * parent_folder_id = root folder; documents whose `folder_id` is NULL
 * sit at the project root alongside top-level folders.
 *
 * Selection: each child folder card carries a checkbox; selecting one or
 * more reveals a bulk-action strip with Delete / Move To. Single-folder
 * actions live in a per-card ⋯ menu (Rename / Delete).
 *
 * Parent (Documents.jsx) owns the folder query + currentFolderId state
 * and supplies the create/rename/delete/move/bulk-create handlers. This
 * component is presentational + orchestration only.
 */

import React, { useMemo, useState, useEffect } from "react";
import {
  ChevronRight, FolderPlus, Folder, MoreHorizontal,
  CheckSquare, XCircle, Trash2, FolderInput, FolderTree,
} from "lucide-react";

const PILL_BTN = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "6px 12px",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
  cursor: "pointer", color: "var(--text-secondary)",
  transition: "all 0.12s",
};

const PRIMARY_BTN = {
  ...PILL_BTN,
  background: "var(--accent)",
  color: "var(--bg-base)",
  borderColor: "var(--accent)",
};

const CRUMB_LINK = {
  background: "none", border: "none", padding: 0,
  cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--text-secondary)",
};

const CRUMB_CURRENT = { ...CRUMB_LINK, color: "var(--text-primary)", cursor: "default" };

const CARD_STYLE = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 12px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  cursor: "pointer",
  transition: "all 0.12s",
  position: "relative",
};

/**
 * Walk up parent_folder_id chain from currentFolderId to build the
 * breadcrumb path. Bounded depth = 50 to defensively prevent
 * runaway loops if a cycle ever appeared in the data.
 */
function buildPath(folders, currentFolderId) {
  if (!currentFolderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = [];
  let cursor = byId.get(currentFolderId);
  let safety = 0;
  while (cursor && safety++ < 50) {
    path.unshift(cursor);
    cursor = cursor.parent_folder_id ? byId.get(cursor.parent_folder_id) : null;
  }
  return path;
}

export default function FolderBar({
  folders,                  // all folders for the project (active only)
  currentFolderId,          // null = root
  onNavigate,               // (folderId|null) => void
  onCreate,                 // (name, parentFolderId|null) => void
  onRename,                 // (folder, newName) => void
  onDelete,                 // (folder) => void

  // Bulk operations on folders. Parent supplies the handlers; we surface
  // the controls only when at least one folder is selected.
  onBulkDelete,             // (folderIds[]) => void
  onBulkMove,               // (folderIds[]) => void   — opens parent's FolderPicker
  onOpenBulkCreate,         // () => void              — opens BulkCreateFoldersModal
}) {
  const [menuFolderId, setMenuFolderId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Drop selection when the user navigates between folders so the bulk
  // strip doesn't carry stale ids from the previous view.
  useEffect(() => { setSelectedIds(new Set()); }, [currentFolderId]);

  const childFolders = useMemo(
    () => folders.filter((f) => (f.parent_folder_id ?? null) === (currentFolderId ?? null)),
    [folders, currentFolderId],
  );

  const path = useMemo(() => buildPath(folders, currentFolderId), [folders, currentFolderId]);

  const handleNewFolder = () => {
    const name = window.prompt(
      currentFolderId ? "New folder name (inside current folder):" : "New folder name:",
      "",
    );
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    onCreate(trimmed, currentFolderId ?? null);
  };

  const handleRename = (folder) => {
    setMenuFolderId(null);
    const next = window.prompt(`Rename folder "${folder.name}":`, folder.name || "");
    const trimmed = (next || "").trim();
    if (!trimmed || trimmed === folder.name) return;
    onRename(folder, trimmed);
  };

  const handleDelete = (folder) => {
    setMenuFolderId(null);
    const ok = window.confirm(
      `Delete folder "${folder.name}"?\n\n` +
      `Documents inside this folder will move to its parent (root if it has no parent). ` +
      `Sub-folders will also be removed.`
    );
    if (!ok) return;
    onDelete(folder);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Delete ${ids.length} folder${ids.length === 1 ? "" : "s"}?\n\n` +
      `Documents inside will be detached and fall back to the root view. ` +
      `Sub-folders will also be removed.`
    );
    if (!ok) return;
    onBulkDelete?.(ids);
    setSelectedIds(new Set());
  };

  const handleBulkMove = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    onBulkMove?.(ids);
    // Don't clear selection here — the parent closes the picker; if the
    // user cancels, selection should stay so they can retry.
  };

  const someSelected = selectedIds.size > 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10,
      padding: "10px 12px",
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 8,
    }}>
      {/* Breadcrumb + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
          <button
            style={path.length === 0 ? CRUMB_CURRENT : CRUMB_LINK}
            onClick={() => path.length > 0 && onNavigate(null)}
            disabled={path.length === 0}
            title="All documents"
          >
            ALL DOCUMENTS
          </button>
          {path.map((folder, i) => {
            const isLast = i === path.length - 1;
            return (
              <React.Fragment key={folder.id}>
                <ChevronRight size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <button
                  style={isLast ? CRUMB_CURRENT : CRUMB_LINK}
                  onClick={() => !isLast && onNavigate(folder.id)}
                  disabled={isLast}
                  title={folder.name}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <button
          onClick={onOpenBulkCreate}
          style={PILL_BTN}
          title="Paste a list of folders to create them all at once"
        >
          <FolderTree size={12} />
          Bulk Create
        </button>
        <button
          onClick={handleNewFolder}
          style={PRIMARY_BTN}
          title={currentFolderId ? "Create a sub-folder here" : "Create a top-level folder"}
        >
          <FolderPlus size={12} />
          New Folder
        </button>
      </div>

      {/* Bulk action strip — appears when ≥1 folder is selected */}
      {someSelected && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "8px 12px",
          background: "rgba(168,85,247,0.06)",
          border: "1px solid rgba(168,85,247,0.20)",
          borderRadius: 8,
        }}>
          <CheckSquare size={14} style={{ color: "#a855f7" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "#a855f7", letterSpacing: "0.06em" }}>
            {selectedIds.size} FOLDER{selectedIds.size === 1 ? "" : "S"} SELECTED
          </span>
          <div style={{ width: 1, height: 18, background: "var(--bg-surface-high)" }} />
          <button
            onClick={handleBulkMove}
            style={{ ...PILL_BTN, color: "#a855f7", borderColor: "rgba(168,85,247,0.40)" }}
            title="Move selected folders under a different parent"
          >
            <FolderInput size={12} /> Move To…
          </button>
          <button
            onClick={handleBulkDelete}
            style={{ ...PILL_BTN, color: "var(--status-error-bright)", borderColor: "rgba(255,61,61,0.40)" }}
            title="Delete all selected folders"
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={PILL_BTN}
            title="Clear selection"
          >
            <XCircle size={12} /> Clear
          </button>
        </div>
      )}

      {/* Child folders grid */}
      {childFolders.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
        }}>
          {childFolders.map((folder) => {
            const isMenuOpen = menuFolderId === folder.id;
            const isSelected = selectedIds.has(folder.id);
            return (
              <div
                key={folder.id}
                style={{
                  ...CARD_STYLE,
                  borderColor: isSelected ? "#a855f7" : "var(--border-default)",
                  background: isSelected ? "rgba(168,85,247,0.06)" : "var(--bg-surface)",
                }}
                onClick={() => onNavigate(folder.id)}
                onMouseEnter={(e) => {
                  if (isSelected) return;
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.background = "var(--bg-surface-high)";
                }}
                onMouseLeave={(e) => {
                  if (isSelected) return;
                  e.currentTarget.style.borderColor = "var(--border-default)";
                  e.currentTarget.style.background = "var(--bg-surface)";
                }}
              >
                {/* Selection checkbox */}
                <div
                  onClick={(e) => { e.stopPropagation(); toggleSelect(folder.id); }}
                  style={{
                    width: 16, height: 16, borderRadius: 3,
                    border: `2px solid ${isSelected ? "#a855f7" : "var(--text-muted)"}`,
                    background: isSelected ? "#a855f7" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                  title={isSelected ? "Unselect" : "Select"}
                  aria-pressed={isSelected}
                  role="checkbox"
                >
                  {isSelected && <span style={{ color: "white", fontSize: 10, lineHeight: 1 }}>{"✔"}</span>}
                </div>

                <Folder size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span style={{
                  flex: 1, minWidth: 0,
                  fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {folder.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFolderId(isMenuOpen ? null : folder.id);
                  }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: 4, color: "var(--text-muted)",
                  }}
                  aria-label="Folder actions"
                  title="Folder actions"
                >
                  <MoreHorizontal size={14} />
                </button>

                {isMenuOpen && (
                  <>
                    {/* Click-away catcher */}
                    <div
                      onClick={(e) => { e.stopPropagation(); setMenuFolderId(null); }}
                      style={{ position: "fixed", inset: 0, zIndex: 10 }}
                    />
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute", top: "100%", right: 0,
                        marginTop: 4,
                        background: "var(--bg-surface-high)",
                        border: "1px solid var(--border-default)",
                        borderRadius: 6,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        minWidth: 140,
                        zIndex: 20,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        onClick={() => handleRename(folder)}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "8px 12px", background: "none", border: "none",
                          fontFamily: "var(--font-body)", fontSize: 12,
                          color: "var(--text-primary)", cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDelete(folder)}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "8px 12px", background: "none", border: "none",
                          fontFamily: "var(--font-body)", fontSize: 12,
                          color: "var(--status-error)", cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
