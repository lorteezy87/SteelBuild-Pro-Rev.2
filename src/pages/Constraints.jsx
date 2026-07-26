/**
 * Constraints.jsx — Constraint Log page shell.
 *
 * Owns: React-Query wiring (constraints, work packages, projects),
 * create/update/delete mutations, the filter/derived-data useMemo
 * blocks, and composition of the feature-folder components.
 *
 * Every chunk of UI (KPI strip, priority bar, overdue strip, filters,
 * list/board views, expanded row, form modal, empty state) lives in
 * src/pages/constraints/.
 */

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import DeleteDialog from "@/components/shared/DeleteDialog";

import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { isOverdue } from "./constraints/utils";
import KpiStrip from "./constraints/KpiStrip";
import PriorityBar from "./constraints/PriorityBar";
import OverdueStrip from "./constraints/OverdueStrip";
import FilterBar from "./constraints/FilterBar";
import EmptyState from "./constraints/EmptyState";
import ListView from "./constraints/ListView";
import BoardView from "./constraints/BoardView";
import ConstraintFormModal from "./constraints/ConstraintFormModal";
import { CONSTRAINT_TYPES, TYPE_COLORS, inputStyle } from "./constraints/constants";
import SequenceFilter, { matchesSequenceFilter } from "@/components/shared/SequenceFilter";
import { OperationsPageShell, OpsActionButton, OpsFilterPanel } from "@/components/operations/OperationsPageShell";
import { Plus, Search } from "lucide-react";
import { CONSTRAINT_STATUS, RESOLVED_STATUSES, PRIORITY, PRIORITY_ORDER } from "@/lib/enums";
import { deriveOperationalConstraints } from "@/services/constraintEngine";

const EMPTY_ENGINE_SOURCES = {
  rfis: [],
  submittals: [],
  deliveries: [],
  scheduleTasks: [],
  drawings: [],
  inspections: [],
};

