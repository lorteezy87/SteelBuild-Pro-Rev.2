// @vitest-environment jsdom
//
// Boot-invariant test for the index route ("/") default-landing logic. This is
// the page every user sees first, so the branchy precedence is easy to break
// silently. We mount the real IndexRoute with the three inputs (prefs, project
// context, project role) mocked, and pin:
//   - an explicit non-Dashboard pref redirects immediately, without waiting on role
//   - while a pending project's role resolves, we hold the loader and do NOT
//     set the once-per-session guard (the anti-trap)
//   - role → target mapping (pm/admin/owner → hub, field → Field Today, viewer → Dashboard)
//   - a brand-new zero-project user lands on Dashboard immediately (no spinner)
//   - the once-per-session guard makes a later visit show Dashboard, not the role target

import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

let prefsState;
let projState;
let roleState;

vi.mock("@/hooks/useUserPrefs", () => ({ useUserPrefs: () => prefsState }));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => projState,
  ProjectProvider: ({ children }) => children,
}));
vi.mock("@/hooks/useProjectRole", () => ({ useProjectRole: () => roleState }));
vi.mock("@/pages/Dashboard", () => ({ default: () => <div>DASHBOARD</div> }));
vi.mock("@/boot/PageLoader", () => ({ default: () => <div>LOADER</div> }));

import { IndexRoute, LANDING_REDIRECT_KEY } from "@/boot/AppRoutes";

