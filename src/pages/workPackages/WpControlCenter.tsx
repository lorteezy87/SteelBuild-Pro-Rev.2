/**
 * WpControlCenter — canonical presentation shell for Work Packages.
 *
 * Receives pre-computed analytics + enriched rows from the WorkPackages
 * container (which still owns all data access and mutations).
 * The active execution workflow, exception rail, filters, bulk actions, and
 * modal surfaces are composed through slots so this shell does not duplicate
 * or reimplement domain behavior.
 *
 * CSS: inline styles only for the custom phase-rail section per task spec.
 * Everything else uses cmd-* classes from command.css.
 */

import { useMemo, useRef, type ReactNode } from "react";
import {
  Boxes,
  Truck,
  Anchor,
  CheckSquare,
  Timer,
  AlertTriangle,
  BookOpen,
  PauseCircle,
  Download,
  Plus,
  Upload,
} from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  useCommandSkin,
} from "@/components/command";
import type { KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import { areAllFilteredRowsSelected, buildWpPanels } from "./wpControlCenter.derive";
import type { WpMetrics, EnrichedWp } from "./wpControlCenter.derive";
import { formatTons, formatHours, phaseColor, PHASE_META, VIEW_OPTIONS } from "./format";
import { ControlPanel } from "./components";
import { RESPONSIVE_CSS, contentGridStyle, pageStyle } from "./styles";

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

/** Scroll to the active execution workflow. */
function scrollToBody(body: HTMLDivElement | null) {
  body?.scrollIntoView({
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
  view: string;
  onViewChange: (view: string) => void;
  search: string;
  onSearch: (v: string) => void;
  phaseFilter: string;
  onPhaseFilter: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  riskFilter: string;
  onRiskFilter: (v: string) => void;
  onClearFilters: () => void;
  filteredCount: number;
  totalCount: number;
  onOpenWp: (wp: EnrichedWp) => void;
  onExport: () => void;
  onBulkAdd: () => void;
  onCreate: (() => void) | null;
  canCreate: boolean;
  /** Bulk selection state (drives checkbox column + BulkActionBar in container). */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  /** From the project record — passes straight through to the hero. */
  projectHealth?: string | null;
  percentComplete?: number | null;
  sequenceFilter?: ReactNode;
  exceptionPanel?: ReactNode;
  listTruncationNotice?: ReactNode;
  bulkActions?: ReactNode;
  modals?: ReactNode;
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WpControlCenter(props: WpControlCenterProps) {
  const {
    projectName,
    filtered,
    metrics,
    view,
    onViewChange,
    search,
    onSearch,
    phaseFilter,
    onPhaseFilter,
    statusFilter,
    onStatusFilter,
    riskFilter,
    onRiskFilter,
    onClearFilters,
    filteredCount,
    totalCount,
    onOpenWp,
    onExport,
    onBulkAdd,
    onCreate,
    canCreate,
    selectedIds,
    onToggleSelect,
    onToggleAll,
    projectHealth,
    percentComplete,
    sequenceFilter,
    exceptionPanel,
    listTruncationNotice,
    bulkActions,
    modals,
    children,
  } = props;

  useCommandSkin();
  const bodyRef = useRef<HTMLDivElement | null>(null);

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

  const selectable = !!(selectedIds && onToggleSelect && onToggleAll);

  return (
    <div className="wp-cc sb-dashboard-reference-page" style={pageStyle}>
      <style>{RESPONSIVE_CSS}</style>
      {listTruncationNotice}
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

      <div className="wp-cc__toolbar" style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "12px 24px" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Work package view">
          {VIEW_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = view === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`cmd-chip-btn${active ? " is-active" : ""}`}
                onClick={() => onViewChange(option.id)}
                aria-pressed={active}
              >
                {Icon && <Icon size={13} />}
                {option.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {selectable && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", fontSize: 11 }}>
              <input
                type="checkbox"
                checked={areAllFilteredRowsSelected(filtered, selectedIds!)}
                onChange={(event) => onToggleAll!(event.target.checked)}
                aria-label="Select all visible work packages"
              />
              Select visible ({filtered.length})
            </label>
          )}
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}>
            <Download size={14} /> CSV
          </button>
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onBulkAdd} disabled={!canCreate}>
            <Upload size={14} /> Bulk Add
          </button>
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={onCreate || undefined} disabled={!canCreate}>
            <Plus size={14} /> New WP
          </button>
        </div>
      </div>

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
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
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
              <div style={{ color: "var(--text-primary)", fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
                {row.count}
                <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                  {formatTons(row.tons)}
                </span>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: 4,
                  background: "var(--divider)",
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
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.progress}% complete</span>
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
            scrollToBody(bodyRef.current);
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
        <DecisionPanel title="Ready to Advance" onViewAll={() => scrollToBody(bodyRef.current)}>
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
        <DecisionPanel title="At Risk" onViewAll={() => scrollToBody(bodyRef.current)}>
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

      <ControlPanel
        search={search}
        onSearch={onSearch}
        phaseFilter={phaseFilter}
        onPhaseFilter={onPhaseFilter}
        statusFilter={statusFilter}
        onStatusFilter={onStatusFilter}
        riskFilter={riskFilter}
        onRiskFilter={onRiskFilter}
        filteredCount={filteredCount}
        totalCount={totalCount}
        onClear={onClearFilters}
      />
      {sequenceFilter}

      <div ref={bodyRef} className="wp-cc__body" style={contentGridStyle}>
        {exceptionPanel}
        {children}
      </div>

      {bulkActions}
      {modals}
    </div>
  );
}
