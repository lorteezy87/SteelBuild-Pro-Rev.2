// @vitest-environment jsdom
import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createContext } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlannerAuthGate, { clearPlannerTenantStorage } from "../PlannerAuthGate";
import PlannerRoutes from "../PlannerRoutes";
import { getSteelBuildMainAppUrl, normalizeSteelBuildMainAppUrl } from "../plannerAppUrl";

type AuthState = {
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  isLoadingPublicSettings: boolean;
  isPasswordRecovery: boolean;
  mfaRequired: boolean;
  authError: { type: "auth_required"; message: string } | null;
  loginWithPassword: () => Promise<{ success: true }>;
  signUpWithPassword: () => Promise<{ success: true; needsConfirmation: false }>;
  sendPasswordReset: () => Promise<{ success: true }>;
  logout: () => Promise<void>;
  user: { id: string; full_name: string } | null;
};

let authState: AuthState;
let orgState: { isLoadingOrgs: boolean; hasOrg: boolean };

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => authState,
  registerTenantClientStateCleanup: () => () => undefined,
}));
vi.mock("@/components/shared/OrgContext", () => ({
  OrgProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useOrg: () => orgState,
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  ProjectProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ProjectContext: createContext({ projects: [], loading: false, projectLoadError: null }),
}));
vi.mock("@/pages/Landing", () => ({
  default: () => <div>SteelBuild credential form</div>,
}));
vi.mock("@/pages/MfaChallenge", () => ({
  default: () => <div>SteelBuild MFA challenge</div>,
}));
vi.mock("@/pages/UpdatePassword", () => ({
  default: () => <div>SteelBuild password recovery</div>,
}));

const readyAuth: AuthState = {
  isAuthenticated: true,
  isLoadingAuth: false,
  isLoadingPublicSettings: false,
  isPasswordRecovery: false,
  mfaRequired: false,
  authError: null,
  loginWithPassword: vi.fn(async () => ({ success: true } as const)),
  signUpWithPassword: vi.fn(async () => ({ success: true, needsConfirmation: false } as const)),
  sendPasswordReset: vi.fn(async () => ({ success: true } as const)),
  logout: vi.fn(async () => undefined),
  user: { id: "planner-user", full_name: "Planner User" },
};