function renderIndex() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route index element={<IndexRoute />} />
        <Route path="DrawingSubmittalHub" element={<div>HUB</div>} />
        <Route path="FieldToday" element={<div>FIELD</div>} />
        <Route path="RFIs" element={<div>RFISPAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const proj = (over = {}) => ({ activeProject: null, loading: false, ...over });
const roleResolved = (role) => ({ role, isLoading: false });

/**
 * Write the pair of keys a saved project pick actually consists of. IndexRoute
 * reads BOTH — the id alone outlives the project it names, so the cached list
 * is what makes the pick resolvable. Deliberately not mocked: this is real
 * localStorage against the real helper, since the bug being pinned lived in
 * treating the id as sufficient on its own.
 */
function saveSelection(activeProjectId, cachedProjects) {
  localStorage.setItem("activeProjectId", activeProjectId);
  localStorage.setItem("sbp_projects_cache", JSON.stringify(cachedProjects));
}

describe("IndexRoute — default landing precedence (boot invariants)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    prefsState = { default_landing: "Dashboard", default_project_id: null };
    projState = proj();
    roleState = roleResolved("viewer");
  });

  it("explicit non-Dashboard pref redirects immediately, without waiting on role", async () => {
    prefsState = { default_landing: "RFIs", default_project_id: null };
    // Projects + role still loading — the explicit pref must NOT wait on them.
    projState = proj({ loading: true });
    roleState = { role: "viewer", isLoading: true };
    renderIndex();
    expect(await screen.findByText("RFISPAGE")).toBeInTheDocument();
    expect(sessionStorage.getItem(LANDING_REDIRECT_KEY)).toBe("1");
  });

  it("holds the loader (and does NOT set the guard) while a pending project's role resolves", () => {
    // A saved pick counts as pending only when the cached list still contains
    // it — see the stale-id cases below for why presence alone is not enough.
    saveSelection("p1", [{ id: "p1" }]);
    projState = proj({ activeProject: null, loading: true });
    renderIndex();
    expect(screen.getByText("LOADER")).toBeInTheDocument();
    expect(screen.queryByText("DASHBOARD")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(LANDING_REDIRECT_KEY)).toBeNull();
  });

  it("does NOT hold the loader for a stale activeProjectId with no cached projects", async () => {
    // The state every user is in right after their projects are erased, and
    // every brand-new signup who once had a project elsewhere. ProjectContext
    // clears the stale id, but only AFTER a fetch that retries an empty list
    // three times with 1.5s + 3s of backoff — so counting the bare key made
    // exactly the users this logic protects wait out that spinner.
    localStorage.setItem("activeProjectId", "gone");
    // No sbp_projects_cache: ProjectContext removes it when a load returns
    // zero live projects, so its absence means "the server said none".
    projState = proj({ activeProject: null, loading: true });
    renderIndex();
    expect(await screen.findByText("DASHBOARD")).toBeInTheDocument();
    expect(screen.queryByText("LOADER")).not.toBeInTheDocument();
  });

  it("does NOT hold the loader when the cached list no longer contains the saved pick", async () => {
    // The user still has projects, but the one they last opened was erased.
    saveSelection("gone", [{ id: "p2" }]);
    projState = proj({ activeProject: null, loading: true });
    renderIndex();
    expect(await screen.findByText("DASHBOARD")).toBeInTheDocument();
    expect(screen.queryByText("LOADER")).not.toBeInTheDocument();
  });

  it("does NOT treat an archived cached project as a resolvable pick", async () => {
    // Tombstones never seed a selection — same rule ProjectContext's cache
    // reader applies when it hydrates the switcher.
    saveSelection("p1", [{ id: "p1", is_deleted: true }]);
    projState = proj({ activeProject: null, loading: true });
    renderIndex();
    expect(await screen.findByText("DASHBOARD")).toBeInTheDocument();
    expect(screen.queryByText("LOADER")).not.toBeInTheDocument();
  });

  it("still waits when the Settings default-project pref is set, cache or no cache", () => {
    // The pref resolves into an active project independently of the saved pick,
    // so it must keep holding the loader even with no cache to cross-check.
    prefsState = { default_landing: "Dashboard", default_project_id: "p9" };
    projState = proj({ activeProject: null, loading: true });
    renderIndex();
    expect(screen.getByText("LOADER")).toBeInTheDocument();
    expect(sessionStorage.getItem(LANDING_REDIRECT_KEY)).toBeNull();
  });

  it("routes pm to the Detailing Control Center and sets the once-per-session guard", async () => {
    projState = proj({ activeProject: { id: "p1" } });
    roleState = roleResolved("pm");
    renderIndex();
    expect(await screen.findByText("HUB")).toBeInTheDocument();
    expect(sessionStorage.getItem(LANDING_REDIRECT_KEY)).toBe("1");
  });

  it("routes field users to Field Today", async () => {
    projState = proj({ activeProject: { id: "p1" } });
    roleState = roleResolved("field");
    renderIndex();
    expect(await screen.findByText("FIELD")).toBeInTheDocument();
  });

  it("keeps viewers on the Dashboard (no redirect → no guard)", async () => {
    projState = proj({ activeProject: { id: "p1" } });
    roleState = roleResolved("viewer");
    renderIndex();
    expect(await screen.findByText("DASHBOARD")).toBeInTheDocument();
    expect(sessionStorage.getItem(LANDING_REDIRECT_KEY)).toBeNull();
  });

  it("zero-project user lands on Dashboard immediately — never held through the retry backoff", async () => {
    // No saved pick, no default-project pref, but the list is still loading.
    // roleReady must short-circuit to a decision (Dashboard), so IndexRoute
    // renders Dashboard rather than returning the bare loader.
    projState = proj({ activeProject: null, loading: true });
    renderIndex();
    expect(await screen.findByText("DASHBOARD")).toBeInTheDocument();
  });

  it("respects the once-per-session guard — a later visit shows Dashboard, not the role target", async () => {
    sessionStorage.setItem(LANDING_REDIRECT_KEY, "1");
    projState = proj({ activeProject: { id: "p1" } });
    roleState = roleResolved("pm"); // would be the hub on first load, but the guard is set
    renderIndex();
    expect(await screen.findByText("DASHBOARD")).toBeInTheDocument();
    expect(screen.queryByText("HUB")).not.toBeInTheDocument();
  });
});
