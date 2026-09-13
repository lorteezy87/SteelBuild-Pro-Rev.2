// @vitest-environment jsdom
/**
 * Submittals smoke test — renders the real Submittals page with router,
 * QueryClient, and a synthetic active project. entity reads
 * are mocked to empty arrays so the page renders its empty canonical register
 * state without network traffic.
 */

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submittalFilter: vi.fn(), componentFilter: vi.fn(), featureFlags: vi.fn() }));

vi.mock("@/api/supabaseClient", () => {
  const noop = {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
  };
  return {
    entities: new Proxy({}, {
      get: (_target, entity) => {
        if (entity === "Submittal") return { ...noop, filter: mocks.submittalFilter };
        if (entity === "SubmittalComponent") return { ...noop, filter: mocks.componentFilter };
        if (entity === "FeatureFlag") return { ...noop, list: mocks.featureFlags };
        return noop;
      },
    }),
    resolveFileUrl: vi.fn((u) => u),
  };
});

vi.mock("@/pages/submittals/SubmittalWorkspace", async (importOriginal) => ({
  ...await importOriginal(),
  SubmittalDetailSection: ({ detail }) => detail.submittal
    ? <output aria-label="Selected submittal">{detail.submittal.id}</output>
    : null,
}));

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

function RouteLocation() {
  const location = useLocation();
  return <output aria-label="Current route">{location.pathname}{location.search}</output>;
}

function renderSubmittals(initialEntry = "/Submittals") {
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
      <MemoryRouter initialEntries={[initialEntry]}>
        <RouteLocation />
        <ProjectContext.Provider value={ctxValue}>
          <Routes>
            <Route path="/Submittals" element={<Submittals />} />
          </Routes>
        </ProjectContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Submittals page (smoke)", () => {
  beforeEach(() => {
    mocks.submittalFilter.mockReset().mockResolvedValue([]);
    mocks.componentFilter.mockReset().mockResolvedValue([]);
    mocks.featureFlags.mockReset().mockResolvedValue([]);
  });

  it("preserves the record deep link after a failed read and opens it when Retry succeeds", async () => {
    const user = userEvent.setup();
    mocks.submittalFilter.mockRejectedValue(new Error("Submittals unavailable"));
    renderSubmittals("/Submittals?recordId=s1");

    expect(await screen.findByRole("alert", { name: "Submittals" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/Submittals?recordId=s1");
    expect(screen.queryByLabelText("Selected submittal")).not.toBeInTheDocument();

    let resolveRetry;
    mocks.submittalFilter.mockImplementation(() => new Promise((resolve) => {
      resolveRetry = resolve;
    }));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/Submittals?recordId=s1");
    expect(screen.queryByLabelText("Selected submittal")).not.toBeInTheDocument();

    await act(async () => {
      resolveRetry([{
        id: "s1",
        project_id: TEST_PROJECT.id,
        submittal_number: "SUB-001",
        title: "Recovered submittal",
        status: "Draft",
        ball_in_court: "Detailer",
        drawing_set_ids: [],
      }]);
    });

    expect(await screen.findByLabelText("Selected submittal")).toHaveTextContent("s1");
    await waitFor(() => expect(screen.getByLabelText("Current route").textContent).toBe("/Submittals"));
  });

  it("waits for enabled drawing-type evidence and allows retry after its failure", async () => {
    const user = userEvent.setup();
    mocks.featureFlags.mockResolvedValue([{ flag_key: "submittal_drawing_types", enabled: true }]);
    mocks.componentFilter.mockRejectedValue(new Error("Drawing types unavailable"));
    renderSubmittals();
    expect(await screen.findByRole("alert", { name: "Submittals" })).toBeInTheDocument();
    expect(screen.queryByText("Submittal Register")).not.toBeInTheDocument();
    mocks.componentFilter.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Submittal Register")).toBeInTheDocument();
  });

  it("keeps the register waiting while enabled drawing-type evidence is pending", async () => {
    mocks.featureFlags.mockResolvedValue([{ flag_key: "submittal_drawing_types", enabled: true }]);
    let resolveComponents;
    mocks.componentFilter.mockImplementation(() => new Promise(resolve => { resolveComponents = resolve; }));
    renderSubmittals();
    await waitFor(() => expect(mocks.componentFilter).toHaveBeenCalled());
    expect(screen.getByRole("status", { name: "Submittals" })).toBeInTheDocument();
    expect(screen.queryByText("Submittal Register")).not.toBeInTheDocument();
    await act(async () => resolveComponents([]));
    expect(await screen.findByText("Submittal Register")).toBeInTheDocument();
  });

  it("does not request drawing-type evidence when its feature is disabled", async () => {
    renderSubmittals();
    expect(await screen.findByText("Submittal Register")).toBeInTheDocument();
    expect(mocks.componentFilter).not.toHaveBeenCalled();
  });

  it("renders without crashing and shows the canonical register title", async () => {
    renderSubmittals();
    expect(await screen.findByText("Submittal Register")).toBeInTheDocument();
  });

  it("renders the project-scoped eyebrow", async () => {
    renderSubmittals();
    expect(await screen.findByText(/Submittals/)).toBeInTheDocument();
  });

  it("renders the canonical filter and search surface", async () => {
    renderSubmittals();
    expect(await screen.findByPlaceholderText("Search # / title / spec section")).toBeInTheDocument();
  });
});
