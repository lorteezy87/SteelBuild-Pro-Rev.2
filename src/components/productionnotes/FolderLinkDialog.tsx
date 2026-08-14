import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { computeAccessImpact } from "@/lib/noteFolders/domain";
import type { VisibleNoteFolder } from "@/lib/noteFolders/types";

interface ProjectOption {
  id: string;
  name?: string | null;
  project_number?: string | null;
}

interface FolderLinkDialogProps {
  folder: VisibleNoteFolder;
  projects: ProjectOption[];
  onClose: () => void;
  onSave: (projectIds: string[], makeIndependent: boolean) => void;
  pending?: boolean;
}

export function FolderLinkDialog({
  folder,
  projects,
  onClose,
  onSave,
  pending,
}: FolderLinkDialogProps) {
  const [selected, setSelected] = useState<string[]>(folder.effective_project_ids);
  const isChild = folder.parent_folder_id != null;
  const [inheritParent, setInheritParent] = useState(isChild && folder.link_mode === "inherited");
  const makeIndependent = !isChild || !inheritParent;
  const impact = useMemo(
    () => computeAccessImpact(folder.effective_project_ids, inheritParent ? folder.effective_project_ids : selected),
    [folder.effective_project_ids, inheritParent, selected],
  );

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const named = (ids: string[]) =>
    ids
      .map((id) => projects.find((project) => project.id === id)?.name || id)
      .join(", ");

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 20,
          width: 480,
          maxHeight: "78vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Link jobs
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)" }}>
              {folder.name}
              {isChild && makeIndependent ? " · independently linked" : ""}
              {isChild && inheritParent ? " · inherits parent jobs" : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          People can open this folder only if they currently have access to every linked job.
          Leave every job unchecked to keep it as a general-notes folder.
        </p>

        {isChild && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={inheritParent}
              onChange={(event) => setInheritParent(event.target.checked)}
            />
            Inherit parent job links
          </label>
        )}

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {projects.map((project) => {
            const checked = selected.includes(project.id);
            return (
              <label
                key={project.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  border: "1px solid var(--divider)",
                  borderRadius: 6,
                  background: checked
                    ? "color-mix(in srgb, var(--accent) 10%, var(--bg-surface-low))"
                    : "var(--bg-surface-low)",
                  cursor: inheritParent ? "not-allowed" : "pointer",
                  opacity: inheritParent ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={inheritParent}
                  onChange={() => toggle(project.id)}
                />
                <span style={{ display: "flex", flexDirection: "column" }}>
                  {project.project_number && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>
                      {project.project_number}
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700 }}>
                    {project.name}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {(impact.accessTightens || impact.accessLoosens) && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background: "color-mix(in srgb, var(--status-warning) 14%, transparent)",
              color: "var(--text-primary)",
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {impact.accessTightens && impact.addedJobIds.length > 0 && (
              <div>
                Adding {named(impact.addedJobIds)} will hide this folder from anyone who lacks those jobs.
              </div>
            )}
            {impact.accessLoosens && impact.removedJobIds.length > 0 && (
              <div>
                Removing {named(impact.removedJobIds)} loosens access for people who still have the remaining jobs.
              </div>
            )}
            {selected.length === 0 && (
              <div>No jobs selected — this becomes a general-notes folder for workspace members.</div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={ghostBtn()}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onSave(inheritParent ? [] : selected, makeIndependent)}
            style={primaryBtn()}
          >
            {pending ? "Saving…" : "Save links"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ghostBtn(): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: "var(--radius-btn)",
    border: "1px solid var(--border-default)",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
  };
}

function primaryBtn(): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: "var(--radius-btn)",
    border: "none",
    background: "var(--accent)",
    color: "var(--bg-page)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 700,
  };
}
