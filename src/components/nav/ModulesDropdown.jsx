import React, { useState, useEffect, useRef } from "react";
import { NAV_GROUPS, getDropdownColumn } from "@/config/moduleRegistry";
import { prefetchRoute } from "@/lib/routePrefetch";

export default function ModulesDropdown({ open, onClose, onNavigate, userRole, alertCounts = {} }) {
  const ref = useRef(null);
  const [search, setSearch] = useState("");
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  useEffect(() => { if (!open) setSearch(""); }, [open]);

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (!open) return null;

  const isMobile = windowWidth < 760;
  const dropdownWidth = isMobile ? 280 : 720;
  const isSearching = search.trim().length > 0;

  const searchResults = isSearching
    ? NAV_GROUPS.flatMap((g) => g.items).filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
    : [];

  const columns = [[], [], []];
  NAV_GROUPS.forEach((group) => { columns[getDropdownColumn(group.label)].push(group); });

  const totalModules = NAV_GROUPS.flatMap((g) => g.items).length;

  return (
    <div ref={ref} className="sbd-card" style={{
      position: "absolute", top: "calc(100% + 4px)", right: 0,
      width: dropdownWidth,
      // Theme-aware opaque surface so light-mode text stays legible (was a
      // hardcoded dark navy gradient that left dark text unreadable in light mode).
      background: "var(--bg-surface-secondary)",
      backdropFilter: "none",
      WebkitBackdropFilter: "none",
      border: "1px solid color-mix(in srgb, var(--accent) 34%, var(--border-default))",
      borderRadius: "var(--radius-card)",
      boxShadow: "0 28px 80px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.07)",
      zIndex: 3000,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      maxHeight: isMobile ? "calc(100vh - 72px)" : "auto",
    }}>
      {/* Search bar */}
      <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}>
        <input
          placeholder="Search modules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: "100%", background: "var(--bg-input, var(--bg-page))", border: "1px solid var(--accent-border)",
            borderRadius: 6, padding: "6px 10px", color: "var(--text-primary)",
            fontFamily: "var(--font-body)", fontSize: 12, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* 3-column grid (hidden when searching) */}
      {!isSearching && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
          alignItems: "start", gap: 0,
          padding: isMobile ? "6px 0 12px" : "6px 0 12px",
          overflowY: isMobile ? "auto" : "visible",
          maxHeight: isMobile ? "calc(100vh - 140px)" : "none",
        }}>
          {columns.map((column, colIdx) => (
            <div key={colIdx} style={{ borderRight: colIdx < 2 && !isMobile ? "1px solid rgba(255,255,255,0.095)" : "none", padding: "0" }}>
              {column.map((group, groupIdx) => (
                <div key={group.label}>
                  <div className="sbd-nav-section" style={{
                    padding: "8px 14px 3px",
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.20em", color: "var(--accent)",
                    borderTop: groupIdx === 0 ? "none" : "1px solid var(--divider)",
                    marginTop: groupIdx === 0 ? 0 : 4, userSelect: "none",
                  }}>
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <NavItem
                      key={item.page}
                      item={item}
                      userRole={userRole}
                      alertCounts={alertCounts}
                      onNavigate={onNavigate}
                      onClose={onClose}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Search results (flat list) */}
      {isSearching && (
        <div style={{ padding: "4px 0 8px", maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
          {searchResults.length > 0 ? (
            searchResults.map((item) => (
              <NavItem
                key={item.page}
                item={item}
                userRole={userRole}
                alertCounts={alertCounts}
                onNavigate={onNavigate}
                onClose={onClose}
              />
            ))
          ) : (
            <div style={{
              padding: "20px 14px", textAlign: "center",
              fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)",
            }}>
              No modules match &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{
        borderTop: "1px solid var(--border-default)", padding: "7px 14px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "var(--bg-surface)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 800,
            letterSpacing: "-0.02em", color: "var(--accent)", textTransform: "uppercase",
          }}>
            STEELBUILD
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 500,
            letterSpacing: "0.20em", color: "var(--text-muted)", textTransform: "uppercase", marginTop: 1,
          }}>
            PRO &middot; REV 2
          </span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>
          {totalModules} MODULES
        </span>
      </div>
    </div>
  );
}

function NavItem({ item, userRole, alertCounts, onNavigate, onClose }) {
  const isAdminOnly = item.adminOnly && userRole !== "admin";
  const warmRoute = () => {
    if (!isAdminOnly) prefetchRoute(item.page);
  };
  return (
    <div
      onClick={() => { if (!isAdminOnly) { onNavigate(item.page); onClose(); } }}
      className="sbd-nav-item"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "7px 14px", cursor: isAdminOnly ? "not-allowed" : "pointer",
        borderLeft: "2px solid transparent", borderRadius: 0,
        transition: "all 0.1s ease", userSelect: "none",
        opacity: isAdminOnly ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isAdminOnly) {
          warmRoute();
          e.currentTarget.style.background = "rgba(86,176,255,0.12)";
          e.currentTarget.style.borderLeft = "2px solid var(--accent)";
        }
      }}
      onFocus={warmRoute}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderLeft = "2px solid transparent";
      }}
      title={isAdminOnly ? "Admin only" : ""}
    >
      <span style={{ fontSize: 13, width: 16, textAlign: "center", opacity: 0.65, flexShrink: 0 }}>
        {item.icon}
      </span>
      <span style={{
        fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
        color: "var(--text-primary)", flex: 1, lineHeight: 1.2,
      }}>
        {item.label}
        {isAdminOnly && <span style={{ fontSize: 10, color: "var(--status-error-bright)", marginLeft: 6 }}>{"\uD83D\uDC51"}</span>}
      </span>
      {item.badgeKey && alertCounts[item.badgeKey] > 0 && (
        <span className="sbd-badge sbd-badge-error" style={{
          background: "var(--status-error)", color: "white", borderRadius: 10,
          padding: "1px 6px", fontSize: 8, fontFamily: "var(--font-mono)",
          fontWeight: 700, minWidth: 16, textAlign: "center",
        }}>
          {alertCounts[item.badgeKey]}
        </span>
      )}
    </div>
  );
}
