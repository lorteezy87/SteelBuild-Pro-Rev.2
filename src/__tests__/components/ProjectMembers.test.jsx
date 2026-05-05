// @vitest-environment jsdom
/**
 * ProjectMembers smoke test — renders the real page inside a router +
 * QueryClient + ProjectContext stack with an admin user mocked into
 * AuthContext (so AdminRoute lets us through). base44 entity reads
 * are mocked to return empty arrays so the page renders the
 * "pick a project" empty state without any network traffic.
 *
 * Mirrors the Drawings / Layout smoke-test idiom — proof of life that
 * the route loads, the CommandBar renders, and the project picker
 * mounts. Doesn't exercise the mutation paths.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

// AdminRoute calls useAuth(); the page itself also calls useAuth() to
// figure out who the current user is for the self-edit guard. Mock the
// hook to return a system admin so we land past the gate.
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-admin-id", email: "admin@example.com", role: "admin" },
    isAuthenticated: true,
    isLoadingAuth: false,
  }),
  AuthContext: React.createContext({
    user: { id: "test-admin-id", email: "admin@example.com", role: "admin" },
  }),
}));

vi.mock("@/api/base44Client", () => {
  const noop = {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue({ success: true }),
  };
  return {
    base44: { entities: new Proxy({}, { get: () => noop }) },
    resolveFileUrl: vi.fn((u) => u),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

import ProjectMembers from "@/pages/ProjectMembers";
import { ProjectContext } from "@/components/shared/ProjectContext";

function renderProjectMembers(activeProject = null) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ctxValue = {
    activeProject,
    setActiveProject: () => {},
    updateActiveProject: () => activeProject,
    projects: activeProject ? [activeProject] : [],
    loading: false,
    projectLoadError: null,
  };
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/ProjectMembers"]}>
        <ProjectContext.Provider value={ctxValue}>
          <ProjectMembers />
        </ProjectContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectMembers page (smoke)", () => {
  it("renders without crashing and shows the CommandBar title", () => {
    renderProjectMembers();
    expect(screen.getByText("Project Members")).toBeInTheDocument();
  });

  it("renders the project picker so an admin can pick a project", () => {
    renderProjectMembers();
    expect(
      screen.getByLabelText(/select project to manage members for/i),
    ).toBeInTheDocument();
  });

  it("hides the members table until a project is selected", () => {
    renderProjectMembers(); // no active project
    // The pick-a-project empty subtitle is what tells the admin what to
    // do next — the table itself shouldn't be on screen yet.
    expect(
      screen.getByText(/pick a project to manage its members/i),
    ).toBeInTheDocument();
  });
});
