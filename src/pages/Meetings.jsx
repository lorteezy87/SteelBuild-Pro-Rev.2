import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MeetingFormModal from "@/components/meetings/MeetingFormModal";
import MeetingList from "@/components/meetings/MeetingList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, KpiTile } from "@/components/design-system";
import { CheckSquare, Plus } from "lucide-react";
import { useProjectId } from "@/hooks/useProjectId";
import { parseProductionMeetingNotes } from "@/utils/productionMeetingParser";

/* ── Meeting type templates for Quick Start empty state ── */
const MEETING_TEMPLATES = [
  {
    key: "oac",
    type: "OAC",
    label: "OAC Meeting",
    desc: "Owner / Architect / Contractor coordination",
    icon: "\u2660",
    color: "var(--status-error)",
    defaults: {
      meeting_type: "OAC",
      title: "OAC Meeting",
    },
  },
  {
    key: "handover",
    type: "Internal",
    label: "Shop-to-Field Handover",
    desc: "Transition fabrication details to erection crew",
    icon: "\u2692",
    color: "var(--status-info)",
    defaults: {
      meeting_type: "Internal",
      title: "Shop-to-Field Handover",
    },
  },
  {
    key: "preinstall",
    type: "Safety",
    label: "Pre-Install Meeting",
    desc: "Safety & logistics review before steel erection",
    icon: "\u26A0",
    color: "var(--status-warning)",
    defaults: {
      meeting_type: "Safety",
      title: "Pre-Install Meeting",
    },
  },
  {
    key: "kickoff",
    type: "Kickoff",
    label: "Project Kickoff",
    desc: "Align scope, schedule, and team responsibilities",
    icon: "\u25B6",
    color: "var(--accent)",
    defaults: {
      meeting_type: "Kickoff",
      title: "Project Kickoff",
    },
  },
];

const types = ["OAC", "Internal", "Safety", "Kickoff", "Progress", "Other"];
const statuses = ["Scheduled", "In Progress", "Complete", "Cancelled"];

