// @vitest-environment jsdom
/**
 * Drawings smoke test — renders the real Drawings page inside the
 * router + QueryClient + ProjectContext stack. base44 entity reads
 * are mocked to return empty arrays so the page renders its
 * empty-state CommandBar without any network traffic.
 *
 * We provide a synthetic active project so the page advances past
 * its "SELECT A PROJECT TO VIEW DRAWINGS" guard and exercises the
 * real CommandBar / KPI / table render path.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/api/base44Client", () => {
  const noop = {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
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

import Drawings from "@/pages/Drawings";
import { ProjectContext } from "@/components/shared/ProjectContext";

const TEST_PROJECT = {
  id: "test-project-id",
  name: "Test Project",
};

function renderDrawings() {
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
      <MemoryRouter initialEntries={["/Drawings"]}>
        <ProjectContext.Provider value={ctxValue}>
          <Drawings />
        </ProjectContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Drawings page (smoke)", () => {
  it("renders without crashing and shows the CommandBar title", () => {
    renderDrawings();
    expect(screen.getByText("Drawings & Submittals")).toBeInTheDocument();
  });

  it("renders the page eyebrow scoped to the active project", () => {
    renderDrawings();
    // Eyebrow text is `DESIGN & DOCUMENTS · TEST PROJECT`
    expect(screen.getByText(/DESIGN & DOCUMENTS/)).toBeInTheDocument();
  });
});
