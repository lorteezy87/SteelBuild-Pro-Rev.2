/**
 * DetailingCommandShell — canonical shell for the Detailing Control Center.
 *
 * SHELL ONLY. Every tab panel, modal, mutation, escalation, and data-fetch
 * lives in DrawingSubmittalHub.tsx and is passed through via `children`.
 * This file never touches data or workflow logic.
 *
 * Layout follows the master brief's control-center contract and the
 * SteelBuild-Pro-2026 hub it borrows from: context header (project, overdue,
 * holds) → KPI strip → tab strip → the active panel. DetailingNoProject is the
 * explicit empty state for "no project selected".
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

const TITLE = "Detailing Control Center";
// The 2026 hub's framing: one place for the whole drawings → submittals →
// transmittals chain, with the submittal workflow owning the stage.
const SUBTITLE = "Drawings → submittals → transmittals in one place. Stage follows each set's governing submittal.";

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
  /** Project context line, e.g. "24-117 · Mesa Gateway". */
  projectName?: string;
  /** True while the underlying queries are still resolving. */
  isLoading?: boolean;
  /**
   * Active sheet holds — the Holds tab's Active-table count over the same
   * query. null/undefined while unknown, so the header never claims "No holds"
   * before it has checked.
   */
  activeHolds?: number | null;
  /** Header actions rendered in the hero (e.g. Lead Times). Optional. */
  actions?: ReactNode;
  /** Tab-count badge values, keyed by tab key. */
  tabCounts: Record<string, number>;
  /** Tabs whose count is a warning (e.g. holds) rather than a row tally. */
  alertTabs?: readonly string[];
  /** The active tab panel rendered by the hub (unchanged). */
  children: ReactNode;
}

const tabId = (key: string) => `dcc-tab-${key}`;
const PANEL_ID = "dcc-panel";

// ── Shell component ────────────────────────────────────────────────────────