function ProductionMeetingParserPanel({
  notes,
  onNotesChange,
  parsedActions,
  selectedIds,
  onToggle,
  onParse,
  onCreate,
  isCreating,
  canCreate,
}) {
  const inputStyle = {
    width: "100%",
    background: "var(--bg-input)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.9fr)", gap: 0 }}>
        <div style={{ padding: 16, borderRight: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", fontWeight: 800, marginBottom: 6 }}>
            PRODUCTION MEETING PARSER
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, marginBottom: 12 }}>
            Paste meeting notes. SteelBuild will suggest action items for VIF, RFIs, drawing revisions, load lists, deliveries, fabrication, field coordination, and cost exposure. Review before creating records.
          </div>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={"Example:\n- Need Walker to confirm VIF before 5/13 shipment\n- Fire protection drawings pending GC response\n- ABs shipping tomorrow, load list not confirmed"}
            rows={8}
            style={{ ...inputStyle, minHeight: 170, resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={onParse}
              disabled={!notes.trim()}
              style={{
                background: "var(--accent)",
                color: "var(--bg-base)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "8px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: notes.trim() ? "pointer" : "not-allowed",
                opacity: notes.trim() ? 1 : 0.55,
              }}
            >
              Extract Actions
            </button>
          </div>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, minHeight: 260 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", letterSpacing: "0.12em", fontWeight: 800 }}>
                SUGGESTED ACTIONS
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                {selectedIds.size} selected of {parsedActions.length}
              </div>
            </div>
            <button
              type="button"
              onClick={onCreate}
              disabled={!canCreate || isCreating}
              style={{
                background: "var(--accent-muted)",
                color: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-btn)",
                padding: "8px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: canCreate && !isCreating ? "pointer" : "not-allowed",
                opacity: canCreate && !isCreating ? 1 : 0.55,
              }}
            >
              {isCreating ? "Creating..." : "Create Selected"}
            </button>
          </div>

          {parsedActions.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed var(--divider)", borderRadius: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textAlign: "center", padding: 20 }}>
              No extracted actions yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: 300 }}>
              {parsedActions.map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <label
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "18px 1fr",
                      gap: 10,
                      padding: 10,
                      border: `1px solid ${selected ? "var(--accent)" : "var(--divider)"}`,
                      borderRadius: 8,
                      background: selected ? "var(--accent-muted)" : "var(--bg-surface-low)",
                      cursor: "pointer",
                    }}
                  >
                    <input type="checkbox" checked={selected} onChange={() => onToggle(item.id)} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                        {item.title}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                        <span>{item.priority}</span>
                        <span>Due {item.due_date}</span>
                        <span>{item.metadata.task_type}</span>
                        <span>{item.metadata.impact_area}</span>
                        {item.assigned_to && <span>Owner {item.assigned_to}</span>}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Meetings() {
  const projectId = useProjectId();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [templateDefaults, setTemplateDefaults] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showParser, setShowParser] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState("");
  const [parsedActions, setParsedActions] = useState([]);
  const [selectedActionIds, setSelectedActionIds] = useState(new Set());

  const qc = useQueryClient();

  const { data: meetings = [] } = useQuery({
    queryKey: ["meetings", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Meeting.filter({ project_id: projectId })
        : base44.entities.Meeting.list("-meeting_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Meeting.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", projectId] });
      toast.success("Meeting created");
      setShowForm(false);
      setEditing(null);
      setTemplateDefaults(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Meeting.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", projectId] });
      toast.success("Meeting updated");
      setShowForm(false);
      setEditing(null);
      setTemplateDefaults(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Meeting.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["meetings", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      toast.success("Meeting deleted");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const createActionsMut = useMutation({
    mutationFn: async (items) => {
      if (!projectId) throw new Error("Select a project before creating action items.");
      await Promise.all(items.map((item) => base44.entities.ActionItem.create({
        project_id: projectId,
        project_name: selectedProject?.name || "",
        title: item.title,
        description: item.description,
        assigned_to: item.assigned_to,
        due_date: item.due_date,
        priority: item.priority,
        status: item.status,
        meeting_reference: item.meeting_reference,
        metadata: item.metadata,
      })));
      return items.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["action-items"] });
      qc.invalidateQueries({ queryKey: ["action-items", projectId] });
      qc.invalidateQueries({ queryKey: ["action-items-all"] });
      toast.success(`${count} action item${count === 1 ? "" : "s"} created`);
      setShowParser(false);
      setMeetingNotes("");
      setParsedActions([]);
      setSelectedActionIds(new Set());
    },
    onError: (err) => toast.error(err?.message || "Failed to create action items"),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
    }
  };

  const handleParseNotes = () => {
    const parsed = parseProductionMeetingNotes(meetingNotes, { source: "Production meeting notes" });
    setParsedActions(parsed);
    setSelectedActionIds(new Set(parsed.map((item) => item.id)));
    if (parsed.length === 0) {
      toast.info("No actionable meeting items found");
    }
  };

  const selectedParsedActions = parsedActions.filter((item) => selectedActionIds.has(item.id));

  const openTemplate = (tpl) => {
    setEditing(null);
    setTemplateDefaults(tpl.defaults);
    setShowForm(true);
  };

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = useMemo(
    () =>
      meetings.filter((m) => {
        const typeMatch = filterType === "all" || m.meeting_type === filterType;
        const statusMatch = filterStatus === "all" || m.status === filterStatus;
        return typeMatch && statusMatch;
      }),
    [meetings, filterType, filterStatus],
  );

  const stats = useMemo(
    () => ({
      total: meetings.length,
      scheduled: meetings.filter((m) => m.status === "Scheduled").length,
      inProgress: meetings.filter((m) => m.status === "In Progress").length,
      complete: meetings.filter((m) => m.status === "Complete").length,
      cancelled: meetings.filter((m) => m.status === "Cancelled").length,
    }),
    [meetings],
  );

  /* ── Type distribution for badge counts ── */
  const typeCounts = useMemo(() => {
    const counts = {};
    types.forEach((t) => {
      counts[t] = meetings.filter((m) => m.meeting_type === t).length;
    });
    return counts;
  }, [meetings]);

  /* ── Interactive KPI tile click: filter by status ── */
  const handleStatClick = (statusValue) => {
    if (statusValue === "all") {
      setFilterStatus("all");
    } else {
      setFilterStatus((prev) => (prev === statusValue ? "all" : statusValue));
    }
  };

  const kpiTiles = [
    { label: "Total", value: stats.total, color: "var(--accent)", statusFilter: "all" },
    { label: "Scheduled", value: stats.scheduled, color: "var(--status-info)", statusFilter: "Scheduled" },
    { label: "In Progress", value: stats.inProgress, color: "var(--status-warning)", statusFilter: "In Progress", pulse: true },
    { label: "Complete", value: stats.complete, color: "var(--status-success)", statusFilter: "Complete" },
    { label: "Cancelled", value: stats.cancelled, color: "var(--status-error)", statusFilter: "Cancelled" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Meetings"
        count={filtered.length}
        unit=" · MEETINGS"
        subtitle={`${stats.upcoming || 0} upcoming · ${stats.complete || 0} complete · OAC / Foreman / Pre-Con templates`}
      >
        <button
          onClick={() => setShowParser((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: showParser ? "var(--accent-muted)" : "var(--bg-surface)",
            color: showParser ? "var(--accent)" : "var(--text-secondary)",
            border: `1px solid ${showParser ? "var(--accent)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-btn)",
            padding: "8px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <CheckSquare size={12} /> Parse Notes
        </button>
        <button
          onClick={() => {
            setEditing(null);
            setTemplateDefaults(null);
            setShowForm(true);
          }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)",
            color: "var(--bg-base)",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> New Meeting
        </button>
      </CommandBar>

      {showParser && (
        <ProductionMeetingParserPanel
          notes={meetingNotes}
          onNotesChange={setMeetingNotes}
          parsedActions={parsedActions}
          selectedIds={selectedActionIds}
          onToggle={(id) => {
            setSelectedActionIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onParse={handleParseNotes}
          onCreate={() => createActionsMut.mutate(selectedParsedActions)}
          isCreating={createActionsMut.isPending}
          canCreate={!!projectId && selectedParsedActions.length > 0}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {kpiTiles.map((stat) => {
          const isActive = filterStatus === stat.statusFilter;
          return (
            <KpiTile
              key={stat.label}
              compact
              label={stat.label}
              value={stat.value}
              color={stat.color}
              active={isActive}
              onClick={() => handleStatClick(stat.statusFilter)}
            />
          );
        })}
      </div>

      {/* Filters with type badge counts */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginRight: "2px",
            }}
          >
            Type:
          </span>
          {["all", ...types].map((type) => {
            const isActive = filterType === type;
            const count = type === "all" ? meetings.length : typeCounts[type] || 0;
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                style={{
                  background: isActive ? "var(--accent)" : "var(--bg-surface-low)",
                  color: isActive ? "#07090E" : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "var(--radius-btn)",
                  padding: "6px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  minHeight: "44px",
                  minWidth: "44px",
                  justifyContent: "center",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "var(--bg-surface-mid)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "var(--bg-surface-low)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                {type === "all" ? "All" : type}
                {count > 0 && (
                  <span
                    style={{
                      background: isActive ? "rgba(7,9,14,0.25)" : "var(--bg-surface-high)",
                      borderRadius: "10px",
                      padding: "1px 5px",
                      fontSize: "8px",
                      fontWeight: 600,
                      lineHeight: "14px",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            width: "1px",
            height: "24px",
            background: "var(--divider)",
          }}
        />

        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginRight: "2px",
            }}
          >
            Status:
          </span>
          {["all", ...statuses].map((status) => {
            const isActive = filterStatus === status;
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                style={{
                  background: isActive ? "var(--accent)" : "var(--bg-surface-low)",
                  color: isActive ? "#07090E" : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "var(--radius-btn)",
                  padding: "6px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  minHeight: "44px",
                  minWidth: "44px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "var(--bg-surface-mid)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "var(--bg-surface-low)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                {status === "all" ? "All" : status}
              </button>
            );
          })}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <MeetingFormModal
          projectId={projectId}
          meeting={editing}
          templateDefaults={templateDefaults}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
            setTemplateDefaults(null);
          }}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Meetings List or Empty State */}
      {meetings.length === 0 ? (
        <MeetingsEmptyState onTemplate={openTemplate} />
      ) : (
        <MeetingList
          meetings={filtered}
          onEdit={(m) => {
            setEditing(m);
            setTemplateDefaults(null);
            setShowForm(true);
          }}
          onDelete={(m) => setDeleteTarget(m)}
          onFilterType={setFilterType}
        />
      )}

      {/* Delete Confirmation */}
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Meeting"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />

      {/* FAB - floating add button for mobile */}
      <button
        onClick={() => {
          setEditing(null);
          setTemplateDefaults(null);
          setShowForm(true);
        }}
        aria-label="New Meeting"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#07090E",
          border: "none",
          fontSize: "28px",
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--shadow-lg), var(--shadow-glow-gold)",
          zIndex: 900,
          transition: "transform 0.15s, box-shadow 0.15s",
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.boxShadow =
            "var(--shadow-lg), 0 0 32px rgba(200,155,32,0.35)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow =
            "var(--shadow-lg), var(--shadow-glow-gold)";
        }}
      >
        +
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Empty State with Quick Start Templates
   ═══════════════════════════════════════════════════════════════ */
function MeetingsEmptyState({ onTemplate }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "48px 32px",
        textAlign: "center",
      }}
    >
      {/* Header icon */}
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "var(--accent-muted)",
          border: "1px solid var(--accent-border)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
          fontSize: "24px",
        }}
      >
        {"\uD83D\uDCC5"}
      </div>

      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "16px",
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: "0 0 6px 0",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        No Meetings Yet
      </h3>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "12px",
          color: "var(--text-muted)",
          margin: "0 0 28px 0",
          maxWidth: "400px",
          marginLeft: "auto",
          marginRight: "auto",
          lineHeight: 1.5,
        }}
      >
        Get started with a template or create a blank meeting from scratch.
      </p>

      {/* Template grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          maxWidth: "860px",
          margin: "0 auto",
        }}
      >
        {MEETING_TEMPLATES.map((tpl) => (
          <button
            key={tpl.key}
            onClick={() => onTemplate(tpl)}
            style={{
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              padding: "20px 16px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s ease",
              minHeight: "44px",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `${tpl.color}`;
              e.currentTarget.style.background = "var(--bg-surface-mid)";
              e.currentTarget.style.boxShadow = `0 0 16px ${tpl.color}15`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.background = "var(--bg-surface-low)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* Top accent line */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "2px",
                background: tpl.color,
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: `${tpl.color}18`,
                  border: `1px solid ${tpl.color}35`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  flexShrink: 0,
                }}
              >
                {tpl.icon}
              </span>
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {tpl.label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    fontWeight: 600,
                    color: tpl.color,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {tpl.type}
                </div>
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "11px",
                color: "var(--text-muted)",
                lineHeight: 1.4,
              }}
            >
              {tpl.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
