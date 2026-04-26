import { Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { PAGES } from "@/config/routes";
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
            path={path}
            element={
              <LazyRoute label={path}>
                <Page />
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
