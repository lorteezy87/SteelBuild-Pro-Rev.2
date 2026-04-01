import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "../components/shared/useProjectContext";
import MeetingFormModal from "@/components/meetings/MeetingFormModal";
import MeetingList from "@/components/meetings/MeetingList";
import DeleteDialog from "@/components/shared/DeleteDialog";

const TYPES = ["OAC", "Internal", "Safety", "Kickoff", "Progress", "Other"];
const STATUSES = ["Scheduled", "In Progress", "Complete", "Cancelled"];

export default function Meetings() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const qc = useQueryClient();

  const { data: meetings = [] } = useQuery({
    queryKey: ["meetings", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Meeting.filter({ project_id: projectId })
        : [],
    initialData: [],
    enabled: !!projectId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Meeting.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", projectId] });
      toast.success("Meeting created");
      setShowForm(false);
      setEditing(null);
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

  const handleSave = (data) => {
    if (editing?.id) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
    }
  };

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return meetings
      .filter((meeting) => {
        const typeMatch = filterType === "all" || meeting.meeting_type === filterType;
        const statusMatch = filterStatus === "all" || meeting.status === filterStatus;
        const searchMatch =
          !query ||
          [meeting.title, meeting.meeting_number, meeting.location, meeting.attendees, meeting.minutes]
            .some((value) => String(value || "").toLowerCase().includes(query));
        return typeMatch && statusMatch && searchMatch;
      })
      .sort((a, b) => String(b.meeting_date || "").localeCompare(String(a.meeting_date || "")));
  }, [meetings, filterStatus, filterType, search]);

  const today = new Date().toISOString().split("T")[0];
  const stats = {
    total: meetings.length,
    scheduled: meetings.filter((m) => m.status === "Scheduled").length,
    inProgress: meetings.filter((m) => m.status === "In Progress").length,
    complete: meetings.filter((m) => m.status === "Complete").length,
    cancelled: meetings.filter((m) => m.status === "Cancelled").length,
    upcoming: meetings.filter((m) => m.meeting_date && m.meeting_date >= today && m.status !== "Cancelled").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="sbp-panel" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.9fr)",
            gap: 0,
          }}
        >
          <div style={{ padding: "22px 24px", background: "linear-gradient(135deg, rgba(255,107,0,0.14), rgba(255,107,0,0.04) 55%, transparent 100%)" }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
              Meeting Command
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Meetings
            </h1>
            <div style={{ marginTop: 10, fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)", maxWidth: 680 }}>
              Run coordination, OAC, kickoff, and field meetings from a single surface with searchable minutes, roster visibility, and direct edit/delete controls.
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="badge badge-info">{selectedProject ? selectedProject.name : "All Projects"}</span>
              <span className="badge badge-neutral">{filtered.length} visible</span>
              <span className="badge badge-warning">{stats.upcoming} upcoming</span>
            </div>
          </div>

          <div style={{ padding: "22px 24px", background: "var(--bg-surface-mid)", borderLeft: "1px solid var(--divider)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="section-divider" style={{ marginBottom: 0 }}>
              <div className="section-divider-title">Actions</div>
              <div className="section-divider-line" />
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, location, attendees, or minutes"
              style={{ width: "100%" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-primary"
                style={{ flex: 1, color: "var(--on-accent)" }}
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                Create Meeting
              </button>
              <button
                className="btn-ghost"
                style={{ flex: 1 }}
                onClick={() => {
                  setFilterType("all");
                  setFilterStatus("all");
                  setSearch("");
                }}
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
        <StatTile label="Total" value={stats.total} color="var(--accent)" />
        <StatTile label="Upcoming" value={stats.upcoming} color="var(--status-info)" />
        <StatTile label="Scheduled" value={stats.scheduled} color="var(--status-info)" />
        <StatTile label="In Progress" value={stats.inProgress} color="var(--status-warning)" />
        <StatTile label="Complete" value={stats.complete} color="var(--status-success)" />
        <StatTile label="Cancelled" value={stats.cancelled} color="var(--status-error)" />
      </div>

      <div className="sbp-panel" style={{ padding: 14 }}>
        <div className="section-divider">
          <div className="section-divider-title">Filters</div>
          <div className="section-divider-line" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={filterLabelStyle}>Meeting Type</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["all", ...TYPES].map((type) => (
                <button
                  key={type}
                  className={filterType === type ? "btn-primary" : "btn-ghost"}
                  style={filterType === type ? activePillStyle : inactivePillStyle}
                  onClick={() => setFilterType(type)}
                >
                  {type === "all" ? "All Types" : type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={filterLabelStyle}>Meeting Status</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["all", ...STATUSES].map((status) => (
                <button
                  key={status}
                  className={filterStatus === status ? "btn-primary" : "btn-ghost"}
                  style={filterStatus === status ? activePillStyle : inactivePillStyle}
                  onClick={() => setFilterStatus(status)}
                >
                  {status === "all" ? "All Status" : status}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <MeetingFormModal
          projectId={projectId}
          meeting={editing}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          isSaving={createMut.isPending || updateMut.isPending}
        />
      )}

      <MeetingList
        meetings={filtered}
        onEdit={(meeting) => {
          setEditing(meeting);
          setShowForm(true);
        }}
        onDelete={setDeleteTarget}
      />

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
    </div>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div className="kpi-card" style={{ padding: "16px 18px", borderTop: `2px solid ${color}` }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 24, color }}>{value}</div>
    </div>
  );
}

const filterLabelStyle = {
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 10,
};

const activePillStyle = {
  padding: "7px 12px",
  color: "var(--on-accent)",
};

const inactivePillStyle = {
  padding: "7px 12px",
};
