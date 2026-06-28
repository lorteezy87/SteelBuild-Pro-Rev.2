/**
 * Fab Release Control Center
 *
 * Light Command UI skin for the Fab Release page, behind the `command_ui`
 * feature flag. Presentation-only: all release mutations, gate enforcement,
 * and CRUD handlers are passed in from FabRelease.tsx unchanged.
 *
 * Inline styles used for one-off positioning that doesn't belong in the
 * shared command.css (see CSS WANTS at bottom of file for what should
 * ultimately move there).
 */
import { useMemo } from "react";
import { Factory, AlertTriangle, CheckCircle2, Layers, Clock, Flame } from "lucide-react";
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
import {
  buildFabReleaseSummary,
  riskTone,
  stageTone,
  stageLabel,
} from "./fabReleaseControlCenter.derive";
import type { EnrichedWorkPackage, FabMetrics } from "./types";
import { formatDate } from "./format";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTons(n: number | string | undefined): string {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `${v.toFixed(1)}T` : "—";
}

function readinessPill(score: number) {
  const tone = score >= 80 ? "good" : score >= 50 ? "warn" : "danger";
  return <Pill tone={tone}>{score}%</Pill>;
}

function topBlockerLabel(wp: EnrichedWorkPackage): string {
  const high = wp._signals.flags.filter((f) => f.severity === "high");
  if (high.length > 0) return high[0].label;
  const med = wp._signals.flags.filter((f) => f.severity === "medium");
  if (med.length > 0) return med[0].label;
  return "—";
}

