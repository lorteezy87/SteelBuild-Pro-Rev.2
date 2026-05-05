/**
 * Layout.jsx - Application shell
 *
 * Thin composition layer that wires together:
 *  - Top utility bar (brand, search, density, modules, bell, user, project)
 *  - Desktop sidebar navigation
 *  - Mobile hamburger drawer
 *  - Content area with error banner
 *  - Global search modal, quick-add FAB, toast notifications
 *
 * All data definitions live in src/config/moduleRegistry.js.
 * All sub-components live in src/components/nav/.
 */

import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Toaster } from "sonner";

// Nav components (extracted from Layout)
import ModulesDropdown from "./components/nav/ModulesDropdown";
import BellDropdown from "./components/nav/BellDropdown";
import SidebarNav from "./components/nav/SidebarNav";
import MobileDrawer, { HamburgerMenu } from "./components/nav/MobileDrawer";
import ThemeToggleButton from "./components/nav/ThemeToggleButton";
import ProjectErrorBanner from "./components/nav/ProjectErrorBanner";
import { useLayoutNavData } from "./components/nav/useLayoutNavData";
import { useResponsiveBreakpoint } from "./components/nav/useResponsiveBreakpoint";
import { useGlobalSearchShortcut } from "./components/nav/useGlobalSearchShortcut";

// Shared components
import GlobalSearchModal from "./components/search/GlobalSearchModal";
import QuickAddFAB from "./components/shared/QuickAddFAB";
// AiAssistantLauncher intentionally not imported — the floating "Ask AI"
// launcher and its Cmd/Ctrl+K shortcut were hidden site-wide because the
// schedule-assistant edge function isn't reliably returning answers yet.
// The component, drawer, hook, and edge-function call site are all still
// in the repo — uncomment this import + its render below to re-enable.
// import AiAssistantLauncher from "./components/ai-assistant/AiAssistantLauncher";
import ProjectPillDropdown from "./components/nav/ProjectPillDropdown";

// Context
import { useProjectContext } from "./components/shared/useProjectContext";
import { AuthContext } from "@/lib/AuthContext";

// Utilities
import useDocumentTitle from "@/hooks/useDocumentTitle";
import { routeLabel, PROJECT_SCOPED_PAGES } from "@/routes";
import { shortcutKeyLabel } from "@/lib/browser";

// Config
import { PRIMARY_TABS, TAB_DEFAULT_PAGE } from "@/config/moduleRegistry";

