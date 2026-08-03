import { useEffect, type ReactNode } from "react";
import { OrgProvider, useOrg } from "@/components/shared/OrgContext";
import { ProjectProvider } from "@/components/shared/ProjectContext";
import {
  registerTenantClientStateCleanup,
  useAuth,
} from "@/lib/AuthContext";
import Landing from "@/pages/Landing";
import MfaChallenge from "@/pages/MfaChallenge";
import UpdatePassword from "@/pages/UpdatePassword";
import { getSteelBuildOnboardingUrl } from "@planner/app/plannerAppUrl";
import PlannerOfflineProvider from "@planner/offline/PlannerOfflineProvider";
import { clearPlannerTenantState } from "@planner/offline/plannerSnapshots";

type PlannerAuthGateProps = {
  children: ReactNode;
};

function PlannerLoadingState() {
  return <div role="status" aria-live="polite">Loading SteelBuild Planner…</div>;
}

/** Removes Planner-owned browser state when the authenticated identity changes. */
export function clearPlannerTenantStorage(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("sbp:planner:")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Browser storage is best-effort in private browsing and non-browser tests.
  }
  void clearPlannerTenantState();
}

function PlannerOrgGate({ children }: PlannerAuthGateProps) {
  const { hasOrg, isLoadingOrgs, currentOrg } = useOrg();
  const { user } = useAuth();

  if (isLoadingOrgs) {
    return <PlannerLoadingState />;
  }

  if (!hasOrg) {
    return (
      <section aria-labelledby="planner-onboarding-heading">
        <h2 id="planner-onboarding-heading">A SteelBuild workspace is required</h2>
        <p>Create or join a workspace before using SteelBuild Planner.</p>
        <a href={getSteelBuildOnboardingUrl()}>Open SteelBuild onboarding</a>
      </section>
    );
  }

  return <ProjectProvider><PlannerOfflineProvider key={`${user?.id ?? "anonymous"}:${currentOrg?.id ?? "no-org"}`}>{children}</PlannerOfflineProvider></ProjectProvider>;
}

/**
 * Adapts the existing SteelBuild authentication and tenancy boundaries to the
 * Planner. RLS remains authoritative; this only selects the appropriate UI.
 */
export default function PlannerAuthGate({ children }: PlannerAuthGateProps) {
  const {
    authError,
    isLoadingAuth,
    isLoadingPublicSettings,
    isPasswordRecovery,
    loginWithPassword,
    mfaRequired,
    sendPasswordReset,
    signUpWithPassword,
  } = useAuth();

  useEffect(() => registerTenantClientStateCleanup(clearPlannerTenantStorage), []);

  if (isPasswordRecovery) {
    return <UpdatePassword />;
  }

  if (mfaRequired) {
    return <MfaChallenge />;
  }

  if (isLoadingAuth || isLoadingPublicSettings) {
    return <PlannerLoadingState />;
  }

  if (authError?.type === "auth_required") {
    return (
      <Landing
        onLogin={loginWithPassword}
        onSignUp={signUpWithPassword}
        onForgotPassword={sendPasswordReset}
        isSubmitting={isLoadingAuth}
        loginError={authError.message !== "Authentication required" ? authError.message : null}
      />
    );
  }

  return (
    <OrgProvider>
      <PlannerOrgGate>{children}</PlannerOrgGate>
    </OrgProvider>
  );
}
