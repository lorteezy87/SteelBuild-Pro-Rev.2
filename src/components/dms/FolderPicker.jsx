/**
 * FolderPicker — modal that shows a folder tree and lets the caller
 * pick a destination folder (or "Root").
 *
 * Used in three places:
 *   - Move a single document to a folder (per-card "Move…" action)
 *   - Bulk-move selected documents (BatchActionBar)
 *   - Reparent selected folders (FolderBar bulk action)
 *
 * The `disabledIds` prop lets callers grey out folders that would be
 * invalid destinations (e.g. when reparenting folder X, X itself and
 * all its descendants are disabled to prevent cycles).
 *
 * Folders come in flat from the parent (already RLS-scoped to the
 * current project); we build the tree client-side here so we don't
 * pre-compute the same structure in two places.
 */

import React, { useMemo, useState } from "react";
import { Folder, FolderOpen, ChevronRight, ChevronDown, X } from "lucide-react";

const overlay = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.6)",
  zIndex: 2000,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const dialog = {
  background: "var(--bg-surface-secondary)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  width: "min(540px, 92vw)",
  maxHeight: "min(720px, 90vh)",
  display: "flex", flexDirection: "column",
};

const header = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--border-default)",
  display: "flex", alignItems: "center", justifyContent: "space-between",
  flexShrink: 0,
};

const footer = {
  padding: "12px 16px",
  borderTop: "1px solid var(--border-default)",
  display: "flex", justifyContent: "flex-end", gap: 8,
  flexShrink: 0,
};

const btn = (variant = "secondary") => ({
  padding: "8px 14px",
  borderRadius: 6,
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
  cursor: "pointer",
  border: variant === "primary" ? "1px solid var(--accent)" : "1px solid var(--border-default)",
  background: variant === "primary" ? "var(--accent)" : "transparent",
  color: variant === "primary" ? "var(--bg-base)" : "var(--text-primary)",
});

/**
 * Build a tree from the flat folders array. `null` parent_folder_id
 * roots become top-level entries. Active rows only — soft-deleted
 * folders are skipped before we get here.
 */
function buildTree(folders) {
  const byParent = new Map();
  for (const f of folders) {
    const key = f.parent_folder_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(f);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  return byParent;
}

/**
 * Collect a folder and ALL its descendants. Used to compute the
 * "disabled" set when reparenting: a folder can never move under
 * itself or any of its children. Bounded depth defends against
 * any cycle that might somehow appear in the data.
 */
export function collectFolderAndDescendants(folders, rootId) {
  const ids = new Set();
  if (!rootId) return ids;
  const childrenByParent = new Map();
  for (const f of folders) {
    const k = f.parent_folder_id ?? null;
    if (!childrenByParent.has(k)) childrenByParent.set(k, []);
    childrenByParent.get(k).push(f);
  }
  const stack = [rootId];
  let safety = 0;
  while (stack.length && safety++ < 1000) {
    const cur = stack.pop();
    if (ids.has(cur)) continue;
    ids.add(cur);
    const kids = childrenByParent.get(cur) || [];
    for (const k of kids) stack.push(k.id);
  }
  return ids;
}

function TreeNode({ folder, byParent, depth, selectedId, onSelect, expandedIds, toggleExpand, disabledIds }) {
  const children = byParent.get(folder.id) || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedId === folder.id;
  const isDisabled = disabledIds.has(folder.id);

  return (
    <div>
      <div
        onClick={() => !isDisabled && onSelect(folder.id)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 10px",
          paddingLeft: 10 + depth * 16,
          background: isSelected ? "var(--accent-muted)" : "transparent",
          borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
          cursor: isDisabled ? "not-allowed" : "pointer",
          opacity: isDisabled ? 0.4 : 1,
        }}
        onMouseEnter={(e) => { if (!isDisabled && !isSelected) e.currentTarget.style.background = "var(--hover-bg)"; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(folder.id); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)", display: "flex" }}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span style={{ width: 12, display: "inline-block" }} />
        )}
        {isExpanded && hasChildren ? (
          <FolderOpen size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
        ) : (
          <Folder size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
        )}
        <span style={{
          fontFamily: "var(--font-body)", fontSize: 13,
          color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
          fontWeight: isSelected ? 600 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          minWidth: 0, flex: 1,
        }}>
          {folder.name}
        </span>
      </div>
      {isExpanded && children.map((child) => (
        <TreeNode
          key={child.id}
          folder={child}
          byParent={byParent}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          disabledIds={disabledIds}
        />
      ))}
    </div>
  );
}

export default function FolderPicker({
  open,
  title = "Move to folder",
  description,
  folders = [],
  initialFolderId = null,         // pre-select (e.g. current folder)
  disabledIds = new Set(),        // ids that can't be picked (cycle prevention)
  allowRoot = true,               // expose a "(Root)" entry
  confirmLabel = "Move",
  onConfirm,                      // (folderId|null) => void
  onClose,
}) {
  // null = root selected. undefined = nothing selected (button disabled).
  const [selectedId, setSelectedId] = useState(initialFolderId);
  const byParent = useMemo(() => buildTree(folders), [folders]);
  const roots = byParent.get(null) || [];

  // Default: expand roots so the user sees the tree without clicking.
  // Once they expand/collapse, their state takes over.
  const [expandedIds, setExpandedIds] = useState(() => new Set(roots.map((r) => r.id)));
  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (!open) return null;

  const canConfirm = selectedId !== undefined;

  return (
    <div style={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Folder Picker
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
              {title}
            </div>
            {description && (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {description}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {allowRoot && (
            <div
              onClick={() => setSelectedId(null)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 12px",
                background: selectedId === null ? "var(--accent-muted)" : "transparent",
                borderLeft: selectedId === null ? "2px solid var(--accent)" : "2px solid transparent",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { if (selectedId !== null) e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { if (selectedId !== null) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 12, display: "inline-block" }} />
              <Folder size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span style={{
                fontFamily: "var(--font-body)", fontSize: 13,
                color: selectedId === null ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: selectedId === null ? 600 : 400,
              }}>
                (Root — All Documents)
              </span>
            </div>
          )}
          {roots.length === 0 && !allowRoot && (
            <div style={{ padding: 24, textAlign: "center", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
              No folders exist yet.
            </div>
          )}
          {roots.map((root) => (
            <TreeNode
              key={root.id}
              folder={root}
              byParent={byParent}
              depth={0}
              selectedId={selectedId}
              onSelect={(id) => !disabledIds.has(id) && setSelectedId(id)}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              disabledIds={disabledIds}
            />
          ))}
        </div>

        <div style={footer}>
          <button onClick={onClose} style={btn("secondary")}>Cancel</button>
          <button
            onClick={() => onConfirm(selectedId ?? null)}
            disabled={!canConfirm}
            style={{
              ...btn("primary"),
              opacity: canConfirm ? 1 : 0.5,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
