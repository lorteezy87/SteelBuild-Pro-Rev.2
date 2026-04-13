import React, { useState } from "react";
import { SIDEBAR_GROUPS, loadSidebarState, saveSidebarState } from "@/config/moduleRegistry";

export default function SidebarNav({ currentPageName, onNavigate, visible }) {
  const [collapsed, setCollapsed] = useState(loadSidebarState);

  const toggle = (label) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      saveSidebarState(next);
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

  if (!visible) return null;

  return (
    <div style={{
      width: 220, minWidth: 220,
      background: "var(--glass-bg, var(--nav-bg))", borderRight: "1px solid var(--glass-border, var(--border-default))",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      overflowY: "auto", overflowX: "hidden",
      display: "flex", flexDirection: "column", flexShrink: 0, height: "100%",
    }}>
      {/* Collapse All / Expand All toggle */}
      <div style={{ padding: "10px 16px 2px", display: "flex", justifyContent: "flex-end" }}>
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
      </div>

      {/* Navigation groups */}
      <nav aria-label="Sections" style={{ flex: 1, padding: "0 0 16px" }}>
        {SIDEBAR_GROUPS.map((group, groupIdx) => {
          const isCollapsed = group.collapsible && collapsed[group.label];
          return (
            <div key={group.label} style={{ marginTop: groupIdx === 0 ? 0 : 8 }}>
              {/* Group header */}
              <div
                onClick={group.collapsible ? () => toggle(group.label) : undefined}
                style={{
                  padding: "8px 16px 4px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: group.collapsible ? "pointer" : "default",
                  userSelect: "none", transition: "color 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (group.collapsible) {
                    const label = e.currentTarget.querySelector("[data-group-label]");
                    if (label) label.style.color = "var(--text-secondary)";
                    const chev = e.currentTarget.querySelector("[data-group-chevron]");
                    if (chev) chev.style.color = "var(--text-secondary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (group.collapsible) {
                    const label = e.currentTarget.querySelector("[data-group-label]");
                    if (label) label.style.color = "var(--text-muted)";
                    const chev = e.currentTarget.querySelector("[data-group-chevron]");
                    if (chev) chev.style.color = "var(--text-muted)";
                  }
                }}
              >
                <span data-group-label="" style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.1em", color: "var(--text-muted)", transition: "color 0.12s",
                }}>
                  {group.label}
                </span>
                {group.collapsible && (
                  <span data-group-chevron="" style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
                    transition: "color 0.12s", lineHeight: 1,
                  }}>
                    {isCollapsed ? "\u25B8" : "\u25BE"}
                  </span>
                )}
              </div>

              {/* Group items */}
              <div style={{ display: isCollapsed ? "none" : "block" }}>
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.page}
                    item={item}
                    active={currentPageName === item.page}
                    onClick={() => onNavigate(item.page)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarLink({ item, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "7px 16px 7px 24px",
        background: active ? "var(--accent-muted)" : hovered ? "var(--nav-hover-bg)" : "transparent",
        border: "none",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        cursor: "pointer", transition: "all 0.1s ease",
        userSelect: "none", textAlign: "left", borderRadius: 0,
      }}
    >
      <span style={{ fontSize: 13, width: 16, textAlign: "center", opacity: active ? 0.9 : 0.55, flexShrink: 0 }}>
        {item.icon}
      </span>
      <span style={{
        fontFamily: "var(--font-body)", fontSize: 12,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--accent)" : hovered ? "var(--text-primary)" : "var(--text-secondary)",
        flex: 1, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {item.label}
      </span>
    </button>
  );
}
