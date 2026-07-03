import { Suspense } from "react";
import { useAuth } from "@/lib/AuthContext";
import { OrgProvider, useOrg } from "@/components/shared/OrgContext";
import AppLoader from "@/boot/AppLoader";
import { lazyWithRetry } from "@/lib/lazyRetry";

const Landing = lazyWithRetry(() => import("@/pages/Landing"));
const UpdatePassword = lazyWithRetry(() => import("@/pages/UpdatePassword"));
const AppRoutes = lazyWithRetry(() => import("@/boot/AppRoutes"));
const OrgOnboarding = lazyWithRetry(() => import("@/pages/OrgOnboarding"));
const ProjectProvider = lazyWithRetry(() =>
  import("@/components/shared/ProjectContext").then((mod) => ({ default: mod.ProjectProvider }))
);

/**
 * AuthenticatedApp — auth gate + org gate + routing.
 *
 * States, in order of precedence:
 *   1. Auth still resolving         → AppLoader
 *   2. Auth required (no session)   → Landing (marketing + inline sign-in)
 *   3. Authenticated, resolving org → AppLoader
 *   4. Authenticated, no workspace  → OrgOnboarding (create a workspace)
 *   5. Authenticated, has workspace → AppRoutes
 *
 * The org gate is fail-open (see OrgContext): an org-fetch error renders the app
 * rather than trapping an existing user on onboarding.
 */
function OrgGate() {
  const { isLoadingOrgs, hasOrg } = useOrg();

  if (isLoadingOrgs) {
    return <AppLoader />;
  }
  if (!hasOrg) {
    return (
      <Suspense fallback={<AppLoader />}>
        <OrgOnboarding />
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

export default function AuthenticatedApp() {
  const {
    isLoadingAuth, isLoadingPublicSettings, authError,
    loginWithPassword, signUpWithPassword, sendPasswordReset, isPasswordRecovery,
  } = useAuth();

  // Password recovery takes precedence over every other state: a user who
  // followed the emailed reset link is technically "authenticated" with a
  // recovery session, so gate them straight to the set-new-password screen
  // rather than into the app or org onboarding (H22).
  if (isPasswordRecovery) {
    return (
      <Suspense fallback={<AppLoader />}>
        <UpdatePassword />
      </Suspense>
    );
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppLoader />;
  }

  if (authError?.type === "auth_required") {
    return (
      <Suspense fallback={<AppLoader />}>
        <Landing
          onLogin={loginWithPassword}
          onSignUp={signUpWithPassword}
          onForgotPassword={sendPasswordReset}
          isSubmitting={isLoadingAuth}
          loginError={authError?.message !== "Authentication required" ? authError?.message : null}
        />
      </Suspense>
    );
  }

  return (
    <OrgProvider>
      <OrgGate />
    </OrgProvider>
  );
}
