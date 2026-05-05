import React, { useState, useEffect, useRef } from "react";
import { SIDEBAR_GROUPS, loadSidebarState, saveSidebarState } from "@/config/moduleRegistry";

// ── Hamburger Icon ───────────────────────────────────────────────────
export function HamburgerMenu({ open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 32, height: 32, borderRadius: 8,
        background: "var(--hover-bg)", border: "1px solid var(--border)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 4, cursor: "pointer", flexShrink: 0,
      }}
    >
      {open ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
        </svg>
      ) : (
        <>
          <div style={{ width: 14, height: 1.5, background: "var(--text-secondary)", borderRadius: 1 }} />
          <div style={{ width: 10, height: 1.5, background: "var(--text-muted)", borderRadius: 1, alignSelf: "flex-start", marginLeft: 9 }} />
          <div style={{ width: 14, height: 1.5, background: "var(--text-secondary)", borderRadius: 1 }} />
        </>
      )}
    </button>
  );
}

// ── Mobile Drawer ────────────────────────────────────────────────────
export default function MobileDrawer({ open, onClose, onNavigate }) {
  const ref = useRef(null);
  const [mobileCollapsed, setMobileCollapsed] = useState(loadSidebarState);

  const toggleGroup = (label) => {
    setMobileCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      saveSidebarState(next);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  return (
    <>
      {open && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 900 }} />}
      <div ref={ref} className="sbd-sidebar" style={{
        position: "fixed", top: 0, left: 0, bottom: 0,
        width: "min(280px, 85vw)",
        zIndex: 950,
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        overflowY: "auto",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 16px 8px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center" }}>
          <img src="/logo.png" alt="SteelBuild Pro" style={{ height: 32, width: "auto", objectFit: "contain" }} />
        </div>
        <div style={{ padding: "4px 0 16px" }}>
          {SIDEBAR_GROUPS.map((group, groupIdx) => {
            const isCollapsed = group.collapsible && mobileCollapsed[group.label];
            return (
              <div key={group.label} style={{ marginTop: groupIdx === 0 ? 0 : 8 }}>
                <div
                  onClick={group.collapsible ? () => toggleGroup(group.label) : undefined}
                  style={{
                    padding: "8px 16px 4px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: group.collapsible ? "pointer" : "default", userSelect: "none",
                  }}
                >
                  <span className="sbd-nav-section" style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.1em", color: "var(--text-muted)",
                  }}>
                    {group.label}
                  </span>
                  {group.collapsible && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1 }}>
                      {isCollapsed ? "\u25B8" : "\u25BE"}
                    </span>
                  )}
                </div>
                <div style={{ display: isCollapsed ? "none" : "block" }}>
                  {group.items.map((item) => (
                    <button
                      key={item.page}
                      onClick={() => { onNavigate(item.page); onClose(); }}
                      className="sbd-nav-item"
                      style={{
                        width: "100%", textAlign: "left", padding: "7px 16px 7px 24px",
                        display: "flex", alignItems: "center", gap: 10,
                        fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)",
                        background: "none", border: "none", borderRadius: 0, cursor: "pointer",
                        borderLeft: "2px solid transparent", transition: "all 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--hover-bg)";
                        e.currentTarget.style.color = "var(--accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "none";
                        e.currentTarget.style.color = "var(--text-secondary)";
                      }}
                    >
                      <span style={{ fontSize: 13, width: 16, textAlign: "center", opacity: 0.55, flexShrink: 0 }}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