// ─────────────────────────────────────────────────────────────────────
export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();

  // Auth
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user || null;
  const logout = authCtx?.logout || (() => {});

  // UI state
  const [gridOpen, setGridOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const isMobile = useResponsiveBreakpoint();

  // Density preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sbp-density");
      if (saved) document.documentElement.setAttribute("data-density", saved);
    } catch { /* ignore */ }
  }, []);

  // Active project
  const { activeProject: ctxActiveProject } = useProjectContext();
  const activeProjectId = ctxActiveProject?.id || null;

  // Cmd+K search shortcut
  useGlobalSearchShortcut(setSearchOpen);

  // ── Nav badge data ───────────────────────────────────────────────
  // useLayoutNavData owns the four cross-module count queries, the
  // overdue derivations, and the mark-all-read mutation. Keeping them
  // out of this file lets the chrome JSX stay focused on rendering.
  const {
    unreadAlerts,
    unreadCount,
    alertCounts,
    markAllRead,
  } = useLayoutNavData(activeProjectId);

  // Page tracking (non-critical)
  useEffect(() => {
    if (!currentPageName) return;
    try { /* Base44 internal page tracking */ } catch { /* suppress */ }
  }, [currentPageName]);

  // Keep document.title in sync with the current route so browser tabs,
  // history entries, and screen readers get an informative label. When the
  // page is project-scoped we also include the active project name.
  const activeProjectName = ctxActiveProject?.name || ctxActiveProject?.project_name || null;
  const pageLabel = routeLabel(currentPageName);
  const titleSuffix =
    activeProjectName && PROJECT_SCOPED_PAGES.has(currentPageName)
      ? `${pageLabel} — ${activeProjectName}`
      : pageLabel;
  useDocumentTitle(titleSuffix);

  // Move keyboard focus back to <main> on every route change so screen
  // readers and tab users land on the new page's content. We only focus
  // when the previously-focused element is NOT a form input on the new
  // page, otherwise typing would get yanked away mid-keystroke.
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const el = typeof document !== "undefined" ? document.getElementById("main-content") : null;
    if (!el) return;
    const active = document.activeElement;
    const tag = active?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
  }, [currentPageName]);

  // ── Navigation handlers ──────────────────────────────────────────
  const activeTab = PRIMARY_TABS.find((t) => t.pages.includes(currentPageName));

  const handleTabClick = (tab) => {
    const dest = TAB_DEFAULT_PAGE[tab.label];
    if (dest) navigate(createPageUrl(dest));
  };

  const handleNavigate = (page) => navigate(createPageUrl(page));

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: 0, background: "var(--bg-base)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Skip-to-main-content link — first focusable element on the page */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only"
        style={{
          position: "absolute",
          top: 4, left: 4,
          background: "var(--accent)",
          color: "#fff",
          padding: "6px 12px",
          borderRadius: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          textDecoration: "none",
          zIndex: 9999,
        }}
      >
        Skip to main content
      </a>

      {/* Mobile Drawer */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} onNavigate={handleNavigate} />

      <div style={{
        background: "var(--bg-surface)", borderRadius: 0,
        width: "100%", maxWidth: "100%", minHeight: "100vh",
        overflow: "hidden", boxShadow: "none",
        position: "relative", display: "flex", flexDirection: "column",
      }}>
        {/* Top accent line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
          zIndex: 200, opacity: 0.6,
        }} />

        {/* ── TOP UTILITY BAR ─────────────────────────────────────── */}
        <nav aria-label="Primary" className="nav-glass" style={{
          height: 36,
          background: "var(--nav-bg)", borderBottom: "1px solid var(--border-default)",
          padding: "0 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, position: "relative", zIndex: 100, gap: 8,
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        }}>
          {/* LEFT: Brand + Hamburger */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isMobile && <HamburgerMenu open={mobileOpen} onToggle={() => setMobileOpen((o) => !o)} />}
            <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => handleNavigate("Dashboard")}>
              <img src="/logo.png" alt="SteelBuild Pro" style={{ height: 26, width: "auto", objectFit: "contain" }} />
            </div>
            {!isMobile && <div style={{ width: 1, height: 16, background: "var(--divider)", margin: "0 6px" }} />}
            {!isMobile && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {currentPageName?.replace(/([A-Z])/g, " $1").trim() || "Dashboard"}
              </span>
            )}
          </div>

          {/* RIGHT: Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Search trigger \u2014 was a 180px-wide pill labeled "Search...
                Ctrl+K" duplicating the SidebarNav search affordance. The
                sidebar entry is the single source of truth for global
                search now; we keep a compact icon-only button up here so
                the action is reachable even with the sidebar collapsed
                or on routes without it. The Cmd/Ctrl+K shortcut is still
                wired in the effect above and stays unique app-wide. */}
            {!isMobile && (
              <button
                onClick={() => setSearchOpen(true)}
                title={`Search (${shortcutKeyLabel("K")})`}
                aria-label="Open global search"
                style={{
                  height: 32, width: 32, borderRadius: 8,
                  background: "var(--hover-bg)", border: "1px solid var(--border-default)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "var(--text-muted)", transition: "all 0.15s",
                  padding: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-muted)"; e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6" /><line x1="14" y1="14" x2="19" y2="19" />
                </svg>
              </button>
            )}

            {/* Density toggle + Modules grid — desktop only */}
            {!isMobile && (
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
                <div
                  title="Toggle compact/comfortable density"
                  onClick={() => {
                    const html = document.documentElement;
                    const current = html.getAttribute("data-density");
                    const next = current === "compact" ? "comfortable" : "compact";
                    html.setAttribute("data-density", next);
                    try { localStorage.setItem("sbp-density", next); } catch { /* ignore */ }
                  }}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "var(--hover-bg)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "var(--text-muted)", transition: "all 0.15s",
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-muted)"; e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <line x1="2" y1="3" x2="12" y2="3" /><line x1="2" y1="7" x2="12" y2="7" /><line x1="2" y1="11" x2="12" y2="11" />
                  </svg>
                </div>

                <div
                  title="All Modules"
                  onClick={() => setGridOpen((o) => !o)}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: gridOpen ? "var(--accent-muted)" : "var(--hover-bg)",
                    border: `1px solid ${gridOpen ? "var(--accent-border)" : "var(--border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    color: gridOpen ? "var(--accent)" : "var(--text-muted)",
                    transition: "all 0.15s",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="0" y="0" width="6" height="6" rx="1.5" />
                    <rect x="8" y="0" width="6" height="6" rx="1.5" />
                    <rect x="0" y="8" width="6" height="6" rx="1.5" />
                    <rect x="8" y="8" width="6" height="6" rx="1.5" />
                  </svg>
                </div>

                <ModulesDropdown
                  open={gridOpen}
                  onClose={() => setGridOpen(false)}
                  onNavigate={handleNavigate}
                  userRole={user?.role}
                  alertCounts={alertCounts}
                />
              </div>
            )}

            {/* Theme Toggle */}
            <ThemeToggleButton />

            {/* Bell */}
            <BellDropdown
              alerts={unreadAlerts}
              unreadCount={unreadCount}
              onMarkAllRead={markAllRead}
              onViewAll={() => handleNavigate("AlertsCenter")}
            />

            {/* User + Sign Out */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto", paddingRight: 0 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
                letterSpacing: "0.10em", textTransform: "uppercase",
              }}>
                {user?.email || user?.full_name || ""}
              </div>
              <button
                onClick={logout}
                style={{
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 6, padding: "4px 12px",
                  color: "var(--text-muted)", fontFamily: "var(--font-mono)",
                  fontSize: 8, letterSpacing: "0.10em", cursor: "pointer",
                  transition: "all 0.15s", textTransform: "uppercase", fontWeight: 600,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--danger-muted)";
                  e.currentTarget.style.borderColor = "var(--danger-border)";
                  e.currentTarget.style.color = "var(--danger)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                SIGN OUT
              </button>
            </div>

            {/* Project pill dropdown */}
            <ProjectPillDropdown />
          </div>
        </nav>

        {/* ── SIDEBAR + CONTENT ───────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {!isMobile && (
            <SidebarNav
              currentPageName={currentPageName}
              onNavigate={handleNavigate}
              visible={!isMobile}
            />
          )}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
            <main id="main-content" aria-label="Main content" tabIndex={-1} style={{
              flex: 1, overflowY: "auto", padding: 0,
              background: "var(--bg-base)", color: "var(--text-primary)",
              display: "flex", flexDirection: "column",
            }}>
              <ProjectErrorBanner />
              {children}
            </main>
          </div>
        </div>

        {/* ── OVERLAYS ────────────────────────────────────────────── */}
        <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        <QuickAddFAB />
        {/* <AiAssistantLauncher /> — hidden until the schedule-assistant
            edge function returns reliable answers. Underlying code kept
            in src/components/ai-assistant/* for re-enable. */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-primary)",
              fontFamily: "'Inter', sans-serif",
              fontSize: 13, borderRadius: 10,
              boxShadow: "var(--shadow-lg)",
            },
          }}
        />
      </div>
    </div>
  );
}
