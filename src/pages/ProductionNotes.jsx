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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Highlighter, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { CommandBar, Button } from "@/components/design-system";
import { logActivity } from "@/services/auditLogger";

// ─── Date helpers ──────────────────────────────────────────────────────────
const toISODate = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Default meeting date = the most recent Tuesday on or before today.
 * (User runs the meeting on Tuesdays per the OneNote example "4/21/2026"
 * which was a Tuesday. This is documented in the commit body.)
 */
const mostRecentTuesday = () => {
  const today = new Date();
  const dow = today.getDay(); // 0 = Sun, 2 = Tue
  const diff = (dow - 2 + 7) % 7;
  today.setDate(today.getDate() - diff);
  return toISODate(today);
};

const formatLongDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .toUpperCase()
    .replace(",", "");
};

const shiftDate = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISODate(dt);
};

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
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  // All notes for the selected meeting date.
  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["production-notes", meetingDate],
    queryFn: () => base44.entities.ProductionNote.filter({ note_date: meetingDate }, "created_at"),
    staleTime: 30 * 1000,
  });

  // ─── Mutations ──────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ProductionNote.create(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["production-notes", meetingDate] });
      const previous = qc.getQueryData(["production-notes", meetingDate]);
      const optimistic = { ...data, id: `tmp-${Date.now()}-${Math.random()}`, _optimistic: true };
      qc.setQueryData(["production-notes", meetingDate], (old = []) => [...old, optimistic]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (err, _data, ctx) => {
      if (ctx?.previous) qc.setQueryData(["production-notes", meetingDate], ctx.previous);
      toast.error(err.message || "Failed to add bullet");
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
    mutationFn: ({ id, data }) => base44.entities.ProductionNote.update(id, data),
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
      toast.error(err.message || "Update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production-notes", meetingDate] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ProductionNote.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["production-notes", meetingDate] });
      const previous = qc.getQueryData(["production-notes", meetingDate]);
      qc.setQueryData(["production-notes", meetingDate], (old = []) => old.filter((n) => n.id !== id));
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(["production-notes", meetingDate], ctx.previous);
      toast.error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production-notes", meetingDate] }),
  });

  // ─── Derived: group notes by project ────────────────────────────────────
  const projectsById = useMemo(() => {
    const m = new Map();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  // Each project's bullets, in insertion order. Skip optimistic-only projects.
  const projectRows = useMemo(() => {
    const grouped = new Map();
    notes.forEach((n) => {
      if (!n.project_id) return;
      if (!grouped.has(n.project_id)) grouped.set(n.project_id, []);
      grouped.get(n.project_id).push(n);
    });
    // Sort by project name for stable ordering.
    return Array.from(grouped.entries())
      .map(([projectId, bullets]) => ({
        projectId,
        project: projectsById.get(projectId),
        bullets,
      }))
      .filter((r) => r.project) // hide rows whose project was deleted
      .sort((a, b) => (a.project?.name || "").localeCompare(b.project?.name || ""));
  }, [notes, projectsById]);

  const projectsWithRows = useMemo(() => new Set(projectRows.map((r) => r.projectId)), [projectRows]);

  const availableProjects = useMemo(() => {
    const q = projectPickerQuery.trim().toLowerCase();
    return projects
      .filter((p) => !projectsWithRows.has(p.id))
      .filter((p) =>
        !q ||
        (p.name || "").toLowerCase().includes(q) ||
        (p.project_number || "").toLowerCase().includes(q)
      )
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [projects, projectsWithRows, projectPickerQuery]);

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
  const highlightedCount = notes.filter((n) => n.is_high_priority).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-page)" }}>
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
          {projectRows.length === 0 && !notesLoading && (
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
          )}

          {notesLoading && projectRows.length === 0 && (
            <div
              style={{
                padding: "60px 24px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.1em",
              }}
            >
              LOADING…
            </div>
          )}

          {projectRows.map((row) => (
            <ProjectRow
              key={row.projectId}
              row={row}
              onUpdateBulletText={updateBulletText}
              onToggleHighlight={toggleHighlight}
              onDeleteBullet={deleteBullet}
              onAddBullet={addBullet}
            />
          ))}
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

function BulletRow({ note, projectId, isLast, onCreateNext, onUpdateBulletText, onToggleHighlight, onDeleteBullet }) {
  const [text, setText] = useState(note.content || "");
  const inputRef = useRef(null);

  useEffect(() => {
    setText(note.content || "");
  }, [note.id, note.content]);

  const commit = () => {
    const trimmed = text.replace(/\s+$/, "");
    if (trimmed !== (note.content || "")) {
      onUpdateBulletText(note, trimmed);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
      if (isLast) {
        if (text.trim()) onCreateNext();
      } else {
        const all = document.querySelectorAll(`[data-bullet-project="${projectId}"] [data-bullet-input]`);
        const idx = Array.from(all).indexOf(e.currentTarget);
        if (idx >= 0 && all[idx + 1]) all[idx + 1].focus();
      }
    } else if (e.key === "Backspace" && text === "" && !note._optimistic) {
      e.preventDefault();
      const all = document.querySelectorAll(`[data-bullet-project="${projectId}"] [data-bullet-input]`);
      const idx = Array.from(all).indexOf(e.currentTarget);
      onDeleteBullet(note);
      setTimeout(() => {
        const updated = document.querySelectorAll(`[data-bullet-project="${projectId}"] [data-bullet-input]`);
        if (updated[idx - 1]) updated[idx - 1].focus();
      }, 50);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
      e.preventDefault();
      onToggleHighlight(note);
    }
  };

  const highlighted = !!note.is_high_priority;

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 6px",
        borderRadius: 4,
        background: highlighted ? "rgba(234,179,8,0.18)" : "transparent",
        borderLeft: highlighted ? "3px solid var(--status-warning)" : "3px solid transparent",
        transition: "background 0.15s",
      }}
      className="bullet-row"
    >
      <span style={{ color: highlighted ? "var(--status-warning)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 14, lineHeight: 1.5, paddingTop: 1, userSelect: "none" }}>•</span>
      <textarea
        ref={inputRef}
        data-bullet-input
        value={text}
        rows={1}
        onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
        onFocus={(e) => { e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={isLast ? "Type a bullet — Enter for next, Ctrl+H to highlight" : ""}
        style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.55, padding: "1px 0", fontWeight: highlighted ? 600 : 400 }}
      />
      <div className="bullet-actions" style={{ display: "flex", gap: 4, opacity: 0.65, transition: "opacity 0.15s" }}>
        <button title="Highlight (Ctrl+H)" onClick={() => onToggleHighlight(note)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid transparent", background: highlighted ? "rgba(234,179,8,0.25)" : "transparent", color: highlighted ? "var(--status-warning)" : "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Highlighter size={12} />
        </button>
        <button title="Delete bullet" onClick={() => onDeleteBullet(note)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid transparent", background: "transparent", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--status-error)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function ProjectRow({ row, onUpdateBulletText, onToggleHighlight, onDeleteBullet, onAddBullet }) {
  const { project, bullets, projectId } = row;
  const renderable = bullets.length > 0 ? bullets : [];

  return (
    <div data-bullet-project={projectId} style={{ display: "grid", gridTemplateColumns: "260px 1fr", borderTop: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
      <div style={{ padding: "14px 18px", borderRight: "1px solid var(--divider)", background: "var(--bg-surface-low)", display: "flex", flexDirection: "column", gap: 4, minHeight: 60 }}>
        {project.project_number && (<span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.1em" }}>{project.project_number}</span>)}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3, wordBreak: "break-word" }}>{project.name}</span>
        {project.gc_name && (<span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.05em" }}>{project.gc_name}</span>)}
      </div>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
        {renderable.map((note, idx) => (
          <BulletRow
            key={note.id}
            note={note}
            projectId={projectId}
            isLast={idx === renderable.length - 1}
            onCreateNext={() => onAddBullet(projectId, "")}
            onUpdateBulletText={onUpdateBulletText}
            onToggleHighlight={onToggleHighlight}
            onDeleteBullet={onDeleteBullet}
          />
        ))}
        <button onClick={() => onAddBullet(projectId, "")} style={{ alignSelf: "flex-start", marginTop: 4, padding: "3px 8px", borderRadius: 4, border: "1px dashed var(--divider)", background: "transparent", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--divider)"; }}>
          <Plus size={11} /> Add bullet
        </button>
      </div>
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
