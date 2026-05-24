import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { PAGES } from "@/config/routes";
import { isGatedPage } from "@/config/moduleGating";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import PageNotFound from "@/lib/PageNotFound";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import LayoutRoute from "@/boot/LayoutRoute";
import PageLoader from "@/boot/PageLoader";

// Two pages keep dedicated lazy bindings here (rather than going through the
// PAGES registry) because they're mounted at non-canonical URLs:
//   - Dashboard at the index route ("/")
//   - Landing  at "/Landing"
const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const Landing = lazyWithRetry(() => import("@/pages/Landing"));

/**
 * Wrap each lazy page in Suspense + per-page error boundary. Keyed by `label`
 * so React tears down and rebuilds the boundary on route changes — that's
 * what lets a previously-errored page recover when the user navigates back.
 */
function LazyRoute({ label, children }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <PageErrorBoundary label={label} key={label}>
        {children}
      </PageErrorBoundary>
    </Suspense>
  );
}

/**
 * Blocks direct-URL access to a deprioritized (gated) module when its
 * feature flag is off. Non-gated pages render immediately. While flags are
 * still loading we hold on a loader instead of redirecting, so a deep-link
 * to an enabled module doesn't bounce home on first paint.
 */
function ModuleGate({ page, children }) {
  const { pageEnabled } = useModuleAccess();
  if (!isGatedPage(page)) return children;
  const enabled = pageEnabled(page);
  if (enabled === undefined) return <PageLoader />;
  return enabled ? children : <Navigate to="/" replace />;
}

/**
 * AppRoutes — the full route table.
 *
 * All registered pages share a single Layout instance (mounted once, kept
 * across navigation). The 404 catch-all is OUTSIDE the layout route so that
 * a typo'd URL gets a clean fullscreen "not found" instead of an empty
 * shell.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<LayoutRoute />}>
        <Route
          index
          element={
            <LazyRoute label="Dashboard">
              <Dashboard />
            </LazyRoute>
          }
        />

        {Object.entries(PAGES).map(([path, Page]) => (
          <Route
            key={path}
            // Reports owns nested routes (`/Reports/<slug>`) for the
            // report-hub framework, so it has to match wildcards.
            // Every other registered page is a single-leaf route.
            path={path === "Reports" ? "Reports/*" : path}
            element={
              <LazyRoute label={path}>
                <ModuleGate page={path}>
                  <Page />
                </ModuleGate>
              </LazyRoute>
            }
          />
        ))}

        <Route
          path="Landing"
          element={
            <LazyRoute label="Landing">
              <Landing />
            </LazyRoute>
          }
        />
      </Route>

      {/* 404 — outside layout */}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}
