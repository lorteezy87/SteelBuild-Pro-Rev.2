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
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { useProjectContext } from "@/components/shared/useProjectContext";

import { useProjectId } from "@/hooks/useProjectId";
import { inputStyle } from "./constraints/constants";
import { isOverdue } from "./constraints/utils";
import KpiStrip from "./constraints/KpiStrip";
import PriorityBar from "./constraints/PriorityBar";
import OverdueStrip from "./constraints/OverdueStrip";
import FilterBar from "./constraints/FilterBar";
import EmptyState from "./constraints/EmptyState";
import ListView from "./constraints/ListView";
import BoardView from "./constraints/BoardView";
import ConstraintFormModal from "./constraints/ConstraintFormModal";
import { CONSTRAINT_TYPES, TYPE_COLORS } from "./constraints/constants";
import { CommandBar } from "@/components/design-system";
import { Plus, Search } from "lucide-react";

const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export default function Constraints() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [searchParams] = useSearchParams();
  const projectId = useProjectId();
  const navigate = useNavigate();

  const [view, setView] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  // ── Data ───────────────────────────────────────────────────────────
  const { data: items = [] } = useQuery({
    queryKey: ["constraints", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ActionItem.filter({ project_id: projectId, category: "CONSTRAINT" })
        : base44.entities.ActionItem.filter({ category: "CONSTRAINT" }),
    enabled: true,
  });

  const { data: wps = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.WorkPackage.filter({ project_id: projectId })
        : base44.entities.WorkPackage.list(),
    enabled: true,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutations ──────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ActionItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      toast.success("Constraint logged");
      setShowForm(false);
      setEditing(null);
    },
    onError: (err) => toast.error(err?.message || "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActionItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      toast.success("Constraint updated");
      setShowForm(false);
      setEditing(null);
    },
    onError: (err) => toast.error(err?.message || "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ActionItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      setDeleteTarget(null);
      toast.success("Constraint deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  // ── Derived data ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const open = items.filter((c) => !["Resolved", "Closed"].includes(c.status));
    const resolved = items.filter((c) => c.status === "Resolved");
    const closed = items.filter((c) => c.status === "Closed");
    const overdue = open.filter(isOverdue);
    const critical = open.filter((c) => c.priority === "Critical");
    const inProg = items.filter((c) => c.status === "In Progress");

    const oldestOpen = open.reduce((oldest, c) => {
      const d = new Date(c.created_date || c.due_date || Date.now());
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

    const byPriority = ["Critical", "High", "Medium", "Low"].map((p) => ({
      priority: p,
      count: open.filter((c) => c.priority === p).length,
    }));

    return { open, resolved, closed, overdue, critical, inProg, agedays, byType, byPriority, total: items.length };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items
      .filter((c) => {
        if (filterType !== "all" && c.constraint_type !== filterType) return false;
        if (filterStatus === "open" && ["Resolved", "Closed"].includes(c.status)) return false;
        if (filterStatus !== "all" && filterStatus !== "open" && c.status !== filterStatus) return false;
        if (filterPriority !== "all" && c.priority !== filterPriority) return false;
        if (
          q &&
          ![c.title, c.description, c.project_area, c.assigned_to]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        const aResolved = ["Resolved", "Closed"].includes(a.status);
        const bResolved = ["Resolved", "Closed"].includes(b.status);
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
  }, [items, filterType, filterStatus, filterPriority, search]);

  const openCount = kpis.open.length;
  const overdueCount = kpis.overdue.length;

  // ── Handlers ───────────────────────────────────────────────────────
  const handleLogMitigation = (c) => {
    localStorage.setItem("sbp-new-mitigation", JSON.stringify({
      issue_source: "Constraint",
      source_entity_ref: c.constraint_number || "Constraint",
      source_entity_id: c.id,
      title: c.title,
      identified_date: new Date().toISOString().split("T")[0],
      status: "Open",
    }));
    navigate("/Mitigations");
  };

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

  // ── No-project early return ────────────────────────────────────────
  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>◆</div>
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

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "18px 18px 28px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
      <CommandBar
        eyebrow={activeProject?.name || projects.find((p) => p.id === projectId)?.name || "ALL PROJECTS"}
        title="Constraint Log"
        count={kpis.total}
        unit=" · TOTAL"
        subtitle={`${openCount} open${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""} · upstream blockers to field work`}
      >
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search constraints..."
            style={{ ...inputStyle, paddingLeft: 30, maxWidth: 240 }}
          />
        </div>
        <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
          {[["list", "≡ LIST"], ["board", "▦ BOARD"]].map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                background: view === v ? "var(--accent-muted)" : "transparent",
                color: view === v ? "var(--accent)" : "var(--text-secondary)",
                border: "none",
                borderRight: v === "list" ? "1px solid var(--border-default)" : "none",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setEditing(null); setShowForm(true); }}
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
          <Plus size={12} /> Log Constraint
        </button>
      </CommandBar>

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
          onEdit={(c) => { setEditing(c); setShowForm(true); }}
          onDelete={(c) => setDeleteTarget(c)}
          onLogMitigation={handleLogMitigation}
        />
      ) : (
        <BoardView
          items={filtered}
          wps={wps}
          onQuickUpdate={(id, data) => updateMut.mutate({ id, data })}
          onEdit={(c) => { setEditing(c); setShowForm(true); }}
          onDelete={(c) => setDeleteTarget(c)}
          onLogMitigation={handleLogMitigation}
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
    </div>
  );
}
