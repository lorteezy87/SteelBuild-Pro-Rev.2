
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Printer,
  ChevronDown,
  ChevronRight,
  Flag as FlagIcon,
  Trash2,
  Check as CheckIcon,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import DeleteDialog from "@/components/shared/DeleteDialog";

const CATEGORY_COLORS = {
  General: "var(--text-muted)",
  Safety: "var(--status-error)",
  Quality: "var(--status-warning)",
  Schedule: "var(--status-info)",
  Fabrication: "var(--accent)",
  Erection: "var(--status-success)",
};

const PHASE_COLORS = {
  Detailing: "var(--status-info)",
  Fabrication: "var(--accent)",
  Delivery: "var(--status-warning)",
  "Erection/Installation": "var(--phase-erection)",
  Closeout: "var(--status-success)",
};

const healthOrder = { "At Risk": 0, Watch: 1, "On Track": 2 };
export default function ProductionNotes() {
  const qc = useQueryClient();

  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split("T")[0]);
  const [showDateInput, setShowDateInput] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [categoryFilters, setCategoryFilters] = useState({});
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editBuffer, setEditBuffer] = useState({});
  const [quickAddState, setQuickAddState] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [convertTarget, setConvertTarget] = useState(null); // { note, projectId }
  const [convertForm, setConvertForm] = useState({ assigned_to: "", due_date: "" });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["production-notes"],
    queryFn: () => base44.entities.ProductionNote.list("-note_date"),
    refetchInterval: 30000,
  });

  const { data: allWPs = [] } = useQuery({
    queryKey: ["wps-all"],
    queryFn: () => base44.entities.WorkPackage.list(),
  });

  const { data: allRFIs = [] } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => base44.entities.RFI.list(),
  });

  const { data: allDeliveries = [] } = useQuery({
    queryKey: ["deliveries-all"],
    queryFn: () => base44.entities.Delivery.list(),
  });

  const { data: allCOs = [] } = useQuery({
    queryKey: ["cos-all"],
    queryFn: () => base44.entities.ChangeOrder.list(),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductionNote.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-notes"] });
      toast.success("Note updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ProductionNote.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-notes"] });
      setDeleteTarget(null);
      toast.success("Note deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ProductionNote.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-notes"] });
      toast.success("Note added");
    },
    onError: (err) => toast.error(err.message),
  });

  const createActionItemMut = useMutation({
    mutationFn: (data) => base44.entities.ActionItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      setConvertTarget(null);
      setConvertForm({ assigned_to: "", due_date: "" });
      toast.success("Action item created from note");
    },
    onError: (err) => toast.error(err.message),
  });
  const allOpenRFIs = useMemo(
    () => allRFIs.filter((r) => !["Answered", "Closed"].includes(r.status)),
    [allRFIs]
  );
  const overdueRFIs = useMemo(
    () =>
      allRFIs.filter(
        (r) =>
          r.date_required &&
          new Date(r.date_required) < new Date() &&
          !["Answered", "Closed"].includes(r.status)
      ),
    [allRFIs]
  );
  const pendingCOs = useMemo(
    () => allCOs.filter((c) => ["Submitted", "Under Review"].includes(c.status)),
    [allCOs]
  );
  const lateDeliveries = useMemo(
    () =>
      allDeliveries.filter(
        (d) => d.scheduled_date && new Date(d.scheduled_date) < new Date() && d.status !== "Delivered"
      ),
    [allDeliveries]
  );
  const openNotes = useMemo(() => notes.filter((n) => !n.is_resolved), [notes]);
  const highPriorityNotes = useMemo(
    () => notes.filter((n) => n.is_high_priority && !n.is_resolved),
    [notes]
  );
  const weekStart = useMemo(() => {
    const ws = new Date();
    ws.setDate(ws.getDate() - 7);
    ws.setHours(0, 0, 0, 0);
    return ws;
  }, []);
  const weekNotes = useMemo(
    () => notes.filter((n) => n.note_date && new Date(n.note_date) >= weekStart),
    [notes, weekStart]
  );

  const activeProjects = useMemo(
    () =>
      projects.filter(
        (p) => (!["Closeout", "Complete"].includes(p.phase)) || showClosed
      ),
    [projects, showClosed]
  );

  const sortedProjects = useMemo(() => {
    return [...activeProjects].sort((a, b) => {
      const aNotes = notes.filter((n) => n.project_id === a.id);
      const bNotes = notes.filter((n) => n.project_id === b.id);
      const aHP = aNotes.some((n) => n.is_high_priority && !n.is_resolved);
      const bHP = bNotes.some((n) => n.is_high_priority && !n.is_resolved);
      if (aHP && !bHP) return -1;
      if (!aHP && bHP) return 1;
      const ha = healthOrder[a.health_status] ?? 2;
      const hb = healthOrder[b.health_status] ?? 2;
      if (ha !== hb) return ha - hb;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [activeProjects, notes]);
  useEffect(() => {
    if (allCollapsed) {
      const next = {};
      sortedProjects.forEach((p) => (next[p.id] = true));
      setCollapsed(next);
    } else {
      setCollapsed({});
    }
  }, [allCollapsed, sortedProjects]);

  const formatMeetingDate = (iso) => {
    const d = new Date(iso);
    return d
      .toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
      .toUpperCase()
      .replace(",", "");
  };

  const toggleCollapse = (id) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const noteCategoryFilter = (projectId) => categoryFilters[projectId] || "ALL";

  const handleInlineEdit = (noteId, newContent) => {
    updateMut.mutate({ id: noteId, data: { content: newContent } });
    setEditingNoteId(null);
  };

  const handleQuickAdd = (project) => {
    const state = quickAddState[project.id] || { value: "", category: "General", priority: false };
    if (!state.value.trim()) return;
    createMut.mutate({
      project_id: project.id,
      project_name: project.name,
      note_date: meetingDate,
      category: state.category,
      content: state.value.trim(),
      is_high_priority: state.priority,
      is_resolved: false,
    });
    setQuickAddState((prev) => ({ ...prev, [project.id]: { value: "", category: state.category, priority: state.priority } }));
  };

  const handleResolveToggle = (note) => {
    updateMut.mutate({
      id: note.id,
      data: { is_resolved: !note.is_resolved, resolved_date: !note.is_resolved ? new Date().toISOString() : null },
    });
  };

  const handlePriorityToggle = (note) => {
    updateMut.mutate({ id: note.id, data: { is_high_priority: !note.is_high_priority } });
  };

  const renderKPICell = (label, value, tone) => {
    const isEmpty = value === 0;
    const isAlert = (tone === "error" || tone === "warning") && !isEmpty;
    const color = isEmpty
      ? "var(--status-success)"
      : tone === "error"
      ? "var(--status-error)"
      : tone === "warning"
      ? "var(--status-warning)"
      : "var(--accent)";
    return (
      <div
        style={{
          padding: "10px 18px",
          borderRight: "1px solid var(--divider)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 130,
          background: isAlert ? `${color}08` : "transparent",
          borderTop: isAlert ? `2px solid ${color}` : "2px solid transparent",
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>
          {label}
        </span>
        {isEmpty ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--status-success)" }}>
            ✓ Clear
          </span>
        ) : (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color, lineHeight: 1.1 }}>
            {value}
          </span>
        )}
      </div>
    );
  };

  const projectWpStats = (projectId) => {
    const wps = allWPs.filter((w) => w.project_id === projectId);
    const total = wps.length;
    const counts = {
      "Not Started": wps.filter((w) => w.status === "Not Started").length,
      "In Progress": wps.filter((w) => w.status === "In Progress").length,
      Complete: wps.filter((w) => w.status === "Complete").length,
      "On Hold": wps.filter((w) => w.status === "On Hold").length,
    };
    const tonnageTotal = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    const tonnageFab = wps
      .filter((w) => w.status === "Complete")
      .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    return { total, counts, tonnageTotal, tonnageFab };
  };

  const projectRfiStats = (projectId) => {
    const rfis = allRFIs.filter((r) => r.project_id === projectId);
    const open = rfis.filter((r) => !["Answered", "Closed"].includes(r.status)).length;
    const overdue = rfis.filter(
      (r) => r.date_required && new Date(r.date_required) < new Date() && !["Answered", "Closed"].includes(r.status)
    ).length;
    return { open, overdue };
  };

  const projectDeliveryStats = (projectId) => {
    const ds = allDeliveries.filter((d) => d.project_id === projectId);
    const late = ds.filter(
      (d) => d.scheduled_date && new Date(d.scheduled_date) < new Date() && d.status !== "Delivered"
    );
    const nextDelivery = ds
      .filter((d) => d.scheduled_date)
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0];
    return { late, nextDelivery };
  };

  const projectCOs = (projectId) => allCOs.filter((c) => c.project_id === projectId);

  const projectNotes = (projectId) => {
    const filtered = notes.filter((n) => n.project_id === projectId);
    const cat = noteCategoryFilter(projectId);
    return filtered
      .filter((n) => cat === "ALL" || n.category === cat)
      .sort((a, b) => {
        if (a.is_high_priority && !b.is_high_priority) return -1;
        if (!a.is_high_priority && b.is_high_priority) return 1;
        return new Date(b.note_date || 0) - new Date(a.note_date || 0);
      });
  };

  const NoteCard = ({ note }) => {
    const isEditing = editingNoteId === note.id;
    const buffer = editBuffer[note.id] ?? note.content ?? "";
    return (
      <div
        className={`note-row ${note.is_resolved ? "note-resolved" : ""}`}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "12px 14px",
          border: "1px solid var(--divider)",
          borderLeft: `4px solid ${CATEGORY_COLORS[note.category] || "var(--text-muted)"}`,
          borderRadius: 6,
          marginBottom: 10,
          position: "relative",
          background: "var(--bg-surface)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--hover-bg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--bg-surface)";
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: `${(CATEGORY_COLORS[note.category] || "#999")}22`,
                  color: CATEGORY_COLORS[note.category] || "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {note.category || "General"}
              </span>
              {note.is_high_priority && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)" }}>FLAG</span>
              )}
              {note.is_resolved && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-success)" }}>RESOLVED</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {note.author && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                  {note.author}
                </span>
              )}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                {note.note_date ? new Date(note.note_date).toLocaleDateString("en-US") : ""}
              </span>
            </div>
          </div>

          <div
            className={`note-content ${note.is_resolved ? "note-resolved" : ""}`}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => {
              setEditingNoteId(note.id);
              setEditBuffer((prev) => ({ ...prev, [note.id]: buffer }));
            }}
            onBlur={(e) => {
              const text = e.currentTarget.innerText.trim();
              setEditBuffer((prev) => ({ ...prev, [note.id]: text }));
              handleInlineEdit(note.id, text);
            }}
            onInput={(e) => {
              setEditBuffer((prev) => ({ ...prev, [note.id]: e.currentTarget.innerText }));
            }}
            style={{
              border: isEditing ? "1px solid var(--accent)" : "1px solid transparent",
              background: isEditing ? "rgba(99,102,241,0.06)" : "transparent",
              borderRadius: 4,
              padding: "6px 8px",
              minHeight: 32,
              outline: "none",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--text-primary)",
              lineHeight: 1.7,
            }}
          >
            {buffer || "Click to add notes..."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          {/* Convert to Action Item */}
          {!note.is_resolved && (
            <button
              title="Convert to Action Item"
              onClick={() => { setConvertTarget(note); setConvertForm({ assigned_to: "", due_date: "" }); }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                height: 26, padding: "0 8px", borderRadius: 4,
                border: "1px solid var(--accent-border)",
                background: "var(--accent-muted)",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
              }}
            >
              <ArrowRight size={11} /> Task
            </button>
          )}
          <button
            title={note.is_resolved ? "Reopen" : "Resolve"}
            onClick={() => handleResolveToggle(note)}
            style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid var(--divider)", background: "var(--bg-surface)", color: "var(--status-success)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {note.is_resolved ? <ChevronRight size={14} /> : <CheckIcon size={14} />}
          </button>
          <button
            title={note.is_high_priority ? "Remove flag" : "Flag as priority"}
            onClick={() => handlePriorityToggle(note)}
            style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid var(--divider)", background: note.is_high_priority ? "rgba(239,68,68,0.12)" : "var(--bg-surface)", color: note.is_high_priority ? "var(--status-error)" : "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <FlagIcon size={14} />
          </button>
          <button
            title="Delete"
            onClick={() => setDeleteTarget(note.id)}
            style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid var(--divider)", background: "var(--bg-surface)", color: "var(--status-error)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-page)" }}>
      <style>{`
        @media print {
          button { display: none !important; }
          input { display: none !important; }
          select { display: none !important; }
          * { background: white !important; color: black !important; border-color: #ccc !important; box-shadow: none !important; }
          .meeting-header { position: static !important; border-bottom: 2px solid black !important; padding-bottom: 8px !important; margin-bottom: 16px !important; }
          .project-section { page-break-inside: avoid; margin-bottom: 24px; }
          .note-content { font-size: 12pt !important; line-height: 1.8 !important; }
          .note-resolved { opacity: 0.5 !important; text-decoration: line-through; }
          .phase-bar { border-left: 4px solid black !important; }
        }
      `}</style>

      {/* Header */}
      <div
        className="meeting-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--divider)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "var(--text-primary)",
            }}
          >
            WEEKLY PRODUCTION MEETING
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {showDateInput ? (
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                onBlur={() => setShowDateInput(false)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--divider)",
                  borderRadius: 4,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                  padding: "4px 6px",
                }}
              />
            ) : (
              <span
                style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}
                onClick={() => setShowDateInput(true)}
              >
                {formatMeetingDate(meetingDate)}
              </span>
            )}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
              {activeProjects.length} PROJECTS · {notes.length} NOTES THIS WEEK
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => window.print()}
            style={{
              height: 34,
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--divider)",
              padding: "0 12px",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Printer size={16} /> PRINT / EXPORT
          </button>
          <button
            onClick={() => {
              const first = sortedProjects[0];
              if (first) handleQuickAdd(first);
            }}
            style={{
              height: 34,
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--accent)",
              padding: "0 12px",
              background: "var(--accent)",
              color: "var(--accent-text)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            <Plus size={16} /> ADD NOTE
          </button>
          <button
            onClick={() => setAllCollapsed((v) => !v)}
            style={{
              height: 34,
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--divider)",
              padding: "0 12px",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            {allCollapsed ? "EXPAND ALL" : "COLLAPSE ALL"}
          </button>
          <button
            onClick={() => setShowClosed((v) => !v)}
            style={{
              height: 34,
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--divider)",
              padding: "0 12px",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            {showClosed ? "HIDE CLOSED" : "SHOW ALL"}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div
        style={{
          display: "flex",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--divider)",
          overflowX: "auto",
        }}
      >
        {renderKPICell("OPEN RFIs", allOpenRFIs.length, allOpenRFIs.length ? "warning" : "success")}
        {renderKPICell("OVERDUE RFIs", overdueRFIs.length, overdueRFIs.length ? "error" : "success")}
        {renderKPICell("PENDING COs", pendingCOs.length, pendingCOs.length ? "warning" : "success")}
        {renderKPICell("LATE DELIVERIES", lateDeliveries.length, lateDeliveries.length ? "error" : "success")}
        {renderKPICell("HIGH PRIORITY NOTES", highPriorityNotes.length, highPriorityNotes.length ? "error" : "success")}
        {renderKPICell("NOTES THIS WEEK", weekNotes.length, "accent")}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        {sortedProjects.map((project) => {
          const notesForProject = projectNotes(project.id);
          const wpStat = projectWpStats(project.id);
          const rfiStat = projectRfiStats(project.id);
          const deliveries = projectDeliveryStats(project.id);
          const cos = projectCOs(project.id);
          const hasHP = notes.some((n) => n.project_id === project.id && n.is_high_priority && !n.is_resolved);
          const collapsedState = collapsed[project.id];
          const quickState = quickAddState[project.id] || { value: "", category: "General", priority: false };
          const upcoming = [];
          const projectOverdueRFIs = allRFIs
            .filter(
              (r) =>
                r.project_id === project.id &&
                r.date_required &&
                new Date(r.date_required) < new Date() &&
                !["Answered", "Closed"].includes(r.status)
            )
            .slice(0, 3);
          projectOverdueRFIs.forEach((r) => upcoming.push({ type: "RFI", title: `${r.rfi_number || ""} ${r.title || ""}` }));
          deliveries.late.slice(0, 3).forEach((d) => upcoming.push({ type: "DEL", title: `${d.vendor || ""} ${d.scheduled_date || ""}` }));
          cos
            .filter((c) => ["Submitted", "Under Review"].includes(c.status))
            .slice(0, 3)
            .forEach((c) => upcoming.push({ type: "CO", title: `${c.co_number || ""} ${c.amount || ""}` }));

          const latestNote = notes
            .filter((n) => n.project_id === project.id)
            .sort((a, b) => new Date(b.note_date || 0) - new Date(a.note_date || 0))[0];

          return (
            <div
              key={project.id}
              className="project-section"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 0,
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-card)",
                background: "var(--bg-surface)",
                marginBottom: 16,
                boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                overflow: "hidden",
              }}
            >
              {/* Section header */}
              <div
                className="phase-bar"
                onClick={() => toggleCollapse(project.id)}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderLeft: `4px solid ${PHASE_COLORS[project.phase] || "var(--accent)"}`,
                  borderRadius: "var(--radius-card) var(--radius-card) 0 0",
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                }}
              >
                {collapsedState ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.08em" }}>
                    {project.project_number || "PROJECT"}
                  </span>
                  <span style={{ fontFamily: "Space Grotesk", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    {project.name}
                  </span>
                  {project.gc_name && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{project.gc_name}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: `${(PHASE_COLORS[project.phase] || "var(--text-muted)")}22`,
                      color: PHASE_COLORS[project.phase] || "var(--text-muted)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {project.phase || "Phase"}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background:
                        project.health_status === "At Risk"
                          ? "rgba(239,68,68,0.18)"
                          : project.health_status === "Watch"
                          ? "rgba(234,179,8,0.18)"
                          : "rgba(34,197,94,0.18)",
                      color:
                        project.health_status === "At Risk"
                          ? "var(--status-error)"
                          : project.health_status === "Watch"
                          ? "var(--status-warning)"
                          : "var(--status-success)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {project.health_status || "On Track"}
                  </span>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>
                    WPs {wpStat.counts["Complete"] || 0}/{wpStat.total}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: rfiStat.open ? "var(--status-warning)" : "var(--text-muted)",
                    }}
                  >
                    RFIs {rfiStat.open} {rfiStat.overdue ? `(${rfiStat.overdue} overdue)` : ""}
                  </span>
                  {deliveries.late.length > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-error)" }}>
                      {deliveries.late.length} late deliveries
                    </span>
                  )}
                  {hasHP && <span style={{ color: "var(--status-error)" }}>FLAG</span>}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickAdd(project);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 6,
                      border: "1px solid var(--divider)",
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {/* Body */}
              {!collapsedState && (
                <div
                  style={{
                    border: "1px solid var(--border-default)",
                    borderTop: "none",
                    borderRadius: "0 0 var(--radius-card) var(--radius-card)",
                    borderLeft: `4px solid ${(PHASE_COLORS[project.phase] || "var(--accent)") + "55"}`,
                    background: "var(--bg-surface)",
                    overflow: "hidden",
                  }}
                >
                  {/* Snapshot row */}
                  <div
                    style={{
                      background: "var(--bg-sidebar)",
                      padding: "10px 20px",
                      borderBottom: "1px solid var(--divider)",
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 14,
                    }}
                  >
                    {/* WP status */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                        WORK PACKAGE STATUS
                      </div>
                      <div style={{ display: "flex", height: 10, overflow: "hidden", borderRadius: 4 }}>
                        {["Not Started", "In Progress", "Complete", "On Hold"].map((key) => {
                          const count = wpStat.counts[key] || 0;
                          const pct = wpStat.total ? (count / wpStat.total) * 100 : 0;
                          const color =
                            key === "Complete"
                              ? "var(--status-success)"
                              : key === "In Progress"
                              ? "var(--accent)"
                              : key === "On Hold"
                              ? "var(--status-warning)"
                              : "var(--text-muted)";
                          return <div key={key} style={{ width: `${pct}%`, background: color }} />;
                        })}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                        {wpStat.counts["Complete"] || 0} of {wpStat.total} WPs complete
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
                        {wpStat.tonnageFab}T fabricated of {wpStat.tonnageTotal}T
                      </div>
                    </div>

                    {/* Upcoming */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                        UPCOMING / OVERDUE
                      </div>
                      {upcoming.length === 0 ? (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-success)" }}>✓ NO URGENT ITEMS</div>
                      ) : (
                        upcoming.slice(0, 3).map((item, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-body)", fontSize: 12 }}>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 9,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "var(--bg-surface)",
                                border: "1px solid var(--divider)",
                              }}
                            >
                              {item.type}
                            </span>
                            <span style={{ color: "var(--text-primary)" }}>{item.title}</span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Schedule pulse */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                        SCHEDULE PULSE
                      </div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>
                        Next delivery: {deliveries.nextDelivery ? new Date(deliveries.nextDelivery.scheduled_date).toLocaleDateString("en-US") : "—"}
                      </div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>
                        Overdue RFIs: {rfiStat.overdue}
                      </div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>
                        Latest note: {latestNote ? `${latestNote.author || ""} on ${new Date(latestNote.note_date).toLocaleDateString("en-US")}` : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Notes area */}
                  <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
                        PRODUCTION NOTES
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                        {notesForProject.length} notes
                      </span>
                      {["ALL", "Fabrication", "Erection", "Schedule", "Quality", "Safety", "General"].map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setCategoryFilters((prev) => ({ ...prev, [project.id]: cat }))}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid var(--divider)",
                            background: noteCategoryFilter(project.id) === cat ? "var(--accent)" : "var(--bg-surface)",
                            color: noteCategoryFilter(project.id) === cat ? "var(--accent-text)" : "var(--text-primary)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            letterSpacing: "0.05em",
                            cursor: "pointer",
                          }}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Quick add — pinned at top of notes section */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: "var(--bg-surface-low)", borderRadius: 8, border: "1px solid var(--border-default)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {["General", "Fabrication", "Erection", "Schedule", "Quality", "Safety"].map((cat) => {
                          const isActive = quickState.category === cat;
                          const catColor = CATEGORY_COLORS[cat] || "var(--text-muted)";
                          return (
                            <button
                              key={cat}
                              onClick={() => setQuickAddState(prev => ({ ...prev, [project.id]: { ...quickState, category: cat } }))}
                              style={{
                                padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                                textTransform: "uppercase", letterSpacing: "0.06em",
                                border: `1px solid ${isActive ? catColor : "var(--border-default)"}`,
                                background: isActive ? `${catColor}20` : "transparent",
                                color: isActive ? catColor : "var(--text-muted)",
                                transition: "all 0.12s",
                              }}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          value={quickState.value}
                          onChange={(e) => setQuickAddState((prev) => ({ ...prev, [project.id]: { ...quickState, value: e.target.value } }))}
                          onKeyDown={(e) => { if (e.key === "Enter" && quickState.value.trim()) handleQuickAdd(project); }}
                          placeholder={`Type a note… Enter to add`}
                          style={{
                            flex: 1, background: "transparent", border: "none",
                            borderBottom: "1px solid var(--divider)",
                            color: "var(--text-primary)", fontFamily: "var(--font-body)",
                            fontSize: 12, padding: "6px 4px", outline: "none",
                          }}
                        />
                        <button
                          onClick={() => setQuickAddState((prev) => ({ ...prev, [project.id]: { ...quickState, priority: !quickState.priority } }))}
                          title="Flag as high priority"
                          style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "center", background: quickState.priority ? "rgba(239,68,68,0.12)" : "var(--bg-surface)", color: quickState.priority ? "var(--status-error)" : "var(--text-muted)", cursor: "pointer" }}
                        >
                          <FlagIcon size={13} />
                        </button>
                        <button
                          disabled={!quickState.value.trim()}
                          onClick={() => handleQuickAdd(project)}
                          style={{
                            height: 30,
                            padding: "0 12px",
                            borderRadius: 6,
                            border: "1px solid var(--accent)",
                            background: "var(--accent)",
                            color: "var(--accent-text)",
                            fontWeight: 700,
                            cursor: quickState.value.trim() ? "pointer" : "not-allowed",
                            opacity: quickState.value.trim() ? 1 : 0.5,
                          }}
                        >
                          ADD
                        </button>
                      </div>
                    </div>

                    {/* Empty state */}
                    {notesForProject.length === 0 && (
                      <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em" }}>
                        NO NOTES YET — TYPE ABOVE TO ADD THE FIRST ONE
                      </div>
                    )}

                    {/* Notes list */}
                    {notesForProject.map((note) => (
                      <NoteCard key={note.id} note={note} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Convert to Action Item modal */}
      {convertTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => { if (e.target === e.currentTarget) setConvertTarget(null); }}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 24, width: 420, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-primary)" }}>
              Convert to Action Item
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", padding: "8px 12px", background: "var(--bg-surface-low)", borderRadius: 6, borderLeft: "3px solid var(--accent)" }}>
              {convertTarget.content}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Assign To</label>
              <input
                value={convertForm.assigned_to}
                onChange={(e) => setConvertForm((f) => ({ ...f, assigned_to: e.target.value }))}
                placeholder="Name or team"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Due Date</label>
              <input
                type="date"
                value={convertForm.due_date}
                onChange={(e) => setConvertForm((f) => ({ ...f, due_date: e.target.value }))}
                style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "8px 12px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConvertTarget(null)}
                style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid var(--divider)", background: "var(--bg-surface)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                disabled={createActionItemMut.isPending}
                onClick={() => createActionItemMut.mutate({
                  project_id: convertTarget.project_id,
                  title: (convertTarget.content || "Action Item").slice(0, 100),
                  description: convertTarget.content,
                  priority: convertTarget.is_high_priority ? "High" : "Medium",
                  status: "Open",
                  assigned_to: convertForm.assigned_to || null,
                  due_date: convertForm.due_date || null,
                })}
                style={{ padding: "8px 20px", borderRadius: 4, border: "none", background: "var(--accent)", color: "white", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: createActionItemMut.isPending ? "not-allowed" : "pointer", opacity: createActionItemMut.isPending ? 0.6 : 1 }}
              >
                {createActionItemMut.isPending ? "Creating..." : "Create Action Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget)}
        title="Delete note?"
        description="This note will be removed from the meeting document."
      />
    </div>
  );
}

