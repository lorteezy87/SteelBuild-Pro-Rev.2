// @vitest-environment jsdom
/**
 * DrawingSubmittalHub smoke + wiring test — boots the real hub with Supabase
 * mocked empty, then confirms the Drawing Register tab mounts the clean
 * sheet-level DrawingRegisterGridPanel (Doc Control parity), plus the hub's
 * route entry (no-project state) and tab-history semantics.
 */
import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, it, expect, vi } from "vitest";

// Lazy panel chunks can take seconds under a loaded full-suite run, and
// several waits below allow 8s, so the per-test budget has to exceed that.
vi.setConfig({ testTimeout: 15000 });

// Per-test entity overrides ({ Name: { filter } }). Every other entity answers
// with no rows. Cleared after each test.
//
// The hub reads its claim-bearing tables (rfis, drawing_revisions, drawing_sets,
// work_packages) with filterAll, which pages past PostgREST's 1000-row cap, so
// an override that pins only `filter` would leave that read unmocked. Overrides
// naming just `filter` are widened to both by `withFilterAll` below.
const entityOverrides = vi.hoisted(() => ({}));
vi.mock("@/api/supabaseClient", () => {
  const noop = {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
    filterAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
  };
  // An override that pins `filter` and not `filterAll` means "this table reads
  // like so" — apply it to whichever call the hub actually makes.
  const withFilterAll = (o) => (o.filter && !o.filterAll ? { ...o, filterAll: o.filter } : o);
  return {
    entities: new Proxy({}, { get: (_target, name) => (entityOverrides[name] ? { ...noop, ...withFilterAll(entityOverrides[name]) } : noop) }),
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

// Feature flags, shaped like the TanStack v5 (5.100) query. `ready` means the
// flags query HAS data; `error` means its last read failed. Both at once is a
// failed background refetch that kept its cached flags (status stays "error").
// With no data, a re-read after an error resets to pending — isError false —
// while errorUpdateCount keeps counting, exactly as v5's fetchState does. Like
// the real hook, useFlag reads false unless the query is a success. Default:
// loaded, everything off. setFlags() changes the state and re-renders.
const flagsState = vi.hoisted(() => ({
  ready: true, error: false, fetching: false, on: new Set(), refetch: vi.fn(), version: 0, listeners: new Set(),
}));
vi.mock("@/hooks/useFeatureFlag", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener) => {
    flagsState.listeners.add(listener);
    return () => flagsState.listeners.delete(listener);
  };
  const getVersion = () => flagsState.version;
  return {
    useFlag: (key) => flagsState.ready && !flagsState.error && flagsState.on.has(key),
    useAllFlags: () => {
      useSyncExternalStore(subscribe, getVersion);
      const pendingAgain = !flagsState.ready && flagsState.fetching;
      return {
        isSuccess: flagsState.ready && !flagsState.error,
        isPending: !flagsState.ready && (!flagsState.error || pendingAgain),
        isError: flagsState.error && !pendingAgain,
        isFetching: flagsState.fetching,
        errorUpdateCount: flagsState.error ? 1 : 0,
        data: flagsState.ready ? new Map([...flagsState.on].map((key) => [key, true])) : undefined,
        refetch: flagsState.refetch,
      };
    },
  };
});
function setFlags(patch) {
  Object.assign(flagsState, patch);
  flagsState.version++;
  for (const listener of flagsState.listeners) listener();
}
// The real 3D tab pulls in the IFC viewer. The stub says which project it got.
vi.mock("@/components/viewer3d/Model3DTab", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ projectId }) => createElement("p", { "data-testid": "model3d-tab" }, `model3d-tab:${projectId}`),
  };
});
// The full model roster pages ~28 requests on big projects. Only the 3D tab
// (flag on) or the mapping card may start it. countModelElements stays real.
const rosterFetch = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/ifc/fetchAllModelElements", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAllModelElements: rosterFetch,
}));
vi.mock("@/components/shared/useAppSecurity", () => ({
  useAppSecurity: () => ({ user: { email: "test@example.com", id: "test-user-id" } }),
}));
// HoldsPanel (the holds tab) reads the signed-in user for hold attribution.
vi.mock("@/lib/AuthContext", async (importOriginal) => ({
  ...(await importOriginal()),
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

// The real Fleet Health strip renders only for scored sets, and the entity
// mock returns none. A stub exposes its one callback, so the needs-attention
// chip's destination is testable.
vi.mock("@/pages/drawingSubmittalHub/components", async (importOriginal) => {
  const actual = await importOriginal();
  const { createElement } = await import("react");
  return {
    ...actual,
    FleetHealthStrip: ({ onOpenRegister }) =>
      createElement("button", { type: "button", onClick: onOpenRegister }, "fleet-needs-attention"),
  };
});

import DrawingSubmittalHub from "@/pages/DrawingSubmittalHub";
import { ProjectContext } from "@/components/shared/ProjectContext";

const TEST_PROJECT = { id: "test-project-id", name: "Test Project" };

afterEach(() => {
  holdsState.data = [];
  holdsState.isError = false;
  for (const name of Object.keys(entityOverrides)) delete entityOverrides[name];
  flagsState.ready = true;
  flagsState.error = false;
  flagsState.fetching = false;
  flagsState.on.clear();
  flagsState.refetch.mockClear();
  rosterFetch.mockClear();
});

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="pathname">{location.pathname}</output>
      <output data-testid="search">{location.search}</output>
      <output data-testid="nav-type">{navigationType}</output>
      <button type="button" onClick={() => navigate(-1)}>probe-back</button>
    </div>
  );
}

function renderHub({ entries = ["/DrawingSubmittalHub"], ctx = {}, seed } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(qc);
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

    // The editing actions that used to require leaving for /Drawings are on
    // the tab itself now, and the "Full editor ↗" link is gone with them.
    expect(screen.queryByRole("link", { name: /Full editor/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload set/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New revision/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import log/i })).toBeInTheDocument();
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
    await waitFor(() => {
      expect(screen.getByTestId("search").textContent).toBe("?hub_tab=holds");
    });
  });

  it("drops unconsumed record and create params so they can't fire on a later visit", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=matrix&targetSetId=s2&recordId=r1&prefilledStatus=IFA&prefilledBallInCourt=EOR&transmittal=t1"] });

    await user.click(await screen.findByRole("tab", { name: /Control Board/ }));
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=overview");
  });

  it("drops the sub-view and the matrix filter on every switch, even into the matrix, and keeps unrelated params", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=overview&hub_view=sets&matrix_filter=hold&keep=1"] });

    await user.click(await screen.findByRole("tab", { name: /Approval Matrix/ }));
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=matrix&keep=1");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("PUSH");
  });
});

