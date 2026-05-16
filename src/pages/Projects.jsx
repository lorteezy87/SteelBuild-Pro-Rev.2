import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/components/shared/formatters";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import ProjectDetailView from "@/components/projects/ProjectDetailView";
import { toast } from "sonner";
import { calcWpProgress, calcLaborBurn, calcContractValue, calcDaysToDeadline, calcRfiHealth } from "@/utils/projectKpis";
import { CommandBar } from "@/components/design-system";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { Plus } from "lucide-react";

/* ─────────────────────────────────────────────
   Phase + Health configs
───────────────────────────────────────────── */
const PHASE_CONFIG = {
  "Pre-Construction":      { color: "var(--text-muted)",      bg: "var(--bg-surface-low)", order: 0 },
  "Detailing":             { color: "var(--info)",            bg: "var(--info-muted)",     order: 1 },
  "Procurement":           { color: "var(--warning)",         bg: "var(--warning-muted)",  order: 2 },
  "Fabrication":           { color: "var(--accent)",          bg: "var(--accent-muted)",   order: 3 },
  "Delivery":              { color: "var(--phase-delivery)",  bg: "var(--info-muted)",     order: 4 },
  "Installation":          { color: "var(--phase-erection)",  bg: "var(--success-muted)",  order: 5 },
  "Installation/Erection": { color: "var(--phase-erection)",  bg: "var(--success-muted)",  order: 5 },
  "Erection":              { color: "var(--phase-erection)",  bg: "var(--success-muted)",  order: 5 },
  "Closeout":              { color: "var(--phase-closeout)",  bg: "var(--bg-surface-low)", order: 6 },
};

const HEALTH_CONFIG = {
  "On Track": { color: "var(--success)", dot: "var(--success)" },
  "Watch":    { color: "var(--warning)", dot: "var(--warning)" },
  "At Risk":  { color: "var(--danger)",  dot: "var(--danger)" },
};

/* ─────────────────────────────────────────────
   ProgressRing — 48px SVG ring
───────────────────────────────────────────── */
function ProgressRing({ pct, size = 48, color = "var(--accent)" }) {
  const r    = (size - 7) / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ - (circ * Math.min(100, pct || 0)) / 100;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="var(--bg-surface-high)"
          strokeWidth={4.5}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={4.5}
          strokeDasharray={circ}
          strokeDashoffset={fill}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.55s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 800,
          color: "var(--text-primary)",
          lineHeight: 1,
          letterSpacing: "-0.03em",
        }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mini stat card used inside ProjectCard
───────────────────────────────────────────── */
function MiniStat({ label, value, valueColor = "var(--text-primary)" }) {
  return (
    <div style={{
      background: "var(--hover-bg)",
      border: "1px solid var(--border-default)",
      borderRadius: 4,
      padding: "7px 10px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 15,
        fontWeight: 800,
        color: valueColor,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}>
        {value}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Phase pill badge
───────────────────────────────────────────── */
function PhasePill({ phase, config, size = "sm" }) {
  const isSm = size === "sm";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      background: config.bg,
      border: `1px solid ${config.color}45`,
      borderRadius: 3,
      padding: isSm ? "2px 7px" : "3px 9px",
      fontFamily: "var(--font-mono)",
      fontSize: isSm ? 8 : 9,
      fontWeight: 700,
      color: config.color,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      whiteSpace: "nowrap",
    }}>
      {phase}
    </span>
  );
}

