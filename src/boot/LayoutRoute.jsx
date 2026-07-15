import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import Layout from "@/Layout";
import { PAGES } from "@/config/routes";
import { useTheme } from "@/components/shared/ThemeContext";

/**
 * LayoutRoute — mounts the app chrome (Layout) ONCE and keeps it across
 * navigations; the page <Outlet> renders inside it. Also defaults the whole
 * shell to the light theme when the canonical layout is active (the user can still
 * toggle dark afterward). (The removed DesktopShell / desktop_shell path is
 * gone — Layout is the only shell.)
 */
export default function LayoutRoute() {
  const location = useLocation();
  const pathSegments = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const segment = pathSegments.length === 0 ? "Dashboard" : pathSegments[0];
  const canonicalPageName =
    Object.keys(PAGES).find((pageName) => pageName.toLowerCase() === segment.toLowerCase()) || segment;
  const currentPageName = canonicalPageName || "Dashboard";
  const { setTheme } = useTheme();

  // The command presentation is light-first. Set the same default once while
  // preserving the user's ability to toggle the theme afterward.
  useEffect(() => {
    setTheme("light");
  }, [setTheme]);

  return (
    <PageErrorBoundary label="Layout" key="layout-boundary">
      <Layout currentPageName={currentPageName}>
        <Outlet />
      </Layout>
    </PageErrorBoundary>
  );
}