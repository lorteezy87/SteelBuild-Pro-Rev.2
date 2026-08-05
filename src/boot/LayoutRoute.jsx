import { Outlet, useLocation } from "react-router-dom";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import Layout from "@/Layout";
import { PAGES } from "@/config/routes";

/**
 * LayoutRoute — mounts the app chrome (Layout) ONCE and keeps it across
 * navigations; the page <Outlet> renders inside it.
 * Theme resolution lives entirely in ThemeContext (stored pref or system).
 */
export default function LayoutRoute() {
  const location = useLocation();
  const pathSegments = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const segment = pathSegments.length === 0 ? "Dashboard" : pathSegments[0];
  const canonicalPageName =
    Object.keys(PAGES).find((pageName) => pageName.toLowerCase() === segment.toLowerCase()) || segment;
  const currentPageName = canonicalPageName || "Dashboard";

  return (
    <PageErrorBoundary label="Layout" key="layout-boundary">
      <Layout currentPageName={currentPageName}>
        <Outlet />
      </Layout>
    </PageErrorBoundary>
  );
}