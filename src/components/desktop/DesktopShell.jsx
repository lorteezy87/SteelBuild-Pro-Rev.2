/**
 * DesktopShell — the Linux-desktop-style app chrome (flag: desktop_shell).
 * Sets [data-skin="desktop"] while mounted; composes DesktopTopBar + Dock +
 * (Launcher overlay | ModuleSurface(children)). Reuses Layout's overlays so all
 * page functionality (search, toasts, error banner) is preserved.
 */
import React, { Suspense, useEffect, useState, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { AuthContext } from "@/lib/AuthContext";
import { useTheme } from "@/components/shared/ThemeContext";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useResponsiveBreakpoint } from "@/components/nav/useResponsiveBreakpoint";
import { useGlobalSearchShortcut } from "@/components/nav/useGlobalSearchShortcut";
import { useDensityRestore } from "@/components/nav/useDensityRestore";
import { useLayoutNavData } from "@/components/nav/useLayoutNavData";
import { useDocumentTitleForRoute } from "@/components/nav/useDocumentTitleForRoute";
import { useFocusMainOnRouteChange } from "@/components/nav/useFocusMainOnRouteChange";
import ProjectErrorBanner from "@/components/nav/ProjectErrorBanner";
import SkipToMainContentLink from "@/components/nav/SkipToMainContentLink";
import { PAGE_LABELS } from "@/config/moduleRegistry";
import DesktopTopBar from "./DesktopTopBar";
import Dock from "./Dock";
import Launcher from "./Launcher";
import ModuleSurface from "./ModuleSurface";

const GlobalSearchModal = lazyWithRetry(() => import("@/components/search/GlobalSearchModal"));
const Toaster = lazyWithRetry(() => import("sonner").then((m) => ({ default: m.Toaster })));

export default function DesktopShell({ currentPageName, children }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isMobile = useResponsiveBreakpoint();

  const authCtx = useContext(AuthContext);
  const user = authCtx?.user || null;
  const logout = authCtx?.logout || (() => {});

  const [searchOpen, setSearchOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);

  useDensityRestore();
  useGlobalSearchShortcut(setSearchOpen);

  const { activeProject } = useProjectContext();
  const { unreadAlerts, unreadCount, markAllRead } = useLayoutNavData(activeProject?.id || null, { includeModuleCounts: false });

  useDocumentTitleForRoute(currentPageName, activeProject);
  useFocusMainOnRouteChange(currentPageName);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-skin", "desktop");
    return () => root.removeAttribute("data-skin");
  }, []);

  useEffect(() => { setLauncherOpen(false); }, [currentPageName]);

  const handleNavigate = useCallback((page) => navigate(createPageUrl(page)), [navigate]);
  const title = PAGE_LABELS[currentPageName] || currentPageName || "Dashboard";
  const showLauncher = launcherOpen || currentPageName === "Launcher";

  // Activities/Show-Applications toggles the launcher overlay — but when you're
  // already ON the /Launcher route, toggling launcherOpen can't close it (the
  // route keeps showLauncher true), so navigate to the Dashboard to leave it.
  const handleActivities = useCallback(() => {
    if (currentPageName === "Launcher") handleNavigate("Dashboard");
    else setLauncherOpen((v) => !v);
  }, [currentPageName, handleNavigate]);

  return (
    <div className={`desk-canvas ${isDark ? "steelbuild-dark" : ""}`} style={{
      minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <SkipToMainContentLink />

      <DesktopTopBar
        currentPageName={currentPageName}
        title={title}
        onShowLauncher={handleActivities}
        onOpenSearch={() => setSearchOpen(true)}
        user={user}
        onLogout={logout}
        alerts={unreadAlerts}
        unreadCount={unreadCount}
        onMarkAllRead={markAllRead}
        onViewAllAlerts={() => handleNavigate("AlertsCenter")}
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative", zIndex: 1 }}>
        {!isMobile && (
          <Dock currentPageName={currentPageName} isMobile={false} onNavigate={handleNavigate} onShowLauncher={handleActivities} />
        )}

        {showLauncher ? (
          <Launcher onNavigate={handleNavigate} />
        ) : (
          <ModuleSurface title={title} isMobile={isMobile}>
            <ProjectErrorBanner />
            {children}
          </ModuleSurface>
        )}
      </div>

      {isMobile && (
        <Dock currentPageName={currentPageName} isMobile={true} onNavigate={handleNavigate} onShowLauncher={handleActivities} />
      )}

      {searchOpen && (
        <Suspense fallback={null}>
          <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <Toaster theme={isDark ? "dark" : "light"} richColors closeButton position="bottom-right" />
      </Suspense>
    </div>
  );
}