export function DetailingCommandShell({
  tabs,
  activeTab,
  onTab,
  kpis,
  projectName,
  tabCounts,
  alertTabs = [],
  activeHolds,
  actions,
  isLoading,
  children,
}: DetailingCommandShellProps) {
  useCommandSkin();

  // While the queries are in flight every count is 0, and rendering those as
  // finished numbers made the band assert "Nothing overdue" / "Released 0" on
  // every cold load — reliably, when navigating in from Drawings, because the
  // hub's own ["drawing-sets"] key is cold while ["drawings"] is already warm.
  // An em dash says "not known yet"; a 0 says "we checked, there are none".
  const pending = Boolean(isLoading);
  const num = (v: number): ReactNode => (pending ? "—" : v);
  const tone = (t: KpiTone): KpiTone => (pending ? "neutral" : t);

  // Every overdue item on the board, both kinds. buildTriage partitions its
  // `overdue` bucket into these two disjoint counts.
  const totalOverdue = kpis.overdueDrawingSets + kpis.overdueUnlinkedSubmittals;

  // Holds badge (from the 2026 hub): the same number the Holds tab's Active
  // table shows. Omitted until the holds query answers.
  const holdsChip: HeroChip[] = typeof activeHolds === "number"
    ? [activeHolds > 0
        ? { label: `${activeHolds} Sheet${activeHolds === 1 ? "" : "s"} On Hold`, tone: "warn" as const }
        : { label: "No holds" }]
    : [];

  // ── Hero chips from real fleet metrics ────────────────────────────────
  const chips: HeroChip[] = pending ? [{ label: "Loading…" }] : [
    { label: `${kpis.totalSets} Sets` },
    ...(kpis.openItems > 0
      ? [{ label: `${kpis.openItems} Open`, tone: "info" as const }]
      : []),
    // The all-clear must account for BOTH overdue kinds. `kpis.overdue` counts
    // drawing sets only, so a project with four late unlinked submittals and no
    // late sets flew a green "No overdue sets" chip.
    ...(totalOverdue > 0
      ? [{
          label: kpis.overdueUnlinkedSubmittals > 0 && kpis.overdueDrawingSets > 0
            ? `${kpis.overdueDrawingSets} Overdue Set${kpis.overdueDrawingSets === 1 ? "" : "s"} · ${kpis.overdueUnlinkedSubmittals} Overdue Submittal${kpis.overdueUnlinkedSubmittals === 1 ? "" : "s"}`
            : kpis.overdueUnlinkedSubmittals > 0
              ? `${kpis.overdueUnlinkedSubmittals} Overdue Submittal${kpis.overdueUnlinkedSubmittals === 1 ? "" : "s"}`
              : `${kpis.overdueDrawingSets} Overdue Set${kpis.overdueDrawingSets === 1 ? "" : "s"}`,
          tone: "danger" as const,
        }]
      : [{ label: "Nothing overdue", tone: "good" as const }]),
    ...holdsChip,
    ...(kpis.atRisk > 0
      ? [{ label: `${kpis.atRisk} At Risk`, tone: "warn" as const }]
      : []),
  ];

  // ── Hero stats (right-hand stat cards) ────────────────────────────────
  // Real values only — OMIT fleet score when no data (fleetAverageScore null).
  const heroStats = pending ? [{ value: "—", label: "Fab Ready" }] : [
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
      value: num(kpis.totalSets),
      sublabel: pending ? "loading…" : `${kpis.totalSheets} active sheets`,
      tone: "neutral",
      Icon: FileStack,
    },
    {
      label: "Released",
      value: num(kpis.released),
      sublabel: "sets to fab",
      tone: tone("good"),
      Icon: CheckCircle,
    },
    {
      label: "In Review",
      value: num(kpis.inReview),
      tone: tone(kpis.inReview > 0 ? "info" : "neutral"),
      Icon: Gauge,
    },
    {
      label: "Submittals",
      value: num(kpis.submittalsTotal),
      sublabel: pending ? "loading…" : `${kpis.submittalsPending} pending`,
      tone: "neutral",
      Icon: ClipboardList,
    },
    {
      // Scoped in the label: this counts rejected/returned SUBMITTAL rows, while
      // the Control Board's own "Needs Action" tile counts triage items. Two
      // different denominators under one name read as a contradiction (3 vs 2).
      label: "Submittals Needing Action",
      value: num(kpis.needsAction),
      sublabel: "rejected / returned",
      tone: tone(kpis.needsAction > 0 ? "warn" : "neutral"),
      Icon: AlertTriangle,
    },
    {
      // Counts BOTH overdue kinds, with the split in the sublabel. It used to
      // show the drawing-set count under a sublabel that named both ("3 sets ·
      // 2 unlinked" beside a value of 3), so the tile under-reported the work.
      label: "Overdue",
      value: num(totalOverdue),
      sublabel: (() => {
        if (pending) return "loading…";
        if (kpis.overdueDrawingSets > 0 && kpis.overdueUnlinkedSubmittals > 0)
          return `${kpis.overdueDrawingSets} sets · ${kpis.overdueUnlinkedSubmittals} unlinked subs`;
        if (kpis.overdueUnlinkedSubmittals > 0)
          return `${kpis.overdueUnlinkedSubmittals} unlinked subs`;
        if (kpis.overdueDrawingSets > 0)
          return `${kpis.overdueDrawingSets} drawing sets`;
        return "sets + unlinked submittals";
      })(),
      tone: tone(totalOverdue > 0 ? "danger" : "neutral"),
      Icon: CalendarClock,
    },
    {
      label: "At Risk",
      value: num(kpis.atRisk),
      sublabel: "schedule risk",
      tone: tone(kpis.atRisk > 0 ? "warn" : "neutral"),
    },
  ];

  return (
    <div className="detailing-cc">
      {/* Hero band */}
      <PageHero
        Icon={LayoutGrid}
        title={TITLE}
        subtitle={SUBTITLE}
        projectName={projectName}
        chips={chips}
        stats={heroStats}
        photoSrc={photoFor("DrawingSubmittalHub") ?? undefined}
      >
        {actions}
      </PageHero>

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
          const alert = alertTabs.includes(tab.key);
          return (
            <button
              key={tab.key}
              id={tabId(tab.key)}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={PANEL_ID}
              data-hub-tab={tab.key}
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
                  data-tab-count={tab.key}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: alert
                      ? "var(--cmd-warn-text, var(--status-warning-fg))"
                      : isActive
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
      <div className="detailing-cc__panel" id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(activeTab)}>
        {children}
      </div>
    </div>
  );
}

/**
 * Explicit "no project" state. Without it the hub rendered its full shell
 * with every query disabled, so the band sat on em dashes and "Loading…"
 * indefinitely — reading as a stuck page, not as "pick a project first".
 */
export function DetailingNoProject() {
  useCommandSkin();
  return (
    <div className="detailing-cc">
      <PageHero
        Icon={LayoutGrid}
        title={TITLE}
        subtitle={SUBTITLE}
        photoSrc={photoFor("DrawingSubmittalHub") ?? undefined}
      />
      <div
        role="status"
        style={{
          padding: "40px 24px",
          textAlign: "center",
          border: "1px dashed var(--cmd-border, var(--border-default))",
          borderRadius: 6,
          background: "var(--cmd-surface, var(--bg-surface-low))",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--cmd-text, var(--text-primary))", marginBottom: 4 }}>
          No active project
        </div>
        <div style={{ fontSize: 13, color: "var(--cmd-text-muted, var(--text-muted))" }}>
          Pick a project from the project selector to open its Detailing Control Center.
        </div>
      </div>
    </div>
  );
}
