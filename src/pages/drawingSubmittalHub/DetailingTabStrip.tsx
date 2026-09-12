import { useEffect, useRef, useState } from "react";
import type { ComponentType, KeyboardEvent } from "react";

export interface DetailingTabDef {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number | string }>;
}

interface DetailingTabStripProps {
  tabs: DetailingTabDef[];
  activeTab: string;
  onTab: (key: string) => void;
  tabCounts: Record<string, number>;
  alertTabs: readonly string[];
}

const TAB_SCROLL_GUTTER = 16;
export const DETAILING_PANEL_ID = "dcc-panel";
export const detailingTabId = (key: string) => `dcc-tab-${key}`;

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

/**
 * Manual-activation tablist: arrows move the roving focus without opening a
 * panel, while the browser's native Enter/Space button activation opens it.
 * The active tab is revealed one frame late so command-skin layout is settled.
 */
export function DetailingTabStrip({
  tabs,
  activeTab,
  onTab,
  tabCounts,
  alertTabs,
}: DetailingTabStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const isListed = (key: string | null | undefined): key is string =>
    Boolean(key) && tabs.some((tab) => tab.key === key);
  const tabbableKey = isListed(focusKey)
    ? focusKey
    : isListed(activeTab)
      ? activeTab
      : tabs[0]?.key;

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
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const last = tabs.length - 1;
    let target: number;
    switch (event.key) {
      case "ArrowRight":
        target = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        target = index === 0 ? last : index - 1;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = last;
        break;
      default:
        return;
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
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusKey(null);
        }
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
            id={detailingTabId(tab.key)}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={DETAILING_PANEL_ID}
            aria-label={count > 0 ? `${tab.label}, ${count}` : undefined}
            tabIndex={tab.key === tabbableKey ? 0 : -1}
            data-hub-tab={tab.key}
            onClick={() => {
              setFocusKey(null);
              onTab(tab.key);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`detailing-cc__tab${isActive ? " is-active" : ""}`}
          >
            <TabIcon size={14} />
            <span>{tab.label}</span>
            {count > 0 && (
              <span
                data-tab-count={tab.key}
                className={`detailing-cc__tab-count${alert ? " is-alert" : ""}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
