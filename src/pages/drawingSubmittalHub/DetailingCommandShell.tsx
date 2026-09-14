/**
 * DetailingCommandShell — canonical shell for the Detailing Control Center.
 *
 * SHELL ONLY. Every tab panel, modal, mutation, escalation, and data-fetch
 * lives in DrawingSubmittalHub.tsx and is passed through via `children`.
 * This file never touches data or workflow logic.
 *
 * Layout follows SteelBuild-Pro-2026's compact command header (owner decision
 * 2, 2026-09-11). The header holds the project eyebrow, the h1 with its holds
 * badge, the subtitle, a status line, and Lead Times, with the tab strip as
 * its bottom row. Every tab but the Control Board gets the full status line;
 * the Control Board gets only Fab Ready, beside its KPI strip. The active
 * panel follows, and the KPI strip opens the Control Board's panel.
 * DetailingNoProject is the explicit empty state for "no project selected".
 *
 * Rendered unconditionally by DrawingSubmittalHub.
 */

import type { ReactNode } from "react";
import "@/styles/command.css";
import { KpiStrip, useCommandSkin } from "@/components/command";
import { DetailingCommandHeader } from "./DetailingCommandHeader";
import {
  DETAILING_PANEL_ID,
  DetailingTabStrip,
  detailingTabId,
} from "./DetailingTabStrip";
import type { DetailingTabDef } from "./DetailingTabStrip";
import { buildDetailingKpiCells, buildFabReadyLine, buildStatusLine } from "./detailingKpis";
import type { DetailingKpis } from "./detailingKpis";

export type { DetailingKpis } from "./detailingKpis";
export { revealScrollLeft } from "./DetailingTabStrip";

// ── Prop types ─────────────────────────────────────────────────────────────

/** One tab descriptor — same shape as TABS in format.ts / the hub's `tabs` memo. */
export type TabDef = DetailingTabDef;

interface DetailingCommandShellProps {
  tabs: TabDef[];
  activeTab: string;
  onTab: (key: string) => void;
  kpis: DetailingKpis;
  /** The active project, for the header's eyebrow ("24-117 · Mesa Gateway"). */
  projectName?: string | null;
  projectNumber?: string | null;
  /** True while the underlying queries are still resolving. */
  isLoading?: boolean;
  /**
   * Active sheet holds — the Holds tab's Active-table count over the same
   * query. null/undefined while unknown, so the header never claims "No holds"
   * before it has checked.
   */
  activeHolds?: number | null;
  /** Header actions (e.g. Lead Times). Optional. */
  actions?: ReactNode;
  /** Tab-count badge values, keyed by tab key. */
  tabCounts: Record<string, number>;
  /** Tabs whose count is a warning (e.g. holds) rather than a row tally. */
  alertTabs?: readonly string[];
  /** The active tab panel rendered by the hub (unchanged). */
  children: ReactNode;
}

/** The tab that owns the KPI strip. Every other tab shows the status line. */
const KPI_TAB = "overview";
const HOLDS_TAB = "holds";
// ── Shell component ────────────────────────────────────────────────────────

export function DetailingCommandShell({
  tabs,
  activeTab,
  onTab,
  kpis,
  projectName,
  projectNumber,
  tabCounts,
  alertTabs = [],
  activeHolds,
  actions,
  isLoading,
  children,
}: DetailingCommandShellProps) {
  useCommandSkin();

  // Every number reads "—" until the queries answer (see buildDetailingKpiCells).
  const pending = Boolean(isLoading);
  const onKpiTab = activeTab === KPI_TAB;
  const hasHoldsTab = tabs.some((t) => t.key === HOLDS_TAB);

  return (
    <div className="detailing-cc">
      <DetailingCommandHeader
        projectName={projectName}
        projectNumber={projectNumber}
        activeHolds={activeHolds}
        onOpenHolds={hasHoldsTab ? () => onTab(HOLDS_TAB) : undefined}
        // The Control Board carries the KPI strip. That strip's grid is shared
        // by every Control Center and has no Fab Ready cell, so the Control
        // Board keeps just that number here. Every other tab gets the headline
        // numbers as one line.
        statusLine={onKpiTab ? buildFabReadyLine(kpis, pending) : buildStatusLine(kpis, pending)}
        actions={actions}
      >
        <DetailingTabStrip
          tabs={tabs}
          activeTab={activeTab}
          onTab={onTab}
          tabCounts={tabCounts}
          alertTabs={alertTabs}
        />
      </DetailingCommandHeader>

      {/* Tab panel slot — the hub renders the existing active-tab JSX here unchanged */}
      <div
        className="detailing-cc__panel"
        id={DETAILING_PANEL_ID}
        role="tabpanel"
        aria-labelledby={detailingTabId(activeTab)}
        data-hub-panel={activeTab}
      >
        {onKpiTab && <KpiStrip cells={buildDetailingKpiCells(kpis, pending)} />}
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
      <DetailingCommandHeader />
      <div role="status" className="detailing-cc__empty">
        <div className="detailing-cc__empty-title">No active project</div>
        <div className="detailing-cc__empty-body">
          Pick a project from the project selector to open its Detailing Control Center.
        </div>
      </div>
    </div>
  );
}