// Every live ?hub_tab= key, model3d too: the viewer_3d flag (off here) gates
// its body, not its tab. Pinned rather than imported, so a key that stops
// resolving fails loudly. doccontrol was retired into an alias; its redirect
// is tested below.
const LIVE_KEYS = ["overview", "process", "drawings", "submittals", "transmittals", "matrix", "revimpact", "holds", "validation", "model3d"];

// The hub's own tab strip; some panels (Holds) render a tablist of their own.
async function selectedTab() {
  const tablist = await screen.findByRole("tablist", { name: "Detailing Control Center tabs" });
  return within(tablist).getByRole("tab", { selected: true });
}

describe("DrawingSubmittalHub — ?hub_tab= links", () => {
  it.each(LIVE_KEYS)("?hub_tab=%s opens its tab and leaves the URL alone", async (key) => {
    renderHub({ entries: [`/DrawingSubmittalHub?hub_tab=${key}`] });
    expect(await selectedTab()).toHaveAttribute("id", `dcc-tab-${key}`);
    expect(screen.getByTestId("search").textContent).toBe(`?hub_tab=${key}`);
    expect(screen.getByTestId("nav-type")).toHaveTextContent("POP");
  });

  it("drops an unknown ?hub_tab= before mounting, without adding a history entry", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/Dashboard", "/DrawingSubmittalHub?hub_tab=bogus"] });

    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-overview");
    expect(screen.getByTestId("pathname").textContent).toBe("/DrawingSubmittalHub");
    expect(screen.getByTestId("search").textContent).toBe("");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("REPLACE");

    // The bogus entry was replaced, not stacked on: Back leaves the hub.
    await user.click(screen.getByRole("button", { name: "probe-back" }));
    expect(screen.getByTestId("pathname").textContent).toBe("/Dashboard");
  });

});

