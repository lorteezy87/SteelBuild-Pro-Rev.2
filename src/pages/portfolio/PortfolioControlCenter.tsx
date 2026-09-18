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
import { CalendarClock } from "lucide-react";
import "@/styles/command.css";
import {
  AttentionQueue,
  OperationalSummary,
  PageHeader,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column } from "@/components/command";
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
  if (!n) return "Not entered";
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
  if (days === null) return "Not scheduled";
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

  const operationalMetrics = [
    { label: "Total Projects", value: summary.kpis.totalProjects, sublabel: "in portfolio", tone: "neutral" as const },
    { label: "Active", value: summary.kpis.activeProjects, sublabel: "projects", tone: "good" as const },
    { label: "At Risk", value: summary.kpis.atRisk, sublabel: "projects", tone: summary.kpis.atRisk > 0 ? "danger" as const : "good" as const },
    { label: "Portfolio Value", value: fmtMoney(summary.kpis.totalContractValue), sublabel: "revised contract", tone: "info" as const },
    { label: "On Schedule", value: summary.kpis.onSchedule, sublabel: "projects", tone: "good" as const },
    { label: "Avg Complete", value: `${summary.kpis.avgPctComplete}%`, sublabel: "by work package", tone: "neutral" as const },
  ];

  const attentionItems: AttentionItem[] = summary.atRiskQueue.map((row): AttentionItem => {
    const project = summary.allRows.find((candidate) => candidate.id === row.id);
    return {
      id: row.id,
      issue: `${row.projectNumber || "Project"} · ${row.name}`,
      deadline: project?.target_completion_date || null,
      risk: [
        row.health,
        row.openRfis > 0 ? `${row.openRfis} open RFIs` : null,
        `${row.pctComplete}% complete`,
      ].filter(Boolean).join(" · "),
      owner: null,
      nextAction: "Open project control center",
      tone: row.health === "At Risk" ? "danger" : "warn",
      onOpen: project ? () => onOpenProject(project) : undefined,
    };
  });

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
          return <span className="cmd-row__meta">Not scheduled</span>;
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
            style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}
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
    <div className="portfolio-cc sbp-command-page">
      <PageHeader
        eyebrow="Portfolio / Command"
        title="Portfolio Overview"
        subtitle="Org-wide project health, contract value, schedule pressure, and structural-steel execution."
        meta={`${summary.kpis.activeProjects} active · ${summary.kpis.atRisk} at risk · ${fmtMoney(summary.kpis.totalContractValue)} revised contract`}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Portfolio operational summary" />

      <AttentionQueue
        title="Portfolio Attention"
        items={attentionItems}
        emptyMessage="No Watch or At Risk projects."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>Top by Contract Value</h2></div>
          <div>
            {summary.topByValue.length === 0 ? <div className="sbp-attention__empty">No contract values entered.</div> : summary.topByValue.map((row) => (
              <button type="button" className="cmd-row is-clickable" key={row.id} onClick={() => { const project = byId.get(row.id); if (project) onOpenProject(project); }} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
                <div><div className="cmd-row__num">{row.name}</div><div className="cmd-row__meta">{row.projectNumber || "—"}</div></div>
                <div style={{ textAlign: "right" }}><div>{fmtMoney(row.revisedContract)}</div><Pill tone={healthTone(row.health)}>{row.health}</Pill></div>
              </button>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>Closing Soon</h2></div>
          <div>
            {summary.closingSoon.length === 0 ? <div className="sbp-attention__empty">No target dates within 90 days.</div> : summary.closingSoon.map((row) => (
              <button type="button" className="cmd-row is-clickable" key={row.id} onClick={() => { const project = byId.get(row.id); if (project) onOpenProject(project); }} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
                <div><div className="cmd-row__num">{row.name}</div><div className="cmd-row__meta">{row.projectNumber || "—"}</div></div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><CalendarClock size={13} /><span className={row.isOverdue ? "cmd-overdue" : "cmd-row__meta"}>{daysLabel(row.daysLeft, row.isOverdue)}</span></div>
              </button>
            ))}
          </div>
        </section>
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



