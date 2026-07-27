import { Suspense } from "react";
import { useAuth } from "@/lib/AuthContext";
import { OrgProvider, useOrg } from "@/components/shared/OrgContext";
import AppLoader from "@/boot/AppLoader";
import { lazyWithRetry } from "@/lib/lazyRetry";

const Landing = lazyWithRetry(() => import("@/pages/Landing"));
const DesktopConnectSignIn = lazyWithRetry(() => import("@/pages/DesktopConnectSignIn"));
const UpdatePassword = lazyWithRetry(() => import("@/pages/UpdatePassword"));
const MfaChallenge = lazyWithRetry(() => import("@/pages/MfaChallenge"));
const AppRoutes = lazyWithRetry(() => import("@/boot/AppRoutes"));
const OrgOnboarding = lazyWithRetry(() => import("@/pages/OrgOnboarding"));
const ProjectProvider = lazyWithRetry(() =>
  import("@/components/shared/ProjectContext").then((mod) => ({ default: mod.ProjectProvider }))
);

function isDesktopConnectPath() {
  if (typeof window === "undefined") return false;
  return /\/DesktopConnect\/?$/i.test(window.location.pathname);
}

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
    loginWithPassword, signUpWithPassword, sendPasswordReset, isPasswordRecovery, mfaRequired,
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

  // MFA step-up: an aal1 session on an account with a verified TOTP factor must
  // complete the challenge before entering the app or org onboarding (H23).
  if (mfaRequired) {
    return (
      <Suspense fallback={<AppLoader />}>
        <MfaChallenge />
      </Suspense>
    );
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppLoader />;
  }

  if (authError?.type === "auth_required") {
    const loginError = authError?.message !== "Authentication required" ? authError?.message : null;
    // Desktop Connect opens the system browser, which often has no session even
    // when the user is signed in elsewhere. Show a focused gate instead of the
    // marketing Landing page so the handoff query string stays obvious.
    if (isDesktopConnectPath()) {
      return (
        <Suspense fallback={<AppLoader />}>
          <DesktopConnectSignIn
            onLogin={loginWithPassword}
            isSubmitting={isLoadingAuth}
            loginError={loginError}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<AppLoader />}>
        <Landing
          onLogin={loginWithPassword}
          onSignUp={signUpWithPassword}
          onForgotPassword={sendPasswordReset}
          isSubmitting={isLoadingAuth}
          loginError={loginError}
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
