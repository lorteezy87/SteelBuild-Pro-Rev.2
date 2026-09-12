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

import { useEffect, useRef, useState } from "react";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import "@/styles/command.css";
import { KpiStrip, useCommandSkin } from "@/components/command";
import { DetailingCommandHeader } from "./DetailingCommandHeader";
import { buildDetailingKpiCells, buildFabReadyLine, buildStatusLine } from "./detailingKpis";
import type { DetailingKpis } from "./detailingKpis";

export type { DetailingKpis } from "./detailingKpis";

// ── Prop types ─────────────────────────────────────────────────────────────

/** One tab descriptor — same shape as TABS in format.ts / the hub's `tabs` memo. */
export interface TabDef {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number | string }>;
}

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

const tabId = (key: string) => `dcc-tab-${key}`;
const PANEL_ID = "dcc-panel";
/** The tab that owns the KPI strip. Every other tab shows the status line. */
const KPI_TAB = "overview";
const HOLDS_TAB = "holds";
/** Room kept beside a tab scrolled into view: the strip's side padding. */
const TAB_SCROLL_GUTTER = 16;

/**
 * The strip scrollLeft that brings a tab fully into view, or null when it
 * already is. `tab` is the tab's offsetLeft/offsetWidth inside the strip,
 * `strip` the strip's scrollLeft/clientWidth. Sideways only: revealing a tab
 * never scrolls the page.
 */
export function revealScrollLeft(
  strip: { scrollLeft: number; width: number },
  tab: { left: number; width: number },
  gutter: number = TAB_SCROLL_GUTTER,
): number | null {
  if (tab.left - gutter < strip.scrollLeft) return Math.max(0, tab.left - gutter);
  const end = tab.left + tab.width + gutter;
  if (end > strip.scrollLeft + strip.width) return end - strip.width;
  return null;
}

// ── Tab strip ──────────────────────────────────────────────────────────────

interface TabStripProps {
  tabs: TabDef[];
  activeTab: string;
  onTab: (key: string) => void;
  tabCounts: Record<string, number>;
  alertTabs: readonly string[];
}

/**
 * The header's bottom row: one line of tabs that scrolls sideways instead of
 * wrapping. It uses manual activation (WAI-ARIA tabs). ArrowLeft and
 * ArrowRight (both wrap), Home and End move focus. Enter or Space opens the
 * focused tab, as a click does.
 *
 * Why manual: tab switches push history, and each panel loads its own data,
 * so automatic activation would add a history entry and a fetch for every
 * tab arrowed past. Roving tabIndex follows focus and returns to the open tab
 * once focus leaves the strip. Modifier chords (Alt/Cmd+Arrow is the
 * browser's Back) are left alone.
 */
function DetailingTabStrip({ tabs, activeTab, onTab, tabCounts, alertTabs }: TabStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  // The tab keyboard focus sits on, while that differs from the open tab.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const isListed = (key: string | null | undefined): key is string => Boolean(key) && tabs.some((t) => t.key === key);
  // Something must be reachable by Tab even if the active key isn't listed.
  const tabbableKey = isListed(focusKey) ? focusKey : isListed(activeTab) ? activeTab : tabs[0]?.key;

  // Keep the active tab visible in the row, on load and on every change (Back
  // included). Measured a frame late on purpose. On mount the command skin
  // lands in the shell's own effect, which runs after this child's, and the
  // strip only becomes a scrolling row once that skin applies.
  useEffect(() => {
    const reveal = () => {
      const strip = stripRef.current;
      const tab = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!strip || !tab) return;
      const next = revealScrollLeft(
        { scrollLeft: strip.scrollLeft, width: strip.clientWidth },
        { left: tab.offsetLeft, width: tab.offsetWidth },
      );
      if (next !== null) strip.scrollLeft = next;
    };
    if (typeof window.requestAnimationFrame !== "function") {
      reveal();
      return undefined;
    }
    const frame = window.requestAnimationFrame(reveal);
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);

  const focusTab = (index: number) => {
    const target = tabs[index];
    if (!target) return;
    setFocusKey(target.key);
    stripRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    // Never swallow a chord. Alt/Cmd+Arrow is the browser's Back or Forward,
    // and Ctrl/Shift+Home/End belong to the platform or assistive tech.
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const last = tabs.length - 1;
    let target: number;
    switch (event.key) {
      case "ArrowRight": target = index === last ? 0 : index + 1; break;
      case "ArrowLeft": target = index === 0 ? last : index - 1; break;
      case "Home": target = 0; break;
      case "End": target = last; break;
      default: return;
    }
    event.preventDefault();
    focusTab(target);
  };

  return (
    <div
      ref={stripRef}
      className="detailing-cc__tabs"
      role="tablist"
      aria-label="Detailing Control Center tabs"
      // Focus leaving the strip hands the Tab stop back to the open tab.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusKey(null);
      }}
    >
      {tabs.map((tab, index) => {
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
            // Screen readers hear the count with the label: "Holds & Blockers, 2".
            aria-label={count > 0 ? `${tab.label}, ${count}` : undefined}
            tabIndex={tab.key === tabbableKey ? 0 : -1}
            data-hub-tab={tab.key}
            onClick={() => { setFocusKey(null); onTab(tab.key); }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`detailing-cc__tab${isActive ? " is-active" : ""}`}
          >
            <TabIcon size={14} />
            <span>{tab.label}</span>
            {count > 0 && (
              <span data-tab-count={tab.key} className={`detailing-cc__tab-count${alert ? " is-alert" : ""}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

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
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={tabId(activeTab)}
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
