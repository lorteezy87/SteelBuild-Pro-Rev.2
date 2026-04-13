import { useProjectContext } from "@/components/shared/useProjectContext";
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import MitigationFormModal from "@/components/mitigations/MitigationFormModal";
import MitigationDetailPanel from "@/components/mitigations/MitigationDetailPanel";
import DeleteDialog from "@/components/shared/DeleteDialog";
import StatCard from "@/components/shared/StatCard";
import ErrorBoundary from "@/components/shared/ErrorBoundary";

const STATUS_COLORS = {
  Open: "var(--status-warning)",
  Noticed: "var(--status-info)",
  "Action Taken": "var(--accent)",
  Resolved: "var(--status-success)",
  Escalated: "var(--status-error)",
};

const STATUSES = ["Open", "Noticed", "Action Taken", "Resolved", "Escalated"];

export default function Mitigations() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selected, setSelected] = useState(null);
  const [prefill, setPrefill] = useState(null);

  // Check for pre-populated mitigation from external pages
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sbp-new-mitigation");
      if (raw) {
        const data = JSON.parse(raw);
        localStorage.removeItem("sbp-new-mitigation");
        setPrefill(data);
        setEditing(null);
        setShowForm(true);
      }
    } catch {
      localStorage.removeItem("sbp-new-mitigation");
    }
  }, []);

  const { data: mitigations = [] } = useQuery({
    queryKey: ["mitigations", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.MitigationLog.filter({ project_id: projectId })
        : base44.entities.MitigationLog.list("-identified_date"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  const filtered = mitigations.filter((m) => {
    return filterStatus === "all" || m.status === filterStatus;
  });

  const stats = {
    open: mitigations.filter((m) => m.status === "Open").length,
    escalated: mitigations.filter((m) => m.status === "Escalated").length,
    coCandidates: mitigations.filter((m) => m.is_co_candidate).length,
    totalExposure: mitigations.reduce((sum, m) => sum + (Number(m.cost_exposure) || 0), 0),
  };

  const createMut = useMutation({
    mutationFn: (data) =>
      base44.entities.MitigationLog.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mitigations", projectId] });
      setShowForm(false);
      setEditing(null);
      setPrefill(null);
      toast.success("Mitigation logged");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.MitigationLog.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mitigations", projectId] });
      setShowForm(false);
      setEditing(null);
      // Refresh the detail panel if still open
      if (selected) {
        const updated = mitigations.find((m) => m.id === selected.id);
        if (updated) setSelected(updated);
      }
      toast.success("Mitigation updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.MitigationLog.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["mitigations", projectId] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setShowForm(false);
      }
      if (selected?.id === deletedId) setSelected(null);
      setDeleteTarget(null);
      toast.success("Mitigation deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ ...data, id: editing.id });
    } else {
      createMut.mutate(data);
    }
  };

  const handleRowClick = (m) => {
    setSelected(m);
  };

  return (
    <ErrorBoundary label="Mitigations">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 24,
                fontWeight: 800,
                color: "var(--text-primary)",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Mitigations
            </h1>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--text-muted)",
                marginTop: 4,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {selectedProject ? selectedProject.name : "All Projects"} &bull; {filtered.length} Issues
            </p>
          </div>

          <button
            onClick={() => {
              setEditing(null);
              setPrefill(null);
              setShowForm(true);
            }}
            style={{
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "8px 16px",
              fontFamily: "var(--font-body)",
              fontSize: "10px",
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
          >
            + Log Issue
          </button>
        </div>

        {/* Stats Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
          <StatCard label="Open" value={stats.open} color="var(--status-warning)" />
          <StatCard label="Escalated" value={stats.escalated} color="var(--status-error)" />
          <StatCard label="CO Candidates" value={stats.coCandidates} color="var(--accent)" />
          <StatCard
            label="Total Exposure"
            value={`$${(stats.totalExposure || 0).toLocaleString()}`}
            color={stats.totalExposure > 0 ? "var(--status-warning)" : "var(--status-success)"}
          />
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "9px",
              fontWeight: 700,
              color: "var(--text-muted)",
              alignSelf: "center",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Status:
          </span>
          {["all", ...STATUSES].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                background: filterStatus === status ? "var(--accent)" : "var(--bg-surface-low)",
                color: filterStatus === status ? "white" : "var(--text-secondary)",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "5px 12px",
                fontFamily: "var(--font-body)",
                fontSize: "8px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>

        {/* Form Modal */}
        {showForm && (
          <MitigationFormModal
            projectId={projectId}
            mitigation={editing}
            onClose={() => {
              setShowForm(false);
              setEditing(null);
              setPrefill(null);
            }}
            onSave={handleSave}
            isSaving={createMut.isPending || updateMut.isPending}
            prefill={prefill}
          />
        )}

        {/* Table / List */}
        {filtered.length === 0 ? (
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-card)",
              padding: "40px",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              No mitigations logged
            </p>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "11px",
                color: "var(--text-muted)",
                margin: 0,
              }}
            >
              Log issues here to document your protective actions and notice history.
            </p>
          </div>
        ) : (
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              overflow: "hidden",
            }}
          >
            {/* Table header */}
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--divider)",
                display: "grid",
                gridTemplateColumns: "70px 1.5fr 90px 90px 90px 80px 70px 70px 80px 72px",
                gap: "8px",
                background: "var(--bg-surface-secondary)",
                alignItems: "center",
              }}
            >
              {["MIT #", "Title", "Source", "Ref", "Status", "CO", "Cost", "Days", "Date", "Actions"].map(
                (col) => (
                  <div
                    key={col}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      textAlign: col === "Cost" || col === "Days" ? "right" : "left",
                    }}
                  >
                    {col}
                  </div>
                )
              )}
            </div>

            {/* Table rows */}
            {filtered.map((m) => {
              const statusColor = STATUS_COLORS[m.status] || "var(--text-muted)";
              return (
                <div
                  key={m.id}
                  onClick={() => handleRowClick(m)}
                  style={{
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--divider)",
                    display: "grid",
                    gridTemplateColumns: "70px 1.5fr 90px 90px 90px 80px 70px 70px 80px 72px",
                    gap: "8px",
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "background 0.1s",
                    background: selected?.id === m.id ? "var(--bg-surface-low)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (selected?.id !== m.id) e.currentTarget.style.background = "var(--hover-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selected?.id === m.id ? "var(--bg-surface-low)" : "transparent";
                  }}
                >
                  {/* Mitigation # */}
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--accent)",
                    }}
                  >
                    {m.mitigation_number || "\u2014"}
                  </div>

                  {/* Title */}
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.title}
                  </div>

                  {/* Issue Source badge */}
                  <div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        color: "var(--text-muted)",
                        background: "var(--bg-surface-high)",
                        borderRadius: "var(--radius-badge)",
                        padding: "2px 6px",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {m.issue_source || "\u2014"}
                    </span>
                  </div>

                  {/* Source Ref */}
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.source_entity_ref || "\u2014"}
                  </div>

                  {/* Status chip */}
                  <div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 8px",
                        background: `${statusColor}18`,
                        borderRadius: "var(--radius-badge)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          fontWeight: 700,
                          color: statusColor,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {m.status}
                      </span>
                    </span>
                  </div>

                  {/* CO Candidate */}
                  <div>
                    {m.is_co_candidate && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          fontWeight: 700,
                          color: "var(--accent)",
                          background: "var(--accent-muted)",
                          borderRadius: "var(--radius-badge)",
                          padding: "2px 6px",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        CO
                      </span>
                    )}
                  </div>

                  {/* Cost */}
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-secondary)",
                      textAlign: "right",
                    }}
                  >
                    {m.cost_exposure ? `$${Number(m.cost_exposure).toLocaleString()}` : "\u2014"}
                  </div>

                  {/* Schedule days */}
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-secondary)",
                      textAlign: "right",
                    }}
                  >
                    {m.schedule_exposure_days ? `${m.schedule_exposure_days}d` : "\u2014"}
                  </div>

                  {/* Date */}
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                    }}
                  >
                    {m.identified_date
                      ? new Date(m.identified_date + "T00:00:00").toLocaleDateString()
                      : "\u2014"}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        setEditing(m);
                        setPrefill(null);
                        setShowForm(true);
                      }}
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-btn)",
                        padding: "3px 8px",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        cursor: "pointer",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(m)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-btn)",
                        padding: "3px 8px",
                        color: "var(--status-error)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        cursor: "pointer",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Del
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detail Panel */}
        {selected && (
          <MitigationDetailPanel
            mitigation={selected}
            onClose={() => setSelected(null)}
            onEdit={(m) => {
              setSelected(null);
              setEditing(m);
              setPrefill(null);
              setShowForm(true);
            }}
            onDelete={(m) => {
              setSelected(null);
              setDeleteTarget(m);
            }}
          />
        )}

        {/* Delete Dialog */}
        <DeleteDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (!deleteMut.isPending && deleteTarget?.id) {
              deleteMut.mutate(deleteTarget.id);
            }
          }}
          title="Delete Mitigation"
          description="Delete this mitigation record? This cannot be undone."
        />
      </div>
    </ErrorBoundary>
  );
}
