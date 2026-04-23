import React, { useState, useMemo, useEffect, useRef } from "react";
import { SIDEBAR_GROUPS, loadSidebarState, saveSidebarState } from "@/config/moduleRegistry";
import { ChevronsLeft, ChevronsRight, Search, Clock } from "lucide-react";

// ── Group accent colors (subtle section hues) ───────────────────────
const GROUP_ACCENTS = {
  "OVERVIEW":            "#E0B030", // gold
  "PROJECT MANAGEMENT":  "#58A6FF", // blue
  "DESIGN & DRAWINGS":   "#0D9488", // violet
  "PRODUCTION":          "#3FB950", // green
  "FINANCIALS":          "#E3B341", // amber
  "DOCUMENTS & REPORTS": "#06B6D4", // cyan
  "FIELD":               "#F97316", // orange
  "ADMINISTRATION":      "#8C909F", // gray
};

const RAIL_LS_KEY = "sbp-sidebar-rail";
const RECENTS_LS_KEY = "sbp-sidebar-recents";
const MAX_RECENTS = 4;

function loadRailState() {
  try { return localStorage.getItem(RAIL_LS_KEY) === "1"; } catch { return false; }
}
function saveRailState(v) {
  try { localStorage.setItem(RAIL_LS_KEY, v ? "1" : "0"); } catch { /* noop */ }
}
function loadRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveRecents(pages) {
  try { localStorage.setItem(RECENTS_LS_KEY, JSON.stringify(pages)); } catch { /* noop */ }
}

