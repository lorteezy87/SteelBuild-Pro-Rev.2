/**
 * Dock — persistent left dock of module quick-links.
 *
 * Compact dark-glass chips, each a white lucide outline icon (getPageIcon) for
 * the user's dock set (localStorage override or DOCK_DEFAULT_PAGES), plus a Show
 * Applications button that opens the launcher. Active module gets an accent ring.
 * (Photos are reserved for the launcher tiles; the dock stays clean at chip size.)
 */
import React, { useMemo } from "react";
import { Grid3x3 } from "lucide-react";
import { getPageIcon } from "@/config/pageIcons";
import { dockModules } from "@/config/launcherConfig";

const DOCK_LS_KEY = "sbp-desktop-dock";

function loadDockPages() {
  try {
    const raw = localStorage.getItem(DOCK_LS_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch { return null; }
}

export default function Dock({ currentPageName, onNavigate, onShowLauncher }) {
  const items = useMemo(() => dockModules(loadDockPages() || undefined), []);

  return (
    <aside
      aria-label="Dock"
      style={{
        width: 56, flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "center", gap: 10, padding: "10px 0",
        margin: "8px 0 8px 8px", borderRadius: 16,
        background: "var(--desk-dock-bg)", border: "1px solid var(--desk-dock-edge)",
        position: "relative", zIndex: 10,
      }}
    >
      {items.map((m) => {
        const Icon = getPageIcon(m.page);
        const active = m.page === currentPageName;
        return (
          <button
            key={m.page}
            className="desk-dock-btn"
            onClick={() => onNavigate(m.page)}
            aria-label={m.label}
            aria-current={active ? "page" : undefined}
            title={m.label}
            style={{
              width: 40, height: 40, borderRadius: 11, padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              background: "var(--desk-tile)",
              border: active ? "1px solid var(--accent)" : "1px solid var(--desk-tile-edge)",
              boxShadow: "var(--desk-tile-shadow)",
              color: active ? "var(--accent)" : "#fff",
            }}
          >
            <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
          </button>
        );
      })}

      <button
        className="desk-dock-btn"
        onClick={onShowLauncher}
        aria-label="Show applications"
        title="Show applications"
        style={{
          marginTop: "auto", width: 40, height: 40, borderRadius: 11,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          color: "var(--text-secondary)", background: "var(--desk-tile)",
          border: "1px solid var(--desk-tile-edge)", boxShadow: "var(--desk-tile-shadow)",
        }}
      >
        <Grid3x3 size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </aside>
  );
}