describe("PlannerAuthGate", () => {
  beforeEach(() => {
    authState = { ...readyAuth };
    orgState = { isLoadingOrgs: false, hasOrg: true };
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("shows the Planner loading state while SteelBuild auth resolves", () => {
    authState = { ...readyAuth, isLoadingAuth: true };

    render(<PlannerAuthGate><div>AUTHORIZED_PLANNER</div></PlannerAuthGate>);

    expect(screen.getByRole("status")).toHaveTextContent("Loading SteelBuild Planner…");
  });

  it("uses the existing SteelBuild credential form when authentication is required", () => {
    authState = {
      ...readyAuth,
      authError: { type: "auth_required", message: "Authentication required" },
    };

    render(<PlannerAuthGate><div>AUTHORIZED_PLANNER</div></PlannerAuthGate>);

    expect(screen.getByText("SteelBuild credential form")).toBeInTheDocument();
    expect(screen.queryByText("AUTHORIZED_PLANNER")).not.toBeInTheDocument();
  });

  it("returns to the credential boundary after logout clears identity without an auth error", () => {
    authState = { ...readyAuth, isAuthenticated: false, user: null, authError: null };

    render(<PlannerAuthGate><div>AUTHORIZED_PLANNER</div></PlannerAuthGate>);

    expect(screen.getByText("SteelBuild credential form")).toBeInTheDocument();
    expect(screen.queryByText("AUTHORIZED_PLANNER")).not.toBeInTheDocument();
  });

  it("uses the existing MFA challenge before Planner access", () => {
    authState = { ...readyAuth, mfaRequired: true };

    render(<PlannerAuthGate><div>AUTHORIZED_PLANNER</div></PlannerAuthGate>);

    expect(screen.getByText("SteelBuild MFA challenge")).toBeInTheDocument();
    expect(screen.queryByText("AUTHORIZED_PLANNER")).not.toBeInTheDocument();
  });

  it("prioritizes password recovery above MFA, loading, and the credential form", () => {
    authState = {
      ...readyAuth,
      isPasswordRecovery: true,
      isLoadingAuth: true,
      mfaRequired: true,
      authError: { type: "auth_required", message: "Authentication required" },
    };

    render(<PlannerAuthGate><div>AUTHORIZED_PLANNER</div></PlannerAuthGate>);

    expect(screen.getByText("SteelBuild password recovery")).toBeInTheDocument();
    expect(screen.queryByText("SteelBuild MFA challenge")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("SteelBuild credential form")).not.toBeInTheDocument();
  });

  it("links a signed-in user without an organization to SteelBuild onboarding", () => {
    orgState = { isLoadingOrgs: false, hasOrg: false };

    render(<PlannerAuthGate><div>AUTHORIZED_PLANNER</div></PlannerAuthGate>);

    expect(screen.getByRole("link", { name: "Open SteelBuild onboarding" })).toHaveAttribute(
      "href",
      "https://steelbuild-pro.com/Onboarding",
    );
    expect(screen.queryByText("AUTHORIZED_PLANNER")).not.toBeInTheDocument();
  });

  it("normalizes a configured SteelBuild app URL before building the onboarding destination", () => {
    const mainAppUrl = getSteelBuildMainAppUrl("https://planner-staging.example.com/");

    expect(mainAppUrl).toBe("https://planner-staging.example.com");
    expect(normalizeSteelBuildMainAppUrl("https://planner-staging.example.com///")).toBe(
      "https://planner-staging.example.com",
    );
  });

  it("keeps only the http origin from a configured main-app URL", () => {
    expect(normalizeSteelBuildMainAppUrl("https://planner-staging.example.com/app/?preview=true#onboarding")).toBe(
      "https://planner-staging.example.com",
    );
  });

  it("falls back when the configured main-app URL is malformed or not http", () => {
    expect(normalizeSteelBuildMainAppUrl("not a url")).toBe("https://steelbuild-pro.com");
    expect(normalizeSteelBuildMainAppUrl("javascript:alert('unsafe')")).toBe("https://steelbuild-pro.com");
  });

  it("renders an origin-only external onboarding destination from configured Planner environment", () => {
    vi.stubEnv("VITE_STEELBUILD_APP_URL", "https://planner-staging.example.com/app/?preview=true#onboarding");
    orgState = { isLoadingOrgs: false, hasOrg: false };

    render(<PlannerAuthGate><div>AUTHORIZED_PLANNER</div></PlannerAuthGate>);

    expect(screen.getByRole("link", { name: "Open SteelBuild onboarding" })).toHaveAttribute(
      "href",
      "https://planner-staging.example.com/Onboarding",
    );
  });

  it("renders authorized Planner children inside the shared tenant providers", () => {
    render(<PlannerAuthGate><div>AUTHORIZED_PLANNER</div></PlannerAuthGate>);

    expect(screen.getByText("AUTHORIZED_PLANNER")).toBeInTheDocument();
  });

  it("removes only Planner-scoped browser state when shared tenant cleanup runs", () => {
    localStorage.setItem("sbp:planner:user-a:org-a", "cached planner data");
    localStorage.setItem("sbp:field:outbox:user-a", "field data");

    clearPlannerTenantStorage();

    expect(localStorage.getItem("sbp:planner:user-a:org-a")).toBeNull();
    expect(localStorage.getItem("sbp:field:outbox:user-a")).toBe("field data");
  });

  it("clears React Query and Planner storage when the shared AuthProvider receives a new identity or SIGNED_OUT", async () => {
    type AuthEventListener = (
      event: string,
      session: { user: { id: string; email: string; user_metadata: Record<string, unknown> } } | null,
    ) => void;

    let authEventListener: AuthEventListener | null = null;
    const profileLookup = vi.fn(async () => ({ data: { role: "user" } }));
    const firstSession = {
      user: { id: "planner-user-a", email: "a@example.com", user_metadata: {} },
    };
    const secondSession = {
      user: { id: "planner-user-b", email: "b@example.com", user_metadata: {} },
    };

    vi.doMock("@/lib/supabase", () => ({
      supabase: {
        auth: {
          getSession: vi.fn(async () => ({ data: { session: firstSession } })),
          refreshSession: vi.fn(async () => ({ data: { session: null } })),
          onAuthStateChange: vi.fn((listener: AuthEventListener) => {
            authEventListener = listener;
            return { data: { subscription: { unsubscribe: vi.fn() } } };
          }),
          mfa: {
            getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: null })),
          },
        },
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: profileLookup })),
          })),
        })),
      },
    }));
    vi.doMock("@/lib/field/blobStore", () => ({
      clearPendingPhotos: vi.fn(async () => undefined),
    }));
    vi.doMock("@sentry/react", () => ({
      captureException: vi.fn(),
      setUser: vi.fn(),
    }));

    const authModule = await vi.importActual<typeof import("@/lib/AuthContext")>("@/lib/AuthContext");
    const queryModule = await vi.importActual<typeof import("@/lib/query-client")>("@/lib/query-client");
    const clearQueryCache = vi.spyOn(queryModule.queryClientInstance, "clear");

    function PlannerCleanupRegistration() {
      useEffect(
        () => authModule.registerTenantClientStateCleanup(clearPlannerTenantStorage),
        [],
      );
      return null;
    }

    render(
      <authModule.AuthProvider>
        <PlannerCleanupRegistration />
      </authModule.AuthProvider>,
    );

    await waitFor(() => expect(profileLookup).toHaveBeenCalled());
    localStorage.setItem("sbp:planner:planner-user-a", "stale planner state");

    authEventListener?.("SIGNED_IN", secondSession);

    await waitFor(() => expect(clearQueryCache).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("sbp:planner:planner-user-a")).toBeNull();

    localStorage.setItem("sbp:planner:planner-user-b", "planner state after identity change");
    localStorage.setItem("unrelated-storage", "retain this value");

    authEventListener?.("SIGNED_OUT", null);

    await waitFor(() => expect(clearQueryCache).toHaveBeenCalledTimes(2));
    expect(localStorage.getItem("sbp:planner:planner-user-b")).toBeNull();
    expect(localStorage.getItem("unrelated-storage")).toBe("retain this value");
    clearQueryCache.mockRestore();
  });
});

describe("PlannerRoutes", () => {
  it("keeps the SteelBuild Planner identity on the home route", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <PlannerRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "STEELBUILD-PLANNER" })).toBeInTheDocument();
  });

  it("mounts Task Register as the usable shell and honest empty register reference", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/task-register"]}>
          <PlannerRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Task Register" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByLabelText("Action register toolbar")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("No actions match the current Planner register filters.")).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "Search actions" });
    fireEvent.change(search, { target: { value: "shop drawings" } });
    expect(search).toHaveValue("shop drawings");

    expect(screen.getByRole("button", { name: "New Task" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Complete Selected" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByText("No authorized active project is available for a new task.")).toBeInTheDocument();
    expect(screen.getByText("No authorized rows match the current Planner filters.")).toBeInTheDocument();
  });

  it("renders a safe not-found route", () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <PlannerRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Planner page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Planner home" })).toHaveAttribute("href", "/");
  });
});
