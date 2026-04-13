import React, { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { formatDate, formatDateShort as formatShortDate } from "@/components/shared/formatters";

const CONSTRAINT_TYPES = [
  "Missing Embeds",
  "Anchor Bolt Issue",
  "Approved Submittal Missing",
  "Release Pending",
  "Field Measurement Needed",
  "Access Issue",
  "Crane / Logistics Conflict",
  "Predecessor Not Complete",
  "Material Not Available",
  "Design Change Pending",
  "Other",
];

const TYPE_COLORS = {
  "Missing Embeds": "var(--status-error)",
  "Anchor Bolt Issue": "var(--status-error)",
  "Approved Submittal Missing": "var(--status-warning)",
  "Release Pending": "var(--status-warning)",
  "Field Measurement Needed": "var(--accent)",
  "Access Issue": "var(--status-error)",
  "Crane / Logistics Conflict": "var(--status-error)",
  "Predecessor Not Complete": "var(--status-warning)",
  "Material Not Available": "var(--status-warning)",
  "Design Change Pending": "var(--accent)",
  Other: "var(--text-muted)",
};

const TYPE_ICONS = {
  "Missing Embeds": "\u2B1C",
  "Anchor Bolt Issue": "\u2693",
  "Approved Submittal Missing": "\u2709",
  "Release Pending": "\u23F3",
  "Field Measurement Needed": "\u{1F4CF}",
  "Access Issue": "\u{1F6AB}",
  "Crane / Logistics Conflict": "\u{1F3D7}",
  "Predecessor Not Complete": "\u26D4",
  "Material Not Available": "\u{1F4E6}",
  "Design Change Pending": "\u270F",
  Other: "\u2022",
};

const PRIORITY_CONFIG = {
  Critical: {
    color: "var(--status-error)",
    bg: "var(--danger-muted)",
    border: "var(--danger-border)",
    dot: "#FF4444",
  },
  High: {
    color: "var(--status-warning)",
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
    dot: "var(--tertiary)",
  },
  Medium: {
    color: "var(--accent)",
    bg: "var(--accent-muted)",
    border: "var(--accent-border)",
    dot: "var(--accent)",
  },
  Low: {
    color: "var(--text-muted)",
    bg: "rgba(144,144,149,0.1)",
    border: "rgba(144,144,149,0.25)",
    dot: "#909095",
  },
};

const STATUS_CONFIG = {
  Open: { color: "var(--status-warning)", bg: "var(--warning-muted)", label: "OPEN" },
  "In Progress": { color: "var(--accent)", bg: "var(--accent-muted)", label: "IN PROGRESS" },
  Resolved: { color: "var(--status-success)", bg: "var(--success-muted)", label: "RESOLVED" },
  Closed: { color: "var(--text-muted)", bg: "rgba(144,144,149,0.1)", label: "CLOSED" },
};

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};


