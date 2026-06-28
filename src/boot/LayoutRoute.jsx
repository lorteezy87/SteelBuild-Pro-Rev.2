import { Outlet, useLocation } from "react-router-dom";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import Layout from "@/Layout";
import { PAGES } from "@/config/routes";
import { isReferenceChromePage } from "@/config/dashboardChromePages";
import DesktopShell from "@/components/desktop/DesktopShell";
import { useFlag } from "@/hooks/useFeatureFlag";

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
  const useReferenceChrome = isReferenceChromePage(currentPageName);
  const useDesktopShell = desktopShell && !useReferenceChrome;

  const Shell = useDesktopShell ? DesktopShell : Layout;

  return (
    <PageErrorBoundary label="Layout" key="layout-boundary">
      <Shell currentPageName={currentPageName}>
        <Outlet />
      </Shell>
    </PageErrorBoundary>
  );
}
