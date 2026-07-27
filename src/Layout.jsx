/**
 * Layout.jsx - Application shell
 *
 * Thin composition layer that wires together:
 *  - Top utility bar (brand, search, density, modules, bell, user, project)
 *  - Desktop sidebar navigation
 *  - Mobile hamburger drawer
 *  - Content area with error banner
 *  - Global search modal and toast notifications
 *
 * All data definitions live in src/config/moduleRegistry.js.
 * All sub-components live in src/components/nav/.
 */

import React, { Suspense, useState, useEffect, useContext } from "react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
import { createPageUrl } from "@/utils";

// Nav components (extracted from Layout)
import BellDropdown from "./components/nav/BellDropdown";
import HamburgerMenu from "./components/nav/HamburgerMenu";
import { BrandLogo } from "./components/nav/BrandLogo";
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
const ModuleLauncherGrid = lazyWithRetry(() => import("./components/nav/ModuleLauncherGrid"));
const GlobalSearchModal = lazyWithRetry(() => import("./components/search/GlobalSearchModal"));
const MobileDrawer = lazyWithRetry(() => import("./components/nav/MobileDrawer"));
const Toaster = lazyWithRetry(() => import("sonner").then((mod) => ({ default: mod.Toaster })));
const SidebarNav = lazyWithRetry(() => import("./components/nav/SidebarNav"));
import ProjectPillDropdown from "./components/nav/ProjectPillDropdown";

// Context
import { useProjectContext } from "./components/shared/ProjectContext";
import { AuthContext } from "@/lib/AuthContext";
import { useTheme } from "@/components/shared/ThemeContext";
import { REFERENCE_CHROME_PAGES } from "@/config/dashboardChromePages";
import "./pages/dashboard/dashboardTheme.css";

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
  const isDashboardPage = REFERENCE_CHROME_PAGES.has(currentPageName);
  const appShellClassName = `app-shell ${isDashboardPage ? "dashboard-reference-shell " : ""}sbd-mesh-bg`;

  // Auth
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user || null;
  const logout = authCtx?.logout || (() => {});

  // UI state
  const [gridOpen, setGridOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const isMobile = useResponsiveBreakpoint();
  const useDashboardChrome = isDashboardPage && !isMobile;

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
    markAllRead,
  } = useLayoutNavData(activeProjectId, { includeModuleCounts: false });

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
  const userName = user?.full_name || user?.email || "User";
  const userInitials = String(userName)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

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

        {useDashboardChrome ? (
          <div className="app-body sb-dashboard-shell-body" style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <Suspense fallback={<SidebarNavFallback />}>
              <SidebarNav
                currentPageName={currentPageName}
                onNavigate={handleNavigate}
                visible
                variant="dashboard"
              />
            </Suspense>

            <div className="sb-dashboard-shell-content">
              <nav aria-label="Primary" className="app-topbar nav-glass sbd-topbar sb-dashboard-topbar" style={{
                height: 68,
                minHeight: 68,
                padding: "0 22px",
                display: "grid",
                gridTemplateColumns: "260px minmax(320px, 1fr) auto",
                alignItems: "center",
                gap: 22,
                flexShrink: 0,
                position: "relative",
                zIndex: 100,
              }}>
                <ProjectPillDropdown align="left" variant="dashboard" />

                <div className="sb-dashboard-topbar__search">
                  <TopBarSearchButton onClick={() => setSearchOpen(true)} variant="dashboard" />
                </div>

                <div className="sb-dashboard-topbar__actions">
                  <ThemeToggleButton />
                  <HighContrastToggleButton />
                  <button
                    type="button"
                    className="sb-dashboard-topbar__icon"
                    aria-label="Open search"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search size={18} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <button
                      type="button"
                      className="sb-dashboard-topbar__icon"
                      aria-label="All modules"
                      title="All Modules"
                      onClick={() => setGridOpen((o) => !o)}
                    >
                      <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                        <rect x="0" y="0" width="6" height="6" rx="1.5" />
                        <rect x="8" y="0" width="6" height="6" rx="1.5" />
                        <rect x="0" y="8" width="6" height="6" rx="1.5" />
                        <rect x="8" y="8" width="6" height="6" rx="1.5" />
                      </svg>
                    </button>
                    {gridOpen && (
                      <Suspense fallback={null}>
                        <ModuleLauncherGrid
                          open={gridOpen}
                          onClose={() => setGridOpen(false)}
                          onNavigate={handleNavigate}
                        />
                      </Suspense>
                    )}
                  </div>
                  <BellDropdown
                    alerts={unreadAlerts}
                    unreadCount={unreadCount}
                    onMarkAllRead={markAllRead}
                    onViewAll={() => handleNavigate("AlertsCenter")}
                  />
                  <button
                    type="button"
                    className="sb-dashboard-topbar__user"
                    title={`${userName} · sign out`}
                    onClick={logout}
                  >
                    <span className="sb-dashboard-topbar__avatar">{userInitials.slice(0, 2)}</span>
                    <span>{userInitials.slice(0, 2)}</span>
                    <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
              </nav>

              <main id="main-content" className="app-main-content sb-dashboard-main-content" aria-label="Main content" tabIndex={-1} style={{
                flex: 1, overflowY: "auto", padding: 0,
                background: "var(--bg-base)", color: "var(--text-primary)",
                display: "flex", flexDirection: "column",
              }}>
                <ProjectErrorBanner />
                {children}
              </main>
            </div>
          </div>
        ) : (
          <>
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
            {/* Brand lives in the sidebar on desktop (SidebarNav) and in the
                drawer on mobile. The top bar only carries the logo on mobile —
                where the sidebar is off-canvas — so desktop shows it once, not
                twice. The leading divider went with it. */}
            {isMobile && (
              <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => handleNavigate("Dashboard")}>
                <BrandLogo height={30} title="SteelBuild Pro" style={{ display: "block" }} />
              </div>
            )}
            {!isMobile && <ProjectPillDropdown align="left" />}
            {!isMobile && (
              <span className="sbd-topbar-eyebrow" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {currentPageName?.replace(/([A-Z])/g, " $1").trim() || "Dashboard"}
              </span>
            )}
          </div>

          {/* RIGHT: Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Search trigger — see TopBarSearchButton for context. */}
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
                    <ModuleLauncherGrid
                      open={gridOpen}
                      onClose={() => setGridOpen(false)}
                      onNavigate={handleNavigate}
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
          </>
        )}

        {/* ── OVERLAYS ────────────────────────────────────────────── */}
        {searchOpen && (
          <Suspense fallback={null}>
            <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
          </Suspense>
        )}
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
