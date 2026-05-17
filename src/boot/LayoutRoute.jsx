import { Outlet, useLocation } from "react-router-dom";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import Layout from "@/Layout";

/**
 * LayoutRoute — react-router layout route that mounts <Layout> ONCE and stays
 * mounted across all page navigations. Only the <Outlet> (page content) swaps
 * when the route changes.
 *
 * Wrapping in PageErrorBoundary catches a crash in Layout's chrome (sidebar,
 * top utility bar, breadcrumbs) without taking down the whole app — the user
 * still sees the page content with a recoverable banner.
 */
export default function LayoutRoute() {
  const location = useLocation();
  // Derive currentPageName from URL path (e.g. "/Drawings" → "Drawings")
  const currentPageName = location.pathname.replace(/^\//, "") || "Dashboard";

  return (
    <PageErrorBoundary label="Layout" key="layout-boundary">
      <Layout currentPageName={currentPageName}>
        <Outlet />
      </Layout>
    </PageErrorBoundary>
  );
}
