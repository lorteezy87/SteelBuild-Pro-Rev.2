/**
 * DesktopTopBar — the "Activities" bar for the desktop shell.
 * Left: Activities/Home (opens launcher) + project pill.
 * Center: active page title.
 * Right: search, theme, bell, user.
 */
import React from "react";
import { Grid3x3, Search } from "lucide-react";
import ProjectPillDropdown from "@/components/nav/ProjectPillDropdown";
import BellDropdown from "@/components/nav/BellDropdown";
import ThemeToggleButton from "@/components/nav/ThemeToggleButton";
import UserSignOutBlock from "@/components/nav/UserSignOutBlock";

function prettyTitle(page) {
  if (!page) return "Dashboard";
  return page.replace(/([A-Z])/g, " $1").trim();
}

export default function DesktopTopBar({
  currentPageName, title, onShowLauncher, onOpenSearch, user, onLogout,
  alerts, unreadCount, onMarkAllRead, onViewAllAlerts,
}) {
  return (
    <nav
      aria-label="Primary"
      style={{
        height: 34, minHeight: 34, padding: "0 12px",
        display: "flex", alignItems: "center", gap: 12,
        background: "var(--desk-topbar-bg)",
        color: "var(--text-primary)", position: "relative", zIndex: 50, flexShrink: 0,
      }}
    >
      <button
        onClick={onShowLauncher}
        aria-label="Show applications"
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none",
          border: "none", cursor: "pointer", color: "var(--accent)",
          fontFamily: "var(--font-body)", fontSize: 12, padding: "4px 6px", borderRadius: 6,
        }}
      >
        <Grid3x3 size={15} strokeWidth={1.9} aria-hidden="true" /> Activities
      </button>

      <ProjectPillDropdown align="left" />

      <span style={{
        margin: "0 auto", fontSize: 12, color: "var(--text-secondary)",
        fontFamily: "var(--font-body)",
      }}>
        {title || prettyTitle(currentPageName)}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onOpenSearch} aria-label="Search"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 6 }}
        >
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <ThemeToggleButton />
        <BellDropdown
          alerts={alerts} unreadCount={unreadCount}
          onMarkAllRead={onMarkAllRead} onViewAll={onViewAllAlerts}
        />
        <UserSignOutBlock user={user} onLogout={onLogout} />
      </div>
    </nav>
  );
}
