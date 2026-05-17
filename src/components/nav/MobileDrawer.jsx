import React, { useState, useEffect, useRef } from "react";
import { SIDEBAR_GROUPS, loadSidebarState, saveSidebarState } from "@/config/moduleRegistry";

export default function MobileDrawer({ open, onClose, onNavigate, currentPageName }) {
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
    const originalOverflow = document.body.style.overflow;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      {open && <div style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 900,
      }} />}
      <div
        ref={ref}
        className="mobile-drawer-panel sbd-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        aria-hidden={!open}
        style={{
        position: "fixed", top: 0, left: 0, bottom: 0,
        width: "min(360px, 92vw)",
        zIndex: 950,
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        overflowY: "auto",
        background: "linear-gradient(180deg, rgba(5, 9, 18, 0.995) 0%, rgba(7, 13, 24, 0.995) 100%)",
        display: "flex", flexDirection: "column",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}>
        <div style={{
          padding: "max(14px, env(safe-area-inset-top)) 16px 10px",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <img src="/logo.png" alt="SteelBuild Pro" style={{ height: 32, width: "auto", objectFit: "contain" }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
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
                  {group.items.map((item) => {
                    const isActive = item.page === currentPageName;
                    return (
                      <button
                        key={item.page}
                        onClick={() => { onNavigate(item.page); onClose(); }}
                        className="sbd-nav-item"
                        aria-current={isActive ? "page" : undefined}
                        style={{
                          width: "100%", textAlign: "left", padding: "10px 16px 10px 22px",
                          minHeight: 44,
                          display: "flex", alignItems: "center", gap: 12,
                          fontFamily: "var(--font-body)", fontSize: 14,
                          color: isActive ? "var(--accent)" : "var(--text-secondary)",
                          background: isActive ? "var(--accent-muted)" : "transparent",
                          border: "none", borderRadius: 0, cursor: "pointer",
                          borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
                          transition: "all 0.1s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--hover-bg)";
                          e.currentTarget.style.color = "var(--accent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isActive ? "var(--accent-muted)" : "transparent";
                          e.currentTarget.style.color = isActive ? "var(--accent)" : "var(--text-secondary)";
                        }}
                      >
                        <span style={{ fontSize: 15, width: 18, textAlign: "center", opacity: isActive ? 0.9 : 0.62, flexShrink: 0 }}>{item.icon}</span>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
