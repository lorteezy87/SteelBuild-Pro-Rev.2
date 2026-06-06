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

import React, { Suspense, useState, useEffect, useContext } from "react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Nav components (extracted from Layout)
import BellDropdown from "./components/nav/BellDropdown";
import HamburgerMenu from "./components/nav/HamburgerMenu";
import ThemeToggleButton from "./components/nav/ThemeToggleButton";
import HighContrastToggleButton from "./components/nav/HighContrastToggleButton";
import ProjectErrorBanner from "./components/nav/ProjectErrorBanner";
import TopBarSearchButton from "./components/nav/TopBarSearchButton";
import DensityToggle from "./components/nav/DensityToggle";
import UserSignOutBlock from "./components/nav/UserSignOutBlock";
import SkipToMainContentLink from "./components/nav/SkipToMainContentLink";
import { useLayoutNavData } from "./components/nav/useLayoutNavData";
import { useResponsiveBreakpoint } from "./components/nav/useResponsiveBreakpoint";
import { useGlobalSearchShortcut } from "./components/nav/useGlobalSearchShortcut";
import { useDensityRestore } from "./components/nav/useDensityRestore";
import { useFocusMainOnRouteChange } from "./components/nav/useFocusMainOnRouteChange";
import { useDocumentTitleForRoute } from "./components/nav/useDocumentTitleForRoute";

// Shared components — use lazyWithRetry so stale-chunk 404s after a deploy
// trigger a single page reload instead of a hard "LOAD ERROR" crash.
const ModulesDropdown = lazyWithRetry(() => import("./components/nav/ModulesDropdown"));
const GlobalSearchModal = lazyWithRetry(() => import("./components/search/GlobalSearchModal"));
const MobileDrawer = lazyWithRetry(() => import("./components/nav/MobileDrawer"));
const Toaster = lazyWithRetry(() => import("sonner").then((mod) => ({ default: mod.Toaster })));
const SidebarNav = lazyWithRetry(() => import("./components/nav/SidebarNav"));
// QuickAddFAB intentionally not imported — the floating "+" shortcut at
// bottom-right was hidden per user request. Component file is preserved
// in src/components/shared/QuickAddFAB.jsx; uncomment this import + its
// render below to re-enable.
// import QuickAddFAB from "./components/shared/QuickAddFAB";
// AiAssistantLauncher intentionally not imported — the floating "Ask AI"
// launcher and its Cmd/Ctrl+K shortcut were hidden site-wide because the
// schedule-assistant edge function isn't reliably returning answers yet.
// The component, drawer, hook, and edge-function call site are all still
// in the repo — uncomment this import + its render below to re-enable.
// import AiAssistantLauncher from "./components/ai-assistant/AiAssistantLauncher";
import ProjectPillDropdown from "./components/nav/ProjectPillDropdown";

// Context
import { useProjectContext } from "./components/shared/ProjectContext";
import { AuthContext } from "@/lib/AuthContext";
import { useTheme } from "@/components/shared/ThemeContext";

// ─────────────────────────────────────────────────────────────────────
function sidebarFallbackWidth() {
  try { return localStorage.getItem("sbp-sidebar-rail") === "1" ? 56 : 240; } catch { return 240; }
}

