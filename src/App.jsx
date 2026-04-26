import AppProviders from "@/boot/AppProviders";
import AuthenticatedApp from "@/boot/AuthenticatedApp";

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
export default function App() {
  return (
    <AppProviders>
      <AuthenticatedApp />
    </AppProviders>
  );
}
