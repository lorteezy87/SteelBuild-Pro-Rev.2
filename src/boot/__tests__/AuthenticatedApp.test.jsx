// @vitest-environment jsdom
//
// Boot/gate reliability test: the auth + org gate decides what an authenticated
// (and unauthenticated) user sees first. A regression here is a white-screen or
// a lockout for a paying customer, so we pin the precedence:
//   auth loading → Landing (no session) → org loading → onboarding (no org) → app.
// The lazy children + both context hooks are stubbed so we test only the gate.

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

let authState;
let orgState;

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/components/shared/OrgContext", () => ({
  OrgProvider: ({ children }) => children,
  useOrg: () => orgState,
}));
vi.mock("@/boot/AppLoader", () => ({ default: () => <div>LOADER</div> }));
vi.mock("@/pages/Landing", () => ({ default: () => <div>LANDING</div> }));
vi.mock("@/boot/AppRoutes", () => ({ default: () => <div>APP_ROUTES</div> }));
vi.mock("@/pages/OrgOnboarding", () => ({ default: () => <div>ONBOARDING</div> }));
vi.mock("@/components/shared/ProjectContext", () => ({ ProjectProvider: ({ children }) => <>{children}</> }));

import AuthenticatedApp from "@/boot/AuthenticatedApp";

const authed = { isLoadingAuth: false, isLoadingPublicSettings: false, authError: null, loginWithPassword: vi.fn() };

describe("AuthenticatedApp — auth + org gate precedence", () => {
  beforeEach(() => {
    authState = { ...authed };
    orgState = { isLoadingOrgs: false, hasOrg: true };
  });

  it("shows the loader while auth is resolving", () => {
    authState = { ...authed, isLoadingAuth: true };
    render(<AuthenticatedApp />);
    expect(screen.getByText("LOADER")).toBeInTheDocument();
  });

  it("shows the Landing page when there is no session", async () => {
    authState = { ...authed, authError: { type: "auth_required", message: "Authentication required" } };
    render(<AuthenticatedApp />);
    expect(await screen.findByText("LANDING")).toBeInTheDocument();
  });

  it("shows the loader while the org is resolving", () => {
    orgState = { isLoadingOrgs: true, hasOrg: false };
    render(<AuthenticatedApp />);
    expect(screen.getByText("LOADER")).toBeInTheDocument();
  });

  it("shows onboarding for an authenticated user with no workspace", async () => {
    orgState = { isLoadingOrgs: false, hasOrg: false };
    render(<AuthenticatedApp />);
    expect(await screen.findByText("ONBOARDING")).toBeInTheDocument();
  });

  it("renders the app for an authenticated user with a workspace", async () => {
    orgState = { isLoadingOrgs: false, hasOrg: true };
    render(<AuthenticatedApp />);
    expect(await screen.findByText("APP_ROUTES")).toBeInTheDocument();
  });

  it("fails open — renders the app when the org gate reports hasOrg despite an error", async () => {
    // OrgContext sets hasOrg=true on fetch error; the gate must NOT trap the user.
    orgState = { isLoadingOrgs: false, hasOrg: true, isError: true };
    render(<AuthenticatedApp />);
    expect(await screen.findByText("APP_ROUTES")).toBeInTheDocument();
    expect(screen.queryByText("ONBOARDING")).not.toBeInTheDocument();
  });
});
