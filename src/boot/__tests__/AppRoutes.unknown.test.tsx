// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMe } = vi.hoisted(() => ({ authMe: vi.fn() }));

vi.mock("@/api/supabaseClient", () => ({ auth: { me: authMe } }));
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", role: "admin" }, isAuthenticated: true }),
}));
vi.mock("@/config/routes", () => ({
  PAGES: {
    OrgMembers: () => <div>TEAM_PAGE</div>,
    CostHub: () => <div>COST_PAGE</div>,
    Projects: () => <div>PROJECTS_PAGE</div>,
  },
  PROJECT_SCOPED_PAGES: new Set(),
  STATIC_ROUTE_METADATA: Object.fromEntries(
    [
      ["Schedule", "/"],
      ["Financials", "/"],
      ["CostDashboard", "/"],
      ["ResourceManagement", "/"],
      ["AIInsights", "/"],
      ["MarginRisk", "/"],
      ["RFIHub", "/"],
      ["GanttChart", "/"],
      ["Team", "/OrgMembers"],
      ["BudgetControl", "/CostHub"],
    ].map(([path, target]) => [`/${path}`, { lifecycle: "legacy", kind: "redirect", target }]),
  ),
}));
vi.mock("@/lib/lazyRetry", () => ({
  lazyWithRetry: () => () => <div>LAZY_PAGE</div>,
}));
vi.mock("@/boot/LayoutRoute", () => ({
  default: () => (
    <div data-testid="authenticated-app-shell">
      <Outlet />
    </div>
  ),
}));
vi.mock("@/hooks/useModuleAccess", () => ({
  useModuleAccess: () => ({ pageEnabled: () => true }),
}));
vi.mock("@/hooks/useUserPrefs", () => ({
  useUserPrefs: () => ({
    default_landing: null as string | null,
    default_project_id: null as string | null,
  }),
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: null as { id: string } | null, loading: false }),
}));
vi.mock("@/hooks/useProjectRole", () => ({
  useProjectRole: () => ({ role: null as string | null, isLoading: false }),
}));

import AppRoutes, { buildStaticRedirectTarget } from "@/boot/AppRoutes";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe("AppRoutes unknown URL handling", () => {
  beforeEach(() => authMe.mockClear());

  it("keeps an unknown URL inside the authenticated shell without a second auth request", () => {
    render(
      <MemoryRouter initialEntries={["/definitely-not-a-real-route"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("authenticated-app-shell")).toBeInTheDocument();
    expect(screen.getByText("PAGE_NOT_FOUND")).toBeInTheDocument();
    expect(screen.getByText("ADMIN_NOTE")).toBeInTheDocument();
    expect(authMe).not.toHaveBeenCalled();
  });

  it("preserves project context when a legacy route redirects", () => {
    expect(buildStaticRedirectTarget("/ScheduleHub", "?project=26179", "#week-4"))
      .toBe("/ScheduleHub?project=26179#week-4");
  });

  it("merges a target's own query with the incoming one", () => {
    // /Drawings redirects to a specific hub TAB, so its target carries a
    // param. Concatenating produced "…?hub_tab=drawings?sheet=S-301", which no
    // router parses — and the RFI board's "update drawing" deep link rides on
    // exactly this path.
    expect(buildStaticRedirectTarget("/DrawingSubmittalHub?hub_tab=drawings", "?sheet=S-301"))
      .toBe("/DrawingSubmittalHub?hub_tab=drawings&sheet=S-301");
  });

  it("keeps a target's own query when nothing comes in, and keeps the hash", () => {
    expect(buildStaticRedirectTarget("/DrawingSubmittalHub?hub_tab=drawings", "", "#top"))
      .toBe("/DrawingSubmittalHub?hub_tab=drawings#top");
  });

  it("lets the incoming param win, since it came from the link followed", () => {
    expect(buildStaticRedirectTarget("/DrawingSubmittalHub?hub_tab=drawings", "?hub_tab=holds"))
      .toBe("/DrawingSubmittalHub?hub_tab=holds");
  });

  it.each([
    ["/ProjectDetail?id=proj-42"],
    ["/ProjectDetail?projectId=proj-42"],
  ])("redirects legacy %s to /Projects?recordId= (the param /Projects actually reads)", (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("location")).toHaveTextContent("/Projects?recordId=proj-42");
    expect(screen.getByText("PROJECTS_PAGE")).toBeInTheDocument();
  });

  it.each([
    ["/Team", "TEAM_PAGE"],
    ["/BudgetControl", "COST_PAGE"],
  ])("mounts the metadata redirect %s", (path, expectedPage) => {
    render(
      <MemoryRouter initialEntries={[`${path}?project=26179`]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText(expectedPage)).toBeInTheDocument();
    expect(screen.queryByText("PAGE_NOT_FOUND")).not.toBeInTheDocument();
  });
});