/* ─────────────────────────────────────────────
   ProjectCard
───────────────────────────────────────────── */
function ProjectCard({ project, workPackages, rfis, changeOrders, onClick, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const phase  = PHASE_CONFIG[project.phase] || PHASE_CONFIG["Detailing"];
  const health = HEALTH_CONFIG[project.health_status] || HEALTH_CONFIG["On Track"];
  const cardBorderColor = hovered ? "var(--accent-border)" : "var(--border-default)";

  const projectWPs = workPackages.filter(w => w.project_id === project.id);
  const projectRFIs = rfis.filter(r => r.project_id === project.id);
  const projectCOs  = changeOrders.filter(c => c.project_id === project.id);

  const { pct: wpPct, totalTons, completeTons, completeCount: completeWPs } = calcWpProgress(projectWPs);
  const { openCount: openRFIs, overdueCount: overdueRFIs } = calcRfiHealth(projectRFIs);
  const { approvedCOTotal: approvedCOs, revised: revisedContract, original: originalContract, pendingCOCount: pendingCOs } = calcContractValue(project, projectCOs);
  const { daysLeft, isOverdue } = calcDaysToDeadline(project);
  const { burnPct: laborBurn, isOverBudget } = calcLaborBurn(projectWPs);

  const contractDisplay = formatCurrency(revisedContract || originalContract);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--bg-surface)",
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 4,
        borderTopStyle: "solid",
        borderRightStyle: "solid",
        borderBottomStyle: "solid",
        borderLeftStyle: "solid",
        borderTopColor: cardBorderColor,
        borderRightColor: cardBorderColor,
        borderBottomColor: cardBorderColor,
        borderLeftColor: phase.color,
        borderRadius: 6,
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.12s",
        boxShadow: hovered
          ? "0 6px 28px rgba(0,0,0,0.30), 0 0 0 1px var(--accent-border)"
          : "var(--shadow-card)",
        transform: hovered ? "translateY(-2px)" : "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Card header */}
      <div style={{ padding: "16px 18px 12px 16px" }}>
        {/* Row 1: phase pill + number */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <PhasePill phase={project.phase || "—"} config={phase} />
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}>
            {project.project_number || "—"}
          </span>
        </div>

        {/* Row 2: project name + progress ring */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.25,
              marginBottom: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {project.name}
            </div>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {project.general_contractor || project.client || "—"}
            </div>
          </div>
          <ProgressRing pct={wpPct} color={phase.color} size={48} />
        </div>
      </div>

      {/* Contract value box */}
      <div style={{
        margin: "0 16px 12px 16px",
        background: "rgba(0,0,0,0.25)",
        border: "1px solid var(--border-default)",
        borderRadius: 4,
        padding: "10px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: 4,
          }}>
            Contract Value
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 17,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}>
            {contractDisplay}
          </div>
        </div>
        {approvedCOs !== 0 && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: approvedCOs > 0 ? "var(--success)" : "var(--danger)",
            background: approvedCOs > 0 ? "var(--success-muted)" : "var(--danger-muted)",
            border: `1px solid ${approvedCOs > 0 ? "var(--success-border)" : "var(--danger-border)"}`,
            borderRadius: 3,
            padding: "2px 7px",
          }}>
            {approvedCOs > 0 ? "+" : ""}{formatCurrency(approvedCOs)}
          </span>
        )}
      </div>

      {/* 4-stat grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 6,
        margin: "0 16px 14px 16px",
      }}>
        <MiniStat
          label="Open RFIs"
          value={openRFIs}
          valueColor={openRFIs > 0 ? (overdueRFIs > 0 ? "var(--danger)" : "var(--warning)") : "var(--text-muted)"}
        />
        <MiniStat
          label="Pend COs"
          value={pendingCOs}
          valueColor={pendingCOs > 0 ? "var(--warning)" : "var(--text-muted)"}
        />
        <MiniStat
          label="WPs"
          value={`${completeWPs}/${projectWPs.length}`}
          valueColor={phase.color}
        />
        <MiniStat
          label={totalTons > 0 ? "Tons" : "Labor"}
          value={totalTons > 0 ? `${completeTons}T` : `${laborBurn}%`}
          valueColor={isOverBudget ? "var(--danger)" : "var(--text-secondary)"}
        />
      </div>

      {/* Footer */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 16px",
        borderTop: "1px solid var(--divider)",
        marginTop: "auto",
      }}>
        {/* Health dot + label */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: health.dot,
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            color: health.color,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
          }}>
            {project.health_status || "On Track"}
          </span>
        </div>

        {/* Days remaining */}
        {daysLeft !== null && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: daysLeft < 30 ? 700 : 400,
            color: isOverdue ? "var(--danger)" : daysLeft < 30 ? "var(--warning)" : "var(--text-muted)",
          }}>
            {isOverdue ? `${Math.abs(daysLeft)}d OVERDUE` : `${daysLeft}d left`}
          </span>
        )}

        {/* Edit button */}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(project); }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--on-accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          style={{
            background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 3,
            padding: "3px 9px", color: "var(--text-muted)", fontFamily: "var(--font-mono)",
            fontSize: 8, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em",
            textTransform: "uppercase", transition: "border-color 0.12s, color 0.12s",
          }}
        >
          EDIT
        </button>
        {/* Archive button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(project); }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--danger-border)"; e.currentTarget.style.color = "var(--danger)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          style={{
            background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 3,
            padding: "3px 9px", color: "var(--text-muted)", fontFamily: "var(--font-mono)",
            fontSize: 8, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em",
            textTransform: "uppercase", transition: "border-color 0.12s, color 0.12s",
          }}
        >
          ARCHIVE
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   KPI card used in the metric strip
───────────────────────────────────────────── */
function KpiCard({ label, value, sub, alert = false, alertColor = "var(--status-error)", onClick, active = false }) {
  const [hovered, setHovered] = useState(false);
  const borderColor = active ? "var(--accent-border)" : hovered ? "var(--border-strong)" : "var(--border-default)";
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        minWidth: 130,
        background: active ? "var(--accent-muted)" : "var(--bg-surface)",
        borderTopWidth: alert ? 2 : 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderTopStyle: "solid",
        borderRightStyle: "solid",
        borderBottomStyle: "solid",
        borderLeftStyle: "solid",
        borderTopColor: alert ? alertColor : active ? "var(--accent-border)" : "var(--border-default)",
        borderRightColor: borderColor,
        borderBottomColor: borderColor,
        borderLeftColor: borderColor,
        borderRadius: 4,
        padding: "14px 18px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s, background 0.15s",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        marginBottom: 7,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 22,
        fontWeight: 700,
        color: alert ? alertColor : active ? "var(--accent)" : "var(--text-primary)",
        letterSpacing: "-0.03em",
        lineHeight: 1,
        marginBottom: 5,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-muted)",
        letterSpacing: "0.04em",
      }}>
        {sub}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Filter pill button
