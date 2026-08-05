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
 * Deferred: print/PDF export, AI-generated bullets, drag-to-reorder.
 */

import React, { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { CommandBar, Button } from "@/components/design-system";
import { logActivity } from "@/services/auditLogger";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import {
  mostRecentTuesday,
  formatLongDate,
  shiftDate,
  indexProjectsById,
  buildProjectNoteRows,
  projectIdsWithRows,
  filterAvailableProjects,
  countHighlightedNotes,
} from "./productionNotes/productionNotesHelpers";
import {
  ProjectRow,
  navBtn,
} from "./productionNotes/ProductionNotesUi";

// ─── Page orchestrator ─────────────────────────────────────────────────────
export default function ProductionNotes() {
  const qc = useQueryClient();

  const [meetingDate, setMeetingDate] = useState(mostRecentTuesday());
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectPickerQuery, setProjectPickerQuery] = useState("");
  const [draftBullet, setDraftBullet] = useState({}); // { [projectId]: string }
  const draftInputRefs = useRef({});

  // ─── Data ───────────────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  // All notes for the selected meeting date.
  const {
    data: notes = [],
    isLoading: notesLoading,
    isError: notesError,
    error: notesErrorValue,
    refetch: refetchNotes,
  } = useQuery({
    queryKey: ["production-notes", meetingDate],
    queryFn: () => entities.ProductionNote.filter({ note_date: meetingDate }, "created_at"),
    staleTime: 30 * 1000,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────
  const createMut = useMutation({
    // Multi-project workspace: stamp the row's selected project, not nav project.
    mutationFn: (data) => entities.ProductionNote.create(withProjectId(data, data.project_id)),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["production-notes", meetingDate] });
      const previous = qc.getQueryData(["production-notes", meetingDate]);
      const optimistic = { ...data, id: `tmp-${Date.now()}-${Math.random()}`, _optimistic: true };
      qc.setQueryData(["production-notes", meetingDate], (old = []) => [...old, optimistic]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (err, _data, ctx) => {
      if (ctx?.previous) qc.setQueryData(["production-notes", meetingDate], ctx.previous);
      toast.error(toUserErrorMessage(err, "Failed to add bullet"));
    },
    onSuccess: (record, vars) => {
      qc.invalidateQueries({ queryKey: ["production-notes", meetingDate] });
      logActivity("production_note", "created", record, {
        projectId: vars.project_id,
        projectName: vars.project_name,
        description: `Added bullet to ${vars.project_name} (${meetingDate})`,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.ProductionNote.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ["production-notes", meetingDate] });
      const previous = qc.getQueryData(["production-notes", meetingDate]);
      qc.setQueryData(["production-notes", meetingDate], (old = []) =>
        old.map((n) => (n.id === id ? { ...n, ...data } : n))
      );
      return { previous };
    },
    onError: (err, _data, ctx) => {
      if (ctx?.previous) qc.setQueryData(["production-notes", meetingDate], ctx.previous);
      toast.error(toUserErrorMessage(err, "Update failed"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production-notes", meetingDate] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.ProductionNote.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["production-notes", meetingDate] });
      const previous = qc.getQueryData(["production-notes", meetingDate]);
      qc.setQueryData(["production-notes", meetingDate], (old = []) => old.filter((n) => n.id !== id));
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(["production-notes", meetingDate], ctx.previous);
      toast.error(toUserErrorMessage(err, "Delete failed"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production-notes", meetingDate] }),
  });

  // ─── Derived: group notes by project ────────────────────────────────────
  const projectsById = useMemo(
    () => indexProjectsById(projects),
    [projects],
  );

  // Each project's bullets, in insertion order. Skip optimistic-only projects.
  const projectRows = useMemo(
    () => buildProjectNoteRows(notes, projectsById),
    [notes, projectsById],
  );

  const projectsWithRows = useMemo(
    () => projectIdsWithRows(projectRows),
    [projectRows],
  );

  const availableProjects = useMemo(
    () => filterAvailableProjects(projects, projectsWithRows, projectPickerQuery),
    [projects, projectsWithRows, projectPickerQuery],
  );

  // ─── Actions ────────────────────────────────────────────────────────────
  const addProjectRow = (project) => {
    // Seed a single empty bullet so the row appears and is ready to type into.
    createMut.mutate({
      project_id: project.id,
      project_name: project.name,
      note_date: meetingDate,
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
    if (!project) return;
    createMut.mutate({
      project_id: projectId,
      project_name: project.name,
      note_date: meetingDate,
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

  const toggleHighlight = (note) => {
    updateMut.mutate({ id: note.id, data: { is_high_priority: !note.is_high_priority } });
  };

  const deleteBullet = (note) => {
    deleteMut.mutate(note.id);
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const totalBullets = notes.length;
  const highlightedCount = countHighlightedNotes(notes);

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
            highlightedCount > 0
              ? `${projectRows.length} project${projectRows.length === 1 ? "" : "s"} · ${highlightedCount} highlighted`
              : `${projectRows.length} project${projectRows.length === 1 ? "" : "s"}`
          }
        >
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
          <Button variant="primary" icon="plus" onClick={() => setProjectPickerOpen(true)}>
            Add Project
          </Button>
        </CommandBar>
      </div>

      {/* Body */}
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
          {notesLoading && projectRows.length === 0 ? (
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
              <Button variant="primary" icon="plus" onClick={() => setProjectPickerOpen(true)} style={{ marginTop: 12 }}>
                Add a project to get started
              </Button>
            </div>
          ) : (
            projectRows.map((row) => (
              <ProjectRow
                key={row.projectId}
                row={row}
                onUpdateBulletText={updateBulletText}
                onToggleHighlight={toggleHighlight}
                onDeleteBullet={deleteBullet}
                onAddBullet={addBullet}
              />
            ))
          )}
        </div>
      </div>

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

// ─── H4 fix: BulletRow + ProjectRow extracted to module scope ────────────────
// Previously defined INSIDE ProductionNotes, causing re-creation on every
// render which destroyed input focus and defeated optimistic updates.