// Plan S3: the viewer_3d flag gates the 3D tab's body, never its link.
const MODEL3D_OFF = "3D model viewer is turned off for this workspace. Ask an admin to enable it.";
const MODEL3D_OFF_HEADING = { level: 3, name: "3D model viewer is off" };
const MODEL3D_LOADING = "Loading the 3D model viewer…";
const MODEL3D_FLAGS_FAILED = "Couldn't check whether the 3D model viewer is enabled.";
/** A raw colour literal. jsdom rewrites hex to rgb(), so match every spelling. */
const RAW_COLOR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;

describe("DrawingSubmittalHub — 3D Model tab (viewer_3d)", () => {
  it("shows a loading line on ?hub_tab=model3d while flags load, never the turned-off notice, and leaves the URL alone", async () => {
    flagsState.ready = false;
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=model3d"] });

    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-model3d");
    expect(screen.getByText(MODEL3D_LOADING)).toHaveAttribute("role", "status");
    expect(screen.queryByText(MODEL3D_OFF)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", MODEL3D_OFF_HEADING)).not.toBeInTheDocument();
    expect(screen.queryByTestId("model3d-tab")).not.toBeInTheDocument();
    expect(rosterFetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=model3d");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("POP");
  });

  it("keeps ?hub_tab=model3d on the 3D tab with the flag off: the notice, no viewer, no roster read", async () => {
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=model3d"] });

    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-model3d");
    const notice = screen.getByRole("heading", MODEL3D_OFF_HEADING).closest("section");
    expect(notice).toHaveTextContent(MODEL3D_OFF);
    expect(screen.queryByText(MODEL3D_LOADING)).not.toBeInTheDocument();
    expect(screen.queryByTestId("model3d-tab")).not.toBeInTheDocument();
    // Not the Control Board under another tab's name.
    expect(screen.queryByText("Items Needing Action")).not.toBeInTheDocument();
    expect(rosterFetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=model3d");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("POP");
    // Themed by --cmd-* tokens, never a raw colour.
    const styles = [notice, ...notice.querySelectorAll("[style]")].map((el) => el.getAttribute("style") ?? "");
    expect(styles.join(" ")).toContain("var(--cmd-");
    for (const style of styles) expect(style).not.toMatch(RAW_COLOR);
  });

  it("renders the 3D viewer, and loads its roster, when viewer_3d is on", async () => {
    flagsState.on.add("viewer_3d");
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=model3d"] });

    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-model3d");
    expect(await screen.findByTestId("model3d-tab", {}, { timeout: 8000 })).toHaveTextContent("model3d-tab:test-project-id");
    expect(screen.queryByRole("heading", MODEL3D_OFF_HEADING)).not.toBeInTheDocument();
    expect(screen.queryByText(MODEL3D_LOADING)).not.toBeInTheDocument();
    await waitFor(() => expect(rosterFetch).toHaveBeenCalledWith("test-project-id"));
  });

  it("lists no 3D tab on the bare path when viewer_3d is off", async () => {
    renderHub();
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-overview");
    const tablist = screen.getByRole("tablist", { name: "Detailing Control Center tabs" });
    expect(within(tablist).queryByRole("tab", { name: /3D Model/ })).not.toBeInTheDocument();
  });

  it("lists the 3D tab on the bare path when viewer_3d is on, without reading the roster", async () => {
    flagsState.on.add("viewer_3d");
    renderHub();
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-overview");
    const tablist = screen.getByRole("tablist", { name: "Detailing Control Center tabs" });
    expect(within(tablist).getByRole("tab", { name: /3D Model/ })).toHaveAttribute("aria-selected", "false");
    expect(rosterFetch).not.toHaveBeenCalled();
  });

  it("drops the 3D tab once a flag-off user leaves it, and Back brings it back", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=model3d"] });
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-model3d");

    await user.click(screen.getByRole("tab", { name: /Control Board/ }));
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-overview");
    const tablist = screen.getByRole("tablist", { name: "Detailing Control Center tabs" });
    expect(within(tablist).queryByRole("tab", { name: /3D Model/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "probe-back" }));
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-model3d");
    expect(screen.getByRole("heading", MODEL3D_OFF_HEADING)).toBeInTheDocument();
    expect(rosterFetch).not.toHaveBeenCalled();
  });

  it("says the flag check failed, with a Retry, when the flags query errors before it ever loads", async () => {
    const user = userEvent.setup();
    flagsState.ready = false;
    flagsState.error = true;
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=model3d"] });

    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-model3d");
    const alert = screen.getByText(MODEL3D_FLAGS_FAILED).closest('[role="alert"]');
    expect(alert).not.toBeNull();
    // Not an endless load, not "turned off", no viewer and no roster read.
    expect(screen.queryByText(MODEL3D_LOADING)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", MODEL3D_OFF_HEADING)).not.toBeInTheDocument();
    expect(screen.queryByTestId("model3d-tab")).not.toBeInTheDocument();
    expect(rosterFetch).not.toHaveBeenCalled();
    // Themed by --cmd-* tokens, never a raw colour; a plain button, no form.
    const styles = [alert, ...alert.querySelectorAll("[style]")].map((el) => el.getAttribute("style") ?? "");
    expect(styles.join(" ")).toContain("var(--cmd-");
    for (const style of styles) expect(style).not.toMatch(RAW_COLOR);
    expect(alert.querySelector("form")).toBeNull();

    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(flagsState.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=model3d");
  });

  it("keeps the error up while the flags are re-read, with Retry aria-disabled (not disabled) and inert", async () => {
    const user = userEvent.setup();
    flagsState.ready = false;
    flagsState.error = true;
    flagsState.fetching = true; // v5: isError false here; errorUpdateCount kept
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=model3d"] });

    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-model3d");
    expect(screen.getByText(MODEL3D_FLAGS_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(MODEL3D_LOADING)).not.toBeInTheDocument();
    const retrying = screen.getByRole("button", { name: "Retrying…" });
    expect(retrying).toHaveAttribute("aria-disabled", "true");
    expect(retrying).not.toBeDisabled();
    await user.click(retrying);
    expect(flagsState.refetch).not.toHaveBeenCalled();
  });

  it("keeps the focused Retry button mounted, and focused, through the re-read and a second failure", async () => {
    const user = userEvent.setup();
    flagsState.ready = false;
    flagsState.error = true;
    flagsState.refetch.mockImplementationOnce(() => {
      setFlags({ fetching: true });
      return Promise.resolve();
    });
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=model3d"] });

    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-model3d");
    const retry = screen.getByRole("button", { name: "Retry" });
    await user.click(retry);
    expect(flagsState.refetch).toHaveBeenCalledTimes(1);
    // The same node, now retrying, keeps focus: no swap to the loading line.
    expect(screen.queryByText(MODEL3D_LOADING)).not.toBeInTheDocument();
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveTextContent("Retrying…");
    expect(retry).toHaveFocus();

    // The re-read fails again: the same button reads Retry, still focused.
    act(() => setFlags({ fetching: false }));
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveTextContent("Retry");
    expect(retry).toHaveFocus();
  });

  it("keeps the 3D viewer through a failed background flags refetch that kept its cached flags", async () => {
    flagsState.on.add("viewer_3d");
    flagsState.error = true; // `ready` stays true: TanStack v5 keeps the cached data
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=model3d"] });

    expect(await screen.findByTestId("model3d-tab", {}, { timeout: 8000 })).toHaveTextContent("model3d-tab:test-project-id");
    expect(screen.queryByText(MODEL3D_FLAGS_FAILED)).not.toBeInTheDocument();
    expect(screen.queryByText(MODEL3D_LOADING)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", MODEL3D_OFF_HEADING)).not.toBeInTheDocument();
  });
});

const SHEET_GRID_FILTER = /Filter sheet, title, discipline, set/i;
const MOVED_NOTICE = { name: "Doc Control has moved" };

describe("DrawingSubmittalHub — Doc Control retired", () => {
  it("has no Doc Control tab", async () => {
    renderHub();
    const tablist = await screen.findByRole("tablist", { name: "Detailing Control Center tabs" });
    expect(within(tablist).getByRole("tab", { name: /Drawing Register/ })).toBeInTheDocument();
    expect(within(tablist).queryByRole("tab", { name: /Doc Control/ })).not.toBeInTheDocument();
  });

  it("sends a ?hub_tab=doccontrol bookmark to the Drawing Register's sheets, in place, with a notice", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/Dashboard", "/DrawingSubmittalHub?hub_tab=doccontrol"] });

    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-drawings");
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=drawings");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("REPLACE");
    expect(await screen.findByPlaceholderText(SHEET_GRID_FILTER)).toBeInTheDocument();
    expect(screen.getByRole("heading", MOVED_NOTICE)).toBeInTheDocument();
    expect(screen.getByText(/Drawing Register › Reviews/)).toBeInTheDocument();
    expect(screen.getByText(/Revision Impact › Impact log/)).toBeInTheDocument();

    // Replaced, not stacked: Back leaves the hub.
    await user.click(screen.getByRole("button", { name: "probe-back" }));
    expect(screen.getByTestId("pathname").textContent).toBe("/Dashboard");
  });

  it("keeps the notice while the new views are tried, until it's dismissed", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=doccontrol"] });
    expect(await screen.findByRole("heading", MOVED_NOTICE)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reviews" }));
    expect(await screen.findByRole("heading", { name: "Review Queue" }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole("heading", MOVED_NOTICE)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Dismiss the Doc Control notice/ }));
    expect(screen.queryByRole("heading", MOVED_NOTICE)).not.toBeInTheDocument();
  });

  it("shows the notice once: leaving the tab ends it, and Back doesn't bring it back", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=doccontrol"] });
    expect(await screen.findByRole("heading", MOVED_NOTICE)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Holds & Blockers/ }));
    await user.click(screen.getByRole("tab", { name: /Drawing Register/ }));
    expect(await screen.findByPlaceholderText(SHEET_GRID_FILTER)).toBeInTheDocument();
    expect(screen.queryByRole("heading", MOVED_NOTICE)).not.toBeInTheDocument();

    // Back twice returns to the arrival entry, which still carries the alias state.
    await user.click(screen.getByRole("button", { name: "probe-back" }));
    await user.click(screen.getByRole("button", { name: "probe-back" }));
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-drawings");
    expect(screen.queryByRole("heading", MOVED_NOTICE)).not.toBeInTheDocument();
  });

  it("shows no notice on an ordinary Drawing Register visit, or after an unknown-key redirect", async () => {
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=drawings"] });
    expect(await screen.findByPlaceholderText(SHEET_GRID_FILTER)).toBeInTheDocument();
    expect(screen.queryByRole("heading", MOVED_NOTICE)).not.toBeInTheDocument();
    cleanup();

    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=bogus"] });
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-overview");
    expect(screen.queryByRole("heading", MOVED_NOTICE)).not.toBeInTheDocument();
  });
});

describe("DrawingSubmittalHub — tab sub-views (?hub_view=)", () => {
  it("?hub_tab=drawings&hub_view=reviews opens the Review Queue", async () => {
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=drawings&hub_view=reviews"] });
    expect(await screen.findByRole("heading", { name: "Review Queue" }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reviews" })).toHaveAttribute("aria-pressed", "true");
  });

  it("?hub_tab=revimpact&hub_view=log opens the manual impact log", async () => {
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=revimpact&hub_view=log"] });
    expect(await screen.findByRole("heading", { name: "Impact Board" }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Impact log" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Manually logged drawing impacts/)).toBeInTheDocument();
  });

  it("switches views without adding history entries", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/Dashboard", "/DrawingSubmittalHub?hub_tab=drawings"] });

    await user.click(await screen.findByRole("button", { name: "Reviews" }));
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=drawings&hub_view=reviews");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("REPLACE");

    await user.click(screen.getByRole("button", { name: "Sheets" }));
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=drawings");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("REPLACE");

    await user.click(screen.getByRole("button", { name: "probe-back" }));
    expect(screen.getByTestId("pathname").textContent).toBe("/Dashboard");
  });

  it("opens Sets & revisions from a needs-attention chip, and Back returns to the Control Board", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/DrawingSubmittalHub"] });

    await user.click(await screen.findByRole("button", { name: "fleet-needs-attention" }));
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=drawings&hub_view=sets");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("PUSH");
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-drawings");
    expect(screen.getByRole("button", { name: "Sets & revisions" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "probe-back" }));
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-overview");
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
    // The header has rendered (its tabs are here) but shows no holds badge.
    expect(await screen.findByRole("tab", { name: /Holds & Blockers/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /On Hold$|^No holds$/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/On Hold$|No holds/)).not.toBeInTheDocument();
  });

  it("shows the project number and name in the header", async () => {
    renderHub({ ctx: { activeProject: { id: "p-2", name: "Mesa Gateway", project_number: "24-117" } } });
    expect(await screen.findByText("24-117 · Mesa Gateway")).toBeInTheDocument();
    cleanup();
  });
});

// Owner decision 2 (2026-09-11): 2026's compact header, with the KPI strip
// moved into the Control Board tab.
const STATUS_LINE = /sets · .+ open · .+ overdue · .+ at risk · Fab Ready/;

describe("DrawingSubmittalHub — compact header", () => {
  it("shows the KPI strip on the Control Board, beside the board's own scoped tile", async () => {
    renderHub();
    expect(await screen.findByText("Submittals Needing Action")).toBeInTheDocument();
    expect(await screen.findByText("Items Needing Action")).toBeInTheDocument();
    expect(screen.queryByText("Needs Action")).not.toBeInTheDocument();
    expect(screen.queryByText(STATUS_LINE)).not.toBeInTheDocument();
  });

  it("shows the status line instead of the KPI strip on other tabs", async () => {
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=holds"] });
    expect(await screen.findByText(STATUS_LINE)).toBeInTheDocument();
    expect(screen.queryByText("Submittals Needing Action")).not.toBeInTheDocument();
  });

  it.each([
    ["overview", () => screen.findByText("Items Needing Action", {}, { timeout: 8000 })],
    ["submittals", () => screen.findByPlaceholderText("Search # / title / spec section", {}, { timeout: 8000 })],
    ["holds", () => screen.findByRole("heading", { name: "Holds & Blockers" }, { timeout: 8000 })],
    ["validation", () => screen.findByRole("heading", { name: "Drawing and piece validation" }, { timeout: 8000 })],
    ["model3d", () => screen.findByRole("heading", MODEL3D_OFF_HEADING)],
  ])("has exactly one h1 on ?hub_tab=%s once its panel has loaded", async (key, panelLoaded) => {
    renderHub({ entries: [`/DrawingSubmittalHub?hub_tab=${key}`] });
    await panelLoaded();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Detailing Control Center");
  });

  it("opens Holds & Blockers from the header's holds badge, as a new history entry", async () => {
    const user = userEvent.setup();
    holdsState.data = [{ id: "h1", drawing_id: "d1", is_active: true, placed_at: "2026-09-01T00:00:00Z" }];
    renderHub();

    await user.click(await screen.findByRole("button", { name: "1 Sheet On Hold" }));
    expect(screen.getByTestId("search").textContent).toBe("?hub_tab=holds");
    expect(screen.getByTestId("nav-type")).toHaveTextContent("PUSH");
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-holds");
  });

  it("names the project in the eyebrow without a project number the project doesn't have", async () => {
    renderHub();
    expect(await screen.findByText("Test Project")).toHaveClass("detailing-cc__eyebrow");
  });
});

// Control Board and Process Board clicks land on these URLs (owner decision 3).
describe("DrawingSubmittalHub — record deep links", () => {
  it("opens ?hub_tab=submittals&recordId= on the Submittal Register, which consumes recordId and keeps hub_tab", async () => {
    const user = userEvent.setup();
    renderHub({ entries: ["/Dashboard", "/DrawingSubmittalHub?hub_tab=submittals&recordId=sub-404"] });

    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-submittals");
    // The embedded register strips recordId once its rows settle (a miss here:
    // the entity mock has no rows), rewriting the entry rather than pushing.
    await waitFor(
      () => expect(screen.getByTestId("search").textContent).toBe("?hub_tab=submittals"),
      { timeout: 8000 },
    );
    expect(screen.getByTestId("nav-type")).toHaveTextContent("REPLACE");
    expect(await selectedTab()).toHaveAttribute("id", "dcc-tab-submittals");

    // Nothing was stacked: Back leaves the hub.
    await user.click(screen.getByRole("button", { name: "probe-back" }));
    expect(screen.getByTestId("pathname").textContent).toBe("/Dashboard");
  });

  it("opens ?hub_tab=submittals&targetSetId= as create on the Submittal Register, stripping targetSetId in place", async () => {
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=submittals&targetSetId=set-1"] });

    expect(await screen.findByRole("dialog", { name: "New Submittal" }, { timeout: 8000 })).toBeInTheDocument();
    // The modal hides the page behind it from the accessibility tree.
    expect(screen.getByRole("tab", { name: /Submittal Register/, hidden: true })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => {
      expect(screen.getByTestId("search").textContent).toBe("?hub_tab=submittals");
    });
    expect(screen.getByTestId("nav-type")).toHaveTextContent("REPLACE");
  });
});

// The matrix's Last sent line needs the transmittal log AND the hub's own
// drawing-revisions read. Most tests seed the log fresh (staleTime 60s), so it
// never refetches and the only DrawingRevision read is the hub's; each then
// controls that read alone. The log tests let it read, or refetch, through
// DrawingTransmittal.filter instead.
describe("DrawingSubmittalHub — the matrix's Last sent line", () => {
  const LOG_KEY = ["drawing-transmittals", TEST_PROJECT.id];
  const SENT = [{
    id: "t-1", project_id: TEST_PROJECT.id, transmittal_number: "T-014", direction: "outgoing",
    source_company: null, received_from: null, sent_to: "EOR", subject: null,
    date_sent: "2026-08-03", date_received: null, notes: null, created_at: "2026-08-03T09:00:00Z",
    items: [{ id: "i1", drawing_revision_id: "r1", drawing_id: "d1", sheet_number: "S1", sheet_title: null, revision_code: "0" }],
    item_count: 1,
  }];
  const seedLog = (qc) => qc.setQueryData(LOG_KEY, SENT);
  // d1's current revision is r1, the one T-014 sent.
  const CURRENT_R1 = { id: "r1", project_id: TEST_PROJECT.id, drawing_id: "d1", version_number: 1, is_current: true };

  function withSheetAndRevisions(revisionsFilter) {
    entityOverrides.DrawingSet = { filter: vi.fn().mockResolvedValue([{ id: "s1", project_id: TEST_PROJECT.id, set_name: "Main Steel" }]) };
    entityOverrides.Drawing = { filter: vi.fn().mockResolvedValue([{ id: "d1", project_id: TEST_PROJECT.id, drawing_set_id: "s1", stage: "IFA" }]) };
    entityOverrides.DrawingRevision = { filter: revisionsFilter };
  }

  async function openLastSent(user) {
    await user.click(await screen.findByRole("button", { name: "Main Steel" }, { timeout: 8000 }));
    return () => document.querySelector("#matrix-detail-s1 [data-last-sent]");
  }

  it("waits for the drawing revisions before claiming anything", async () => {
    const user = userEvent.setup();
    withSheetAndRevisions(vi.fn(() => new Promise(() => {})));
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=matrix"], seed: seedLog });

    const line = await openLastSent(user);
    // The log itself is in: the Last Transmittal column shows it.
    expect(screen.getByRole("link", { name: "T-014" })).toBeInTheDocument();
    expect(line()).toHaveAttribute("data-last-sent", "loading");
    expect(within(line()).getByText("Loading last sent transmittal")).toHaveClass("sr-only");
  });

  it("counts a sheet revised since sent, from the hub's own revisions read", async () => {
    const user = userEvent.setup();
    withSheetAndRevisions(vi.fn().mockResolvedValue([
      { id: "r1", project_id: TEST_PROJECT.id, drawing_id: "d1", version_number: 1, is_current: false },
      { id: "r2", project_id: TEST_PROJECT.id, drawing_id: "d1", version_number: 2, is_current: true },
    ]));
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=matrix"], seed: seedLog });

    const line = await openLastSent(user);
    await waitFor(() => expect(line()?.textContent).toBe(
      "Last sent: T-014 · Aug 3, 26 · to EOR · 1 sheet · 1 revised since",
    ));
  });

  it("says the revisions couldn't be loaded instead of guessing", async () => {
    const user = userEvent.setup();
    withSheetAndRevisions(vi.fn().mockRejectedValue(new Error("revisions failed")));
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=matrix"], seed: seedLog });

    const line = await openLastSent(user);
    await waitFor(() => expect(line()).toHaveAttribute("data-last-sent", "error"));
    expect(within(line()).getByText("Transmittals or revisions couldn't be loaded")).toHaveClass("sr-only");
  });

  it("says the log couldn't be loaded when the transmittal read fails", async () => {
    const user = userEvent.setup();
    withSheetAndRevisions(vi.fn().mockResolvedValue([CURRENT_R1]));
    // Only the transmittals read fails. useTransmittals reads revisions too,
    // and they keep working, so the error is the log's own.
    const transmittalsRead = vi.fn().mockRejectedValue(new Error("log failed"));
    entityOverrides.DrawingTransmittal = { filter: transmittalsRead };
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=matrix"] });

    const line = await openLastSent(user);
    await waitFor(() => expect(line()).toHaveAttribute("data-last-sent", "error"));
    expect(transmittalsRead).toHaveBeenCalled();
    expect(within(line()).getByText("Transmittals or revisions couldn't be loaded")).toHaveClass("sr-only");
  });

  it("keeps the last-known log on screen when a background refetch of it fails", async () => {
    const user = userEvent.setup();
    withSheetAndRevisions(vi.fn().mockResolvedValue([CURRENT_R1]));
    const transmittalsRead = vi.fn().mockRejectedValue(new Error("refetch failed"));
    entityOverrides.DrawingTransmittal = { filter: transmittalsRead };
    let client;
    // Seeded stale, so opening the matrix refetches the log, and that fails.
    renderHub({
      entries: ["/DrawingSubmittalHub?hub_tab=matrix"],
      seed: (qc) => {
        client = qc;
        qc.setQueryData(LOG_KEY, SENT, { updatedAt: 1 });
      },
    });

    const line = await openLastSent(user);
    await waitFor(() => expect(client.getQueryState(LOG_KEY)?.status).toBe("error"));
    expect(transmittalsRead).toHaveBeenCalled();
    // Let the observer hand the failed refetch to the hub before looking.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(line()).toHaveAttribute("data-last-sent", "sent");
    expect(line()?.textContent).toBe("Last sent: T-014 · Aug 3, 26 · to EOR · 1 sheet · 0 revised since");
  });

  it("says Unknown, never 'Not sent yet', when the log's read comes back at the row cap", async () => {
    const user = userEvent.setup();
    withSheetAndRevisions(vi.fn().mockResolvedValue([CURRENT_R1]));
    // A full page of incoming transmittals. Last sent ignores incoming ones,
    // so only the cap can make Main Steel Unknown.
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      id: `in-${i}`, project_id: TEST_PROJECT.id, transmittal_number: `T-${i}`, direction: "incoming",
      date_received: "2026-08-01", created_at: "2026-08-01T09:00:00Z",
    }));
    entityOverrides.DrawingTransmittal = { filter: vi.fn().mockResolvedValue(fullPage) };
    renderHub({ entries: ["/DrawingSubmittalHub?hub_tab=matrix"] });

    const line = await openLastSent(user);
    await waitFor(() => expect(line()).toHaveAttribute("data-last-sent", "unknown"));
    expect(within(line()).getByText("Unknown")).toHaveAttribute(
      "title",
      "Some transmittal records weren't loaded, so this set's last outgoing transmittal can't be confirmed.",
    );
  });
});

describe('core workflow evidence recovery', () => {
  for (const source of ['Drawing', 'Submittal', 'SubmittalRound', 'DrawingSet', 'RFI', 'WorkPackage']) {
    it(`does not show workflow readiness after ${source} fails`, async () => {
      const filter = vi.fn().mockRejectedValue(new Error('Read unavailable'));
      entityOverrides[source] = { filter };
      renderHub();
      const failure = await screen.findByRole('alert', { name: 'Detailing workflow' });
      expect(failure).toHaveTextContent('Unable to load detailing workflow');
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      filter.mockResolvedValue([]);
      await userEvent.setup().click(within(failure).getByRole('button', { name: 'Retry' }));
      expect(await screen.findByRole('tablist')).toBeVisible();
    });
  }
});