/** Scroll the data table into view (same pattern as RFI CC). */
function scrollToTable() {
  document.querySelector(".fab-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FabReleaseControlCenterProps {
  projectName: string;
  metrics: FabMetrics;
  filtered: EnrichedWorkPackage[];
  search: string;
  onSearch: (v: string) => void;
  stageFilter: string;
  onStageFilter: (v: string) => void;
  riskFilter: string;
  onRiskFilter: (v: string) => void;
  onOpenWP: (wp: EnrichedWorkPackage) => void;
  onExport: () => void;
  onCreate: (() => void) | null;
  /** Passes through to the existing complete mutation in FabRelease.tsx. */
  onComplete: (wp: EnrichedWorkPackage) => void;
  isCompleting: boolean;
}

// ---------------------------------------------------------------------------
// Stage filter chips — reuses analytics FAB_STAGES IDs
// ---------------------------------------------------------------------------

const STAGE_CHIPS = [
  { id: "all", label: "All" },
  { id: "drawings_approved", label: "Dwgs OK" },
  { id: "material_on_hand", label: "Matl Ready" },
  { id: "shop_released", label: "Released" },
  { id: "in_fabrication", label: "In Fab" },
  { id: "fabricated", label: "Fabricated" },
  { id: "finish_treatment", label: "Finishing" },
  { id: "ready_to_ship", label: "Ship Ready" },
];

const RISK_CHIPS = [
  { id: "all", label: "All Risk" },
  { id: "high", label: "Exceptions" },
  { id: "medium", label: "Warnings" },
  { id: "clear", label: "Clear" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FabReleaseControlCenter(props: FabReleaseControlCenterProps) {
  const {
    projectName, metrics, filtered, search, onSearch,
    stageFilter, onStageFilter, riskFilter, onRiskFilter,
    onOpenWP, onExport, onCreate, onComplete, isCompleting,
  } = props;

  useCommandSkin();

  const s = useMemo(() => buildFabReleaseSummary(metrics), [metrics]);

  // ── Hero chips ─────────────────────────────────────────────────────────
  const heroChips = [
    { label: `${s.totalCount} Packages` },
    { label: `${s.releasedCount} Released`, tone: "good" as const },
    { label: `${s.blockedCount} Blocked` },
  ];

  // ── KPI strip ──────────────────────────────────────────────────────────
  const kpiCells: KpiCellDef[] = s.kpis.map((kpi, i) => ({
    label: kpi.label,
    value: kpi.value,
    sublabel: kpi.sublabel,
    tone: kpi.tone,
    Icon: [Factory, CheckCircle2, AlertTriangle, Flame, Layers, Clock][i],
  }));

  // ── Table columns ──────────────────────────────────────────────────────
  const columns: Column<EnrichedWorkPackage>[] = [
    {
      key: "pkg",
      header: "Package / WP",
      render: (wp) => (
        <div>
          <div className="cmd-row__num">{wp.wp_number || "—"}</div>
          <div className="cmd-row__meta">{wp.name || wp.description || "Unnamed"}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (wp) => (
        <Pill tone={stageTone(wp._signals.stage)}>{stageLabel(wp._signals.stage)}</Pill>
      ),
    },
    {
      key: "readiness",
      header: "Fab Ready %",
      align: "right" as const,
      render: (wp) => readinessPill(wp._signals.readinessScore),
    },
    {
      key: "released",
      header: "Released?",
      render: (wp) => {
        if (wp._signals.complete) return <Pill tone="good">Ship Ready</Pill>;
        if (wp._signals.inShop) return <Pill tone="neutral">{formatDate(wp.released_date as string | null)}</Pill>;
        return <span className="cmd-row__meta">No</span>;
      },
    },
    {
      key: "blockers",
      header: "Top Blocker",
      render: (wp) => {
        const blocker = topBlockerLabel(wp);
        if (blocker === "—") return <span className="cmd-row__meta">None</span>;
        return <Pill tone={riskTone(wp._signals.risk)}>{blocker}</Pill>;
      },
    },
    {
      key: "due",
      header: "Sched End",
      render: (wp) => {
        const d = formatDate(wp._signals.scheduledEnd ? (wp._signals.scheduledEnd as Date).toISOString().slice(0, 10) : null);
        if (d === "TBD") return <span className="cmd-row__meta">TBD</span>;
        if (wp._signals.overduePlan) return <span className="cmd-overdue">{d} · overdue</span>;
        return <span>{d}</span>;
      },
    },
    {
      key: "tons",
      header: "Tons",
      align: "right" as const,
      render: (wp) => <span className="cmd-row__meta">{fmtTons(wp.tonnage)}</span>,
    },
  ];

  return (
    <div className="fab-cc">
      <PageHero
        Icon={Factory}
        title="Fab Release Control Center"
        subtitle="Track shop release readiness, clear blockers, and move steel packages through fabrication."
        projectName={projectName}
        chips={heroChips}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Ready Queue */}
        <DecisionPanel
          title="Ready to Release"
          onViewAll={() => { onStageFilter("all"); onRiskFilter("clear"); scrollToTable(); }}
        >
          {s.readyQueue.length === 0 ? (
            <div className="cmd-row__meta">No packages ready for release.</div>
          ) : s.readyQueue.map((wp) => (
            <div
              key={wp.id}
              className="cmd-row is-clickable"
              onClick={() => onOpenWP(wp)}
            >
              <div>
                <div className="cmd-row__num">{wp.wp_number || "WP"}</div>
                <div className="cmd-row__meta">{wp.name || wp.description || "Unnamed"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {readinessPill(wp._signals.readinessScore)}
                <span className="cmd-row__meta">{fmtTons(wp.tonnage)}</span>
              </div>
            </div>
          ))}
        </DecisionPanel>

        {/* Blocked Queue */}
        <DecisionPanel
          title="Blocked (RFI / Approval)"
          onViewAll={() => { onRiskFilter("high"); scrollToTable(); }}
        >
          {s.blockedQueue.length === 0 ? (
            <div className="cmd-row__meta">No packages blocked.</div>
          ) : s.blockedQueue.map((wp) => (
            <div
              key={wp.id}
              className="cmd-row is-clickable"
              onClick={() => onOpenWP(wp)}
            >
              <div>
                <div className="cmd-row__num">{wp.wp_number || "WP"}</div>
                <div className="cmd-row__meta">{topBlockerLabel(wp)}</div>
              </div>
              <Pill tone={riskTone(wp._signals.risk)}>
                {wp._signals.risk === "high" ? "Exception" : "Warning"}
              </Pill>
            </div>
          ))}
        </DecisionPanel>

        {/* Recently Released */}
        <DecisionPanel
          title="Recently Released"
          onViewAll={() => { onStageFilter("shop_released"); scrollToTable(); }}
        >
          {s.recentlyReleased.length === 0 ? (
            <div className="cmd-row__meta">No packages released yet.</div>
          ) : s.recentlyReleased.map((wp) => (
            <div
              key={wp.id}
              className="cmd-row is-clickable"
              onClick={() => onOpenWP(wp)}
            >
              <div>
                <div className="cmd-row__num">{wp.wp_number || "WP"}</div>
                <div className="cmd-row__meta">{wp.name || "Unnamed"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Pill tone={stageTone(wp._signals.stage)}>{stageLabel(wp._signals.stage)}</Pill>
                <span className="cmd-row__meta">
                  {wp.released_date ? formatDate(wp.released_date as string) : "—"}
                </span>
              </div>
            </div>
          ))}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search package, WP#, crew, stage, or blocker"
        onExport={onExport}
        primaryLabel="New Package"
        onPrimary={onCreate}
        filters={
          <>
            {/* Stage chips */}
            <span
              className="cmd-row__meta"
              style={{ marginRight: 4, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Stage
            </span>
            {STAGE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`cmd-chip-btn${stageFilter === chip.id ? " is-active" : ""}`}
                onClick={() => onStageFilter(chip.id)}
              >
                {chip.label}
              </button>
            ))}
            {/* Risk divider */}
            <span style={{ margin: "0 6px", color: "var(--border-subtle, #ccc)" }}>|</span>
            <span
              className="cmd-row__meta"
              style={{ marginRight: 4, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              Risk
            </span>
            {RISK_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`cmd-chip-btn${riskFilter === chip.id ? " is-active" : ""}`}
                onClick={() => onRiskFilter(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpenWP}
        emptyMessage="No packages match your filters. Clear filters or create a new fab package."
      />
    </div>
  );
}

/*
 * CSS WANTS (inline-style fallback in place today)
 * ─────────────────────────────────────────────────
 * 1. `.fab-cc .cmd-filter-label` — small uppercase label between chip groups
 *    (stage/risk divider). Currently set as inline style on a <span>.
 *    When command.css is extended, extract to:
 *      .cmd-filter-label { font-size: 0.7rem; text-transform: uppercase;
 *        letter-spacing: 0.05em; color: var(--text-muted); margin-right: 4px; }
 *
 * 2. `.fab-cc .cmd-filter-divider` — the `|` separator between chip groups.
 *    Currently inline on a <span>. Move to:
 *      .cmd-filter-divider { color: var(--border-subtle); margin: 0 6px; }
 */
