import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";

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
  "Missing Embeds": "⊗",
  "Anchor Bolt Issue": "⊘",
  "Approved Submittal Missing": "▤",
  "Release Pending": "⏸",
  "Field Measurement Needed": "◎",
  "Access Issue": "⛔",
  "Crane / Logistics Conflict": "▲",
  "Predecessor Not Complete": "⛓",
  "Material Not Available": "◻",
  "Design Change Pending": "✦",
  Other: "◈",
};

const PRIORITY_CONFIG = {
  Critical: { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)", dot: "#FF4444" },
  High: { color: "var(--status-warning)", bg: "var(--warning-muted)", border: "var(--warning-border)", dot: "#FFB95F" },
  Medium: { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)", dot: "#7BD0FF" },
  Low: { color: "var(--text-muted)", bg: "rgba(144,144,149,0.1)", border: "rgba(144,144,149,0.25)", dot: "#909095" },
};

const STATUS_CONFIG = {
  Open: { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  "In Progress": { color: "var(--accent)", bg: "var(--accent-muted)" },
  Resolved: { color: "var(--status-success)", bg: "var(--success-muted)" },
  Closed: { color: "var(--text-muted)", bg: "rgba(144,144,149,0.1)" },
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

const formatDate = (d) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

export default function Constraints() {
  const { project } = useProjectContext();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project") || project?.id || null;
  const qc = useQueryClient();

  const [view, setView] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterPriority, setFilterPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["constraints", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ActionItem.filter({ project_id: projectId, category: "CONSTRAINT" })
        : base44.entities.ActionItem.filter({ category: "CONSTRAINT" }),
    initialData: [],
  });

  const { data: wps = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () =>
      projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : base44.entities.WorkPackage.list(),
    initialData: [],
  });

  useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ActionItem.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      setShowForm(false);
      toast.success("Constraint logged");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActionItem.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["constraints"] });
      setShowForm(false);
      setEditing(null);
      toast.success("Constraint updated");
    },
    onError: (err) => toast.error(err.message),
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
    const overdue = open.filter((c) => c.due_date && new Date(`${c.due_date}T00:00:00Z`) < new Date());
    const critical = open.filter((c) => c.priority === "Critical");
    const inProg = items.filter((c) => c.status === "In Progress");
    const byPriority = ["Critical", "High", "Medium", "Low"].map((p) => ({
      priority: p,
      count: open.filter((c) => c.priority === p).length,
    }));
    return { open, resolved, closed, overdue, critical, inProg, byPriority, total: items.length };
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
        const aOver = a.due_date && new Date(`${a.due_date}T00:00:00Z`) < new Date();
        const bOver = b.due_date && new Date(`${b.due_date}T00:00:00Z`) < new Date();
        if (aOver !== bOver) return aOver ? -1 : 1;
        if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
        return 0;
      });
  }, [items, filterType, filterStatus, filterPriority, search]);

  const priorityBarTotal = Math.max(kpis.open.length, 1);

  const renderKPI = (label, value, color) => (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-card)",
        borderTop: `2px solid ${color}`,
        padding: 12,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, color, marginBottom: 4 }}>{value}</div>
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
        {label}
      </div>
    </div>
  );

  const openOverdueStrip =
    kpis.overdue.length > 0 ? (
      <div
        style={{
          background: "var(--danger-muted)",
          border: "1px solid var(--danger-border)",
          borderLeft: "4px solid var(--status-error)",
          borderRadius: "var(--radius-card)",
          padding: "12px 16px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--status-error)",
            letterSpacing: "0.08em",
          }}
        >
          ⚑ {kpis.overdue.length} CONSTRAINT{kpis.overdue.length === 1 ? "" : "S"} PAST DUE — IMMEDIATE RESOLUTION REQUIRED
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingTop: 8 }}>
          {kpis.overdue.slice(0, 6).map((c) => (
            <div
              key={c.id}
              onClick={() => setExpandedId(c.id)}
              style={{
                background: "rgba(255,180,171,0.15)",
                border: "1px solid var(--danger-border)",
                borderRadius: "var(--radius-badge)",
                padding: "3px 10px",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--status-error)",
                cursor: "pointer",
              }}
            >
              {TYPE_ICONS[c.constraint_type] || "◈"} {c.title?.slice(0, 30) || "Constraint"} · Due {formatDate(c.due_date)}
            </div>
          ))}
        </div>
      </div>
    ) : null;

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
      <div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          CONSTRAINT LOG
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          {project?.name || "All Projects"} · {kpis.open.length} open · {kpis.overdue.length} overdue
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ position: "relative", maxWidth: 240, width: "100%" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)" }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search constraints..."
            style={{ ...inputStyle, paddingLeft: 32, maxWidth: 240 }}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["list", "board"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "7px 12px",
                borderRadius: "var(--radius-btn)",
                border: "none",
                background: view === v ? "var(--accent)" : "var(--bg-surface-low)",
                color: view === v ? "#0A0A0B" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              {v === "list" ? "≡ List" : "⊞ Board"}
            </button>
          ))}
        </div>
        <button
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
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          + LOG CONSTRAINT
        </button>
      </div>
    </div>
  );

  const filterBar = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {["all", "open", "In Progress", "Resolved", "Closed"].map((s) => (
        <button
          key={s}
          onClick={() => setFilterStatus(s)}
          style={{
            padding: "5px 12px",
            borderRadius: "var(--radius-btn)",
            border: "none",
            background: filterStatus === s ? "var(--accent)" : "var(--bg-surface-low)",
            color: filterStatus === s ? "#0A0A0B" : "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {s === "open" ? "OPEN" : s.toString().toUpperCase()}
        </button>
      ))}
      <span style={{ color: "var(--border-strong)" }}>·</span>
      {["all", "Critical", "High", "Medium", "Low"].map((p) => {
        const cfg = PRIORITY_CONFIG[p] || {};
        return (
          <button
            key={p}
            onClick={() => setFilterPriority(p)}
            style={{
              padding: "5px 12px",
              borderRadius: "var(--radius-btn)",
              border: "none",
              background: filterPriority === p ? cfg.bg || "var(--accent)" : "var(--bg-surface-low)",
              color: filterPriority === p ? cfg.color || "#0A0A0B" : "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {p.toString().toUpperCase()}
          </button>
        );
      })}
      <select
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
        style={{ ...inputStyle, width: "auto", padding: "6px 10px", height: 32 }}
      >
        <option value="all">All Types</option>
        {CONSTRAINT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );

  const listView = (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
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
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        <span />
        <span />
        <span>Constraint</span>
        <span>Type</span>
        <span>WP</span>
        <span>Area</span>
        <span>Due</span>
        <span>Actions</span>
      </div>

      {filtered.map((c) => {
        const priorityCfg = PRIORITY_CONFIG[c.priority] || PRIORITY_CONFIG.Medium;
        const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
        const overdue = c.due_date && new Date(`${c.due_date}T00:00:00Z`) < new Date() && !["Resolved", "Closed"].includes(c.status);
        const isExpanded = expandedId === c.id;
        const wp = c.work_package_id && wps.find((w) => w.id === c.work_package_id);

        return (
          <React.Fragment key={c.id}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "6px 28px 1fr 110px 80px 90px 80px 100px",
                gap: 12,
                padding: "0 16px",
                minHeight: 48,
                alignItems: "center",
                borderBottom: "1px solid var(--divider)",
                cursor: "pointer",
                opacity: ["Resolved", "Closed"].includes(c.status) ? 0.55 : 1,
                background: isExpanded ? "var(--bg-surface-low)" : "transparent",
              }}
              onClick={() => setExpandedId(isExpanded ? null : c.id)}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = isExpanded ? "var(--bg-surface-low)" : "transparent")}
            >
              <div style={{ width: 4, height: 36, borderRadius: 2, background: priorityCfg.dot }} />
              <div style={{ fontSize: 14, textAlign: "center", color: typeColor }} title={c.constraint_type}>
                {TYPE_ICONS[c.constraint_type] || "◈"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.title}
                  {overdue && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", marginLeft: 6 }}>⚑ OVERDUE</span>
                  )}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>
                  {c.assigned_to || c.status}
                </div>
              </div>
              <div
                style={{
                  background: `${typeColor}15`,
                  color: typeColor,
                  fontFamily: "var(--font-mono)",
                  fontSize: 7,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: "var(--radius-badge)",
                  textTransform: "uppercase",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {abbreviateType(c.constraint_type)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>{wp ? wp.wp_number : "—"}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{c.project_area ? c.project_area.slice(0, 10) : "—"}</div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: overdue ? "var(--status-error)" : "var(--text-muted)",
                  fontWeight: overdue ? 700 : 500,
                }}
              >
                {c.due_date ? formatDate(c.due_date) : "—"}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {!["Resolved", "Closed"].includes(c.status) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateMut.mutate({ id: c.id, data: { status: "Resolved" } });
                    }}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "var(--radius-btn)",
                      border: "1px solid var(--success-border)",
                      background: "var(--success-muted)",
                      color: "var(--status-success)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ✓
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(c);
                    setShowForm(true);
                  }}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "var(--radius-btn)",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-surface-high)",
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(c);
                  }}
                  style={{
                    padding: "3px 7px",
                    borderRadius: "var(--radius-btn)",
                    border: "1px solid var(--danger-border)",
                    background: "rgba(255,61,61,0.08)",
                    color: "var(--status-error)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {isExpanded && (
              <div
                style={{
                  borderBottom: "1px solid var(--divider)",
                  borderLeft: `4px solid ${typeColor}`,
                  background: "var(--bg-surface-low)",
                  padding: "14px 16px 14px 20px",
                }}
              >
                <div style={{ marginBottom: 12, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  {c.description || <i style={{ color: "var(--text-muted)" }}>No details provided.</i>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
                  <Meta label="Assigned To" value={c.assigned_to || "—"} />
                  <Meta label="Due Date" value={formatDate(c.due_date)} color={overdue ? "var(--status-error)" : "var(--text-primary)"} />
                  <Meta label="Priority" value={c.priority || "—"} color={(PRIORITY_CONFIG[c.priority] || {}).color || "var(--text-primary)"} />
                  <Meta label="Status" value={c.status || "—"} color={(STATUS_CONFIG[c.status] || {}).color || "var(--text-primary)"} />
                </div>
                <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--divider)", paddingTop: 12 }}>
                  {c.status === "Open" && (
                    <ActionBtn text="▶ START PROGRESS" color="var(--accent)" bg="var(--accent-muted)" border="var(--accent-border)" onClick={() => updateMut.mutate({ id: c.id, data: { status: "In Progress" } })} />
                  )}
                  {!["Resolved", "Closed"].includes(c.status) && (
                    <ActionBtn text="✓ MARK RESOLVED" color="var(--status-success)" bg="var(--success-muted)" border="var(--success-border)" onClick={() => updateMut.mutate({ id: c.id, data: { status: "Resolved" } })} />
                  )}
                  {c.status === "Resolved" && (
                    <ActionBtn text="↩ REOPEN" color="var(--status-warning)" bg="var(--warning-muted)" border="var(--warning-border)" onClick={() => updateMut.mutate({ id: c.id, data: { status: "Open" } })} />
                  )}
                  {c.status !== "Closed" && (
                    <ActionBtn text="✕ CLOSE" color="var(--text-muted)" bg="transparent" border="var(--border-strong)" onClick={() => updateMut.mutate({ id: c.id, data: { status: "Closed" } })} />
                  )}
                  <div style={{ flex: 1 }} />
                  <ActionBtn text="EDIT DETAILS" color="var(--text-secondary)" bg="var(--bg-surface-high)" border="var(--border-default)" onClick={() => { setEditing(c); setShowForm(true); }} />
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  const boardView = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, alignItems: "start" }}>
      {["Critical", "High", "Medium", "Low"].map((p) => {
        const cfg = PRIORITY_CONFIG[p];
        const items = filtered.filter((c) => c.priority === p);
        return (
          <div key={p}>
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-card) var(--radius-card) 0 0",
                borderTop: `3px solid ${cfg.dot}`,
                padding: "10px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: cfg.color, letterSpacing: "0.08em" }}>
                {p.toUpperCase()}
              </span>
              <span
                style={{
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                  borderRadius: "var(--radius-badge)",
                  padding: "2px 8px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: cfg.color,
                }}
              >
                {items.length}
              </span>
            </div>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderTop: "none", borderRadius: "0 0 var(--radius-card) var(--radius-card)", padding: 10, minHeight: 120 }}>
              {items.map((c) => {
                const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
                const overdue = c.due_date && new Date(`${c.due_date}T00:00:00Z`) < new Date() && !["Resolved", "Closed"].includes(c.status);
                const wp = c.work_package_id && wps.find((w) => w.id === c.work_package_id);
                return (
                  <div
                    key={c.id}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      borderLeft: `3px solid ${typeColor}`,
                      borderRadius: "var(--radius-card)",
                      padding: 12,
                      marginBottom: 8,
                      cursor: "pointer",
                    }}
                    onClick={() => setExpandedId(c.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14, color: typeColor }}>{TYPE_ICONS[c.constraint_type] || "◈"}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: typeColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {abbreviateType(c.constraint_type)}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(c);
                          setShowForm(true);
                        }}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border-default)",
                          borderRadius: "var(--radius-btn)",
                          padding: "3px 8px",
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        EDIT
                      </button>
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 6 }}>
                      {c.title}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginBottom: 8 }}>
                      {c.assigned_to && <span>👤 {c.assigned_to}</span>}
                      {c.due_date && <span>📅 {formatDate(c.due_date)}</span>}
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "var(--radius-badge)",
                          background: STATUS_CONFIG[c.status]?.bg,
                          color: STATUS_CONFIG[c.status]?.color,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {c.status}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                      {wp ? `${wp.wp_number} · ${wp.name || ""}` : "No WP linked"} {c.project_area ? `· ${c.project_area}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--divider)", paddingTop: 8, marginTop: 6 }}>
                      {c.status === "Open" && (
                        <ActionBtn text="▶ START" color="var(--accent)" bg="var(--accent-muted)" border="var(--accent-border)" onClick={() => updateMut.mutate({ id: c.id, data: { status: "In Progress" } })} small />
                      )}
                      {!["Resolved", "Closed"].includes(c.status) && (
                        <ActionBtn text="✓ RESOLVE" color="var(--status-success)" bg="var(--success-muted)" border="var(--success-border)" onClick={() => updateMut.mutate({ id: c.id, data: { status: "Resolved" } })} small />
                      )}
                      {c.status === "Resolved" && (
                        <ActionBtn text="↩ REOPEN" color="var(--status-warning)" bg="var(--warning-muted)" border="var(--warning-border)" onClick={() => updateMut.mutate({ id: c.id, data: { status: "Open" } })} small />
                      )}
                      <ActionBtn text="✕" color="var(--status-error)" bg="transparent" border="var(--danger-border)" onClick={() => setDeleteTarget(c)} small />
                    </div>
                    {overdue && <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)" }}>⚑ Overdue</div>}
                  </div>
                );
              })}
              {items.length === 0 && (
                <div style={{ padding: 16, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>—</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}\n
