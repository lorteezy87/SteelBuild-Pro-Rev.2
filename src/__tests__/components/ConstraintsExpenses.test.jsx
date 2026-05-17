// @vitest-environment jsdom
/**
 * Smoke tests for page shells that previously crashed from missing React/icon
 * imports. Entity reads are mocked to empty arrays so these tests cover first
 * render without touching live project data.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/base44Client", () => {
  const noop = {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(null),
  };
  return {
    base44: { entities: new Proxy({}, { get: () => noop }) },
    resolveFileUrl: vi.fn((u) => u),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
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

import Constraints from "@/pages/Constraints";
import Expenses from "@/pages/Expenses";
import { ProjectContext } from "@/components/shared/ProjectContext";

const TEST_PROJECT = {
  id: "test-project-id",
  name: "Test Project",
  project_name: "Test Project",
};

function renderWithProject(ui, route) {
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
      <MemoryRouter initialEntries={[route]}>
        <ProjectContext.Provider value={ctxValue}>{ui}</ProjectContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("constraints and expenses page shells", () => {
  it("renders Constraints without crashing", () => {
    renderWithProject(<Constraints />, "/Constraints");
    expect(screen.getByText("Constraint Log")).toBeInTheDocument();
  });

  it("renders Expenses without crashing", () => {
    renderWithProject(<Expenses />, "/Expenses");
    expect(screen.getByText("Expenses")).toBeInTheDocument();
  });
});
