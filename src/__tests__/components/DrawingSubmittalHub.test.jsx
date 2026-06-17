// @vitest-environment jsdom
/**
 * DrawingSubmittalHub smoke + wiring test — boots the real hub (the moat shell:
 * Control Board / Process Board / Drawing Register / Submittal Register /
 * Approval Matrix) with Supabase mocked to empty, then confirms the new clean
 * Drawing Register tab is wired in: clicking it renders DrawingRegisterTable
 * (the flat per-set table), not the old embedded Drawings page.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    integrations: { Core: { UploadFile: vi.fn() } },
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => {
      const result = { data: [], error: null };
      const chain = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain), neq: vi.fn(() => chain),
        order: vi.fn(() => chain), in: vi.fn(() => chain), not: vi.fn(() => chain),
        is: vi.fn(() => chain), gte: vi.fn(() => chain), lte: vi.fn(() => chain),
        limit: vi.fn(() => chain), range: vi.fn(() => Promise.resolve(result)),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve) => resolve(result),
      };
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock("@/hooks/useFeatureFlag", () => ({ useFlag: () => false, useFeatureFlag: () => false }));
vi.mock("@/components/shared/useAppSecurity", () => ({
  useAppSecurity: () => ({ can: () => true, user: { email: "test@example.com" } }),
}));

import DrawingSubmittalHub from "@/pages/DrawingSubmittalHub";
import { ProjectContext } from "@/components/shared/ProjectContext";

const TEST_PROJECT = { id: "test-project-id", name: "Test Project" };

function renderHub() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
      <MemoryRouter initialEntries={["/DrawingSubmittalHub"]}>
        <ProjectContext.Provider value={ctxValue}>
          <DrawingSubmittalHub />
        </ProjectContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DrawingSubmittalHub (smoke + Drawing Register wiring)", () => {
  it("boots and renders the tab strip", async () => {
    renderHub();
    expect(await screen.findByText("Drawing Register")).toBeInTheDocument();
    expect(screen.getByText("Submittal Register")).toBeInTheDocument();
    expect(screen.getByText("Approval Matrix")).toBeInTheDocument();
  });

  it("renders the clean DrawingRegisterTable on the Drawing Register tab", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(await screen.findByText("Drawing Register"));
    // "Drawing Set Package" is the DrawingRegisterTable column header — unique to
    // the clean flat table (the old embedded Drawings page never rendered it).
    expect(await screen.findByText("Drawing Set Package")).toBeInTheDocument();
  });
});
