import React from "react";
import { shortcutKeyLabel } from "@/lib/browser";
import { useTheme } from "@/components/shared/ThemeContext";

/**
 * TopBarSearchButton — compact icon-only button in the top utility bar
 * that opens the global search modal.
 *
 * Was a 180px-wide pill labeled "Search... Ctrl+K" duplicating the
 * SidebarNav search affordance. The sidebar entry is the single source
 * of truth for global search now; we keep a compact icon-only button up
 * here so the action is reachable even with the sidebar collapsed or on
 * routes without it. The Cmd/Ctrl+K shortcut is still wired in
 * useGlobalSearchShortcut and stays unique app-wide.
 *
 * Extracted from Layout.jsx (see git history).
 */
export default function TopBarSearchButton({ onClick, compact = false }) {
  const { theme } = useTheme();
  const isLightSearch = theme === "light" && !compact;

  return (
    <button
      onClick={onClick}
      title={`Search (${shortcutKeyLabel("K")})`}
      aria-label="Open global search"
      className={`sbd-btn-ghost topbar-search-button${isLightSearch ? " is-light-search" : ""}`}
      style={{
        height: 32,
        width: isLightSearch ? 312 : 32,
        borderRadius: isLightSearch ? 2 : 8,
        background: "var(--hover-bg)", border: "1px solid var(--border-default)",
        display: "flex", alignItems: "center", justifyContent: isLightSearch ? "flex-start" : "center",
        gap: isLightSearch ? 8 : 0,
        cursor: "pointer", color: "var(--text-muted)", transition: "all 0.15s",
        padding: isLightSearch ? "0 10px" : 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-muted)"; e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="6" /><line x1="14" y1="14" x2="19" y2="19" />
      </svg>
      {isLightSearch && (
        <span style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          Search projects, submittals, RFIs, drawings...
        </span>
      )}
    </button>
  );
}
