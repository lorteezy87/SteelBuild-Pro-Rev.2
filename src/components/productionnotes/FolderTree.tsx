import React, { useMemo, useState } from "react";
import { Archive, FolderPlus, Link2, MoreHorizontal, Pencil } from "lucide-react";
import { buildFolderTree } from "@/lib/noteFolders/domain";
import type { VisibleNoteFolder } from "@/lib/noteFolders/types";

interface ProjectOption {
  id: string;
  name?: string | null;
  project_number?: string | null;
}

interface FolderTreeProps {
  folders: VisibleNoteFolder[];
  selectedId: string | null;
  onSelect: (folderId: string) => void;
  onCreate: (parentFolderId: string | null, name: string) => void;
  onRename: (folder: VisibleNoteFolder, name: string) => void;
  onArchive: (folder: VisibleNoteFolder) => void;
  onLinkJobs: (folder: VisibleNoteFolder) => void;
  projects: ProjectOption[];
  canOrganize: boolean;
  canManageLinks: boolean;
}

export function FolderTree({
  folders,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onArchive,
  onLinkJobs,
  projects,
  canOrganize,
  canManageLinks,
}: FolderTreeProps) {
  const [creatingUnder, setCreatingUnder] = useState<string | "root" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  const submitCreate = (parentId: string | null) => {
    const name = draftName.trim();
    if (!name) return;
    onCreate(parentId, name);
    setDraftName("");
    setCreatingUnder(null);
  };

  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: "1px solid var(--divider)",
        background: "var(--bg-surface-low)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "12px 14px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--text-muted)",
            textTransform: "uppercase",
          }}
        >
          Folders
        </span>
        {canOrganize && (
          <button
            type="button"
            title="New folder"
            onClick={() => {
              setCreatingUnder("root");
              setDraftName("");
            }}
            style={iconBtn()}
          >
            <FolderPlus size={13} />
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
        {creatingUnder === "root" && (
          <NameDraft
            value={draftName}
            onChange={setDraftName}
            onSubmit={() => submitCreate(null)}
            onCancel={() => setCreatingUnder(null)}
            placeholder="New folder"
          />
        )}
        {tree.map((node) => {
          const selected = node.id === selectedId;
          const jobLabels = node.effective_project_ids
            .map((id) => projectsById.get(id)?.project_number || projectsById.get(id)?.name)
            .filter(Boolean);
          return (
            <div key={node.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginLeft: node.depth * 12,
                  borderRadius: 6,
                  background: selected ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
                  border: selected ? "1px solid color-mix(in srgb, var(--accent) 40%, transparent)" : "1px solid transparent",
                }}
              >
                {renamingId === node.id ? (
                  <NameDraft
                    value={draftName}
                    onChange={setDraftName}
                    onSubmit={() => {
                      onRename(node, draftName);
                      setRenamingId(null);
                    }}
                    onCancel={() => setRenamingId(null)}
                    placeholder={node.name}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(node.id)}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      color: "var(--text-primary)",
                      padding: "7px 8px",
                      cursor: "pointer",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: node.is_system ? 700 : 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {node.name}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                      {node.independently_linked && (
                        <span style={chip("var(--accent)")}>Independent</span>
                      )}
                      {jobLabels.length === 0 ? (
                        <span style={chip("var(--text-muted)")}>General</span>
                      ) : (
                        jobLabels.slice(0, 3).map((label) => (
                          <span key={String(label)} style={chip("var(--text-secondary)")}>
                            {label}
                          </span>
                        ))
                      )}
                      {jobLabels.length > 3 && (
                        <span style={chip("var(--text-muted)")}>+{jobLabels.length - 3}</span>
                      )}
                    </div>
                  </button>
                )}
                {(canOrganize || canManageLinks) && renamingId !== node.id && (
                  <button
                    type="button"
                    onClick={() => setMenuId(menuId === node.id ? null : node.id)}
                    style={{ ...iconBtn(), marginRight: 4 }}
                    aria-label="Folder actions"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                )}
              </div>
              {menuId === node.id && (
                <div
                  style={{
                    margin: "4px 0 8px",
                    marginLeft: node.depth * 12 + 8,
                    border: "1px solid var(--border-default)",
                    borderRadius: 6,
                    background: "var(--bg-surface)",
                    overflow: "hidden",
                  }}
                >
                  {canOrganize && (
                    <MenuItem
                      icon={<FolderPlus size={12} />}
                      label="New subfolder"
                      onClick={() => {
                        setCreatingUnder(node.id);
                        setDraftName("");
                        setMenuId(null);
                      }}
                    />
                  )}
                  {canOrganize && !node.is_system && (
                    <MenuItem
                      icon={<Pencil size={12} />}
                      label="Rename"
                      onClick={() => {
                        setRenamingId(node.id);
                        setDraftName(node.name);
                        setMenuId(null);
                      }}
                    />
                  )}
                  {canManageLinks && (
                    <MenuItem
                      icon={<Link2 size={12} />}
                      label="Link jobs"
                      onClick={() => {
                        onLinkJobs(node);
                        setMenuId(null);
                      }}
                    />
                  )}
                  {canManageLinks && !node.is_system && (
                    <MenuItem
                      icon={<Archive size={12} />}
                      label="Archive"
                      onClick={() => {
                        onArchive(node);
                        setMenuId(null);
                      }}
                    />
                  )}
                </div>
              )}
              {creatingUnder === node.id && (
                <div style={{ marginLeft: (node.depth + 1) * 12 }}>
                  <NameDraft
                    value={draftName}
                    onChange={setDraftName}
                    onSubmit={() => submitCreate(node.id)}
                    onCancel={() => setCreatingUnder(null)}
                    placeholder="New subfolder"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function NameDraft({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder: string;
}) {
  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        if (value.trim()) onSubmit();
        else onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSubmit();
        }
        if (event.key === "Escape") onCancel();
      }}
      style={{
        width: "100%",
        margin: "4px 0",
        background: "var(--bg-surface)",
        border: "1px solid var(--accent)",
        borderRadius: 6,
        color: "var(--text-primary)",
        fontFamily: "var(--font-body)",
        fontSize: 12,
        padding: "6px 8px",
      }}
    />
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        border: "none",
        background: "transparent",
        color: "var(--text-primary)",
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        textAlign: "left",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function iconBtn(): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function chip(color: string): React.CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color,
    border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
    borderRadius: 999,
    padding: "1px 6px",
  };
}
