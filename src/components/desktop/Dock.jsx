/**
 * Dock — persistent dock of module quick-links.
 *
 * Desktop: a vertical glass rail down the left side. Mobile: a horizontal
 * glass bar across the bottom (isMobile prop). Each chip is a white lucide
 * outline icon (getPageIcon) on a dark-glass tile; the icon color follows the
 * theme via --desk-tile-glyph so it stays legible in light mode. Active module
 * gets an accent ring. A Show Applications button opens the launcher.
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

export default function Dock({ currentPageName, onNavigate, onShowLauncher, isMobile = false }) {
  const items = useMemo(() => dockModules(loadDockPages() || undefined), []);

  const asideStyle = isMobile
    ? {
        width: "100%", height: 56, flexShrink: 0, display: "flex", flexDirection: "row",
        alignItems: "center", justifyContent: "flex-start", gap: 10, padding: "0 10px",
        overflowX: "auto", background: "var(--desk-dock-bg)",
        borderTop: "1px solid var(--desk-dock-edge)", position: "relative", zIndex: 10,
      }
    : {
        width: 56, flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "center", gap: 10, padding: "10px 0",
        margin: "8px 0 8px 8px", borderRadius: 16,
        background: "var(--desk-dock-bg)", border: "1px solid var(--desk-dock-edge)",
        position: "relative", zIndex: 10,
      };

  const chip = (extra) => ({
    width: 44, height: 44, borderRadius: 11, padding: 0, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    background: "var(--desk-tile)", boxShadow: "var(--desk-tile-shadow)",
    border: "1px solid var(--desk-tile-edge)", ...extra,
  });

  return (
    <aside aria-label="Dock" style={asideStyle}>
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
            style={chip({
              border: active ? "1px solid var(--accent)" : "1px solid var(--desk-tile-edge)",
              color: active ? "var(--accent)" : "var(--desk-tile-glyph)",
            })}
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
        style={chip({
          color: "var(--text-secondary)",
          [isMobile ? "marginLeft" : "marginTop"]: "auto",
        })}
      >
        <Grid3x3 size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </aside>
  );
}
