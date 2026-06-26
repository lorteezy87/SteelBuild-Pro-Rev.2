import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { PAGES, PROJECT_SCOPED_PAGES } from "@/config/routes";
import PageNotFound from "@/lib/PageNotFound";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import ProjectScopedRoute from "@/components/shared/ProjectScopedRoute";
import LayoutRoute from "@/boot/LayoutRoute";
import PageLoader from "@/boot/PageLoader";
import { useUserPrefs } from "@/hooks/useUserPrefs";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectRole } from "@/hooks/useProjectRole";
import { landingForRole } from "@/lib/landingForRole";

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

export const LANDING_REDIRECT_KEY = "sbp-landing-redirected";

/**
 * Index route ("/"): decide the "page you see when you open the app each
 * morning". Precedence, applied ONCE per browser session on first load (so
 * clicking the logo/home later still shows the Dashboard rather than bouncing
 * away):
 *
 *   1. Explicit user pref (Settings → Dashboard → "Default Landing Page").
 *   2. Role-aware default (only when no explicit pref): field → Field Today,
 *      pm/admin/owner → Detailing Control Center, viewer/unknown → Dashboard.
 *      See src/lib/landingForRole.js.
 *
 * The role is per-project and async (useProjectRole → RPC), and ProjectContext
 * does NOT auto-select a project. So for the role path we wait — but only when
 * there's actually something to wait for — before locking in the decision:
 *   - active project present → wait for its role to resolve;
 *   - none active but one is still pending (a saved pick or the Default-Project
 *     pref may resolve into one) → wait for the project list;
 *   - nothing selected/pending → decide now (→ Dashboard), so a brand-new,
 *     zero-project user doesn't stare at a spinner through ProjectContext's
 *     empty-list retry backoff.
 * Deciding early on the transient "no project / viewer" state would fire the
 * once-per-session guard and trap office/field users on the Dashboard. An
 * explicit pref skips the wait entirely.
 *
 * Exported for the boot-invariant test (src/boot/__tests__/IndexRoute.test.jsx).
 */
export function IndexRoute() {
  const { default_landing, default_project_id } = useUserPrefs();
  const { activeProject, loading: projectsLoading } = useProjectContext();
  const { role, isLoading: roleLoading } = useProjectRole(activeProject?.id);

  let alreadyRedirected = true;
  try { alreadyRedirected = sessionStorage.getItem(LANDING_REDIRECT_KEY) === "1"; } catch { /* ignore */ }

  // An explicit, non-default pref always wins — unchanged legacy behavior.
  const explicitTarget =
    default_landing && default_landing !== "Dashboard" ? default_landing : null;

  // Will an active project (and thus a per-project role) resolve this load?
  // A saved localStorage pick or the Settings "Default Project" pref both
  // resolve into an active project after ProjectContext loads.
  let savedSelection = false;
  try { savedSelection = !!localStorage.getItem("activeProjectId"); } catch { /* ignore */ }
  const projectPending = savedSelection || !!default_project_id;

  // roleReady: the inputs a role decision needs are in. With an active project
  // we wait for its role; with none active we wait only if one is still
  // pending (else decide immediately → no spinner for zero-project users).
  const roleReady = activeProject ? !roleLoading : !(projectPending && projectsLoading);
  const roleTarget =
    !explicitTarget && roleReady ? landingForRole(role, !!activeProject) : null;

  // Hold briefly while the role decision's inputs resolve (first load only).
  // Do NOT set the guard here, or we'd lock in Dashboard before the role lands.
  if (!explicitTarget && !alreadyRedirected && !roleReady) {
    return <PageLoader />;
  }

  const target = explicitTarget || roleTarget;
  if (target && !alreadyRedirected) {
    // Set the once-per-session guard synchronously with the redirect so a
    // logo/home click later shows the Dashboard. Kept in render (not an effect)
    // on purpose: this guarantees the guard is set exactly when we redirect —
    // an effect could be skipped if <Navigate> swaps this route out first,
    // breaking the once-per-session contract. Safe because the app is not
    // wrapped in StrictMode and "/" renders synchronously.
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
                {PROJECT_SCOPED_PAGES.has(path) ? (
                  <ProjectScopedRoute>
                    <Page />
                  </ProjectScopedRoute>
                ) : (
                  <Page />
                )}
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

        {/* /GanttChart was retired — redirect old deep-links to /Schedule */}
        <Route path="GanttChart" element={<Navigate to="/Schedule" replace />} />
      </Route>

      {/* 404 — outside layout */}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}
