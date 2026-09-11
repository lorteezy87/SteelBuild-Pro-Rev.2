// @vitest-environment jsdom
/**
 * DrawingSubmittalHub smoke + wiring test — boots the real hub with Supabase
 * mocked empty, then confirms the Drawing Register tab mounts the clean
 * sheet-level DrawingRegisterGridPanel (Doc Control parity), plus the hub's
 * route entry (no-project state) and tab-history semantics.
 */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, it, expect, vi } from "vitest";

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
  useAppSecurity: () => ({ user: { email: "test@example.com", id: "test-user-id" } }),
}));
vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({
    can: () => true,
    userId: "test-user-id",
    isAdmin: false,
    user: { id: "test-user-id", email: "test@example.com" },
  }),
}));

// Holds drive the header badge + Holds tab count; keep the real helpers.
// data undefined = never loaded; isError WITH data = a failed background
// refetch that kept its cached rows (TanStack v5).
const holdsState = vi.hoisted(() => ({ data: [], isError: false }));
vi.mock("@/hooks/useDrawingHolds", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useDrawingHolds: () => ({
      data: holdsState.data,
      isSuccess: holdsState.data !== undefined && !holdsState.isError,
      isError: holdsState.isError,
      isLoading: holdsState.data === undefined && !holdsState.isError,
      error: holdsState.isError ? new Error("holds failed") : null,
    }),
  };
});

import DrawingSubmittalHub from "@/pages/DrawingSubmittalHub";
import { ProjectContext } from "@/components/shared/ProjectContext";

const TEST_PROJECT = { id: "test-project-id", name: "Test Project" };

afterEach(() => {
  holdsState.data = [];
  holdsState.isError = false;
});

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="search">{location.search}</output>
      <output data-testid="nav-type">{navigationType}</output>
      <button type="button" onClick={() => navigate(-1)}>probe-back</button>
    </div>
  );
}

function renderHub({ entries = ["/DrawingSubmittalHub"], ctx = {} } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ctxValue = {
    activeProject: TEST_PROJECT,
    setActiveProject: () => {},
    updateActiveProject: () => TEST_PROJECT,
    projects: [TEST_PROJECT],
    loading: false,
    projectLoadError: null,
    ...ctx,
  };
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={entries}>
        <ProjectContext.Provider value={ctxValue}>
          <DrawingSubmittalHub />
          <LocationProbe />
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

  it("mounts the clean sheet register on the Drawing Register tab", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(await screen.findByText("Drawing Register"));
    // DrawingRegisterGridPanel chrome — clean flat register (Doc Control look).
    expect(
      await screen.findByRole("button", { name: "Sets & revisions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Filter sheet, title, discipline, set/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by drawing set/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Group by set/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Full editor/i })).toBeInTheDocument();
  });

  it("embeds the Submittal Register without stacking a second title and KPI toolbar", async () => {
    const user = userEvent.setup();
    renderHub();

    await user.click(await screen.findByText("Submittal Register"));

    // The Submittal Register is a lazy chunk; under a loaded worker (full-suite
    // run) it can take longer than the 1s default to land.
    expect(
      await screen.findByPlaceholderText("Search # / title / spec section", {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Submittal Register")).toHaveLength(1);
    expect(screen.queryByText("At risk")).not.toBeInTheDocument();
  });
});

describe("DrawingSubmittalHub — route entry", () => {
  it("says there is no active project instead of rendering a stuck, empty hub", async () => {
    renderHub({ ctx: { activeProject: null, projects: [] } });
    expect(await screen.findByText("No active project")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("doesn't flash the no-project state while projects are still loading", () => {
    renderHub({ ctx: { activeProject: null, projects: [], loading: true } });
    expect(screen.queryByText("No active project")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});

describe("DrawingSubmittalHub — tab history", () => {
  it("pushes tab changes so Back returns to the previous tab", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=overview"] });

    await user.click(await screen.findByRole("tab", { name: /Approval Matrix/ }));
    expect(screen.getByTestId("search")).toHaveTextContent("hub_tab=matrix");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("PUSH");

    await user.click(screen.getByRole("button", { name: "probe-back" }));
    expect(screen.getByTestId("search")).toHaveTextContent("hub_tab=overview");
    expect(screen.getByRole("tab", { name: /Control Board/ })).toHaveAttribute("aria-selected", "true");
  });

  it("adds no history entry when the active tab is clicked again", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=matrix"] });

    await user.click(await screen.findByRole("tab", { name: /Approval Matrix/ }));
    expect(screen.getByTestId("nav-type")).toHaveTextContent("POP");
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=matrix");
  });

  it("drops the matrix quick filter and any project deep-link param when changing tabs", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub?projectId=test-project-id&project=test-project-id&hub_tab=matrix&matrix_filter=hold"] });

    await user.click(await screen.findByRole("tab", { name: /Holds & Blockers/ }));
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=holds");
  });

  it("drops unconsumed record and create params so they can't fire on a later visit", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=matrix&targetSetId=s2&recordId=r1&prefilledStatus=IFA&prefilledBallInCourt=EOR&transmittal=t1"] });

    await user.click(await screen.findByRole("tab", { name: /Control Board/ }));
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=overview");
  });
});

describe("DrawingSubmittalHub — holds", () => {
  it("counts only ACTIVE holds in the Holds tab and the header badge", async () => {
    holdsState.data = [
      { id: "h1", drawing_id: "d1", is_active: true, placed_at: "2026-09-01T00:00:00Z" },
      { id: "h2", drawing_id: "d2", is_active: true, placed_at: "2026-09-02T00:00:00Z" },
      { id: "h3", drawing_id: "d3", is_active: false, placed_at: "2026-08-01T00:00:00Z" },
    ];
    renderHub();

    const holdsTab = await screen.findByRole("tab", { name: /Holds & Blockers/ });
    expect(within(holdsTab).getByText("2")).toBeInTheDocument();
    expect(await screen.findByText("2 Sheets On Hold")).toBeInTheDocument();
  });

  it("keeps the last-known holds on screen when a background refetch fails", async () => {
    holdsState.data = [{ id: "h1", drawing_id: "d1", is_active: true, placed_at: "2026-09-01T00:00:00Z" }];
    holdsState.isError = true;
    renderHub();
    expect(await screen.findByText("1 Sheet On Hold")).toBeInTheDocument();
  });

  it("claims nothing about holds when they never loaded", async () => {
    holdsState.data = undefined;
    holdsState.isError = true;
    renderHub();
    expect(await screen.findByText("Nothing overdue")).toBeInTheDocument(); // band has rendered
    expect(screen.queryByText(/On Hold$|No holds/)).not.toBeInTheDocument();
  });

  it("shows the project number and name in the header", async () => {
    renderHub({ ctx: { activeProject: { id: "p-2", name: "Mesa Gateway", project_number: "24-117" } } });
    expect(await screen.findByText("24-117 · Mesa Gateway")).toBeInTheDocument();
    cleanup();
  });
});
