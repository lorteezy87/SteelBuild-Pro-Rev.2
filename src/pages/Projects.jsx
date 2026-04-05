import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "@/components/shared/formatters";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import ProjectDetailView from "@/components/projects/ProjectDetailView";
import { toast } from "sonner";
import { calcWpProgress, calcLaborBurn, calcContractValue, calcDaysToDeadline, calcRfiHealth } from "@/utils/projectKpis";

const PHASE_CONFIG = {
  Detailing:   { color: "var(--accent)", bg: "var(--accent-muted)", order: 1 },
  Fabrication: { color: "var(--accent)", bg: "rgba(0,229,255,0.06)",  order: 2 },
  Delivery:    { color: "#06B6D4", bg: "rgba(6,182,212,0.12)",   order: 3 },
  Erection:    { color: "#22C55E", bg: "rgba(34,197,94,0.12)",   order: 4 },
  Closeout:    { color: "#9CA3AF", bg: "rgba(156,163,175,0.12)", order: 5 },
};

const HEALTH_CONFIG = {
  "On Track": { color: "var(--status-success)", dot: "#22C55E" },
  "Watch":    { color: "var(--status-warning)", dot: "#F59E0B" },
  "At Risk":  { color: "var(--status-error)",   dot: "#EF4444" },
};

function ProgressRing({ pct, size = 44, color = "var(--accent)" }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ - (circ * Math.min(100, pct || 0)) / 100;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-default)" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={fill} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }} />
    </svg>
  );
}

function StatPill({ label, value, color = "var(--text-muted)" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 44 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 3 }}>{label}</span>
    </div>
  );
}

function ProjectCard({ project, workPackages, rfis, changeOrders, onClick, onEdit }) {
  const [hovered, setHovered] = useState(false);
  const phase  = PHASE_CONFIG[project.phase] || PHASE_CONFIG.Detailing;
  const health = HEALTH_CONFIG[project.health_status] || HEALTH_CONFIG["On Track"];

  const projectWPs = workPackages.filter(w => w.project_id === project.id);
  const projectRFIs = rfis.filter(r => r.project_id === project.id);
  const projectCOs  = changeOrders.filter(c => c.project_id === project.id);

  const { pct: wpPct, totalTons, completeTons, completeCount: completeWPs } = calcWpProgress(projectWPs);
  const { openCount: openRFIs, overdueCount: overdueRFIs } = calcRfiHealth(projectRFIs);
  const { approvedCOTotal: approvedCOs, revised: revisedContract, original: originalContract, pendingCOCount: pendingCOs } = calcContractValue(project, projectCOs);
  const { daysLeft, isOverdue: _isOverdue } = calcDaysToDeadline(project);
  const { burnPct: laborBurn, isOverBudget } = calcLaborBurn(projectWPs);
  const hasIssues = overdueRFIs > 0 || pendingCOs > 0 || isOverBudget;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${hovered ? phase.color + "60" : "var(--border-default)"}`,
        borderTop: `3px solid ${phase.color}`,
        borderRadius: 14, padding: "18px 20px", cursor: "pointer",
        transition: "all 0.15s",
        boxShadow: hovered ? `0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px ${phase.color}30` : "var(--shadow-card)",
        transform: hovered ? "translateY(-2px)" : "none",
        position: "relative", overflow: "hidden",
      }}
    >
      {hasIssues && (
        <div style={{ position: "absolute", top: 12, right: 12, width: 8, height: 8, borderRadius: "50%", background: "var(--status-error)", boxShadow: "0 0 8px var(--status-error)" }} />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: phase.color, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: phase.bg, border: `1px solid ${phase.color}40`, borderRadius: 4, padding: "2px 6px" }}>{project.phase}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 8 }}>{project.project_number}</span>
          </div>
          <h3 style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</h3>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{project.general_contractor || project.client || "—"}</div>
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <ProgressRing pct={wpPct} color={phase.color} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{wpPct}%</span>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 3 }}>Contract Value</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{formatCurrency(revisedContract || originalContract)}</div>
        </div>
        {approvedCOs !== 0 && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: approvedCOs > 0 ? "var(--status-success)" : "var(--status-error)", fontWeight: 700 }}>
            {approvedCOs > 0 ? "+" : ""}{formatCurrency(approvedCOs)} COs
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        <StatPill label="RFIs" value={openRFIs} color={openRFIs > 0 ? (overdueRFIs > 0 ? "var(--status-error)" : "var(--status-warning)") : "var(--text-muted)"} />
        <StatPill label="Pend CO" value={pendingCOs} color={pendingCOs > 0 ? "var(--status-warning)" : "var(--text-muted)"} />
        <StatPill label="WPs" value={`${completeWPs}/${projectWPs.length}`} color={phase.color} />
        <StatPill label={totalTons > 0 ? "Tons" : "Labor"} value={totalTons > 0 ? `${completeTons}T` : `${laborBurn}%`} color={isOverBudget ? "var(--status-error)" : "var(--text-secondary)"} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: health.dot, boxShadow: `0 0 6px ${health.dot}80` }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: health.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{project.health_status || "On Track"}</span>
        </div>
        {daysLeft !== null && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: daysLeft < 0 ? "var(--status-error)" : daysLeft < 30 ? "var(--status-warning)" : "var(--text-muted)", fontWeight: daysLeft < 30 ? 700 : 400 }}>
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d OVERDUE` : `${daysLeft}d remaining`}
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(project); }}
          style={{ background: "transparent", border: "1px solid var(--border-default)", borderRadius: 6, padding: "3px 8px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, cursor: "pointer", transition: "all 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          EDIT
        </button>
      </div>
    </div>
  );
}

