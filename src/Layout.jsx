/**
 * Layout.jsx - Application shell
 *
 * Thin composition layer that wires together the persistent navigation,
 * project context, global controls, responsive drawer, search and toast chrome.
 */

import React, { Suspense, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { createPageUrl } from "@/utils";

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
import ProjectContextBar from "./components/nav/ProjectContextBar";
import { useLayoutNavData } from "./components/nav/useLayoutNavData";
import { useResponsiveBreakpoint } from "./components/nav/useResponsiveBreakpoint";
import { useGlobalSearchShortcut } from "./components/nav/useGlobalSearchShortcut";
import { useDensityRestore } from "./components/nav/useDensityRestore";
import { useFocusMainOnRouteChange } from "./components/nav/useFocusMainOnRouteChange";
import { useDocumentTitleForRoute } from "./components/nav/useDocumentTitleForRoute";
import ProjectPillDropdown from "./components/nav/ProjectPillDropdown";

import { useProjectContext } from "./components/shared/ProjectContext";
import { AuthContext } from "@/lib/AuthContext";
import { useTheme } from "@/components/shared/ThemeContext";
import { useUserPrefs } from "@/hooks/useUserPrefs";
import { setRuntimeUserPreferences } from "@/lib/userPreferences/runtime";
import { REFERENCE_CHROME_PAGES } from "@/config/dashboardChromePages";
import "./pages/dashboard/dashboardTheme.css";

const GlobalSearchModal = lazyWithRetry(() => import("./components/search/GlobalSearchModal"));
const MobileDrawer = lazyWithRetry(() => import("./components/nav/MobileDrawer"));
const Toaster = lazyWithRetry(() => import("sonner").then((mod) => ({ default: mod.Toaster })));
const SidebarNav = lazyWithRetry(() => import("./components/nav/SidebarNav"));

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
        width,
        minWidth: width,
        flexShrink: 0,
        height: "100%",
        borderRight: "1px solid var(--divider)",
      }}
    />
  );
}

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const { theme, applyPreferences } = useTheme();
  const isDarkTheme = theme === "dark";
  const isDashboardPage = REFERENCE_CHROME_PAGES.has(currentPageName);
  const appShellClassName = `app-shell ${isDashboardPage ? "dashboard-reference-shell " : ""}sbd-mesh-bg`;

  const authCtx = useContext(AuthContext);
  const user = authCtx?.user || null;
  const logout = authCtx?.logout || (() => {});

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { band, isPhone, isTablet } = useResponsiveBreakpoint();
  const useDashboardChrome = isDashboardPage && !isPhone;
  const userPrefs = useUserPrefs();
  setRuntimeUserPreferences(userPrefs);

  useEffect(() => {
    applyPreferences(userPrefs);
  }, [
    applyPreferences,
    userPrefs.accent_color,
    userPrefs.contrast_mode,
    userPrefs.font_scale,
    userPrefs.motion_mode,
    userPrefs.theme,
  ]);

  useDensityRestore(userPrefs.table_density);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-keyboard-hints", userPrefs.show_keyboard_hints ? "on" : "off");
    root.setAttribute("data-project-numbers", userPrefs.show_project_numbers ? "on" : "off");
  }, [userPrefs.show_keyboard_hints, userPrefs.show_project_numbers]);

  const { activeProject: ctxActiveProject } = useProjectContext();
  const activeProjectId = ctxActiveProject?.id || null;

  useGlobalSearchShortcut(setSearchOpen);

  const {
    unreadAlerts,
    unreadCount,
    markAllRead,
  } = useLayoutNavData(activeProjectId, { includeModuleCounts: false });

  useEffect(() => {
    if (!currentPageName) return;
    try { /* internal page tracking */ } catch { /* suppress */ }
  }, [currentPageName]);

  useDocumentTitleForRoute(currentPageName, ctxActiveProject);
  useFocusMainOnRouteChange(currentPageName);

  const handleNavigate = (page) => navigate(createPageUrl(page));
  const userName = user?.full_name || user?.email || "User";
  const userInitials = String(userName)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  const dashboardControls = (
    <div className="sb-dashboard-topbar__actions">
      <TopBarSearchButton onClick={() => setSearchOpen(true)} variant="dashboard" />
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
        aria-label={`${userName} · sign out`}
        onClick={logout}
      >
        <span className="sb-dashboard-topbar__avatar">{userInitials.slice(0, 2)}</span>
        <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div
      className={appShellClassName}
      data-viewport={band}
      data-mobile-shell={isPhone ? "true" : "false"}
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 0,
        background: "var(--bg-base)",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <SkipToMainContentLink />

      {isPhone && (
        <Suspense fallback={null}>
          <MobileDrawer
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            onNavigate={handleNavigate}
            currentPageName={currentPageName}
          />
        </Suspense>
      )}

      <div
        className="app-frame"
        style={{
          background: "var(--bg-surface)",
          borderRadius: 0,
          width: "100%",
          maxWidth: "100%",
          minHeight: "100vh",
          overflow: "hidden",
          boxShadow: "none",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
            zIndex: 200,
            opacity: isDarkTheme ? 0.6 : 0,
            display: isDarkTheme ? "block" : "none",
          }}
        />

        {useDashboardChrome ? (
          <div className="app-body sb-dashboard-shell-body" style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <Suspense fallback={<SidebarNavFallback />}>
              <SidebarNav
                currentPageName={currentPageName}
                onNavigate={handleNavigate}
                visible
                variant="dashboard"
                forceRail={isTablet}
              />
            </Suspense>

            <div className="sb-dashboard-shell-content">
              <nav
                aria-label="Primary"
                className="app-topbar nav-glass sbd-topbar sb-dashboard-topbar"
                style={{ minHeight: 58, flexShrink: 0, position: "relative", zIndex: 100 }}
              >
                <ProjectContextBar
                  project={ctxActiveProject}
                  showProjectNumber={userPrefs.show_project_numbers}
                  showIdentity={false}
                  projectSwitcher={<ProjectPillDropdown align="left" variant="dashboard" />}
                  controls={dashboardControls}
                />
              </nav>

              <main
                id="main-content"
                className="app-main-content sb-dashboard-main-content"
                aria-label="Main content"
                tabIndex={-1}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 0,
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <ProjectErrorBanner />
                {children}
              </main>
            </div>
          </div>
        ) : (
          <>
            <nav
              aria-label="Primary"
              className="app-topbar nav-glass sbd-topbar"
              style={{
                height: isPhone ? 52 : 36,
                minHeight: isPhone ? 52 : 36,
                padding: isPhone
                  ? "0 max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left))"
                  : "0 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
                position: "relative",
                zIndex: 100,
                gap: isPhone ? 6 : 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {isPhone && <HamburgerMenu open={mobileOpen} onToggle={() => setMobileOpen((open) => !open)} />}
                {isPhone && (
                  <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => handleNavigate("Dashboard")}>
                    <BrandLogo variant="full" height={30} title="SteelBuild Pro" style={{ display: "block" }} />
                  </div>
                )}
                {!isPhone && <ProjectPillDropdown align="left" />}
                {!isPhone && (
                  <span
                    className="sbd-topbar-eyebrow"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: "var(--text-muted)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {currentPageName?.replace(/([A-Z])/g, " $1").trim() || "Dashboard"}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <TopBarSearchButton onClick={() => setSearchOpen(true)} compact={isPhone} />
                {!isPhone && <DensityToggle />}
                {!isPhone && <ThemeToggleButton />}
                {!isPhone && <HighContrastToggleButton />}
                <BellDropdown
                  alerts={unreadAlerts}
                  unreadCount={unreadCount}
                  onMarkAllRead={markAllRead}
                  onViewAll={() => handleNavigate("AlertsCenter")}
                />
                {!isPhone && <UserSignOutBlock user={user} onLogout={logout} />}
                {isPhone && <ProjectPillDropdown compact />}
              </div>
            </nav>

            <div className="app-body" style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
              {!isPhone && (
                <Suspense fallback={<SidebarNavFallback />}>
                  <SidebarNav
                    currentPageName={currentPageName}
                    onNavigate={handleNavigate}
                    visible={!isPhone}
                    forceRail={isTablet}
                  />
                </Suspense>
              )}

              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
                <main
                  id="main-content"
                  className="app-main-content"
                  aria-label="Main content"
                  tabIndex={-1}
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: 0,
                    background: "var(--bg-base)",
                    color: "var(--text-primary)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <ProjectErrorBanner />
                  {children}
                </main>
              </div>
            </div>
          </>
        )}

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
                background: "var(--bg-elevated, var(--sbd-bg-elevated))",
                border: "1px solid var(--border-strong, var(--sbd-border))",
                color: "var(--text-primary, var(--sbd-text))",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                borderRadius: 10,
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
