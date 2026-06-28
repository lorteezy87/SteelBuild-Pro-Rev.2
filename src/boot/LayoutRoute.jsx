import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import Layout from "@/Layout";
import { PAGES } from "@/config/routes";
import { isReferenceChromePage } from "@/config/dashboardChromePages";
import DesktopShell from "@/components/desktop/DesktopShell";
import { useFlag } from "@/hooks/useFeatureFlag";
import { useTheme } from "@/components/shared/ThemeContext";

/**
 * LayoutRoute — mounts the app chrome ONCE and keeps it across navigations.
 * Chooses DesktopShell (flag: desktop_shell) or the classic Layout. Both render
 * the page <Outlet>, so all routes work identically under either shell.
 */
export default function LayoutRoute() {
  const location = useLocation();
  const pathSegments = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const segment = pathSegments.length === 0 ? "Dashboard" : pathSegments[0];
  const canonicalPageName =
    Object.keys(PAGES).find((pageName) => pageName.toLowerCase() === segment.toLowerCase()) || segment;
  const currentPageName = canonicalPageName || "Dashboard";
  const desktopShell = useFlag("desktop_shell");
  const commandUi = useFlag("command_ui");
  const { setTheme } = useTheme();
  const useReferenceChrome = isReferenceChromePage(currentPageName);
  const useDesktopShell = desktopShell && !useReferenceChrome;

  // The command_ui redesign is light-first. Default the whole shell to the light
  // theme once when the flag turns on (the user can still toggle dark afterward —
  // we only react to the flag, not to the theme, so we never trap them in light).
  useEffect(() => {
    if (commandUi) setTheme("light");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandUi]);

  const Shell = useDesktopShell ? DesktopShell : Layout;

  return (
    <PageErrorBoundary label="Layout" key="layout-boundary">
      <Shell currentPageName={currentPageName}>
        <Outlet />
      </Shell>
    </PageErrorBoundary>
  );
}