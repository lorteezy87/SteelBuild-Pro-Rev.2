// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMe } = vi.hoisted(() => ({ authMe: vi.fn() }));

vi.mock("@/api/supabaseClient", () => ({ auth: { me: authMe } }));
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", role: "admin" }, isAuthenticated: true }),
}));
vi.mock("@/config/routes", () => ({
  PAGES: {},
  PROJECT_SCOPED_PAGES: new Set(),
  STATIC_ROUTE_METADATA: Object.fromEntries(
    ["Schedule", "Financials", "CostDashboard", "ResourceManagement", "AIInsights", "MarginRisk", "RFIHub", "GanttChart"]
      .map((path) => [`/${path}`, { target: "/" }]),
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
});
