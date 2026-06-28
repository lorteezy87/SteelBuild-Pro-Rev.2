/**
 * Projects Control Center — command_ui reskin of src/pages/Projects.jsx
 *
 * Org-wide portfolio view (NOT project-scoped).
 * Data and mutations are owned by the parent Projects.jsx shell; this
 * component is presentation-only.
 */
import { useMemo } from "react";
import {
  FolderKanban,
  AlertTriangle,
  DollarSign,
  Activity,
  BarChart2,
  Clock,
  TrendingUp,
} from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef, PillTone } from "@/components/command";
import {
  buildProjectsSummary,
  type ProjectRecord,
  type WorkPackageRecord,
  type RfiRecord,
  type ChangeOrderRecord,
  type AtRiskEntry,
  type ClosingSoonEntry,
  type RecentlyUpdatedEntry,
} from "./projectsControlCenter.derive";

// ── Inline formatters ──────────────────────────────────────────────
function fmtMoney(n: number): string {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Health → Pill tone mapping ────────────────────────────────────
function healthTone(health?: string | null): PillTone {
  switch (health) {
    case "On Track": return "good";
    case "Watch":    return "warn";
    case "At Risk":  return "danger";
    default:         return "neutral";
  }
}

// ── Phase → Pill tone mapping ─────────────────────────────────────
function phaseTone(phase?: string | null): PillTone {
  switch (phase) {
    case "Pre-Construction": return "neutral";
    case "Detailing":        return "info";
    case "Procurement":      return "warn";
    case "Fabrication":      return "warn";
    case "Delivery":         return "info";
    case "Installation":
    case "Installation/Erection":
    case "Erection":         return "good";
    case "Closeout":         return "neutral";
    default:                 return "neutral";
  }
}

// ── Scroll helper ─────────────────────────────────────────────────
function scrollToTable() {
  document.querySelector(".projects-cc .cmd-table-wrap")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

// ── Props ─────────────────────────────────────────────────────────
export interface ProjectsControlCenterProps {
  projects: ProjectRecord[];
  workPackages?: WorkPackageRecord[];
  rfis?: RfiRecord[];
  changeOrders?: ChangeOrderRecord[];

  search: string;
  onSearch: (v: string) => void;
  phaseFilter: string;
  onPhaseFilter: (v: string) => void;
  healthFilter: string;
  onHealthFilter: (v: string) => void;
  filtered: ProjectRecord[];

  onCreate?: (() => void) | null;
  onOpenProject: (p: ProjectRecord) => void;
}

const PHASES = [
  "All",
  "Pre-Construction",
  "Detailing",
  "Procurement",
  "Fabrication",
  "Delivery",
  "Installation",
  "Erection",
  "Closeout",
];

const HEALTH_VALUES = ["On Track", "Watch", "At Risk"];

// ── Component ─────────────────────────────────────────────────────
export default function ProjectsControlCenter(props: ProjectsControlCenterProps) {
  const {
    projects, workPackages = [], rfis = [], changeOrders = [],
    search, onSearch,
    phaseFilter, onPhaseFilter,
    healthFilter, onHealthFilter,
    filtered,
    onCreate, onOpenProject,
  } = props;

  useCommandSkin();

  const s = useMemo(
    () => buildProjectsSummary(projects, workPackages, rfis, changeOrders),
    [projects, workPackages, rfis, changeOrders]
  );

  // ── Hero chips ────────────────────────────────────────────────
  const chips = [
    { label: `${s.kpis.totalProjects} Projects` },
    { label: `${s.kpis.activeProjects} Active`, tone: "good" as const },
    ...(s.kpis.atRisk > 0 ? [{ label: `${s.kpis.atRisk} At Risk`, tone: "danger" as const }] : []),
    ...(s.kpis.onHold > 0 ? [{ label: `${s.kpis.onHold} On Hold` }] : []),
  ];

  // ── KPI strip ─────────────────────────────────────────────────
  const kpiCells: KpiCellDef[] = [
    {
      label: "Portfolio Value",
      value: fmtMoney(s.kpis.totalContractValue),
      sublabel: `${s.kpis.totalProjects} projects`,
      tone: "neutral",
      Icon: DollarSign,
    },
    {
      label: "Active",
      value: s.kpis.activeProjects,
      sublabel: "in progress",
      tone: "good",
      Icon: Activity,
    },
    {
      label: "At Risk",
      value: s.kpis.atRisk,
      sublabel: "need attention",
      tone: s.kpis.atRisk > 0 ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Avg % Complete",
      value: `${s.kpis.avgPctComplete}%`,
      sublabel: "active projects",
      tone: "info",
      Icon: BarChart2,
    },
    {
      label: "Open RFIs",
      value: s.kpis.openRfis,
      sublabel: s.kpis.overdueRfis > 0 ? `${s.kpis.overdueRfis} overdue` : "org-wide",
      tone: s.kpis.overdueRfis > 0 ? "danger" : s.kpis.openRfis > 0 ? "warn" : "neutral",
      Icon: Clock,
    },
    {
      label: "Pending COs",
      value: fmtMoney(s.kpis.pendingCOValue),
      sublabel: `${s.kpis.pendingCOCount} awaiting approval`,
      tone: s.kpis.pendingCOCount > 0 ? "warn" : "neutral",
      Icon: TrendingUp,
    },
  ];

  // ── DataTable columns ─────────────────────────────────────────
  const columns: Column<ProjectRecord>[] = [
    {
      key: "name",
      header: "Project",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div className="cmd-row__meta">{p.project_number || "—"}</div>
        </div>
      ),
    },
    {
      key: "client",
      header: "GC / Client",
      render: (p) => <span className="cmd-row__meta">{p.general_contractor || p.client || "—"}</span>,
    },
    {
      key: "phase",
      header: "Phase",
      render: (p) => <Pill tone={phaseTone(p.phase)}>{p.phase || "—"}</Pill>,
    },
    {
      key: "pct",
      header: "% Complete",
      align: "right",
      render: (p) => {
        // Derive inline — workPackages scoped to this project may not be passed per-row,
        // so read scope_complete_pct_override as the summary source; WP-based
        // resolution happens in buildProjectsSummary. For the table, show the override
        // if present, otherwise "—" (the panel already shows WP-based values).
        const pct = p.scope_complete_pct_override != null
          ? `${Math.round(Number(p.scope_complete_pct_override))}%`
          : "—";
        return <span className="cmd-row__num">{pct}</span>;
      },
    },
    {
      key: "contract",
      header: "Contract Value",
      align: "right",
      render: (p) => (
        <span className="cmd-row__num">
          {p.original_contract_value ? fmtMoney(Number(p.original_contract_value)) : "—"}
        </span>
      ),
    },
    {
      key: "health",
      header: "Health",
      render: (p) => (
        <Pill tone={healthTone(p.health_status)}>
          {p.health_status || "—"}
          {p.on_hold ? " · ON HOLD" : ""}
        </Pill>
      ),
    },
    {
      key: "target",
      header: "Target Completion",
      render: (p) => {
        if (!p.target_completion_date) return <span className="cmd-row__meta">—</span>;
        const daysLeft = Math.ceil(
          (new Date(p.target_completion_date + "T00:00:00").getTime() - Date.now()) / 86400000
        );
        const overdue = daysLeft < 0;
        return (
          <div>
            <div>{fmtDate(p.target_completion_date)}</div>
            {overdue
              ? <span className="cmd-overdue">{Math.abs(daysLeft)}d overdue</span>
              : daysLeft <= 30
              ? <span className="cmd-row__meta" style={{ color: "var(--cmd-warn)" }}>{daysLeft}d left</span>
              : <span className="cmd-row__meta">{daysLeft}d left</span>
            }
          </div>
        );
      },
    },
  ];

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="projects-cc">
      <PageHero
        Icon={FolderKanban}
        title="Projects Control Center"
        subtitle="Portfolio overview — all projects in your organization."
        chips={chips}
        stats={[
          { value: fmtMoney(s.kpis.totalContractValue), label: "Portfolio Value" },
          { value: `${s.kpis.avgPctComplete}%`, label: "Avg Complete" },
        ]}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1: At-Risk Projects */}
        <DecisionPanel
          title="At-Risk Projects"
          onViewAll={() => { onHealthFilter("At Risk"); scrollToTable(); }}
        >
          {s.atRiskQueue.length === 0 ? (
            <div className="cmd-row__meta">No at-risk projects.</div>
          ) : s.atRiskQueue.map((e: AtRiskEntry) => (
            <div
              className="cmd-row is-clickable"
              key={e.project.id}
              onClick={() => onOpenProject(e.project)}
            >
              <div>
                <div className="cmd-row__num">{e.project.name}</div>
                <div className="cmd-row__meta">
                  {e.openRfis > 0 ? `${e.openRfis} open RFI${e.openRfis !== 1 ? "s" : ""}` : "No open RFIs"}
                  {e.overdueRfis > 0 ? ` · ${e.overdueRfis} overdue` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {e.daysLeft !== null && (
                  <Pill tone={e.isOverdue ? "danger" : "warn"}>
                    {e.isOverdue ? `${Math.abs(e.daysLeft)}d LATE` : `${e.daysLeft}d left`}
                  </Pill>
                )}
              </div>
            </div>
          ))}
        </DecisionPanel>

        {/* Panel 2: Closing Soon */}
        <DecisionPanel
          title="Closing Soon (≤90 days)"
          onViewAll={scrollToTable}
        >
          {s.closingSoonQueue.length === 0 ? (
            <div className="cmd-row__meta">No projects closing within 90 days.</div>
          ) : s.closingSoonQueue.map((e: ClosingSoonEntry) => (
            <div
              className="cmd-row is-clickable"
              key={e.project.id}
              onClick={() => onOpenProject(e.project)}
            >
              <div>
                <div className="cmd-row__num">{e.project.name}</div>
                <div className="cmd-row__meta">
                  {fmtDate(e.project.target_completion_date)} · {e.pctComplete}% complete
                </div>
              </div>
              <Pill tone={e.daysLeft <= 14 ? "danger" : e.daysLeft <= 30 ? "warn" : "info"}>
                {e.daysLeft}d
              </Pill>
            </div>
          ))}
        </DecisionPanel>

        {/* Panel 3: Recently Updated */}
        <DecisionPanel
          title="Recently Updated"
          onViewAll={scrollToTable}
        >
          {s.recentlyUpdatedQueue.length === 0 ? (
            <div className="cmd-row__meta">No recent activity.</div>
          ) : s.recentlyUpdatedQueue.map((e: RecentlyUpdatedEntry) => (
            <div
              className="cmd-row is-clickable"
              key={e.project.id}
              onClick={() => onOpenProject(e.project)}
            >
              <div>
                <div className="cmd-row__num">{e.project.name}</div>
                <div className="cmd-row__meta">
                  <Pill tone={phaseTone(e.project.phase)}>{e.project.phase}</Pill>
                  {" "}{e.pctComplete > 0 ? `· ${e.pctComplete}%` : ""}
                </div>
              </div>
              <span className="cmd-row__meta">
                {e.updatedAt ? fmtDate(e.updatedAt.slice(0, 10)) : "—"}
              </span>
            </div>
          ))}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search projects, clients, GC…"
        onPrimary={onCreate || null}
        primaryLabel="New Project"
        filters={
          <>
            {/* Phase chips */}
            {PHASES.map((ph) => (
              <button
                key={ph}
                type="button"
                className={`cmd-chip-btn${(ph === "All" ? phaseFilter === "all" : phaseFilter === ph) ? " is-active" : ""}`}
                onClick={() => onPhaseFilter(ph === "All" ? "all" : ph)}
              >
                {ph}
              </button>
            ))}
            {/* Separator — inline style per task constraint (no command.css edits) */}
            <span style={{ display: "inline-block", width: 1, height: 16, background: "var(--cmd-border)", margin: "0 4px", verticalAlign: "middle" }} />
            {/* Health chips */}
            {HEALTH_VALUES.map((h) => (
              <button
                key={h}
                type="button"
                className={`cmd-chip-btn${healthFilter === h ? " is-active" : ""}`}
                onClick={() => onHealthFilter(healthFilter === h ? "all" : h)}
              >
                {h}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpenProject}
        emptyMessage="No projects match your filters."
      />
    </div>
  );
}