function SidebarNavFallback() {
  const width = sidebarFallbackWidth();
  return (
    <aside
      aria-hidden="true"
      className="sbd-sidebar"
      style={{
        width, minWidth: width,
        flexShrink: 0,
        height: "100%",
        borderRight: "1px solid var(--divider)",
      }}
    />
  );
}

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkTheme = theme === "dark";
  const appShellClassName = `app-shell ${isDarkTheme ? "steelbuild-dark " : ""}sbd-mesh-bg`;

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
  useDensityRestore();

  // Active project
  const { activeProject: ctxActiveProject } = useProjectContext();
  const activeProjectId = ctxActiveProject?.id || null;

  // Cmd+K search shortcut
  useGlobalSearchShortcut(setSearchOpen);

  // ── Nav badge data ───────────────────────────────────────────────
  // Keep the bell alert stream live, but defer heavier module badge
  // count queries until the user opens the modules menu.
  const {
    unreadAlerts,
    unreadCount,
    alertCounts,
    markAllRead,
  } = useLayoutNavData(activeProjectId, { includeModuleCounts: gridOpen });

  // Page tracking (non-critical)
  useEffect(() => {
    if (!currentPageName) return;
    try { /* internal page tracking */ } catch { /* suppress */ }
  }, [currentPageName]);

  // Keep document.title in sync with the current route.
  useDocumentTitleForRoute(currentPageName, ctxActiveProject);

  // Move keyboard focus back to <main> on every route change so screen
  // readers and tab users land on the new page's content.
  useFocusMainOnRouteChange(currentPageName);

  // ── Navigation handlers ──────────────────────────────────────────
  const handleNavigate = (page) => navigate(createPageUrl(page));

  // ── Render ───────────────────────────────────────────────────────
  // The theme class is scoped here so light mode can use the reference
  // grid-and-panel styling without inheriting dark overlay tokens.
  return (
    <div className={appShellClassName} data-mobile-shell={isMobile ? "true" : "false"} style={{
      minHeight: "100vh", width: "100%",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: 0, background: "var(--bg-base)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Skip-to-main-content link — first focusable element on the page */}
      <SkipToMainContentLink />

      {/* Mobile Drawer */}
      {isMobile && (
        <Suspense fallback={null}>
          <MobileDrawer
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            onNavigate={handleNavigate}
            currentPageName={currentPageName}
          />
        </Suspense>
      )}

      <div className="app-frame" style={{
        background: "var(--bg-surface)", borderRadius: 0,
        width: "100%", maxWidth: "100%", minHeight: "100vh",
        overflow: "hidden", boxShadow: "none",
        position: "relative", display: "flex", flexDirection: "column",
      }}>
        {/* Top accent line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
          zIndex: 200, opacity: isDarkTheme ? 0.6 : 0, display: isDarkTheme ? "block" : "none",
        }} />

        {/* ── TOP UTILITY BAR ─────────────────────────────────────── */}
        <nav aria-label="Primary" className="app-topbar nav-glass sbd-topbar" style={{
          height: isMobile ? 52 : 36,
          minHeight: isMobile ? 52 : 36,
          padding: isMobile
            ? "0 max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left))"
            : "0 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, position: "relative", zIndex: 100, gap: isMobile ? 6 : 8,
        }}>
          {/* LEFT: Brand + Hamburger */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isMobile && <HamburgerMenu open={mobileOpen} onToggle={() => setMobileOpen((o) => !o)} />}
            {/* Topbar is now identical in light + dark: logo → divider → project
                selector → current-page eyebrow. (Branding previously lived in the
                light sidebar; it now sits in the topbar for both themes.) */}
            <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => handleNavigate("Dashboard")}>
              <img src="/logo.png" alt="SteelBuild Pro" style={{ height: isMobile ? 30 : 26, width: "auto", objectFit: "contain" }} />
            </div>
            {!isMobile && <div style={{ width: 1, height: 16, background: "var(--divider)", margin: "0 6px" }} />}
            {!isMobile && <ProjectPillDropdown align="left" />}
            {!isMobile && (
              <span className="sbd-topbar-eyebrow" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {currentPageName?.replace(/([A-Z])/g, " $1").trim() || "Dashboard"}
              </span>
            )}
          </div>

          {/* RIGHT: Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Search trigger \u2014 see TopBarSearchButton for context. */}
            <TopBarSearchButton onClick={() => setSearchOpen(true)} compact={isMobile} />

            {/* Density toggle + Modules grid — desktop only */}
            {!isMobile && (
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
                <DensityToggle />

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

                {gridOpen && (
                  <Suspense fallback={null}>
                    <ModulesDropdown
                      open={gridOpen}
                      onClose={() => setGridOpen(false)}
                      onNavigate={handleNavigate}
                      userRole={user?.role}
                      alertCounts={alertCounts}
                    />
                  </Suspense>
                )}
              </div>
            )}

            {/* Theme + Contrast Toggles */}
            {!isMobile && <ThemeToggleButton />}
            {!isMobile && <HighContrastToggleButton />}

            {/* Bell */}
            <BellDropdown
              alerts={unreadAlerts}
              unreadCount={unreadCount}
              onMarkAllRead={markAllRead}
              onViewAll={() => handleNavigate("AlertsCenter")}
            />

            {/* User + Sign Out */}
            {!isMobile && <UserSignOutBlock user={user} onLogout={logout} />}

            {/* Project pill dropdown — mobile keeps it on the right (compact);
                desktop renders it on the left in both themes (see above). */}
            {isMobile && <ProjectPillDropdown compact />}
          </div>
        </nav>

        {/* ── SIDEBAR + CONTENT ───────────────────────────────────── */}
        <div className="app-body" style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {!isMobile && (
            <Suspense fallback={<SidebarNavFallback />}>
              <SidebarNav
                currentPageName={currentPageName}
                onNavigate={handleNavigate}
                visible={!isMobile}
              />
            </Suspense>
          )}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
            <main id="main-content" className="app-main-content" aria-label="Main content" tabIndex={-1} style={{
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
        {searchOpen && (
          <Suspense fallback={null}>
            <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
          </Suspense>
        )}
        {/* QuickAddFAB removed per user request — the bottom-right "+"
            shortcut was hidden site-wide. Re-enable by restoring the
            import at the top of this file and the <QuickAddFAB /> render
            here. The component file itself is preserved unchanged. */}
        {/* <AiAssistantLauncher /> — hidden until the schedule-assistant
            edge function returns reliable answers. Underlying code kept
            in src/components/ai-assistant/* for re-enable. */}
        <Suspense fallback={null}>
          <Toaster
            theme={isDarkTheme ? "dark" : "light"}
            richColors
            closeButton
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--bg-elevated, var(--sbd-bg-elevated, rgba(15,22,38,0.95)))",
                border: "1px solid var(--border-strong, var(--sbd-border, rgba(255,255,255,0.08)))",
                color: "var(--text-primary, var(--sbd-text, rgba(255,255,255,0.95)))",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13, borderRadius: 10,
                boxShadow: "var(--shadow-lg)",
                backdropFilter: "blur(20px) saturate(140%)",
                WebkitBackdropFilter: "blur(20px) saturate(140%)",
              },
              className: "sbd-card",
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