export default function Projects() {
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const [search,       setSearch]       = useState("");
  const [phaseFilter,  setPhaseFilter]  = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [view,         setView]         = useState("cards");
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [detailProject, setDetailProject] = useState(null);

  const { data: projects     = [] } = useQuery({ queryKey: ["projects"],          queryFn: () => base44.entities.Project.list("-created_date"),    initialData: [] });
  const { data: workPackages = [] } = useQuery({ queryKey: ["work-packages-all"], queryFn: () => base44.entities.WorkPackage.list(),                initialData: [] });
  const { data: rfis         = [] } = useQuery({ queryKey: ["rfis"],              queryFn: () => base44.entities.RFI.list(),                        initialData: [] });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders-all"], queryFn: () => base44.entities.ChangeOrder.list(),                initialData: [] });

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
  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  const kpis = useMemo(() => {
    const active       = projects.filter(p => p.phase !== "Closeout");
    const atRisk       = projects.filter(p => p.health_status === "At Risk").length;
    const totalVal     = projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0);
    const openRFIs     = rfis.filter(r => r.status === "Open" || r.status === "Under Review").length;
    const overdueRFIs  = rfis.filter(r => r.date_required && new Date(r.date_required) < new Date() && !["Answered","Closed"].includes(r.status)).length;
    const pendingCOVal = changeOrders.filter(c => ["Submitted","Under Review"].includes(c.status)).reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    return { total: projects.length, active: active.length, atRisk, totalVal, openRFIs, overdueRFIs, pendingCOVal };
  }, [projects, rfis, changeOrders]);

  const filtered = useMemo(() => projects.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.project_number?.toLowerCase().includes(q) || p.client?.toLowerCase().includes(q) || p.general_contractor?.toLowerCase().includes(q);
    return matchSearch && (phaseFilter === "all" || p.phase === phaseFilter) && (healthFilter === "all" || p.health_status === healthFilter);
  }), [projects, search, phaseFilter, healthFilter]);

  const S = {
    kpiCard:  { background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, padding: "16px 20px", boxShadow: "var(--shadow-card)", flex: 1, minWidth: 140 },
    kpiLabel: { fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 },
    kpiValue: { fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 },
    kpiSub:   { fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 4 },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Projects</h1>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>{kpis.active} active · {kpis.total} total</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 2, background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: 3 }}>
            {[["cards","⊞"],["list","☰"]].map(([v, icon]) => (
              <button key={v} onClick={() => setView(v)} style={{ background: view === v ? "var(--accent)" : "transparent", border: "none", borderRadius: 6, padding: "5px 10px", color: view === v ? "#fff" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>{icon}</button>
            ))}
          </div>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={S.kpiCard}>
          <div style={S.kpiLabel}>Portfolio Value</div>
          <div style={{ ...S.kpiValue, fontSize: 20 }}>{formatCurrency(kpis.totalVal)}</div>
          <div style={S.kpiSub}>{kpis.total} projects</div>
        </div>
        <div style={S.kpiCard}>
          <div style={S.kpiLabel}>Active</div>
          <div style={S.kpiValue}>{kpis.active}</div>
          <div style={S.kpiSub}>in progress</div>
        </div>
        <div style={{ ...S.kpiCard, borderTop: kpis.atRisk > 0 ? "3px solid var(--status-error)" : undefined }}>
          <div style={S.kpiLabel}>At Risk</div>
          <div style={{ ...S.kpiValue, color: kpis.atRisk > 0 ? "var(--status-error)" : "var(--text-primary)" }}>{kpis.atRisk}</div>
          <div style={S.kpiSub}>need attention</div>
        </div>
        <div style={{ ...S.kpiCard, borderTop: kpis.overdueRFIs > 0 ? "3px solid var(--status-warning)" : undefined }}>
          <div style={S.kpiLabel}>Open RFIs</div>
          <div style={{ ...S.kpiValue, color: kpis.overdueRFIs > 0 ? "var(--status-warning)" : "var(--text-primary)" }}>{kpis.openRFIs}</div>
          <div style={{ ...S.kpiSub, color: kpis.overdueRFIs > 0 ? "var(--status-error)" : "var(--text-muted)", fontWeight: kpis.overdueRFIs > 0 ? 700 : 400 }}>
            {kpis.overdueRFIs > 0 ? `${kpis.overdueRFIs} overdue` : "across all projects"}
          </div>
        </div>
        <div style={{ ...S.kpiCard, borderTop: kpis.pendingCOVal > 0 ? "3px solid var(--status-info)" : undefined }}>
          <div style={S.kpiLabel}>Pending COs</div>
          <div style={{ ...S.kpiValue, fontSize: 18 }}>{formatCurrency(kpis.pendingCOVal)}</div>
          <div style={S.kpiSub}>awaiting approval</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          placeholder="Search projects, clients, GC..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 14px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none" }}
          onFocus={e => e.target.style.borderColor = "var(--accent)"}
          onBlur={e => e.target.style.borderColor = "var(--border-default)"}
        />
        <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)} style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 14px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none" }}>
          <option value="all">All Phases</option>
          {Object.keys(PHASE_CONFIG).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)} style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 14px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, outline: "none" }}>
          <option value="all">All Health</option>
          <option value="On Track">On Track</option>
          <option value="Watch">Watch</option>
          <option value="At Risk">At Risk</option>
        </select>
        {(search || phaseFilter !== "all" || healthFilter !== "all") && (
          <button onClick={() => { setSearch(""); setPhaseFilter("all"); setHealthFilter("all"); }} style={{ background: "transparent", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 14px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, cursor: "pointer", letterSpacing: "0.08em" }}>CLEAR</button>
        )}
        <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", alignSelf: "center" }}>{filtered.length} of {projects.length} PROJECTS</div>
      </div>

      {/* Card View */}
      {view === "cards" ? (
        filtered.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {filtered.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                workPackages={workPackages}
                rfis={rfis}
                changeOrders={changeOrders}
                onClick={() => setDetailProject(p)}
                onEdit={(proj) => { setEditing(proj); setModalOpen(true); }}
              />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "60px 24px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>▤</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>No projects found</div>
          </div>
        )
      ) : (
        /* List View */
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 80px 100px 80px 90px 60px", gap: 12, padding: "10px 16px", background: "var(--bg-surface-secondary)", borderBottom: "1px solid var(--border-default)" }}>
            {["Project","GC / Client","Phase","Progress","Contract","Health","Due","RFIs"].map(col => (
              <div key={col} style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{col}</div>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No projects found</div>
          ) : filtered.map(p => {
            const phase  = PHASE_CONFIG[p.phase] || PHASE_CONFIG.Detailing;
            const health = HEALTH_CONFIG[p.health_status] || HEALTH_CONFIG["On Track"];
            const pWPs   = workPackages.filter(w => w.project_id === p.id);
            const wpPct  = pWPs.length > 0 ? Math.round((pWPs.filter(w => w.status === "Complete").length / pWPs.length) * 100) : 0;
            const pRFIs  = rfis.filter(r => r.project_id === p.id && (r.status === "Open" || r.status === "Under Review")).length;
            const target = p.target_completion_date ? new Date(p.target_completion_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—";
            return (
              <div key={p.id}
                onClick={() => setDetailProject(p)}
                style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 80px 100px 80px 90px 60px", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--divider)", borderLeft: `3px solid ${phase.color}`, cursor: "pointer", transition: "background 0.1s", alignItems: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 2 }}>{p.project_number}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.general_contractor || p.client || "—"}</div>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", background: phase.bg, border: `1px solid ${phase.color}40`, borderRadius: 5, width: "fit-content" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600, color: phase.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{p.phase}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: "var(--border-default)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${wpPct}%`, background: phase.color, borderRadius: 2, transition: "width 0.4s" }} />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", minWidth: 28 }}>{wpPct}%</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{formatCurrency(Number(p.original_contract_value) || 0)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: health.dot, boxShadow: `0 0 5px ${health.dot}80` }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600, color: health.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{p.health_status || "—"}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{target}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: pRFIs > 0 ? "var(--status-warning)" : "var(--text-muted)" }}>{pRFIs}</div>
              </div>
            );
          })}
        </div>
      )}

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
