import { Suspense } from "react";
import { useLocation } from "react-router-dom";
import AppProviders from "@/boot/AppProviders";
import AuthenticatedApp from "@/boot/AuthenticatedApp";
import { lazyWithRetry } from "@/lib/lazyRetry";

/**
 * App — boot entrypoint.
 *
 * Composition only. Each concern lives in its own boot module:
 *   - AppProviders     — provider stack (theme, auth, react-query, router, project)
 *   - AuthenticatedApp — auth gating + route table
 *   - AppRoutes        — the routes (loaded transitively via AuthenticatedApp)
 *   - LayoutRoute      — shared chrome (sidebar, top bar) that stays mounted
 *   - PageLoader       — Suspense fallback for lazy page chunks
 *   - AppLoader        — full-screen loader while auth resolves
 */

// Public legal pages — reachable WITHOUT authentication (and without the app
// shell), so logged-out visitors can read them from the landing-page footer.
// Matched HERE, above the auth gate, because AppRoutes only mounts for
// authenticated users who already have a workspace. The check below intercepts
// only these exact paths; everything else falls through to AuthenticatedApp,
// which stays mounted across in-app navigation (same element type, same slot).
const Privacy = lazyWithRetry(() => import("@/pages/Privacy"));
const Terms = lazyWithRetry(() => import("@/pages/Terms"));
const Security = lazyWithRetry(() => import("@/pages/Security"));

const PUBLIC_PAGES = {
  "/privacy": Privacy,
  "/terms": Terms,
  "/security": Security,
};

function Root() {
  const { pathname } = useLocation();
  const key = pathname.toLowerCase().replace(/\/+$/, "");
  const PublicPage = PUBLIC_PAGES[key];
  if (PublicPage) {
    return (
      <Suspense fallback={null}>
        <PublicPage />
      </Suspense>
    );
  }
  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AppProviders>
      <Root />
    </AppProviders>
  );
}
