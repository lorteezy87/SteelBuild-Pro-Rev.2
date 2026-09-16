// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "../../Dashboard";

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  setActiveProject: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    ...Object.fromEntries([
      "RFI", "ChangeOrder", "CostCode", "WorkPackage", "Delivery", "ActionItem",
      "Expense", "ScheduleTask", "Submittal", "Drawing", "SOVItem",
      "DrawingActivity", "PunchlistItem", "Inspection", "SafetyIncident",
      "QualityControlRecord",
    ].map((name) => [name, {
      list: vi.fn().mockResolvedValue([]),
      filter: vi.fn().mockResolvedValue([]),
    }])),
    Project: { list: mocks.listProjects },
  },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async (): Promise<{ count: number; error: Error | null }> => ({ count: 0, error: null }) }) }),
  },
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject: { id: "project-1", name: "Selected project" },
    setActiveProject: mocks.setActiveProject,
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: (): { user: null } => ({ user: null }) }));
vi.mock("@/hooks/useUserPrefs", () => ({
  useUserPrefs: () => ({ auto_refresh_secs: 0 }),
  refetchIntervalFromPref: () => false,
}));
vi.mock("@/components/dashboard/GettingStartedChecklist", () => ({ default: (): null => null }));
vi.mock("../../dashboardCC/DashboardControlCenter", () => ({
  default: () => <div>Project dashboard</div>,
}));
vi.mock("../../portfolio/PortfolioControlCenter", () => ({ default: (): null => null }));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Dashboard /></QueryClientProvider>);
  return client;
}

describe("Dashboard project selection", () => {
  it("retains the selected project when the initial project list request fails", async () => {
    mocks.listProjects.mockRejectedValueOnce(new Error("Network unavailable"));
    const client = renderDashboard();
    await screen.findByText("Project dashboard");
    await waitFor(() => expect(client.getQueryState(["projects"])?.status).toBe("error"));
    expect(mocks.setActiveProject).not.toHaveBeenCalled();
  });

  it("clears the selected project when a successful list excludes it", async () => {
    mocks.listProjects.mockResolvedValueOnce([{ id: "project-2", name: "Other project" }]);
    renderDashboard();
    await waitFor(() => expect(mocks.setActiveProject).toHaveBeenCalledWith(null));
  });

  it("retains the selected project when the successful list includes it", async () => {
    mocks.listProjects.mockResolvedValueOnce([{ id: "project-1", name: "Selected project" }]);
    renderDashboard();
    await screen.findByText("Project dashboard");
    expect(mocks.setActiveProject).not.toHaveBeenCalled();
  });
});