───────────────────────────────────────────── */
function FilterPill({ label, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: active ? "var(--accent-muted)" : "transparent",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border-default)"}`,
        borderRadius: 3,
        padding: "4px 11px",
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        color: active ? (color || "var(--accent)") : "var(--text-muted)",
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: "0.09em",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
      }}
    >
      {color && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: active ? color : "var(--text-muted)",
          flexShrink: 0,
          transition: "background 0.12s",
        }} />
      )}
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function Projects() {
  const qc         = useQueryClient();
  const { removeProject } = useProjectContext();
  const [search,        setSearch]        = useState("");
  const [phaseFilter,   setPhaseFilter]   = useState("all");
  const [healthFilter,  setHealthFilter]  = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [view,          setView]          = useState("cards");
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editing,       setEditing]       = useState(null);
  const [detailProject, setDetailProject] = useState(null);

  /* ── Data fetching ── */
  const { data: projects     = [] } = useQuery({ queryKey: ["projects"],          queryFn: () => base44.entities.Project.list("-created_at"),    staleTime: 5 * 60 * 1000 });
  const { data: rawWorkPackages = [] } = useQuery({ queryKey: ["work-packages-all"], queryFn: () => base44.entities.WorkPackage.list() });
  const { data: rawRfis         = [] } = useQuery({ queryKey: ["rfis"],              queryFn: () => base44.entities.RFI.list() });
  const { data: rawChangeOrders = [] } = useQuery({ queryKey: ["change-orders-all"], queryFn: () => base44.entities.ChangeOrder.list() });

  const liveProjectIds = useMemo(() => new Set(projects.map((p) => p.id).filter(Boolean)), [projects]);
  const workPackages = useMemo(
    () => rawWorkPackages.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawWorkPackages]
  );
  const rfis = useMemo(
    () => rawRfis.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawRfis]
  );
  const changeOrders = useMemo(
    () => rawChangeOrders.filter((row) => row?.project_id && liveProjectIds.has(row.project_id)),
    [liveProjectIds, rawChangeOrders]
  );

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: (d) => base44.entities.Project.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Project created"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Project.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Project updated"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Project.delete(id),
    onSuccess: (_result, id) => {
      removeProject(id);
      qc.invalidateQueries();
      if (detailProject?.id === id) setDetailProject(null);
      toast.success("Project archived");
    },
    onError: (err) => toast.error(err.message),
  });
  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };
  const handleDelete = (project) => {
    if (window.confirm(`Archive "${project.name}"? It will be hidden from active project lists, but its data and audit history will be retained.`)) {
      deleteMut.mutate(project.id);
    }
  };

  /* ── KPI calculations ── */
  const kpis = useMemo(() => {
    const active       = projects.filter(p => p.phase !== "Closeout");
    const atRisk       = projects.filter(p => p.health_status === "At Risk").length;
    const totalVal     = projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0);
    const openRFIs     = rfis.filter(r => r.status === "Open" || r.status === "Under Review").length;
    const overdueRFIs  = rfis.filter(r => r.date_required && new Date(r.date_required) < new Date() && !["Answered","Closed"].includes(r.status)).length;
    const pendingCOVal = changeOrders.filter(c => ["Submitted","Under Review"].includes(c.status)).reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const pendingCOCount = changeOrders.filter(c => ["Submitted","Under Review"].includes(c.status)).length;
    return { total: projects.length, active: active.length, atRisk, totalVal, openRFIs, overdueRFIs, pendingCOVal, pendingCOCount };
  }, [projects, rfis, changeOrders]);

  /* ── Filtered list ── */
  const filtered = useMemo(() => projects.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.project_number?.toLowerCase().includes(q) || p.client?.toLowerCase().includes(q) || p.general_contractor?.toLowerCase().includes(q);
    return matchSearch
      && (phaseFilter === "all"   || p.phase === phaseFilter)
      && (healthFilter === "all"  || p.health_status === healthFilter)
      && (jobTypeFilter === "all" || p.job_type === jobTypeFilter);
  }), [projects, search, phaseFilter, healthFilter, jobTypeFilter]);

  const hasFilters = search || phaseFilter !== "all" || healthFilter !== "all" || jobTypeFilter !== "all";

  /* ─────────────────────────────────────────────
     Render
  ───────────────────────────────────────────── */
  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "var(--bg-page)",
    }}>

      {/* ══ Command bar ══ */}
      <div style={{
        flexShrink: 0,
        background: "var(--bg-surface-low)",
        borderBottom: "1px solid var(--divider)",
        padding: "16px 24px 12px",
      }}>
        <CommandBar
          eyebrow="PORTFOLIO"
          title="Projects"
          count={projects.length}
          unit=" · ACTIVE + HISTORY"
          subtitle={`${formatCurrency(kpis.totalVal)} portfolio value · ${kpis.active} active · ${kpis.atRisk} at risk`}
        >
          <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
            {[["cards", "CARDS"], ["list", "LIST"]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  background: view === v ? "var(--accent-muted)" : "transparent",
                  border: "none",
                  borderRight: v === "cards" ? "1px solid var(--border-default)" : "none",
                  padding: "6px 12px",
                  color: view === v ? "var(--accent)" : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  transition: "background 0.12s, color 0.12s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
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
              transition: "background 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={12} /> New Project
          </button>
        </CommandBar>
      </div>

      {/* ══ KPI strip ══ */}
      <div style={{
        flexShrink: 0,
        display: "flex",
        gap: 10,
        padding: "12px 24px",
        borderBottom: "1px solid var(--divider)",
        overflowX: "auto",
        background: "var(--bg-page)",
      }}>
        <KpiCard
          label="Portfolio Value"
          value={formatCurrency(kpis.totalVal)}
          sub={`${kpis.total} project${kpis.total !== 1 ? "s" : ""} total`}
        />
        <KpiCard
          label="Active"
          value={kpis.active}
          sub="in progress"
          active={phaseFilter === "all" && healthFilter === "all" && !search}
        />
        <KpiCard
          label="At Risk"
          value={kpis.atRisk}
          sub="need attention"
          alert={kpis.atRisk > 0}
          alertColor="var(--status-error)"
          onClick={kpis.atRisk > 0 ? () => setHealthFilter("At Risk") : undefined}
        />
        <KpiCard
          label="Open RFIs"
          value={kpis.openRFIs}
          sub={kpis.overdueRFIs > 0 ? `${kpis.overdueRFIs} overdue` : "across all projects"}
          alert={kpis.overdueRFIs > 0}
          alertColor="var(--status-warning)"
        />
        <KpiCard
          label="Pending COs"
          value={formatCurrency(kpis.pendingCOVal)}
          sub={`${kpis.pendingCOCount} awaiting approval`}
          alert={kpis.pendingCOCount > 0}
          alertColor="var(--status-error)"
        />
      </div>

      {/* ══ Filter bar ══ */}
      <div style={{
        flexShrink: 0,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "10px 24px",
        borderBottom: "1px solid var(--divider)",
        background: "var(--bg-page)",
      }}>
        {/* Search input */}
        <input
          placeholder="Search projects, clients, GC…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={e => { e.target.style.borderColor = "var(--accent)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--border-default)"; }}
          style={{
            width: 230,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 3,
            padding: "6px 12px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            outline: "none",
          }}
        />

        {/* Phase pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          <FilterPill
            label="All"
            active={phaseFilter === "all"}
            onClick={() => setPhaseFilter("all")}
          />
          {Object.entries(PHASE_CONFIG).map(([phase, cfg]) => (
            <FilterPill
              key={phase}
              label={phase}
              color={cfg.color}
              active={phaseFilter === phase}
              onClick={() => setPhaseFilter(phaseFilter === phase ? "all" : phase)}
            />
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "var(--divider)", flexShrink: 0 }} />

        {/* Health pills */}
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {["On Track", "Watch", "At Risk"].map(h => (
            <FilterPill
              key={h}
              label={h}
              color={HEALTH_CONFIG[h].dot}
              active={healthFilter === h}
              onClick={() => setHealthFilter(healthFilter === h ? "all" : h)}
            />
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "var(--divider)", flexShrink: 0 }} />

        {/* Job type pills — kept in sync with the projects_job_type_check
            constraint added in migration 063. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {[
            "Beams/Deck",
            "Beams/Joists/Deck",
            "Joist Deck",
            "Tilt",
            "Tilt Hybrid",
            "Misc.",
            "Other",
          ].map(t => (
            <FilterPill
              key={t}
              label={t}
              active={jobTypeFilter === t}
              onClick={() => setJobTypeFilter(jobTypeFilter === t ? "all" : t)}
            />
          ))}
        </div>

        {/* Clear + count */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setPhaseFilter("all"); setHealthFilter("all"); setJobTypeFilter("all"); }}
              style={{
                background: "transparent",
                border: "1px solid var(--border-default)",
                borderRadius: 3,
                padding: "4px 10px",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                transition: "border-color 0.12s, color 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              CLEAR
            </button>
          )}
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}>
            {filtered.length} / {projects.length}
          </span>
        </div>
      </div>

      {/* ══ Content area ══ */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 24px",
      }}>

        {/* ── CARDS view ── */}
        {view === "cards" ? (
          filtered.length > 0 ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: 16,
            }}>
              {filtered.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  workPackages={workPackages}
                  rfis={rfis}
                  changeOrders={changeOrders}
                  onClick={() => setDetailProject(p)}
                  onEdit={(proj) => { setEditing(proj); setModalOpen(true); }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "72px 24px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
            }}>
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28,
                color: "var(--border-strong)",
                marginBottom: 14,
                lineHeight: 1,
              }}>
                ▤
              </div>
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
                No projects found
              </div>
              {hasFilters && (
                <button
                  onClick={() => { setSearch(""); setPhaseFilter("all"); setHealthFilter("all"); setJobTypeFilter("all"); }}
                  style={{
                    marginTop: 14,
                    background: "transparent",
                    border: "1px solid var(--border-default)",
                    borderRadius: 3,
                    padding: "5px 14px",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: "pointer",
                    letterSpacing: "0.09em",
                    textTransform: "uppercase",
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          )
        ) : (
          /* ── LIST view ── */
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            overflow: "hidden",
            boxShadow: "var(--shadow-card)",
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "2fr 1.2fr 110px 140px 150px 90px 110px 60px",
              gap: 0,
              padding: "9px 16px 9px 20px",
              background: "var(--bg-surface-low)",
              borderBottom: "1px solid var(--border-default)",
            }}>
              {["Project", "GC / Client", "Phase", "Progress", "Contract", "Health", "Due Date", "RFIs"].map(col => (
                <div key={col} style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                  paddingRight: 12,
                }}>
                  {col}
                </div>
              ))}
            </div>

            {/* Table rows */}
            {filtered.length === 0 ? (
              <div style={{
                padding: "44px 24px",
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
                No projects found
              </div>
            ) : filtered.map((p, idx) => {
              const phase  = PHASE_CONFIG[p.phase] || PHASE_CONFIG["Detailing"];
              const health = HEALTH_CONFIG[p.health_status] || HEALTH_CONFIG["On Track"];
              const pWPs   = workPackages.filter(w => w.project_id === p.id);
              const { pct: wpPct } = calcWpProgress(pWPs);
              const pRFIs  = rfis.filter(r => r.project_id === p.id && (r.status === "Open" || r.status === "Under Review")).length;
              const target = p.target_completion_date
                ? new Date(p.target_completion_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
                : "—";
              const contractVal = formatCurrency(Number(p.original_contract_value) || 0);

              return (
                <div
                  key={p.id}
                  onClick={() => setDetailProject(p)}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-row-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 1 ? "var(--bg-surface-lowest)" : "transparent"; }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1.2fr 110px 140px 150px 90px 110px 60px",
                    gap: 0,
                    padding: "10px 16px 10px 0",
                    borderBottom: "1px solid var(--divider)",
                    borderLeft: `3px solid ${phase.color}`,
                    paddingLeft: 17,
                    cursor: "pointer",
                    transition: "background 0.10s",
                    alignItems: "center",
                    background: idx % 2 === 1 ? "var(--bg-surface-lowest)" : "transparent",
                  }}
                >
                  {/* Project name + number */}
                  <div style={{ paddingRight: 12, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {p.name}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: "var(--text-muted)",
                      marginTop: 2,
                      letterSpacing: "0.07em",
                    }}>
                      {p.project_number || "—"}
                    </div>
                  </div>

                  {/* GC / Client */}
                  <div style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    paddingRight: 12,
                  }}>
                    {p.general_contractor || p.client || "—"}
                  </div>

                  {/* Phase pill */}
                  <div style={{ paddingRight: 12 }}>
                    <PhasePill phase={p.phase || "—"} config={phase} />
                  </div>

                  {/* Progress bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 12 }}>
                    <div style={{
                      flex: 1,
                      height: 4,
                      background: "var(--border-default)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${wpPct}%`,
                        background: phase.color,
                        borderRadius: 2,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      minWidth: 30,
                      textAlign: "right",
                    }}>
                      {wpPct}%
                    </span>
                  </div>

                  {/* Contract value */}
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    paddingRight: 12,
                    letterSpacing: "-0.01em",
                  }}>
                    {contractVal}
                  </div>

                  {/* Health */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, paddingRight: 12 }}>
                    <div style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: health.dot,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      color: health.color,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}>
                      {p.health_status || "—"}
                    </span>
                  </div>

                  {/* Due date */}
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                    paddingRight: 12,
                  }}>
                    {target}
                  </div>

                  {/* Open RFIs */}
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 700,
                    color: pRFIs > 0 ? "var(--warning)" : "var(--text-muted)",
                    textAlign: "center",
                  }}>
                    {pRFIs}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ Modals ══ */}
      {modalOpen && (
        <ProjectFormModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
          project={editing}
        />
      )}

      {detailProject && (
        <ProjectDetailView
          project={detailProject}
          onClose={() => setDetailProject(null)}
        />
      )}
    </div>
  );
}
