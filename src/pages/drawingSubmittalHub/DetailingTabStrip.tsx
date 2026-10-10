import { useEffect, useRef, useState } from "react";
import type { ComponentType, KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";

export interface DetailingTabDef {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number | string }>;
}

interface DetailingTabStripProps {
  tabs: DetailingTabDef[];
  /** Leave omitted for legacy callers that display every tab. */
  primaryKeys?: readonly string[];
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
  primaryKeys,
  activeTab,
  onTab,
  tabCounts,
  alertTabs,
}: DetailingTabStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const toolsTriggerRef = useRef<HTMLButtonElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const focusToolOnOpen = useRef<"first" | "last" | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const primaryTabs = primaryKeys
    ? tabs.filter((tab) => primaryKeys.includes(tab.key))
    : tabs;
  const secondaryTabs = primaryKeys
    ? tabs.filter((tab) => !primaryKeys.includes(tab.key))
    : [];
  const activeSecondary = secondaryTabs.find((tab) => tab.key === activeTab);
  const isListed = (key: string | null | undefined): key is string =>
    Boolean(key) && primaryTabs.some((tab) => tab.key === key);
  const tabbableKey = isListed(focusKey)
    ? focusKey
    : isListed(activeTab)
      ? activeTab
      : primaryTabs[0]?.key;

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

  useEffect(() => {
    if (!toolsOpen || !focusToolOnOpen.current) return;
    const items = toolsMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    const target = focusToolOnOpen.current === "last" ? items?.[items.length - 1] : items?.[0];
    focusToolOnOpen.current = null;
    target?.focus();
  }, [toolsOpen]);

  const focusTab = (index: number) => {
    const target = primaryTabs[index];
    if (!target) return;
    setFocusKey(target.key);
    stripRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const last = primaryTabs.length - 1;
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
    <div className="detailing-cc__nav">
    <div
      ref={stripRef}
      className="detailing-cc__tabs"
      role="tablist"
      aria-label="Drawing Control work areas"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusKey(null);
        }
      }}
    >
      {primaryTabs.map((tab, index) => {
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
    {secondaryTabs.length > 0 && (
      <div
        className="detailing-cc__tools"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToolsOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && toolsOpen) {
            event.preventDefault();
            setToolsOpen(false);
            toolsTriggerRef.current?.focus();
            return;
          }
          if (!toolsOpen && event.target === toolsTriggerRef.current && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            focusToolOnOpen.current = event.key === "ArrowUp" ? "last" : "first";
            setToolsOpen(true);
            return;
          }
          if (!toolsOpen || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const items = Array.from(toolsMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
          const index = items.indexOf(event.target as HTMLButtonElement);
          if (index < 0 || items.length === 0) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0
            : event.key === "End" ? items.length - 1
              : event.key === "ArrowDown" ? (index + 1) % items.length
                : (index - 1 + items.length) % items.length;
          items[next]?.focus();
        }}
      >
        <button
          ref={toolsTriggerRef}
          type="button"
          className={`detailing-cc__tools-trigger${activeSecondary ? " is-active" : ""}`}
          aria-label={activeSecondary ? `More tools: ${activeSecondary.label}` : "More tools"}
          aria-haspopup="menu"
          aria-expanded={toolsOpen}
          onClick={(event) => {
            if (!toolsOpen && event.detail === 0) focusToolOnOpen.current = "first";
            setToolsOpen((open) => !open);
          }}
        >
          <span>{activeSecondary ? activeSecondary.label : "More tools"}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {toolsOpen && (
          <div ref={toolsMenuRef} className="detailing-cc__tools-menu" role="menu" aria-label="Drawing control tools">
            {secondaryTabs.map((tab) => {
              const ToolIcon = tab.icon;
              const count = tabCounts[tab.key] ?? 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="menuitem"
                  aria-current={activeTab === tab.key ? "page" : undefined}
                  onClick={() => {
                    setToolsOpen(false);
                    onTab(tab.key);
                  }}
                >
                  <ToolIcon size={14} aria-hidden="true" />
                  <span>{tab.label}</span>
                  {count > 0 && <span className="detailing-cc__tools-count">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    )}
    </div>
  );
}
