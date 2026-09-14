/**
 * ProductionNotes — Weekly Production Meeting workspace.
 *
 * Modeled directly on the user's OneNote layout: one page per meeting date,
 * one row per project, bullets on the right, yellow highlight for urgent
 * items. The whole point is that it should feel like writing in OneNote —
 * inline editing, Enter to add a bullet, no modals, no chrome.
 *
 * Data model: layered on the existing `production_notes` table. One row per
 * bullet. A "meeting" is the set of notes whose `note_date` matches the
 * selected meeting date. `is_high_priority` powers the yellow highlight
 * (semantically identical: "this needs attention").
 *
 * Folders are org-scoped. Every bullet belongs to one folder. A folder may
 * be unlinked (General Notes), linked to one job, or linked to many. Access
 * is enforced server-side: a linked folder is visible only when the user has
 * every linked job.
 *
 * Deferred: print/PDF export, AI-generated bullets, drag-to-reorder.
 */

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, CalendarDays, FolderTree as FolderTreeIcon } from "lucide-react";
import { toast } from "sonner";
import { CommandBar, Button } from "@/components/design-system";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { useOrg } from "@/components/shared/OrgContext";
import { usePermissions } from "@/services/permissions";
import { FolderTree } from "@/components/productionnotes/FolderTree";
import { FolderLinkDialog } from "@/components/productionnotes/FolderLinkDialog";
import { ProductionNoteRows } from "@/components/productionnotes/ProductionNoteRows";
import { canManageFolderLinks, canOrganizeFolders } from "@/lib/noteFolders/domain";
import {
  deriveProductionNotesViewModel,
  formatLongDate,
  mostRecentTuesday,
  shiftDate,
} from "@/pages/productionNotes/productionNotesDerive";
import { useProductionNotesWorkspace } from "@/pages/productionNotes/useProductionNotesWorkspace";

