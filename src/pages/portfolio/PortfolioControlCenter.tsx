/**
 * Portfolio Control Center — light Command UI skin for the Portfolio Overview.
 *
 * Org-wide, multi-project. Not project-scoped. Presents all projects the
 * current user can see (RLS-enforced at the data layer).
 *
 * Mirrors the RfiControlCenter structure exactly:
 *   PageHero → KpiStrip → 3 DecisionPanel → FilterBar → DataTable
 *
 * Data is passed in from PortfolioHub.jsx, the canonical Portfolio Overview shell.
 * Keeps this component presentational + derivation-focused.
 */
import { useMemo, useCallback } from "react";
import { LayoutGrid, DollarSign, AlertTriangle, TrendingUp, CheckCircle2, BarChart3, CalendarClock } from "lucide-react";
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
import type { Column, KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import {
  buildPortfolioSummary,
  healthTone,
  type ProjectRecord,
  type PortfolioRelated,
  type EnrichedProject,
  type PortfolioPanelRow,
} from "./portfolioControlCenter.derive";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtMoney(n: number): string {
  if (!n) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysLabel(days: number | null, isOverdue: boolean): string {
  if (days === null) return "No date";
  if (isOverdue) return `${Math.abs(days)}d overdue`;
  return `${days}d`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PortfolioControlCenterProps {
  /** All raw project records (full org — NOT project-scoped). */
  projects: ProjectRecord[];
  /** Cross-entity arrays for rollup calculations. */
  related: PortfolioRelated;
  /** Active search string. */
  search: string;
  onSearch: (v: string) => void;
  /** Active health filter: "All" | "On Track" | "Watch" | "At Risk" */
  healthFilter: string;
  onHealthFilter: (v: string) => void;
  /** Called when the user clicks a project row or panel entry. */
  onOpenProject: (project: EnrichedProject) => void;
}

// ---------------------------------------------------------------------------
// Health chip filter labels
// ---------------------------------------------------------------------------

const HEALTH_FILTERS = ["All", "On Track", "Watch", "At Risk"] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PortfolioControlCenter(props: PortfolioControlCenterProps) {
  const {
    projects,
    related,
    search,
    onSearch,
    healthFilter,
    onHealthFilter,
    onOpenProject,
  } = props;

  useCommandSkin();

  // Derive all KPIs + panel queues from raw data
  const summary = useMemo(
    () => buildPortfolioSummary(projects, related),
    [projects, related],
  );

  // Client-side filter for the DataTable
  const filteredRows = useMemo<EnrichedProject[]>(() => {
    const q = search.trim().toLowerCase();
    return summary.allRows.filter((p) => {
      const matchesHealth = healthFilter === "All" || p.health === healthFilter;
      const matchesSearch =
        !q ||
        `${p.name || ""} ${p.project_number || ""}`.toLowerCase().includes(q);
      return matchesHealth && matchesSearch;
    });
  }, [summary.allRows, search, healthFilter]);

  // Hero chips
  const heroChips = [
    { label: `${summary.kpis.totalProjects} Projects` },
    { label: `${summary.kpis.activeProjects} Active`, tone: "good" as const },
    { label: `${summary.kpis.atRisk} At Risk` },
  ];

  // KPI strip
  const kpiCells: KpiCellDef[] = [
    {
      label: "Total Projects",
      value: summary.kpis.totalProjects,
      sublabel: "in portfolio",
      tone: "neutral",
      Icon: LayoutGrid,
    },
    {
      label: "Active",
      value: summary.kpis.activeProjects,
      sublabel: "projects",
      tone: "good",
      Icon: CheckCircle2,
    },
    {
      label: "At Risk",
      value: summary.kpis.atRisk,
      sublabel: "projects",
      tone: summary.kpis.atRisk > 0 ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Portfolio Value",
      value: fmtMoney(summary.kpis.totalContractValue),
      sublabel: "revised contract",
      tone: "info",
      Icon: DollarSign,
    },
    {
      label: "On Schedule",
      value: summary.kpis.onSchedule,
      sublabel: "projects",
      tone: "good",
      Icon: TrendingUp,
    },
    {
      label: "Avg Complete",
      value: `${summary.kpis.avgPctComplete}%`,
      sublabel: "by work package",
      tone: "neutral",
      Icon: BarChart3,
    },
  ];

  // DataTable columns
  const columns: Column<EnrichedProject>[] = [
    {
      key: "name",
      header: "Project",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 700 }}>{p.name || "Untitled"}</div>
          <div
            className="cmd-row__meta"
            style={{ marginTop: 2 }}
          >
            {p.project_number || "—"} / {p.phase || "No phase"}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Health",
      render: (p) => <Pill tone={healthTone(p.health)}>{p.health}</Pill>,
    },
    {
      key: "pct",
      header: "% Complete",
      align: "right",
      render: (p) => (
        <span className="cmd-row__num">{p.pctComplete}%</span>
      ),
    },
    {
      key: "contract",
      header: "Contract Value",
      align: "right",
      render: (p) => <span className="cmd-row__num">{fmtMoney(p.revisedContract)}</span>,
    },
    {
      key: "health",
      header: "Score",
      align: "right",
      render: (p) => (
        <span
          className="cmd-row__num"
          style={{
            // inline colour for score using the command.css root variables
            color:
              p.score >= 76
                ? "var(--cmd-good)"
                : p.score >= 52
                  ? "var(--cmd-warn)"
                  : "var(--cmd-danger)",
          }}
        >
          {p.score}
        </span>
      ),
    },
    {
      key: "target",
      header: "Target Completion",
      render: (p) => {
        if (!p.target_completion_date) {
          return <span className="cmd-row__meta">No date</span>;
        }
        if (p.isOverdue) {
          return (
            <span className="cmd-overdue">
              {fmtDate(p.target_completion_date as string)} · overdue
            </span>
          );
        }
        return <span>{fmtDate(p.target_completion_date as string)}</span>;
      },
    },
    {
      key: "openRfis",
      header: "Open RFIs",
      align: "right",
      render: (p) => (
        p.openRfis > 0
          ? <Pill tone={p.overdueRfis > 0 ? "danger" : "neutral"}>{p.openRfis}</Pill>
          : <span className="cmd-row__meta">—</span>
      ),
    },
  ];

  // Panel row renderer helper (shared by all 3 panels)
  const renderPanelRow = useCallback(
    (row: PortfolioPanelRow, enriched: EnrichedProject | undefined) => (
      <div
        className="cmd-row is-clickable"
        key={row.id}
        onClick={() => enriched && onOpenProject(enriched)}
        style={{ cursor: enriched ? "pointer" : "default" }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            className="cmd-row__num"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 200,
            }}
          >
            {row.name}
          </div>
          <div className="cmd-row__meta">
            {row.projectNumber || "—"} · {row.pctComplete}% complete
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <Pill tone={healthTone(row.health)}>{row.health}</Pill>
          {row.openRfis > 0 && (
            <span className="cmd-row__meta">{row.openRfis} RFIs</span>
          )}
        </div>
      </div>
    ),
    [onOpenProject],
  );

  // Build enriched-by-id lookup so panel rows can call onOpenProject
  const byId = useMemo(() => {
    const m = new Map<string, EnrichedProject>();
    for (const p of summary.allRows) m.set(p.id, p);
    return m;
  }, [summary.allRows]);

  return (
    <div className="portfolio-cc">
      <PageHero
        Icon={LayoutGrid}
        title="Portfolio Overview"
        subtitle="Org-wide project health, contract value, schedule pressure, and steel-production progress."
        // No projectName — this is org-wide, not project-scoped
        chips={heroChips}
        photoSrc={photoFor("PortfolioHub") ?? undefined}
        stats={[
          { value: fmtMoney(summary.kpis.totalContractValue), label: "Portfolio Value" },
          { value: `${summary.kpis.avgPctComplete}%`, label: "Avg Complete" },
        ]}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1 — At-Risk Projects (worst health score first) */}
        <DecisionPanel title="At-Risk Projects">
          {summary.atRiskQueue.length === 0 ? (
            <div className="cmd-row__meta">No projects currently at risk.</div>
          ) : (
            summary.atRiskQueue.map((row) =>
              renderPanelRow(row, byId.get(row.id)),
            )
          )}
        </DecisionPanel>

        {/* Panel 2 — Top by Contract Value */}
        <DecisionPanel title="Top by Contract Value">
          {summary.topByValue.length === 0 ? (
            <div className="cmd-row__meta">No projects.</div>
          ) : (
            summary.topByValue.map((row) => (
              <div
                className="cmd-row is-clickable"
                key={row.id}
                onClick={() => { const p = byId.get(row.id); if (p) onOpenProject(p); }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    className="cmd-row__num"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 200,
                    }}
                  >
                    {row.name}
                  </div>
                  <div className="cmd-row__meta">{row.projectNumber || "—"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span
                    className="cmd-row__num"
                    style={{ fontSize: 13, fontWeight: 800 }}
                  >
                    {fmtMoney(row.revisedContract)}
                  </span>
                  <Pill tone={healthTone(row.health)}>{row.health}</Pill>
                </div>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 3 — Closing Soon (target date in next 90 days) */}
        <DecisionPanel title="Closing Soon">
          {summary.closingSoon.length === 0 ? (
            <div className="cmd-row__meta">No projects closing within 90 days.</div>
          ) : (
            summary.closingSoon.map((row) => (
              <div
                className="cmd-row is-clickable"
                key={row.id}
                onClick={() => { const p = byId.get(row.id); if (p) onOpenProject(p); }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    className="cmd-row__num"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 180,
                    }}
                  >
                    {row.name}
                  </div>
                  <div className="cmd-row__meta">{row.projectNumber || "—"}</div>
                </div>
                <div
                  style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}
                >
                  <CalendarClock
                    size={13}
                    color={row.isOverdue ? "var(--cmd-tone-danger)" : "var(--cmd-tone-warn)"}
                  />
                  <span
                    className={row.isOverdue ? "cmd-overdue" : "cmd-row__meta"}
                  >
                    {daysLabel(row.daysLeft, row.isOverdue)}
                  </span>
                </div>
              </div>
            ))
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search project name or job number"
        onImport={null}
        onPrimary={null}
        filters={
          <>
            {HEALTH_FILTERS.map((label) => (
              <button
                key={label}
                type="button"
                className={`cmd-chip-btn${healthFilter === label ? " is-active" : ""}`}
                onClick={() => onHealthFilter(label)}
              >
                {label}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filteredRows}
        onRowClick={onOpenProject}
        emptyMessage="No projects match your filters."
      />
    </div>
  );
}




