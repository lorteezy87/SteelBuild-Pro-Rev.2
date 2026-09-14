// @vitest-environment jsdom
/**
 * The hub under real routes. It unmounts when the user leaves
 * /DrawingSubmittalHub and remounts on Back, which the main hub suite (no
 * <Routes>) can't model. Also covers the wiring behind owner decision 3:
 * board clicks open records inside the hub.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";

// Lazy panel chunks can take seconds under a loaded full-suite run.
vi.setConfig({ testTimeout: 15000 });

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
    resolveFileUrl: vi.fn((u: string) => u),
    integrations: { Core: { UploadFile: vi.fn() } },
  };
});

vi.mock("@/lib/supabase", () => {
  const result = { data: [] as unknown[], error: null as Error | null };
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "order", "in", "not", "is", "gte", "lte", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.range = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.then = (resolve: (value: typeof result) => unknown) => resolve(result);
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: vi.fn(() => chain),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

// Flags loaded, all off. The hub reads the flags query's data to tell "off"
// from "still loading" on the 3D tab.
vi.mock("@/hooks/useFeatureFlag", () => ({
  useFlag: () => false,
  useFeatureFlag: () => false,
  useAllFlags: () => ({ isSuccess: true, isPending: false, data: new Map<string, boolean>() }),
}));
vi.mock("@/components/shared/useAppSecurity", () => ({
  useAppSecurity: () => ({ user: { email: "test@example.com", id: "test-user-id" } }),
}));
vi.mock("@/lib/AuthContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/AuthContext")>()),
  useAuth: () => ({ user: { email: "test@example.com", id: "test-user-id" } }),
}));
vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({
    can: () => true,
    userId: "test-user-id",
    isAdmin: false,
    user: { id: "test-user-id", email: "test@example.com" },
  }),
}));
vi.mock("@/hooks/useDrawingHolds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useDrawingHolds")>()),
  useDrawingHolds: () => ({ data: [] as unknown[], isSuccess: true, isError: false, isLoading: false, error: null as Error | null }),
}));

// Stubs expose exactly what the hub hands each board (owner decision 3).
vi.mock("@/pages/drawingSubmittalHub/ControlBoardPanel", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: { onOpenHref?: (href: string) => void }) =>
      createElement(
        "button",
        {
          type: "button",
          "data-wired": typeof props.onOpenHref,
          onClick: () => props.onOpenHref?.("/DrawingSubmittalHub?hub_tab=submittals&recordId=sub-1"),
        },
        "board-row",
      ),
  };
});
vi.mock("@/components/submittals/ProcessBoardPanel", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: { inHub?: boolean }) => createElement("output", { "data-testid": "process-inhub" }, String(props.inHub)),
  };
});
// The real register would consume ?recordId= as soon as its chunk lands.
vi.mock("@/pages/Submittals", async () => {
  const { createElement } = await import("react");
  return { default: () => createElement("p", null, "submittal-register") };
});

import DrawingSubmittalHub from "@/pages/DrawingSubmittalHub";
import { ProjectContext } from "@/components/shared/ProjectContext";

afterEach(cleanup);

const TEST_PROJECT = { id: "test-project-id", name: "Test Project" };

function Probe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="search">{location.search}</output>
      <output data-testid="nav-type">{navigationType}</output>
      <button type="button" onClick={() => navigate(-1)}>probe-back</button>
      <button type="button" onClick={() => navigate("/DrawingViewer?drawingId=d1")}>probe-leave</button>
    </div>
  );
}

function renderHubRoutes(entry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ctx = {
    activeProject: TEST_PROJECT,
    setActiveProject: () => {},
    updateActiveProject: () => TEST_PROJECT,
    projects: [TEST_PROJECT],
    loading: false,
    projectLoadError: null as string | null,
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <ProjectContext.Provider value={ctx as never}>
          <Routes>
            <Route path="/DrawingSubmittalHub" element={<DrawingSubmittalHub />} />
            <Route path="*" element={<p>somewhere else</p>} />
          </Routes>
          <Probe />
        </ProjectContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const NOTICE = { name: "Doc Control has moved" };

describe("hub under real routes", () => {
  it("doesn't bring the Doc Control notice back after leaving the hub and pressing Back", async () => {
    const user = userEvent.setup();
    renderHubRoutes("/DrawingSubmittalHub?hub_tab=doccontrol");

    expect(await screen.findByRole("heading", NOTICE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss the Doc Control notice" }));
    expect(screen.queryByRole("heading", NOTICE)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "probe-leave" }));
    expect(await screen.findByText("somewhere else")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "probe-back" }));
    // Back on the arrival entry, the hub remounts on the Drawing Register...
    expect(await screen.findByRole("tab", { name: /Drawing Register/ })).toHaveAttribute("aria-selected", "true");
    // ...and the dismissed notice stays gone.
    expect(screen.queryByRole("heading", NOTICE)).not.toBeInTheDocument();
  });

  it("hands the Control Board an in-hub opener: a row click opens the record as a new history entry", async () => {
    const user = userEvent.setup();
    renderHubRoutes("/DrawingSubmittalHub?hub_tab=overview");

    const row = await screen.findByRole("button", { name: "board-row" });
    expect(row).toHaveAttribute("data-wired", "function");
    await user.click(row);
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=submittals&recordId=sub-1");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("PUSH");
    expect(await screen.findByText("submittal-register")).toBeInTheDocument();
  });

  it("tells the Process Board it's inside the hub", async () => {
    renderHubRoutes("/DrawingSubmittalHub?hub_tab=process");
    expect(await screen.findByTestId("process-inhub")).toHaveTextContent("true");
  });
});