export default function ProductionNotes() {
  const { currentOrg } = useOrg();
  const { role } = usePermissions();
  const orgId = currentOrg?.id ?? null;
  const canOrganize = canOrganizeFolders(role);
  const canManageLinks = canManageFolderLinks(role);

  const [meetingDate, setMeetingDate] = useState(mostRecentTuesday());
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectPickerQuery, setProjectPickerQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [folderNavOpen, setFolderNavOpen] = useState(false);
  const [linkingFolder, setLinkingFolder] = useState(null);

  const {
    projectsQuery,
    foldersQuery,
    notesQuery,
    selectedFolder,
    activeFolderId,
    createNote: createMut,
    updateNote: updateMut,
    deleteNote: deleteMut,
    createFolder: createFolderMut,
    renameFolder: renameFolderMut,
    archiveFolder: archiveFolderMut,
    linkFolder: linkFolderMut,
  } = useProductionNotesWorkspace({
    orgId,
    meetingDate,
    selectedFolderId,
    onSelectedFolderArchived: setSelectedFolderId,
    onLinksUpdated: () => setLinkingFolder(null),
  });
  const folderWorkspace = foldersQuery.data;
  const folders = folderWorkspace?.folders ?? [];
  const folderWorkspaceReady = Boolean(folderWorkspace && !foldersQuery.isError);
  const projects = projectsQuery.data ?? [];
  const notes = notesQuery.data ?? [];
  const {
    isLoading: notesLoading,
    isError: notesError,
    error: notesErrorValue,
    refetch: refetchNotes,
  } = notesQuery;

  useEffect(() => {
    if (!selectedFolderId && folderWorkspace?.general_notes_id) {
      setSelectedFolderId(folderWorkspace.general_notes_id);
    }
  }, [selectedFolderId, folderWorkspace?.general_notes_id]);

  const { projectsById, projectRows, availableProjects, totalBullets, highlightedCount } =
    useMemo(
      () => deriveProductionNotesViewModel(projects, notes, projectPickerQuery),
      [notes, projectPickerQuery, projects],
    );

  // ─── Actions ────────────────────────────────────────────────────────────
  const addProjectRow = (project) => {
    if (!activeFolderId) {
      toast.error("Select a folder first");
      return;
    }
    // Seed a single empty bullet so the row appears and is ready to type into.
    createMut.mutate({
      project_id: project.id,
      project_name: project.name,
      note_date: meetingDate,
      date_noted: meetingDate,
      folder_id: activeFolderId,
      content: "",
      category: "General",
      is_high_priority: false,
      is_resolved: false,
    });
    setProjectPickerOpen(false);
    setProjectPickerQuery("");
    // Focus the new row's draft input shortly after it appears.
    setTimeout(() => {
      const el = document.querySelector(`[data-bullet-project="${project.id}"] [data-bullet-input]:last-of-type`);
      if (el) el.focus();
    }, 200);
  };

  const addBullet = (projectId, content = "") => {
    const project = projectsById.get(projectId);
    if (!project || !activeFolderId) return;
    createMut.mutate({
      project_id: projectId,
      project_name: project.name,
      note_date: meetingDate,
      date_noted: meetingDate,
      folder_id: activeFolderId,
      content,
      category: "General",
      is_high_priority: false,
      is_resolved: false,
    });
  };

  const updateBulletText = (note, newText) => {
    if ((note.content || "") === newText) return;
    updateMut.mutate({ id: note.id, data: { content: newText } });
  };

  const updateBulletDates = (note, patch) => {
    updateMut.mutate({ id: note.id, data: patch });
  };

  const toggleHighlight = (note) => {
    updateMut.mutate({ id: note.id, data: { is_high_priority: !note.is_high_priority } });
  };

  const deleteBullet = (note) => {
    deleteMut.mutate(note.id);
  };

  return (
    <div className="sb-dashboard-reference-page" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-page)" }}>
      <style>{`
        .bullet-row:hover .bullet-actions { opacity: 1 !important; }
        @media print {
          button { display: none !important; }
          input, textarea { border: none !important; }
          * { background: white !important; color: black !important; }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--bg-surface-low)",
          borderBottom: "1px solid var(--divider)",
          padding: "14px 24px 4px",
        }}
      >
        <CommandBar
          eyebrow="WEEKLY PRODUCTION MEETING"
          title={formatLongDate(meetingDate)}
          count={totalBullets}
          unit=" · BULLETS"
          subtitle={
            [
              foldersQuery.isError ? "Folder data unavailable" : selectedFolder?.name || "Folders",
              highlightedCount > 0
                ? `${projectRows.length} project${projectRows.length === 1 ? "" : "s"} · ${highlightedCount} highlighted`
                : `${projectRows.length} project${projectRows.length === 1 ? "" : "s"}`,
            ].join(" · ")
          }
        >
          <button
            onClick={() => setFolderNavOpen((open) => !open)}
            title="Folders"
            style={navBtn()}
          >
            <FolderTreeIcon size={14} />
          </button>
          <button
            onClick={() => setMeetingDate(shiftDate(meetingDate, -7))}
            title="Previous week"
            style={navBtn()}
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            value={meetingDate}
            onChange={(e) => e.target.value && setMeetingDate(e.target.value)}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-btn)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "8px 10px",
              cursor: "pointer",
              colorScheme: "dark",
            }}
          />
          <button
            onClick={() => setMeetingDate(shiftDate(meetingDate, 7))}
            title="Next week"
            style={navBtn()}
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setMeetingDate(mostRecentTuesday())}
            title="Jump to most recent Tuesday"
            style={navBtn()}
          >
            <CalendarDays size={14} />
          </button>
          <Button
            variant="primary"
            icon="plus"
            disabled={!folderWorkspaceReady}
            onClick={() => setProjectPickerOpen(true)}
          >
            Add Project
          </Button>
        </CommandBar>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <div
          className="notes-folder-pane"
          style={{
            display: folderNavOpen ? "flex" : undefined,
          }}
        >
          <FolderTree
            folders={folders}
            selectedId={activeFolderId}
            onSelect={(id) => {
              setSelectedFolderId(id);
              setFolderNavOpen(false);
            }}
            onCreate={(parentFolderId, name) => createFolderMut.mutate({ parentFolderId, name })}
            onRename={(folder, name) => renameFolderMut.mutate({ folder, name })}
            onArchive={(folder) => archiveFolderMut.mutate(folder)}
            onLinkJobs={setLinkingFolder}
            projects={projects}
            canOrganize={folderWorkspaceReady && canOrganize}
            canManageLinks={folderWorkspaceReady && canManageLinks}
          />
        </div>
        <style>{`
          .notes-folder-pane { display: none; }
          @media (min-width: 840px) {
            .notes-folder-pane { display: flex; }
          }
          @media (max-width: 839px) {
            .notes-folder-pane[style*="flex"] {
              position: absolute;
              inset: 0 auto 0 0;
              z-index: 30;
              box-shadow: 12px 0 32px rgba(0,0,0,0.35);
            }
          }
        `}</style>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 96px" }}>
        <div
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            background: "var(--bg-surface)",
            overflow: "hidden",
            boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "260px 1fr",
              background: "var(--bg-surface)",
              borderBottom: "1px solid var(--border-default)",
            }}
          >
            <div
              style={{
                padding: "10px 18px",
                borderRight: "1px solid var(--divider)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              Project
            </div>
            <div
              style={{
                padding: "10px 18px",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              Notes
            </div>
          </div>

          {/* Rows */}
          {foldersQuery.isLoading ? (
            <div style={{ padding: "24px" }}>
              <LoadingSkeleton variant="table" rows={5} />
            </div>
          ) : foldersQuery.isError ? (
            <div
              role="alert"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "48px 24px",
                gap: 16,
              }}
            >
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
                Couldn’t load note folders
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 360 }}>
                {toUserErrorMessage(foldersQuery.error, "Folder data is unavailable. Notes cannot be safely edited until it loads.")}
              </p>
              <Button variant="outline" onClick={() => foldersQuery.refetch()}>Retry folders</Button>
            </div>
          ) : notesLoading && projectRows.length === 0 ? (
            <div style={{ padding: "24px" }}>
              <LoadingSkeleton variant="table" rows={5} />
            </div>
          ) : notesError && projectRows.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "48px 24px",
                gap: 16,
              }}
            >
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
                Couldn’t load production notes
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
                {toUserErrorMessage(notesErrorValue, "Something went wrong. Try again.")}
              </p>
              <Button variant="outline" onClick={() => refetchNotes()}>Retry</Button>
            </div>
          ) : projectRows.length === 0 ? (
            <div
              style={{
                padding: "60px 24px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              No notes for this meeting.
              <br />
              <Button
                variant="primary"
                icon="plus"
                disabled={!folderWorkspaceReady}
                onClick={() => setProjectPickerOpen(true)}
                style={{ marginTop: 12 }}
              >
                Add a project to get started
              </Button>
            </div>
          ) : (
            <ProductionNoteRows
              rows={projectRows}
              onUpdateBulletText={updateBulletText}
              onUpdateBulletDates={updateBulletDates}
              onToggleHighlight={toggleHighlight}
              onDeleteBullet={deleteBullet}
              onAddBullet={addBullet}
            />
          )}
        </div>
      </div>
      </div>

      {linkingFolder && (
        <FolderLinkDialog
          folder={linkingFolder}
          projects={projects}
          pending={linkFolderMut.isPending}
          onClose={() => setLinkingFolder(null)}
          onSave={(projectIds, makeIndependent) =>
            linkFolderMut.mutate({ folder: linkingFolder, projectIds, makeIndependent })
          }
        />
      )}

      {/* Project picker modal */}
      {projectPickerOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setProjectPickerOpen(false);
              setProjectPickerQuery("");
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              padding: 20,
              width: 460,
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--text-primary)",
                }}
              >
                Add project to meeting
              </span>
              <button
                onClick={() => {
                  setProjectPickerOpen(false);
                  setProjectPickerQuery("");
                }}
                style={{
                  width: 24,
                  height: 24,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={14} />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Search by name or number…"
              value={projectPickerQuery}
              onChange={(e) => setProjectPickerQuery(e.target.value)}
              style={{
                background: "var(--bg-surface-low)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                padding: "8px 12px",
                outline: "none",
              }}
            />
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {availableProjects.length === 0 && (
                <div
                  style={{
                    padding: 16,
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    textAlign: "center",
                  }}
                >
                  All projects are already on this meeting.
                </div>
              )}
              {availableProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProjectRow(p)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                    padding: "10px 12px",
                    border: "1px solid var(--divider)",
                    borderRadius: 6,
                    background: "var(--bg-surface-low)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--divider)")}
                >
                  {p.project_number && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--accent)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {p.project_number}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {p.name}
                  </span>
                  {p.gc_name && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--text-muted)",
                      }}
                    >
                      {p.gc_name}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Style helpers ───────────────────────────────────────────────────────────
function navBtn() {
  return {
    width: 32,
    height: 32,
    borderRadius: "var(--radius-btn)",
    border: "1px solid var(--border-default)",
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
