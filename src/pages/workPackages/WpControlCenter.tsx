/**
 * WpControlCenter — presentation-only Command UI skin for Work Packages.
 *
 * Receives pre-computed analytics + enriched rows from the WorkPackages
 * container (which still owns all data access and mutations).
 * Composed from the shared @/components/command kit, reusing format.ts
 * helpers and wpControlCenter.derive.ts for pure derivations.
 *
 * CSS: inline styles only for the custom phase-rail section per task spec.
 * Everything else uses cmd-* classes from command.css.
 */

import { useMemo } from "react";
import {
  Boxes,
  Truck,
  Anchor,
  CheckSquare,
  Timer,
  AlertTriangle,
  BookOpen,
  PauseCircle,
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
import type { Column, KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import {
  wpStatusTone,
  riskTone,
  buildWpPanels,
} from "./wpControlCenter.derive";
import type { WpMetrics, EnrichedWp } from "./wpControlCenter.derive";
import { formatTons, formatHours, phaseColor, PHASE_META, RISK_FILTERS } from "./format";
import { formatDate } from "./utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHASES = ["All", "Detailing", "Fabrication", "Delivery", "Erection"];
const STATUSES = ["All", "Not Started", "In Progress", "Complete", "On Hold"];

/** Map phase name to the phase's next step label (for "Ready to Advance" panel). */
function nextPhase(phase: string): string {
  const map: Record<string, string> = {
    Detailing: "Fabrication",
    Fabrication: "Delivery",
    Delivery: "Erection",
    Erection: "Complete",
  };
  return map[phase] || "—";
}

/** Scroll to the DataTable. Mirrors the RFI pattern. */
function scrollToTable() {
  document.querySelector(".wp-cc .cmd-table-wrap")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WpControlCenterProps {
  projectName: string;
  workPackages: EnrichedWp[];
  filtered: EnrichedWp[];
  metrics: WpMetrics;
  search: string;
  onSearch: (v: string) => void;
  phaseFilter: string;
  onPhaseFilter: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  riskFilter: string;
  onRiskFilter: (v: string) => void;
  onOpenWp: (wp: EnrichedWp) => void;
  onExport: () => void;
  onCreate: (() => void) | null;
  /** Bulk selection state (drives checkbox column + BulkActionBar in container). */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  /** From the project record — passes straight through to the hero. */
  projectHealth?: string | null;
  percentComplete?: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WpControlCenter(props: WpControlCenterProps) {
  const {
    projectName,
    filtered,
    metrics,
    search,
    onSearch,
    phaseFilter,
    onPhaseFilter,
    statusFilter,
    onStatusFilter,
    riskFilter,
    onRiskFilter,
    onOpenWp,
    onExport,
    onCreate,
    selectedIds,
    onToggleSelect,
    onToggleAll,
    projectHealth,
    percentComplete,
  } = props;

  useCommandSkin();

  const panels = useMemo(() => buildWpPanels(metrics), [metrics]);

  // Hero
  const heroStats = [
    { value: formatTons(metrics.totalTons), label: "Total Tonnage" },
    { value: `${metrics.progress}%`, label: "Weighted Progress" },
  ];
  const heroChips = [
    { label: `${metrics.totalCount} Packages` },
    { label: `${metrics.highRisk.length} Exceptions`, tone: "danger" as const },
    { label: `${metrics.overdue.length} Overdue`, tone: "warn" as const },
  ];

  // KPI strip — 7 cells
  const laborBurnTone = metrics.laborBurn > 100 ? "danger" as const : "neutral" as const;
  const kpiCells: KpiCellDef[] = [
    {
      label: "Ready for Fab",
      value: metrics.readyForFab.length,
      sublabel: "packages",
      tone: metrics.readyForFab.length ? "good" : "neutral",
      Icon: CheckSquare,
    },
    {
      label: "Ready to Ship",
      value: metrics.readyForShip.length,
      sublabel: "packages",
      tone: metrics.readyForShip.length ? "good" : "neutral",
      Icon: Truck,
    },
    {
      label: "Field Ready",
      value: metrics.fieldReady.length,
      sublabel: "packages",
      tone: metrics.fieldReady.length ? "good" : "neutral",
      Icon: Anchor,
    },
    {
      label: "Labor Burn",
      value: `${metrics.laborBurn}%`,
      sublabel: "actual vs budget",
      tone: laborBurnTone,
      Icon: Timer,
    },
    {
      label: "Budget Hours",
      value: formatHours(metrics.totalBudgetHours),
      sublabel: `${formatHours(metrics.totalActualHours)} actual`,
      tone: "neutral",
      Icon: BookOpen,
    },
    {
      label: "Drawing Gaps",
      value: metrics.drawingGaps.length,
      sublabel: "need drawings",
      tone: metrics.drawingGaps.length ? "warn" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "On Hold",
      value: metrics.onHold.length,
      sublabel: "packages",
      tone: metrics.onHold.length ? "warn" : "neutral",
      Icon: PauseCircle,
    },
  ];

  // Selection
  const selectable = !!(selectedIds && onToggleSelect && onToggleAll);
  const allSelected =
    selectable && filtered.length > 0 && selectedIds!.size === filtered.length;

  // DataTable columns
  const columns: Column<EnrichedWp>[] = [
    ...(selectable
      ? ([
          {
            key: "sel",
            header: (
              <input
                type="checkbox"
                className="cmd-check"
                checked={allSelected}
                onChange={(e) => onToggleAll!(e.target.checked)}
                aria-label="Select all work packages"
              />
            ),
            render: (w: EnrichedWp) => (
              <input
                type="checkbox"
                className="cmd-check"
                checked={selectedIds!.has(w.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelect!(w.id)}
                aria-label="Select work package"
              />
            ),
          },
        ] as Column<EnrichedWp>[])
      : []),
    {
      key: "num",
      header: "WP #",
      render: (w) => <span className="cmd-row__num">{w.wp_number || "—"}</span>,
    },
    {
      key: "name",
      header: "Package",
      render: (w) => w.name || "Untitled",
    },
    {
      key: "phase",
      header: "Phase",
      render: (w) => (
        <Pill tone="neutral">
          <span style={{ color: phaseColor(w._signals?.phase || w.phase || "") }}>
            {w._signals?.phase || w.phase || "—"}
          </span>
        </Pill>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (w) => (
        <Pill tone={wpStatusTone(w._signals?.status || w.status)}>
          {w._signals?.status || w.status || "Not Started"}
        </Pill>
      ),
    },
    {
      key: "risk",
      header: "Risk",
      render: (w) => (
        <Pill tone={riskTone(w._signals?.risk)}>
          {w._signals?.risk === "high"
            ? "Exception"
            : w._signals?.risk === "medium"
            ? "Warning"
            : "Clear"}
        </Pill>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      align: "right" as const,
      render: (w) => `${w._signals?.progress ?? w.percent_complete ?? 0}%`,
    },
    {
      key: "tonnage",
      header: "Tonnage",
      align: "right" as const,
      render: (w) => formatTons(w.tonnage),
    },
    {
      key: "hourBurn",
      header: "Labor Burn",
      align: "right" as const,
      render: (w) => {
        const burn = w._signals?.hourBurn ?? 0;
        return burn > 0 ? `${burn}%` : "—";
      },
    },
    {
      key: "crew",
      header: "Crew",
      render: (w) => w.crew || <span className="cmd-row__meta">—</span>,
    },
    {
      key: "planEnd",
      header: "Plan End",
      render: (w) => formatDate(w.scheduled_end_date),
    },
  ];

  return (
    <div className="wp-cc">
      {/* ------------------------------------------------------------------ */}
      {/* HERO                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <PageHero
        Icon={Boxes}
        title="Work Package Control Center"
        subtitle="Manage fabrication, delivery, and erection packages — surface exceptions and advance production flow."
        projectName={projectName}
        chips={heroChips}
        photoSrc={photoFor("WorkPackages") ?? undefined}
        stats={[
          { value: projectHealth || "—", label: "Project Health" },
          {
            value: percentComplete != null ? `${Math.round(percentComplete)}%` : "—",
            label: "Complete",
          },
          ...heroStats,
        ]}
      />

      {/* ------------------------------------------------------------------ */}
      {/* KPI STRIP                                                            */}
      {/* ------------------------------------------------------------------ */}
      <KpiStrip cells={kpiCells} />

      {/* ------------------------------------------------------------------ */}
      {/* PHASE RAIL (inline-styled per task spec)                             */}
      {/*                                                                      */}
      {/* DESIGN NOTE: This is a custom section not covered by command.css.   */}
      {/* If formalized, suggested class: .cmd-phase-rail (outer flex),        */}
      {/* .cmd-phase-card (each card), .cmd-phase-card__bar (the thin bar).   */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "16px 24px",
          flexWrap: "wrap" as const,
        }}
      >
        {panels.phaseRail.map((row) => {
          const meta = PHASE_META[row.phase];
          const PhaseIcon = meta?.icon;
          return (
            <div
              key={row.phase}
              style={{
                background: "#ffffff",
                border: "1px solid #e4e8ee",
                borderRadius: 12,
                padding: "14px 18px",
                flex: "1 1 180px",
                minWidth: 160,
                display: "flex",
                flexDirection: "column" as const,
                gap: 6,
              }}
            >
              {/* Phase name + icon */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: phaseColor(row.phase),
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {PhaseIcon && <PhaseIcon size={14} />}
                <span>{row.phase}</span>
              </div>

              {/* Count + tonnage */}
              <div style={{ color: "#1b2430", fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
                {row.count}
                <span style={{ fontSize: 13, fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>
                  {formatTons(row.tons)}
                </span>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: 4,
                  background: "#e4e8ee",
                  borderRadius: 2,
                  overflow: "hidden",
                  marginTop: 4,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(0, row.progress))}%`,
                    background: phaseColor(row.phase),
                    borderRadius: 2,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>

              {/* Progress label */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>{row.progress}% complete</span>
                {row.highRisk > 0 && (
                  <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>
                    {row.highRisk} exception{row.highRisk > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* DECISION PANELS                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="cmd-panels">
        {/* Work Queue — high-risk sorted by execution priority */}
        <DecisionPanel
          title="Work Queue"
          onViewAll={() => {
            onRiskFilter("high");
            scrollToTable();
          }}
        >
          {panels.workQueue.map((w) => {
            const firstFlag = w._signals?.flags?.[0];
            return (
              <div
                className="cmd-row is-clickable"
                key={w.id}
                onClick={() => onOpenWp(w)}
              >
                <div>
                  <div className="cmd-row__num">{w.wp_number || "WP"}</div>
                  <div className="cmd-row__meta">{w.name || "Untitled"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {firstFlag && (
                    <Pill tone={firstFlag.severity === "high" ? "danger" : "warn"}>
                      {firstFlag.label}
                    </Pill>
                  )}
                  <span className="cmd-row__meta">{formatTons(w.tonnage)}</span>
                </div>
              </div>
            );
          })}
          {panels.workQueue.length === 0 && (
            <div className="cmd-row__meta">No high-risk packages.</div>
          )}
        </DecisionPanel>

        {/* Ready to Advance — packages near threshold, not in Erection */}
        <DecisionPanel title="Ready to Advance" onViewAll={scrollToTable}>
          {panels.readyToAdvance.map((w) => (
            <div
              className="cmd-row is-clickable"
              key={w.id}
              onClick={() => onOpenWp(w)}
            >
              <div>
                <div className="cmd-row__num">{w.wp_number || "WP"}</div>
                <div className="cmd-row__meta">
                  {w._signals?.phase || w.phase} &rarr; {nextPhase(w._signals?.phase || w.phase || "")}
                </div>
              </div>
              <span className="cmd-row__meta">
                {w._signals?.readinessScore ?? 0}% ready
              </span>
            </div>
          ))}
          {panels.readyToAdvance.length === 0 && (
            <div className="cmd-row__meta">No packages near threshold.</div>
          )}
        </DecisionPanel>

        {/* At Risk — over labor budget or overdue */}
        <DecisionPanel title="At Risk" onViewAll={scrollToTable}>
          {panels.atRisk.map((w) => (
            <div
              className="cmd-row is-clickable"
              key={w.id}
              onClick={() => onOpenWp(w)}
            >
              <div>
                <div className="cmd-row__num">{w.wp_number || "WP"}</div>
                <div className="cmd-row__meta">
                  {w._signals?.overdue ? "Past plan date" : ""}
                  {w._signals?.overdue && (w._signals?.hourBurn ?? 0) > 100 ? " · " : ""}
                  {(w._signals?.hourBurn ?? 0) > 100 ? `${w._signals?.hourBurn}% labor burn` : ""}
                </div>
              </div>
              <Pill tone={w._signals?.overdue ? "danger" : "warn"}>
                {w._signals?.overdue ? "Overdue" : "Over Budget"}
              </Pill>
            </div>
          ))}
          {panels.atRisk.length === 0 && (
            <div className="cmd-row__meta">No packages at risk.</div>
          )}
        </DecisionPanel>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* FILTER BAR                                                           */}
      {/* ------------------------------------------------------------------ */}
      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search WP number, name, crew, phase, or status"
        onExport={onExport}
        primaryLabel="Add WP"
        onPrimary={onCreate}
        filters={
          <>
            {/* Phase chips */}
            {PHASES.map((p) => (
              <button
                key={p}
                type="button"
                className={`cmd-chip-btn${phaseFilter === (p === "All" ? "all" : p) ? " is-active" : ""}`}
                onClick={() => onPhaseFilter(p === "All" ? "all" : p)}
              >
                {p}
              </button>
            ))}
            <span style={{ width: 1, background: "var(--border)", margin: "0 4px" }} />
            {/* Status chips */}
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`cmd-chip-btn${statusFilter === (s === "All" ? "all" : s) ? " is-active" : ""}`}
                onClick={() => onStatusFilter(s === "All" ? "all" : s)}
              >
                {s}
              </button>
            ))}
            <span style={{ width: 1, background: "var(--border)", margin: "0 4px" }} />
            {/* Risk chips */}
            {RISK_FILTERS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`cmd-chip-btn${riskFilter === r.id ? " is-active" : ""}`}
                onClick={() => onRiskFilter(r.id)}
              >
                {r.label}
              </button>
            ))}
          </>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* DATA TABLE                                                           */}
      {/* ------------------------------------------------------------------ */}
      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpenWp}
        emptyMessage="No work packages match your filters."
      />
    </div>
  );
}