export default function Constraints() {
  const qc = useQueryClient();
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();

  const [view, setView] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [seqFilter, setSeqFilter] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // -- Data ----------------------------------------------------------------------
  const { data: items = [] } = useQuery({
    queryKey: ["constraints", projectId],
    queryFn: () =>
      projectId
        ? entities.ActionItem.filter({ project_id: projectId, category: "CONSTRAINT" })
        : entities.ActionItem.filter({ category: "CONSTRAINT" }),
    enabled: true,
  });

  const { data: wps = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () =>
      projectId
        ? entities.WorkPackage.filter({ project_id: projectId })
        : entities.WorkPackage.list(),
    enabled: true,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: engineSources = EMPTY_ENGINE_SOURCES } = useQuery({
    queryKey: ["constraint-engine-sources", projectId],
    queryFn: async () => {
      if (!projectId) return EMPTY_ENGINE_SOURCES;
      const read = (entity, order) =>
        order
          ? entity.filter({ project_id: projectId }, order).catch(() => [])
          : entity.filter({ project_id: projectId }).catch(() => []);
      const [rfis, submittals, deliveries, scheduleTasks, drawings, inspections] = await Promise.all([
        read(entities.RFI, "-submitted_date"),
        read(entities.Submittal, "-submitted_date"),
        read(entities.Delivery, "-scheduled_date"),
        read(entities.ScheduleTask, "start_date"),
        read(entities.Drawing),
        read(entities.Inspection, "-inspection_date"),
      ]);
      return { rfis, submittals, deliveries, scheduleTasks, drawings, inspections };
    },
    enabled: Boolean(projectId),
    staleTime: 30 * 1000,
  });

  // -- Mutations ----------------------------------------------------------------------
  const createMut = useMutation({
    mutationFn: (data) => entities.ActionItem.create(withProjectId(data, projectId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      toast.success("Constraint logged");
      setShowForm(false);
      setEditing(null);
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Create failed")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.ActionItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      toast.success("Constraint updated");
      setShowForm(false);
      setEditing(null);
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Update failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.ActionItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      setDeleteTarget(null);
      toast.success("Constraint deleted");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Delete failed")),
  });

  // -- Derived data ----------------------------------------------------------------------
  const generatedConstraints = useMemo(
    () =>
      deriveOperationalConstraints(
        {
          ...engineSources,
          workPackages: wps,
          existingConstraints: items,
        },
        { today: new Date() },
      ),
    [engineSources, items, wps],
  );

  const allConstraints = useMemo(
    () => [...generatedConstraints, ...items],
    [generatedConstraints, items],
  );

  const kpis = useMemo(() => {
    const open = allConstraints.filter((c) => !RESOLVED_STATUSES.includes(c.status));
    const resolved = allConstraints.filter((c) => c.status === CONSTRAINT_STATUS.RESOLVED);
    const closed = allConstraints.filter((c) => c.status === CONSTRAINT_STATUS.CLOSED);
    const overdue = open.filter(isOverdue);
    const critical = open.filter((c) => c.priority === PRIORITY.CRITICAL);
    const inProg = allConstraints.filter((c) => c.status === CONSTRAINT_STATUS.IN_PROGRESS);
    const generated = allConstraints.filter((c) => c._generated);

    const oldestOpen = open.reduce((oldest, c) => {
      const d = new Date(c.created_date || c.created_at || c.due_date || Date.now());
      return !oldest || d < oldest ? d : oldest;
    }, null);
    const agedays = oldestOpen ? Math.floor((Date.now() - oldestOpen) / 86400000) : 0;

    const byType = CONSTRAINT_TYPES.map((t) => ({
      type: t,
      count: open.filter((c) => c.constraint_type === t).length,
      color: TYPE_COLORS[t],
    }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);

    const byPriority = Object.values(PRIORITY).map((p) => ({
      priority: p,
      count: open.filter((c) => c.priority === p).length,
    }));

    return { open, resolved, closed, overdue, critical, inProg, generated, agedays, byType, byPriority, total: allConstraints.length };
  }, [allConstraints]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allConstraints
      .filter((c) => {
        if (filterType !== "all" && c.constraint_type !== filterType) return false;
        if (filterStatus === "open" && RESOLVED_STATUSES.includes(c.status)) return false;
        if (filterStatus !== "all" && filterStatus !== "open" && c.status !== filterStatus) return false;
        if (filterPriority !== "all" && c.priority !== filterPriority) return false;
        if (!matchesSequenceFilter(c, seqFilter)) return false;
        if (
          q &&
          ![c.title, c.description, c.project_area, c.assigned_to, c.constraint_number, c._source_ref, c._source_type]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        const aResolved = RESOLVED_STATUSES.includes(a.status);
        const bResolved = RESOLVED_STATUSES.includes(b.status);
        if (aResolved !== bResolved) return aResolved ? 1 : -1;
        const aP = PRIORITY_ORDER[a.priority] ?? 2;
        const bP = PRIORITY_ORDER[b.priority] ?? 2;
        if (aP !== bP) return aP - bP;
        const aOverdue = isOverdue(a);
        const bOverdue = isOverdue(b);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
        return 0;
      });
  }, [allConstraints, filterType, filterStatus, filterPriority, seqFilter, search]);

  const openCount = kpis.open.length;
  const overdueCount = kpis.overdue.length;

  // -- Handlers ----------------------------------------------------------------------

  const handleSave = (data) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate({
        ...data,
        category: "CONSTRAINT",
        project_id: projectId || data.project_id || "",
      });
    }
  };

  // -- No-project early return ----------------------------------------------------------------------
  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>—</div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Select a Project
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
          Constraint tracking is project-scoped. Choose a project from the top nav.
        </div>
      </div>
    );
  }

  // -- Render ----------------------------------------------------------------------
  return (
    <div className="sb-dashboard-reference-page">
    <OperationsPageShell
      eyebrow={activeProject?.name || projects.find((p) => p.id === projectId)?.name || "All Projects"}
      title="Constraint Log"
      subtitle="Track upstream blockers, due dates, priority, mitigation, and the work packages they affect before field execution is held up."
      meta={[
        { label: "Total", value: kpis.total },
        { label: "Open", value: openCount, color: openCount > 0 ? "var(--status-warning)" : "var(--status-success)" },
        { label: "Overdue", value: overdueCount, color: overdueCount > 0 ? "var(--status-error)" : "var(--status-success)" },
        { label: "System", value: kpis.generated.length, color: kpis.generated.length > 0 ? "var(--accent)" : "var(--text-muted)" },
        { label: "View", value: view },
      ]}
      metrics={[
        { label: "Open Constraints", value: openCount, sub: `${kpis.critical.length} critical`, color: kpis.critical.length > 0 ? "var(--status-error)" : "var(--status-warning)" },
        { label: "Overdue", value: overdueCount, sub: "Past due blockers", color: overdueCount > 0 ? "var(--status-error)" : "var(--status-success)" },
        { label: "System Generated", value: kpis.generated.length, sub: "From RFIs, drawings, tasks, deliveries", color: kpis.generated.length > 0 ? "var(--accent)" : "var(--text-muted)" },
        { label: "Oldest Open", value: `${kpis.agedays}d`, sub: "Age of oldest blocker", color: kpis.agedays > 7 ? "var(--status-warning)" : undefined },
      ]}
      actions={(
        <>
          <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
            {[["list", "List"], ["board", "Board"]].map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  background: view === v ? "var(--accent-muted)" : "transparent",
                  color: view === v ? "var(--accent)" : "var(--text-secondary)",
                  border: "none",
                  borderRight: v === "list" ? "1px solid var(--border-default)" : "none",
                  padding: "8px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <OpsActionButton
            variant="primary"
            onClick={() => { setEditing(null); setShowForm(true); }}
            icon={<Plus size={13} />}
          >
            Log Constraint
          </OpsActionButton>
        </>
      )}
    >
      <OpsFilterPanel>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search constraints..."
            style={{ ...inputStyle, paddingLeft: 30, width: "100%" }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>
          {filtered.length} shown
        </span>
      </OpsFilterPanel>
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

      <SequenceFilter items={allConstraints} value={seqFilter} onChange={setSeqFilter} />

      {filtered.length === 0 ? (
        <EmptyState hasOpen={filterStatus === "open"} />
      ) : view === "list" ? (
        <ListView
          items={filtered}
          wps={wps}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onQuickUpdate={(id, data) => updateMut.mutate({ id, data })}
          onEdit={(c) => { setEditing(c); setShowForm(true); }}
          onDelete={(c) => setDeleteTarget(c)}
        />
      ) : (
        <BoardView
          items={filtered}
          wps={wps}
          onQuickUpdate={(id, data) => updateMut.mutate({ id, data })}
          onEdit={(c) => { setEditing(c); setShowForm(true); }}
          onDelete={(c) => setDeleteTarget(c)}
        />
      )}

      {(showForm || editing) && (
        <ConstraintFormModal
          projectId={projectId}
          constraint={editing}
          wps={wps}
          onClose={() => { setShowForm(false); setEditing(null); }}
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
    </OperationsPageShell>
    </div>
  );
}
