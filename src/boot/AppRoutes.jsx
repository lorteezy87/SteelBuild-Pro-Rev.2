import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { PAGES } from "@/config/routes";
import PageNotFound from "@/lib/PageNotFound";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import LayoutRoute from "@/boot/LayoutRoute";
import PageLoader from "@/boot/PageLoader";
import { useUserPrefs } from "@/hooks/useUserPrefs";

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

const LANDING_REDIRECT_KEY = "sbp-landing-redirected";

/**
 * Index route ("/"): honour Settings → Dashboard → "Default Landing Page".
 * Redirects ONCE per browser session on first load (the "page you see when you
 * open the app each morning"), so clicking the logo/home later still shows the
 * Dashboard rather than bouncing away.
 */
function IndexRoute() {
  const { default_landing } = useUserPrefs();
  const target = default_landing && default_landing !== "Dashboard" ? default_landing : null;
  let alreadyRedirected = true;
  try { alreadyRedirected = sessionStorage.getItem(LANDING_REDIRECT_KEY) === "1"; } catch { /* ignore */ }
  if (target && !alreadyRedirected) {
    try { sessionStorage.setItem(LANDING_REDIRECT_KEY, "1"); } catch { /* ignore */ }
    return <Navigate to={`/${target}`} replace />;
  }
  return (
    <LazyRoute label="Dashboard">
      <Dashboard />
    </LazyRoute>
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
        <Route index element={<IndexRoute />} />

        {Object.entries(PAGES).map(([path, Page]) => (
          <Route
            key={path}
            // Reports owns nested routes (`/Reports/<slug>`) for the
            // report-hub framework, so it has to match wildcards.
            // Every other registered page is a single-leaf route.
            path={path === "Reports" ? "Reports/*" : path}
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
