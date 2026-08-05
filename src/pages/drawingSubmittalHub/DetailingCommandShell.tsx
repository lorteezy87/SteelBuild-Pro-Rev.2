/**
 * DetailingCommandShell — canonical shell for the Detailing Control Center.
 *
 * SHELL ONLY. Every tab panel, modal, mutation, escalation, and data-fetch
 * lives in DrawingSubmittalHub.tsx and is passed through via `children`.
 * This file never touches data or workflow logic.
 *
 * Rendered unconditionally by DrawingSubmittalHub.
 */

import type { ComponentType, ReactNode } from "react";
import { LayoutGrid } from "lucide-react";
import "@/styles/command.css";
import { PageHero, KpiStrip, useCommandSkin } from "@/components/command";
import type { KpiCellDef, HeroChip, KpiTone } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import { AlertTriangle, CalendarClock, CheckCircle, Gauge, FileStack, ClipboardList } from "lucide-react";

// ── Prop types ─────────────────────────────────────────────────────────────

/** One tab descriptor — same shape as TABS in format.ts / the hub's `tabs` memo. */
export interface TabDef {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number | string }>;
}

/** Real KPI numbers lifted from the hub's computed values. */
export interface DetailingKpis {
  totalSets: number;
  totalSheets: number;
  released: number;
  inReview: number;
  submittalsTotal: number;
  submittalsPending: number;
  needsAction: number;   // kpis.rejected in hub (rejected/returned submittals)
  overdue: number;
  atRisk: number;
  overdueDrawingSets: number;
  overdueUnlinkedSubmittals: number;
  fabReadyNumerator: number;
  fabReadyDenominator: number;
  fabReadyPercent: number;
  openItems: number;      // triage.openItems.length
  fleetAverageScore: number | null; // from fleetHealth.averageScore (null if no data)
}

interface DetailingCommandShellProps {
  tabs: TabDef[];
  activeTab: string;
  onTab: (key: string) => void;
  kpis: DetailingKpis;
  projectName?: string;
  /** Tab-count badge values, keyed by tab key. */
  tabCounts: Record<string, number>;
  /** The active tab panel rendered by the hub (unchanged). */
  children: ReactNode;
}

// ── Shell component ────────────────────────────────────────────────────────

export function DetailingCommandShell({
  tabs,
  activeTab,
  onTab,
  kpis,
  projectName,
  tabCounts,
  children,
}: DetailingCommandShellProps) {
  useCommandSkin();

  // ── Hero chips from real fleet metrics ────────────────────────────────
  const chips: HeroChip[] = [
    { label: `${kpis.totalSets} Sets` },
    ...(kpis.openItems > 0
      ? [{ label: `${kpis.openItems} Open`, tone: "info" as const }]
      : []),
    ...(kpis.overdue > 0
      ? [{ label: `${kpis.overdue} Overdue`, tone: "danger" as const }]
      : [{ label: "No overdue", tone: "good" as const }]),
    ...(kpis.atRisk > 0
      ? [{ label: `${kpis.atRisk} At Risk`, tone: "warn" as const }]
      : []),
  ];

  // ── Hero stats (right-hand stat cards) ────────────────────────────────
  // Real values only — OMIT fleet score when no data (fleetAverageScore null).
  const heroStats = [
    ...(kpis.fleetAverageScore !== null
      ? [{ value: `${kpis.fleetAverageScore}`, label: "Fleet Score" }]
      : []),
    {
      value: kpis.fabReadyDenominator > 0
        ? `${kpis.fabReadyNumerator}/${kpis.fabReadyDenominator}`
        : "—",
      label: "Fab Ready",
    },
  ];

  // ── KPI strip cells ───────────────────────────────────────────────────
  // Mapping → real hub computed values; tones are deterministic (not fabricated).
  const kpiCells: KpiCellDef[] = [
    {
      label: "Drawing Sets",
      value: kpis.totalSets,
      sublabel: `${kpis.totalSheets} active sheets`,
      tone: "neutral",
      Icon: FileStack,
    },
    {
      label: "Released",
      value: kpis.released,
      sublabel: "sets to fab",
      tone: "good",
      Icon: CheckCircle,
    },
    {
      label: "In Review",
      value: kpis.inReview,
      tone: kpis.inReview > 0 ? "info" : "neutral",
      Icon: Gauge,
    },
    {
      label: "Submittals",
      value: kpis.submittalsTotal,
      sublabel: `${kpis.submittalsPending} pending`,
      tone: "neutral",
      Icon: ClipboardList,
    },
    {
      label: "Needs Action",
      value: kpis.needsAction,
      sublabel: "rejected / returned",
      tone: (kpis.needsAction > 0 ? "warn" : "neutral") as KpiTone,
      Icon: AlertTriangle,
    },
    {
      label: "Overdue",
      value: kpis.overdue,
      sublabel: (() => {
        if (kpis.overdueDrawingSets > 0 && kpis.overdueUnlinkedSubmittals > 0)
          return `${kpis.overdueDrawingSets} sets · ${kpis.overdueUnlinkedSubmittals} unlinked`;
        if (kpis.overdueUnlinkedSubmittals > 0)
          return `${kpis.overdueUnlinkedSubmittals} unlinked subs`;
        if (kpis.overdueDrawingSets > 0)
          return `${kpis.overdueDrawingSets} drawing sets`;
        return "packages + unlinked subs";
      })(),
      tone: (kpis.overdue > 0 ? "danger" : "neutral") as KpiTone,
      Icon: CalendarClock,
    },
    {
      label: "At Risk",
      value: kpis.atRisk,
      sublabel: "schedule risk",
      tone: (kpis.atRisk > 0 ? "warn" : "neutral") as KpiTone,
    },
  ];

  return (
    <div className="detailing-cc">
      {/* Hero band */}
      <PageHero
        Icon={LayoutGrid}
        title="Detailing Control Center"
        subtitle="Drawings, submittals, and the path to Released-for-Fab"
        projectName={projectName}
        chips={chips}
        stats={heroStats}
        photoSrc={photoFor("DrawingSubmittalHub") ?? undefined}
      />

      {/* KPI strip */}
      <KpiStrip cells={kpiCells} />

      {/* Command-styled tab strip */}
      <div
        className="detailing-cc__tabs"
        role="tablist"
        aria-label="Detailing Control Center tabs"
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          alignItems: "stretch",
          marginBottom: 16,
          borderBottom: "1px solid var(--cmd-border, var(--border-default))",
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const TabIcon = tab.icon;
          const count = tabCounts[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTab(tab.key)}
              className={`detailing-cc__tab${isActive ? " is-active" : ""}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "11px 2px",
                marginRight: 22,
                marginBottom: -1,
                background: "transparent",
                border: "none",
                borderBottom: isActive
                  ? "2px solid var(--cmd-gold, var(--accent))"
                  : "2px solid transparent",
                color: isActive
                  ? "var(--cmd-text, var(--text-primary))"
                  : "var(--cmd-text-muted, var(--text-muted))",
                font: "inherit",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "color 120ms, border-color 120ms",
              }}
            >
              <TabIcon size={14} />
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isActive
                      ? "var(--cmd-gold, var(--accent))"
                      : "var(--cmd-text-muted, var(--text-muted))",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panel slot — the hub renders the existing active-tab JSX here unchanged */}
      <div className="detailing-cc__panel">
        {children}
      </div>
    </div>
  );
}
