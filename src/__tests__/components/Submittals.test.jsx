// @vitest-environment jsdom
/**
 * Submittals smoke test — renders the real Submittals page with router,
 * QueryClient, and a synthetic active project. entity reads
 * are mocked to empty arrays so the page renders its empty CommandBar
 * state without network traffic.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/api/supabaseClient", () => {
  const noop = {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
  };
  return {
    entities: new Proxy({}, { get: () => noop }),
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

import Submittals from "@/pages/Submittals";
import { ProjectContext } from "@/components/shared/ProjectContext";

const TEST_PROJECT = {
  id: "test-project-id",
  name: "Test Project",
  project_name: "Test Project",
};

function renderSubmittals() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ctxValue = {
    activeProject: TEST_PROJECT,
    setActiveProject: () => {},
    updateActiveProject: () => TEST_PROJECT,
    projects: [TEST_PROJECT],
    loading: false,
    projectLoadError: null,
  };
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/Submittals"]}>
        <ProjectContext.Provider value={ctxValue}>
          <Submittals />
        </ProjectContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Submittals page (smoke)", () => {
  it("renders without crashing and shows the CommandBar title", () => {
    renderSubmittals();
    expect(screen.getByText("Submittal Register")).toBeInTheDocument();
  });

  it("renders the project-scoped eyebrow", () => {
    renderSubmittals();
    // Eyebrow text contains "SUBMITTALS"
    expect(screen.getByText(/SUBMITTALS/)).toBeInTheDocument();
  });
});