export default function SidebarNav({ currentPageName, onNavigate, visible }) {
  const [collapsed, setCollapsed] = useState(loadSidebarState);
  const [railMode, setRailMode] = useState(loadRailState);
  const [recents, setRecents] = useState(loadRecents);
  const [hoveredItem, setHoveredItem] = useState(null);
  const navRef = useRef(null);
  const itemRefs = useRef({});
  const [indicator, setIndicator] = useState({ top: 0, height: 0, visible: false });

  // Track recent pages
  useEffect(() => {
    if (!currentPageName) return;
    setRecents((prev) => {
      const next = [currentPageName, ...prev.filter((p) => p !== currentPageName)].slice(0, MAX_RECENTS);
      saveRecents(next);
      return next;
    });
  }, [currentPageName]);

  // Position the sliding active indicator
  useEffect(() => {
    if (railMode) { setIndicator((i) => ({ ...i, visible: false })); return; }
    const el = itemRefs.current[currentPageName];
    if (el && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      setIndicator({
        top: rect.top - navRect.top + navRef.current.scrollTop,
        height: rect.height,
        visible: true,
      });
    } else {
      setIndicator((i) => ({ ...i, visible: false }));
    }
  }, [currentPageName, collapsed, railMode]);

  const toggleGroup = (label) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      saveSidebarState(next);
      return next;
    });
  };

  const toggleRail = () => {
    setRailMode((r) => {
      const next = !r;
      saveRailState(next);
      return next;
    });
  };

  const allCollapsibleGroups = SIDEBAR_GROUPS.filter((g) => g.collapsible);
  const anyExpanded = allCollapsibleGroups.some((g) => !collapsed[g.label]);

  const toggleAll = () => {
    const newState = {};
    const shouldCollapse = anyExpanded;
    allCollapsibleGroups.forEach((g) => { newState[g.label] = shouldCollapse; });
    setCollapsed(newState);
    saveSidebarState(newState);
  };

  const recentItems = useMemo(() => {
    const flat = SIDEBAR_GROUPS.flatMap((g) =>
      g.items.map((it) => ({ ...it, _group: g.label }))
    );
    return recents
      .map((p) => flat.find((it) => it.page === p))
      .filter(Boolean)
      .filter((it) => it.page !== currentPageName)
      .slice(0, 3);
  }, [recents, currentPageName]);

  if (!visible) return null;

  const width = railMode ? 64 : 220;

  // Trigger global search via keyboard event (Cmd/Ctrl + K)
  const openGlobalSearch = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  };

  return (
    <div style={{
      width, minWidth: width,
      background: "var(--glass-bg, var(--bg-sidebar))",
      borderRight: "1px solid var(--glass-border, var(--border-default))",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      overflowY: "auto", overflowX: "hidden",
      display: "flex", flexDirection: "column", flexShrink: 0, height: "100%",
      transition: "width 0.22s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
      position: "relative",
    }}>

      {/* ── Top bar: rail toggle + collapse-all ───────────────────── */}
      <div style={{
        padding: railMode ? "10px 8px 4px" : "10px 14px 2px",
        display: "flex",
        justifyContent: railMode ? "center" : "space-between",
        alignItems: "center",
        gap: 6,
      }}>
        {!railMode && (
          <button
            onClick={toggleAll}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
              letterSpacing: "0.10em", color: "var(--text-muted)",
              padding: "2px 4px", borderRadius: 3, transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {anyExpanded ? "COLLAPSE ALL" : "EXPAND ALL"}
          </button>
        )}
        <button
          onClick={toggleRail}
          title={railMode ? "Expand sidebar" : "Collapse to icons"}
          aria-label={railMode ? "Expand sidebar" : "Collapse to icons"}
          style={{
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            width: 24, height: 24,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-muted)",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent-border)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-default)"; }}
        >
          {railMode ? <ChevronsRight size={12} /> : <ChevronsLeft size={12} />}
        </button>
      </div>

      {/* ── Quick search trigger ──────────────────────────────────── */}
      <div style={{ padding: railMode ? "6px 8px 0" : "6px 14px 0" }}>
        <button
          onClick={openGlobalSearch}
          title="Quick search (Ctrl/Cmd+K)"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: railMode ? "center" : "flex-start",
            gap: 8,
            padding: railMode ? "7px 0" : "7px 10px",
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            borderRadius: 7,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <Search size={12} />
          {!railMode && (
            <>
              <span style={{ flex: 1, textAlign: "left" }}>Search…</span>
              <span style={{
                fontSize: 8,
                padding: "2px 5px",
                borderRadius: 3,
                background: "var(--bg-surface)",
                border: "1px solid var(--divider)",
                letterSpacing: "0.06em",
              }}>⌘K</span>
            </>
          )}
        </button>
      </div>

      {/* ── Navigation groups ─────────────────────────────────────── */}
      <nav
        ref={navRef}
        style={{ flex: 1, padding: "10px 0 12px", position: "relative" }}
      >
        {/* Sliding active indicator (expanded mode only) */}
        {indicator.visible && !railMode && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: indicator.top,
              height: indicator.height,
              width: 2,
              background: "var(--accent)",
              borderRadius: "0 2px 2px 0",
              boxShadow: "0 0 10px rgba(200,155,32,0.55)",
              transition: "top 0.22s cubic-bezier(0.4, 0, 0.2, 1), height 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        )}

        {SIDEBAR_GROUPS.map((group, groupIdx) => {
          const isCollapsed = group.collapsible && collapsed[group.label];
          const accent = GROUP_ACCENTS[group.label] || "var(--text-muted)";
          return (
            <div key={group.label} style={{ marginTop: groupIdx === 0 ? 0 : (railMode ? 6 : 10) }}>
              {/* Group header */}
              {railMode ? (
                // Rail mode: thin colored divider
                groupIdx > 0 && (
                  <div
                    style={{
                      height: 2,
                      margin: "4px 14px 6px",
                      background: `linear-gradient(to right, ${accent}, transparent)`,
                      borderRadius: 1,
                      opacity: 0.45,
                    }}
                  />
                )
              ) : (
                <div
                  onClick={group.collapsible ? () => toggleGroup(group.label) : undefined}
                  style={{
                    padding: "6px 14px 4px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: group.collapsible ? "pointer" : "default",
                    userSelect: "none", transition: "color 0.12s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 6, height: 6,
                      borderRadius: "50%",
                      background: accent,
                      boxShadow: `0 0 6px ${accent}`,
                      flexShrink: 0,
                    }} />
                    <span data-group-label="" style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.12em", color: "var(--text-muted)", transition: "color 0.12s",
                    }}>
                      {group.label}
                    </span>
                  </div>
                  {group.collapsible && (
                    <span data-group-chevron="" style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
                      transition: "transform 0.2s, color 0.12s", lineHeight: 1,
                      transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                      display: "inline-block",
                    }}>
                      {"\u25BE"}
                    </span>
                  )}
                </div>
              )}

              {/* Group items */}
              <div style={{
                display: (!railMode && isCollapsed) ? "none" : "block",
                overflow: "hidden",
              }}>
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.page}
                    item={item}
                    accent={accent}
                    active={currentPageName === item.page}
                    railMode={railMode}
                    hovered={hoveredItem === item.page}
                    onHover={setHoveredItem}
                    setRef={(el) => { if (el) itemRefs.current[item.page] = el; }}
                    onClick={() => onNavigate(item.page)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Recent section (expanded only, if any) ────────────────── */}
      {!railMode && recentItems.length > 0 && (
        <div style={{
          padding: "10px 14px 14px",
          borderTop: "1px solid var(--divider)",
          background: "rgba(255,255,255,0.015)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            letterSpacing: "0.12em", color: "var(--text-muted)",
            marginBottom: 6,
          }}>
            <Clock size={9} /> RECENT
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recentItems.map((it) => (
              <button
                key={it.page}
                onClick={() => onNavigate(it.page)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "4px 6px",
                  background: "none", border: "none", borderRadius: 4,
                  cursor: "pointer", width: "100%", textAlign: "left",
                  fontFamily: "var(--font-body)", fontSize: 11,
                  color: "var(--text-muted)",
                  transition: "all 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--nav-hover-bg)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                <span style={{ fontSize: 11, width: 14, textAlign: "center", opacity: 0.6 }}>{it.icon}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarLink({ item, accent, active, railMode, hovered, onHover, onClick, setRef }) {
  const [isHovered, setIsHovered] = useState(false);

  const commonProps = {
    ref: setRef,
    onClick,
    onMouseEnter: () => { setIsHovered(true); onHover?.(item.page); },
    onMouseLeave: () => { setIsHovered(false); onHover?.(null); },
  };

  if (railMode) {
    return (
      <div style={{ position: "relative" }}>
        <button
          {...commonProps}
          title={item.label}
          aria-label={item.label}
          style={{
            width: 44, height: 36,
            margin: "2px auto",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: active
              ? `linear-gradient(135deg, ${accent}22, ${accent}08)`
              : isHovered ? "var(--nav-hover-bg)" : "transparent",
            border: active ? `1px solid ${accent}55` : "1px solid transparent",
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.14s",
            position: "relative",
          }}
        >
          <span style={{
            fontSize: 15,
            color: active ? accent : isHovered ? "var(--text-primary)" : "var(--text-secondary)",
            filter: active ? `drop-shadow(0 0 6px ${accent}88)` : "none",
            transition: "all 0.14s",
          }}>
            {item.icon}
          </span>
          {active && (
            <span style={{
              position: "absolute",
              left: -6,
              top: 6, bottom: 6,
              width: 2,
              borderRadius: "0 2px 2px 0",
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
            }} />
          )}
        </button>
        {/* Tooltip on hover */}
        {isHovered && (
          <div
            style={{
              position: "absolute",
              left: 56,
              top: "50%",
              transform: "translateY(-50%)",
              background: "var(--bg-elevated)",
              border: `1px solid ${accent}44`,
              borderRadius: 6,
              padding: "5px 10px",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              zIndex: 1000,
              pointerEvents: "none",
            }}
          >
            {item.label}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      {...commonProps}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 14px 8px 22px",
        background: active
          ? `linear-gradient(90deg, ${accent}18, transparent 70%)`
          : isHovered ? "var(--nav-hover-bg)" : "transparent",
        border: "none",
        cursor: "pointer",
        transition: "all 0.14s ease",
        userSelect: "none", textAlign: "left", borderRadius: 0,
        position: "relative",
      }}
    >
      <span style={{
        fontSize: 13, width: 16, textAlign: "center",
        color: active ? accent : isHovered ? "var(--text-primary)" : "var(--text-secondary)",
        opacity: active ? 1 : (isHovered ? 0.85 : 0.55),
        filter: active ? `drop-shadow(0 0 5px ${accent}aa)` : "none",
        flexShrink: 0,
        transition: "all 0.14s",
      }}>
        {item.icon}
      </span>
      <span style={{
        fontFamily: "var(--font-body)", fontSize: 12,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--text-primary)" : isHovered ? "var(--text-primary)" : "var(--text-secondary)",
        flex: 1, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        letterSpacing: active ? "0.01em" : "0",
        transition: "all 0.14s",
      }}>
        {item.label}
      </span>
    </button>
  );
}