function abbreviateType(type) {
  const map = {
    "Missing Embeds": "EMBEDS",
    "Anchor Bolt Issue": "ANCHOR BOLT",
    "Approved Submittal Missing": "SUBMITTAL",
    "Release Pending": "RELEASE",
    "Field Measurement Needed": "FIELD MEAS",
    "Access Issue": "ACCESS",
    "Crane / Logistics Conflict": "CRANE/LOG",
    "Predecessor Not Complete": "PREDEC",
    "Material Not Available": "MATERIAL",
    "Design Change Pending": "DESIGN CHG",
    Other: "OTHER",
  };
  return map[type] || (type || "").slice(0, 10).toUpperCase();
}
export default function Constraints() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || searchParams.get("project") || activeProject?.id || null;
  const navigate = useNavigate();

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

  const [view, setView] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

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

  const kpis = useMemo(() => {
    const open = items.filter((c) => !["Resolved", "Closed"].includes(c.status));
    const resolved = items.filter((c) => c.status === "Resolved");
    const closed = items.filter((c) => c.status === "Closed");
    const overdue = open.filter(
      (c) => c.due_date && new Date(`${c.due_date}T00:00:00Z`) < new Date()
    );
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
        const PRIO = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        const aResolved = ["Resolved", "Closed"].includes(a.status);
        const bResolved = ["Resolved", "Closed"].includes(b.status);
        if (aResolved !== bResolved) return aResolved ? 1 : -1;
        const aP = PRIO[a.priority] ?? 2;
        const bP = PRIO[b.priority] ?? 2;
        if (aP !== bP) return aP - bP;
        const aOverdue =
          a.due_date && new Date(`${a.due_date}T00:00:00Z`) < new Date();
        const bOverdue =
          b.due_date && new Date(`${b.due_date}T00:00:00Z`) < new Date();
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
        return 0;
      });
  }, [items, filterType, filterStatus, filterPriority, search]);

  const openCount = kpis.open.length;
  const overdueCount = kpis.overdue.length;

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

  const renderNoProject = () => (
    <div
      style={{
        textAlign: "center",
        padding: "80px 24px",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>?</div>
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

  if (!projectId) {
    return renderNoProject();
  }

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
            <span>{activeProject?.name || projects.find((p) => p.id === projectId)?.name || "Project"}</span>
            <span style={{ color: "var(--border-strong)" }}>·</span>
            <span>{openCount} Open</span>
            <span style={{ color: "var(--border-strong)" }}>·</span>
            <span>
              {kpis.total} Total
            </span>
            {overdueCount > 0 && (
              <>
                <span style={{ color: "var(--border-strong)" }}>·</span>
                <span style={{ color: "var(--status-error)", fontWeight: 700 }}>
                  {overdueCount} Overdue
                </span>
              </>
            )}
          </div>
        </div>

        <div className="filter-bar-responsive" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
              ??
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
                  color: view === v ? "var(--accent-text)" : "var(--text-secondary)",
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
                {v === "list" ? "= List" : "? Board"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            style={{
              background: "var(--status-error)",
              color: "#fff",
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
            + Log Constraint
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
          onLogMitigation={handleLogMitigation}
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
          onLogMitigation={handleLogMitigation}
        />
      )}

      {(showForm || editing) && (
        <ConstraintFormModal
          projectId={projectId}
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
function KpiStrip({ kpis }) {
  const cards = [
    { label: "Open", value: kpis.open.length, color: kpis.open.length ? "var(--status-warning)" : "var(--status-success)" },
    { label: "Overdue", value: kpis.overdue.length, color: kpis.overdue.length ? "var(--status-error)" : "var(--text-muted)" },
    { label: "Critical", value: kpis.critical.length, color: kpis.critical.length ? "var(--status-error)" : "var(--text-muted)" },
    { label: "In Progress", value: kpis.inProg.length, color: "var(--accent)" },
    { label: "Resolved", value: kpis.resolved.length, color: "var(--status-success)" },
    { label: "Total", value: kpis.total, color: "var(--text-muted)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-card)",
            borderTop: `2px solid ${c.color}`,
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 22,
              fontWeight: 600,
              color: c.color,
              lineHeight: 1.1,
            }}
          >
            {c.value}
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 8,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}
function PriorityBar({ byPriority }) {
  const openTotal = byPriority.reduce((s, p) => s + p.count, 0);
  if (!openTotal) return null;
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Open Constraint Priority Distribution
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: "var(--radius-card)", overflow: "hidden", background: "var(--bg-surface-high)" }}>
        {byPriority.map((p) => {
          const width = openTotal ? Math.max((p.count / openTotal) * 100, 3) : 0;
          return (
            <div
              key={p.priority}
              style={{
                width: `${width}%`,
                background: PRIORITY_CONFIG[p.priority].dot,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
        {byPriority.map((p) => (
          <div key={p.priority} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: PRIORITY_CONFIG[p.priority].dot,
              }}
            />
            <span style={{ color: PRIORITY_CONFIG[p.priority].color }}>{p.priority}</span>
            <span>{p.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OverdueStrip({ overdue, onClickItem }) {
  return (
    <div
      style={{
        background: "var(--danger-muted)",
        border: "1px solid var(--danger-border)",
        borderLeft: "4px solid var(--status-error)",
        borderRadius: "var(--radius-card)",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--status-error)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        ? {overdue.length} Constraint{overdue.length === 1 ? "" : "s"} Past Due · Immediate Resolution Required
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {overdue.map((c) => (
          <div
            key={c.id}
            onClick={() => onClickItem(c.id)}
            style={{
              background: "rgba(255,180,171,0.15)",
              border: "1px solid var(--danger-border)",
              borderRadius: "var(--radius-badge)",
              padding: "3px 10px",
              whiteSpace: "nowrap",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--status-error)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            title={c.title}
          >
            <span>{TYPE_ICONS[c.constraint_type] || "?"}</span>
            <span>{(c.title || "").slice(0, 30)}</span>
            <span>· Due {formatShortDate(c.due_date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function FilterBar({ filterStatus, filterPriority, filterType, setFilterStatus, setFilterPriority, setFilterType }) {
  const statusOptions = ["all", "open", "In Progress", "Resolved", "Closed"];
  const priorityOptions = ["all", "Critical", "High", "Medium", "Low"];

  const activeCount =
    (filterStatus !== "open" ? 1 : 0) +
    (filterPriority !== "all" ? 1 : 0) +
    (filterType !== "all" ? 1 : 0);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 6 }}>
        {statusOptions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            style={{
              background: filterStatus === s ? "var(--accent)" : "var(--bg-surface-low)",
              color: filterStatus === s ? "var(--accent-text)" : "var(--text-secondary)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "5px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {s === "open" ? "Open" : s}
          </button>
        ))}
      </div>

      <span style={{ color: "var(--border-strong)" }}>·</span>

      <div style={{ display: "flex", gap: 6 }}>
        {priorityOptions.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilterPriority(p)}
            style={{
              background: filterPriority === p ? PRIORITY_CONFIG[p]?.bg || "var(--accent)" : "var(--bg-surface-low)",
              color: filterPriority === p ? PRIORITY_CONFIG[p]?.color || "var(--accent-text)" : "var(--text-secondary)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "5px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <span style={{ color: "var(--border-strong)" }}>·</span>

      <div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ ...inputStyle, width: "auto", height: 32 }}
        >
          <option value="all">All Types</option>
          {CONSTRAINT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {activeCount > 0 && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            color: "var(--accent)",
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            borderRadius: "var(--radius-badge)",
            padding: "3px 8px",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          {activeCount} Filters Active
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasOpen }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>?</div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--status-success)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {hasOpen ? "No Open Constraints" : "No Constraints Found"}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
        {hasOpen ? "All constraints are resolved. Good standing." : "Try adjusting your filters."}
      </div>
    </div>
  );
}
function ListView({ items, wps, expandedId, setExpandedId, onQuickUpdate, onEdit, onDelete, onLogMitigation }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          borderBottom: "1px solid var(--divider)",
          padding: "9px 16px",
          display: "grid",
          gridTemplateColumns: "6px 28px 1fr 110px 80px 90px 80px 100px",
          gap: 12,
          alignItems: "center",
        }}
      >
        {["", "!", "Constraint", "Type", "WP", "Area", "Due", "Actions"].map((h) => (
          <div
            key={h}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {items.map((c) => {
        const overdue =
          c.due_date && new Date(`${c.due_date}T00:00:00Z`) < new Date() && !["Resolved", "Closed"].includes(c.status);
        const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
        const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.Open;
        const wp = wps.find((w) => w.id === c.work_package_id);
        const isResolved = ["Resolved", "Closed"].includes(c.status);
        return (
          <React.Fragment key={c.id}>
            <div
              onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "6px 28px 1fr 110px 80px 90px 80px 100px",
                gap: 12,
                alignItems: "center",
                padding: "0 16px",
                minHeight: 48,
                borderBottom: "1px solid var(--divider)",
                cursor: "pointer",
                background: expandedId === c.id ? "var(--bg-row-hover)" : "transparent",
                opacity: isResolved ? 0.55 : 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-row-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = expandedId === c.id ? "var(--bg-row-hover)" : "transparent")}
            >
              <div
                style={{
                  width: 4,
                  height: 36,
                  borderRadius: 2,
                  background: PRIORITY_CONFIG[c.priority]?.dot || "var(--text-muted)",
                }}
              />
              <div
                style={{
                  fontSize: 14,
                  textAlign: "center",
                  color: typeColor,
                  lineHeight: 1,
                }}
                title={c.constraint_type}
              >
                {TYPE_ICONS[c.constraint_type] || "?"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.title || "Untitled constraint"}
                  </span>
                  {overdue && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)" }}>
                      ? OVERDUE
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
                    {expandedId === c.id ? "?" : "?"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                  {c.assigned_to ? <span style={{ fontStyle: "italic" }}>{c.assigned_to}</span> : null}
                  {!c.assigned_to && !isResolved ? (
                    <span
                      style={{
                        background: statusCfg.bg,
                        color: statusCfg.color,
                        borderRadius: "var(--radius-badge)",
                        padding: "1px 6px",
                        fontSize: 8,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {statusCfg.label}
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <span
                  style={{
                    background: `${typeColor}15`,
                    color: typeColor,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "var(--radius-badge)",
                    textTransform: "uppercase",
                  }}
                >
                  {abbreviateType(c.constraint_type)}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>
                {wp ? wp.wp_number : "—"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                {c.project_area ? c.project_area.slice(0, 10) : "—"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: overdue ? "var(--status-error)" : "var(--text-muted)",
                  fontWeight: overdue ? 700 : 500,
                }}
              >
                {c.due_date ? formatShortDate(c.due_date) : "—"}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-start" }}>
                {!["Resolved", "Closed"].includes(c.status) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickUpdate(c.id, { status: "Resolved" });
                    }}
                    style={{
                      background: "var(--success-muted)",
                      border: "1px solid var(--success-border)",
                      borderRadius: "var(--radius-btn)",
                      padding: "3px 8px",
                      color: "var(--status-success)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ?
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(c);
                  }}
                  style={{
                    background: "var(--bg-surface-high)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-btn)",
                    padding: "3px 8px",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  EDIT
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(c);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--danger-border)",
                    borderRadius: "var(--radius-btn)",
                    padding: "3px 7px",
                    color: "var(--status-error)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ?
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLogMitigation(c);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-btn)",
                    padding: "3px 7px",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                    letterSpacing: "0.08em",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  MIT
                </button>
              </div>
            </div>

            {expandedId === c.id && (
              <ExpandedRow constraint={c} wps={wps} onQuickUpdate={onQuickUpdate} onEdit={onEdit} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
function ExpandedRow({ constraint: c, wps, onQuickUpdate, onEdit }) {
  const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.Open;
  const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
  const wp = wps.find((w) => w.id === c.work_package_id);
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        borderBottom: "1px solid var(--divider)",
        borderLeft: `4px solid ${typeColor}`,
        padding: "14px 16px 14px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          marginTop: 2,
        }}
      >
        {c.description?.trim() ? c.description : <i style={{ color: "var(--text-muted)" }}>No details provided.</i>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Meta label="Assigned To" value={c.assigned_to || "—"} />
        <Meta label="Due Date" value={c.due_date ? formatDate(c.due_date) : "—"} />
        <Meta
          label="Priority"
          value={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: PRIORITY_CONFIG[c.priority]?.dot || "var(--text-muted)",
                }}
              />
              <span>{c.priority}</span>
            </div>
          }
        />
        <Meta
          label="Status"
          value={
            <span
              style={{
                background: statusCfg.bg,
                color: statusCfg.color,
                borderRadius: "var(--radius-badge)",
                padding: "2px 7px",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {statusCfg.label}
            </span>
          }
        />
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
        WP: {wp ? wp.wp_number : "—"} · Area: {c.project_area || "—"}
      </div>

      <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--divider)", paddingTop: 12, alignItems: "center" }}>
        {c.status === "Open" && (
          <ActionBtn label="? Start Progress" onClick={() => onQuickUpdate(c.id, { status: "In Progress" })} />
        )}
        {!["Resolved", "Closed"].includes(c.status) && (
          <ActionBtn
            label="? Mark Resolved"
            tone="success"
            onClick={() => onQuickUpdate(c.id, { status: "Resolved" })}
          />
        )}
        {c.status === "Resolved" && (
          <ActionBtn
            label="? Reopen"
            tone="warning"
            onClick={() => onQuickUpdate(c.id, { status: "Open" })}
          />
        )}
        {c.status !== "Closed" && (
          <ActionBtn
            label="? Close"
            tone="muted"
            onClick={() => onQuickUpdate(c.id, { status: "Closed" })}
          />
        )}
        <div style={{ flex: 1 }} />
        <ActionBtn label="Edit Details" onClick={() => onEdit(c)} tone="neutral" />
      </div>
    </div>
  );
}

function BoardView({ items, wps, onQuickUpdate, onEdit, onDelete, onLogMitigation }) {
  const lanes = ["Critical", "High", "Medium", "Low"];
  const grouped = lanes.map((p) => ({
    priority: p,
    items: items.filter((c) => c.priority === p),
  }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "start" }}>
      {grouped.map((lane) => {
        const cfg = PRIORITY_CONFIG[lane.priority];
        return (
          <div key={lane.priority} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", display: "flex", flexDirection: "column", minHeight: 120 }}>
            <div
              style={{
                borderTop: `3px solid ${cfg.dot}`,
                padding: "10px 12px",
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-card) var(--radius-card) 0 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: cfg.color, letterSpacing: "0.10em" }}>
                {lane.priority.toUpperCase()}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: cfg.color,
                  background: cfg.bg,
                  borderRadius: "var(--radius-badge)",
                  padding: "2px 8px",
                }}
              >
                {lane.items.length}
              </div>
            </div>

            <div style={{ padding: 10 }}>
              {lane.items.length === 0 ? (
                <div
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  —
                </div>
              ) : (
                lane.items.map((c) => {
                  const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
                  const overdue =
                    c.due_date && new Date(`${c.due_date}T00:00:00Z`) < new Date() && !["Resolved", "Closed"].includes(c.status);
                  const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.Open;
                  const wp = wps.find((w) => w.id === c.work_package_id);
                  return (
                    <div
                      key={c.id}
                      style={{
                        background: "var(--bg-surface)",
                        border: overdue ? "1px solid var(--danger-border)" : "1px solid var(--border-default)",
                        borderLeft: `3px solid ${typeColor}`,
                        borderRadius: "var(--radius-card)",
                        padding: "12px",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 14, color: typeColor }}>{TYPE_ICONS[c.constraint_type] || "?"}</span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 9,
                              fontWeight: 700,
                              color: typeColor,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: 140,
                            }}
                          >
                            {abbreviateType(c.constraint_type)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onEdit(c)}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-btn)",
                            padding: "3px 7px",
                            color: "var(--text-secondary)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 8,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          EDIT
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLogMitigation(c);
                          }}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-btn)",
                            padding: "3px 7px",
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 8,
                            fontWeight: 700,
                            cursor: "pointer",
                            letterSpacing: "0.08em",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                        >
                          MIT
                        </button>
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          lineHeight: 1.3,
                          marginBottom: 6,
                          maxHeight: 34,
                          overflow: "hidden",
                        }}
                      >
                        {c.title || "Untitled constraint"}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          fontSize: 9,
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted)",
                          marginBottom: 8,
                        }}
                      >
                        {c.assigned_to && <span>?? {c.assigned_to}</span>}
                        {c.due_date && <span>?? {formatShortDate(c.due_date)}</span>}
                        <span
                          style={{
                            background: statusCfg.bg,
                            color: statusCfg.color,
                            borderRadius: "var(--radius-badge)",
                            padding: "1px 6px",
                            fontSize: 8,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          {statusCfg.label}
                        </span>
                        {overdue && (
                          <span style={{ color: "var(--status-error)", fontWeight: 700 }}>? OVERDUE</span>
                        )}
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          color: "var(--text-muted)",
                          marginBottom: 8,
                        }}
                      >
                        {wp ? wp.wp_number : "No WP"} · {c.project_area || "—"}
                      </div>

                      <div style={{ display: "flex", gap: 4, borderTop: "1px solid var(--divider)", paddingTop: 8 }}>
                        {c.status === "Open" && (
                          <MiniBtn label="? Start" tone="accent" onClick={() => onQuickUpdate(c.id, { status: "In Progress" })} />
                        )}
                        {!["Resolved", "Closed"].includes(c.status) && (
                          <MiniBtn
                            label="? Resolve"
                            tone="success"
                            onClick={() => onQuickUpdate(c.id, { status: "Resolved" })}
                          />
                        )}
                        {c.status === "Resolved" && (
                          <MiniBtn
                            label="? Reopen"
                            tone="warning"
                            onClick={() => onQuickUpdate(c.id, { status: "Open" })}
                          />
                        )}
                        <MiniBtn label="?" tone="muted" onClick={() => onDelete(c)} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function Meta({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-primary)",
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = "accent" }) {
  const styles = {
    accent: {
      background: "var(--accent-muted)",
      border: "1px solid var(--accent-border)",
      color: "var(--accent)",
    },
    success: {
      background: "var(--success-muted)",
      border: "1px solid var(--success-border)",
      color: "var(--status-success)",
    },
    warning: {
      background: "var(--warning-muted)",
      border: "1px solid var(--warning-border)",
      color: "var(--status-warning)",
    },
    muted: {
      background: "transparent",
      border: "1px solid var(--border-strong)",
      color: "var(--text-muted)",
    },
    neutral: {
      background: "var(--bg-surface-high)",
      border: "1px solid var(--border-default)",
      color: "var(--text-secondary)",
    },
  };
  const s = styles[tone] || styles.accent;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...s,
        borderRadius: "var(--radius-btn)",
        padding: "5px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {label}
    </button>
  );
}

function MiniBtn({ label, onClick, tone = "muted" }) {
  const tones = {
    accent: { bg: "var(--accent-muted)", border: "var(--accent-border)", color: "var(--accent)" },
    success: { bg: "var(--success-muted)", border: "var(--success-border)", color: "var(--status-success)" },
    warning: { bg: "var(--warning-muted)", border: "var(--warning-border)", color: "var(--status-warning)" },
    muted: { bg: "transparent", border: "var(--border-default)", color: "var(--text-muted)" },
  };
  const t = tones[tone] || tones.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.color,
        borderRadius: "var(--radius-btn)",
        padding: "3px 8px",
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ConstraintFormModal({ projectId, constraint, wps, onClose, onSave }) {
  const isEdit = !!constraint;
  const [form, setForm] = useState(
    constraint
      ? { ...constraint }
      : {
          title: "",
          constraint_type: "Other",
          description: "",
          project_area: "",
          work_package_id: "",
          assigned_to: "",
          due_date: "",
          status: "Open",
          priority: "High",
          project_id: projectId || "",
        }
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    onSave(form);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: 24,
          maxWidth: 580,
          width: "95%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              textTransform: "uppercase",
              letterSpacing: "0.10em",
            }}
          >
            {isEdit ? `Edit · ${constraint.title}` : "New Constraint"}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
          {CONSTRAINT_TYPES.map((type) => {
            const active = form.constraint_type === type;
            const color = TYPE_COLORS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => set("constraint_type", type)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: active ? `${color}18` : "var(--bg-surface-low)",
                  border: `1px solid ${active ? color : "var(--border-default)"}`,
                  borderRadius: "var(--radius-btn)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.1s",
                }}
              >
                <span style={{ fontSize: 14, color: active ? color : "var(--text-muted)", flexShrink: 0 }}>
                  {TYPE_ICONS[type] || "?"}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    color: active ? color : "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    lineHeight: 1.3,
                  }}
                >
                  {type}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              style={inputStyle}
              value={form.title}
              placeholder="Brief description of what is blocking progress"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <label style={labelStyle}>Details</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              value={form.description}
              placeholder="What is blocking? What is needed to resolve? Any relevant context."
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Project Area / Grid</label>
              <input
                style={inputStyle}
                value={form.project_area}
                onChange={(e) => set("project_area", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Work Package</label>
              <select
                style={inputStyle}
                value={form.work_package_id || ""}
                onChange={(e) => set("work_package_id", e.target.value)}
              >
                <option value="">None</option>
                {wps.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wp_number} · {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Assigned To</label>
              <input
                style={inputStyle}
                value={form.assigned_to}
                onChange={(e) => set("assigned_to", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input
                style={inputStyle}
                type="date"
                value={form.due_date || ""}
                onChange={(e) => set("due_date", e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                style={inputStyle}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {["Open", "In Progress", "Resolved", "Closed"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["Critical", "High", "Medium", "Low"].map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  const active = form.priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set("priority", p)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        background: active ? cfg.bg : "var(--bg-surface-low)",
                        border: `1px solid ${active ? cfg.border : "var(--border-default)"}`,
                        borderRadius: "var(--radius-btn)",
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 700,
                        color: active ? cfg.color : "var(--text-muted)",
                        textTransform: "uppercase",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        transition: "all 0.1s",
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? cfg.dot : "var(--text-muted)" }} />
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "8px 16px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              style={{
                background: "var(--status-error)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-btn)",
                padding: "8px 20px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {isEdit ? "Save Changes" : "Log Constraint"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
