import { Outlet, useLocation } from "react-router-dom";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import Layout from "@/Layout";
import DesktopShell from "@/components/desktop/DesktopShell";
import { useFlag } from "@/hooks/useFeatureFlag";

/**
 * LayoutRoute — mounts the app chrome ONCE and keeps it across navigations.
 * Chooses DesktopShell (flag: desktop_shell) or the classic Layout. Both render
 * the page <Outlet>, so all routes work identically under either shell.
 */
export default function LayoutRoute() {
  const location = useLocation();
  const currentPageName = location.pathname.replace(/^\//, "") || "Dashboard";
  const desktopShell = useFlag("desktop_shell");

  const Shell = desktopShell ? DesktopShell : Layout;

  return (
    <PageErrorBoundary label="Layout" key="layout-boundary">
      <Shell currentPageName={currentPageName}>
        <Outlet />
      </Shell>
    </PageErrorBoundary>
  );
}
