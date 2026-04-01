import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useConstraintsData } from "@/components/constraints/useConstraintsData";
import DeleteDialog from "@/components/shared/DeleteDialog";
import {
  inputStyle,
} from "@/components/constraints/constraintsConfig";
import {
  BoardView,
  ConstraintFormModal,
  EmptyState,
  FilterBar,
  KpiStrip,
  ListView,
  OverdueStrip,
  PriorityBar,
} from "@/components/constraints/ConstraintsSections";
import { useProjectContext } from "@/components/shared/useProjectContext";

export default function Constraints() {
  const { activeProject } = useProjectContext();
  const [searchParams] = useSearchParams();
  const defaultProjectId = searchParams.get("project") || searchParams.get("projectId") || activeProject?.id || null;

  const [view, setView] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId);
  const activeProjectId = selectedProjectId;

  useEffect(() => {
    setSelectedProjectId(defaultProjectId || null);
  }, [defaultProjectId]);

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const {
    wps,
    projects,
    kpis,
    filtered,
    createMut,
    updateMut,
    deleteMut,
  } = useConstraintsData({
    activeProjectId,
    search,
    filterType,
    filterStatus,
    filterPriority,
    onFormClose: closeForm,
    onDeleteClose: () => setDeleteTarget(null),
  });

  const openCount = kpis.open.length;
  const overdueCount = kpis.overdue.length;

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate({
        ...data,
        category: "CONSTRAINT",
        project_id: activeProjectId || data.project_id || "",
      });
    }
  };

  return (
    <div style={{ padding: "18px 18px 28px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 24,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-primary)",
              lineHeight: 1.1,
            }}
          >
            Constraint Log
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>{activeProject?.name || projects.find((p) => p.id === activeProjectId)?.name || "Project"}</span>
            <span style={{ color: "var(--border-strong)" }}>|</span>
            <span>{openCount} Open</span>
            <span style={{ color: "var(--border-strong)" }}>|</span>
            <span>
              {kpis.total} Total
            </span>
            {overdueCount > 0 && (
              <>
                <span style={{ color: "var(--border-strong)" }}>|</span>
                <span style={{ color: "var(--status-error)", fontWeight: 700 }}>
                  {overdueCount} Overdue
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 11,
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            >
                SRCH
              </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search constraints..."
              style={{
                ...inputStyle,
                paddingLeft: 28,
                maxWidth: 240,
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {["list", "board"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  background: view === v ? "var(--accent)" : "var(--bg-surface-low)",
                  color: view === v ? "var(--on-accent)" : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "var(--radius-btn)",
                  padding: "7px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {v === "list" ? "List" : "Board"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-btn)", padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Project Workspace
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            style={{
              background: "var(--status-error)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "8px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Create Constraint
          </button>
        </div>
      </div>
      <KpiStrip kpis={kpis} />

      {kpis.open.length > 0 && <PriorityBar byPriority={kpis.byPriority} />}

      {kpis.overdue.length > 0 && (
        <OverdueStrip
          overdue={kpis.overdue}
          onClickItem={(id) => setExpandedId((prev) => (prev === id ? null : id))}
        />
      )}

      <FilterBar
        filterStatus={filterStatus}
        filterPriority={filterPriority}
        filterType={filterType}
        setFilterStatus={setFilterStatus}
        setFilterPriority={setFilterPriority}
        setFilterType={setFilterType}
      />

      {filtered.length === 0 ? (
        <EmptyState hasOpen={filterStatus === "open"} />
      ) : view === "list" ? (
        <ListView
          items={filtered}
          wps={wps}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onQuickUpdate={(id, data) => updateMut.mutate({ id, data })}
          onEdit={(c) => {
            setEditing(c);
            setShowForm(true);
          }}
          onDelete={(c) => setDeleteTarget(c)}
        />
      ) : (
        <BoardView
          items={filtered}
          wps={wps}
          onQuickUpdate={(id, data) => updateMut.mutate({ id, data })}
          onEdit={(c) => {
            setEditing(c);
            setShowForm(true);
          }}
          onDelete={(c) => setDeleteTarget(c)}
        />
      )}

      {(showForm || editing) && (
        <ConstraintFormModal
          projectId={activeProjectId}
          constraint={editing}
          wps={wps}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget?.id)}
        title="Delete Constraint"
        description={`Delete "${deleteTarget?.title || ""}"? This cannot be undone.`}
      />
    </div>
  );
}
