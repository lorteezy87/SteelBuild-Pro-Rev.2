import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/components/shared/formatters";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import ProjectDetailView from "@/components/projects/ProjectDetailView";
import { toast } from "sonner";
import { calcWpProgress, calcLaborBurn, calcContractValue, calcDaysToDeadline, calcRfiHealth } from "@/utils/projectKpis";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { PauseCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAutoOpenEdit } from "@/hooks/useAutoOpenEdit";
import { usePlan } from "@/hooks/usePlan";
import { withinLimit } from "@/lib/billing/plans";
import ProjectsControlCenter from "./projects/ProjectsControlCenter";

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
      <div style={{ padding: "16px 18px 12px 16px", opacity: project.on_hold ? 0.78 : 1 }}>
        {/* Row 1: phase pill + number (+ on-hold badge) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
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
          {project.on_hold && (
            <span
              title={project.on_hold_reason || "Paused — excluded from every KPI rollup"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800,
                color: "var(--status-warning)",
                background: "var(--warning-muted)",
                border: "1px solid var(--warning-border)",
                padding: "2px 6px", borderRadius: 3,
                textTransform: "uppercase", letterSpacing: "0.10em",
              }}
            >
              <PauseCircle size={9} /> On Hold
            </span>
          )}
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
        background: "color-mix(in srgb, var(--text-primary) 25%, transparent)",
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

  /* ── Data fetching ──
     The /Projects page is the ONE place that sees on-hold projects. We
     bypass entities.Project.list() (which now auto-excludes
     on_hold=true) and query the table directly, still honouring soft-delete
     and project-membership RLS. Every other consumer keeps using
     Project.list() and silently gets the active subset. */
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects", "all-including-on-hold"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: rawWorkPackages = [] } = useQuery({ queryKey: ["work-packages-all"], queryFn: () => entities.WorkPackage.list() });
  const { data: rawRfis         = [] } = useQuery({ queryKey: ["rfis"],              queryFn: () => entities.RFI.list() });
  const { data: rawChangeOrders = [] } = useQuery({ queryKey: ["change-orders-all"], queryFn: () => entities.ChangeOrder.list() });

  const liveProjectIds = useMemo(() => new Set(projects.map((p) => p.id).filter(Boolean)), [projects]);
  useAutoOpenEdit(projects, setDetailProject, { enabled: !projectsLoading });
  // Subset used by every page-level KPI rollup: on-hold projects (and their
  // child entities) must NOT contribute. Per-card stats still show the
  // project's own counts so users can see what's parked in a paused project.
  const activeProjectIds = useMemo(
    () => new Set(projects.filter((p) => !p.on_hold).map((p) => p.id).filter(Boolean)),
    [projects]
  );
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
  // For KPI aggregation only: child entities scoped to active (non-on-hold) projects.
  const kpiRfis          = useMemo(() => rfis.filter((r) => activeProjectIds.has(r.project_id)),         [rfis, activeProjectIds]);
  const kpiChangeOrders  = useMemo(() => changeOrders.filter((c) => activeProjectIds.has(c.project_id)), [changeOrders, activeProjectIds]);

  // Plan gating: Free/Pro orgs cap active projects. The server (create_project) is
  // authoritative; this disables the button proactively so we don't pop a create
  // modal that would only fail on save. Enterprise/Business = unlimited (no cap).
  const navigate = useNavigate();
  const { plan } = usePlan();
  const projectLimit = plan.limits.projects;
  const atProjectLimit = !withinLimit(projectLimit, projects.length);

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: (d) => entities.Project.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Project created"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.Project.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setModalOpen(false); setEditing(null); toast.success("Project updated"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => entities.Project.delete(id),
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

  /* ── KPI calculations ──
     On-hold projects (and their child entities) are excluded from every
     aggregate — they show up in the cards/list below with an ON HOLD badge
     but their data does not contribute to the portfolio rollup. */
  const kpis = useMemo(() => {
    const activeProjs   = projects.filter(p => !p.on_hold);
    const onHoldCount   = projects.length - activeProjs.length;
    const active        = activeProjs.filter(p => p.phase !== "Closeout");
    const atRisk        = activeProjs.filter(p => p.health_status === "At Risk").length;
    const totalVal      = activeProjs.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0);
    const openRFIs      = kpiRfis.filter(r => r.status === "Open" || r.status === "Under Review").length;
    const overdueRFIs   = kpiRfis.filter(r => r.date_required && new Date(r.date_required) < new Date() && !["Answered","Closed"].includes(r.status)).length;
    const pendingCOVal  = kpiChangeOrders.filter(c => ["Submitted","Under Review"].includes(c.status)).reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const pendingCOCount = kpiChangeOrders.filter(c => ["Submitted","Under Review"].includes(c.status)).length;
    return { total: projects.length, active: active.length, atRisk, totalVal, openRFIs, overdueRFIs, pendingCOVal, pendingCOCount, onHoldCount };
  }, [projects, kpiRfis, kpiChangeOrders]);

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

  /* ── Canonical Projects control center ── */
    const canCreate = !atProjectLimit;
    return (
      <>
        <ProjectsControlCenter
          projects={projects}
          workPackages={workPackages}
          rfis={rfis}
          changeOrders={changeOrders}
          search={search}
          onSearch={setSearch}
          phaseFilter={phaseFilter}
          onPhaseFilter={setPhaseFilter}
          healthFilter={healthFilter}
          onHealthFilter={setHealthFilter}
          filtered={filtered}
          onCreate={canCreate ? () => { setEditing(null); setModalOpen(true); } : null}
          onOpenProject={(p) => setDetailProject(p)}
        />
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
      </>
    );
}
