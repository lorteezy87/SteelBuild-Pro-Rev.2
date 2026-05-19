import { Suspense } from "react";
import { useAuth } from "@/lib/AuthContext";
import AppLoader from "@/boot/AppLoader";
import { lazyWithRetry } from "@/lib/lazyRetry";

const Landing = lazyWithRetry(() => import("@/pages/Landing"));
const AppRoutes = lazyWithRetry(() => import("@/boot/AppRoutes"));
const ProjectProvider = lazyWithRetry(() =>
  import("@/components/shared/ProjectContext").then((mod) => ({ default: mod.ProjectProvider }))
);

/**
 * AuthenticatedApp — auth gate + routing.
 *
 * Three states, in order of precedence:
 *   1. Auth still resolving         → AppLoader (full-screen spinner)
 *   2. Auth required (no session)   → Landing page (marketing site
 *      with inline sign-in modal)
 *   3. Authenticated                → AppRoutes (Dashboard, etc.)
 *
 * `authError.type === 'auth_required'` is the canonical "no session"
 * marker; any other authError surfaces as a login-error string on the
 * Landing page's sign-in modal.
 */
export default function AuthenticatedApp() {
  const { isLoadingAuth, isLoadingPublicSettings, authError, loginWithPassword } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppLoader />;
  }

  if (authError?.type === "auth_required") {
    return (
      <Suspense fallback={<AppLoader />}>
        <Landing
          onLogin={loginWithPassword}
          isSubmitting={isLoadingAuth}
          loginError={authError?.message !== "Authentication required" ? authError?.message : null}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<AppLoader />}>
      <ProjectProvider>
        <AppRoutes />
      </ProjectProvider>
    </Suspense>
  );
}
