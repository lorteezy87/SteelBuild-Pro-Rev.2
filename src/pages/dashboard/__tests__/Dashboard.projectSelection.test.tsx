// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "../../Dashboard";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
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
      filterAll: vi.fn().mockResolvedValue([]),
    }])),
    Project: { filterAll: mocks.listProjects },
  },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async (): Promise<{ count: number; error: Error | null }> => ({ count: 0, error: null }) }) }),
  },
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject: { id: "project-1", org_id: "org-a", name: "Selected project" },
    setActiveProject: mocks.setActiveProject,
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/lib/dateMath", () => ({ todayLocalISO: () => "2026-10-06" }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: { id: "org-a" } }) }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: (): { user: null } => ({ user: null }) }));
vi.mock("@/hooks/useUserPrefs", () => ({
  useUserPrefs: () => ({ auto_refresh_secs: 0 }),
  refetchIntervalFromPref: () => false,
}));
vi.mock("@/components/dashboard/GettingStartedChecklist", () => ({ default: (): null => null }));
vi.mock("../../dashboardCC/DashboardControlCenter", () => ({
  default: ({ todayIso, onNavigate }: { todayIso: string; onNavigate: (target: string) => void }) => (
    <div>Project dashboard<time>{todayIso}</time><button onClick={() => onNavigate("RFIs")}>Open risk record</button></div>
  ),
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
  it("routes canonical attention targets and supplies the local calendar date", async () => {
    mocks.listProjects.mockResolvedValueOnce([{ id: "project-1", org_id: "org-a", name: "Selected project" }]);
    renderDashboard();
    const button = await screen.findByRole("button", { name: "Open risk record" });
    expect(screen.getByText("2026-10-06")).toBeInTheDocument();
    fireEvent.click(button);
    expect(mocks.navigate).toHaveBeenCalledWith("/RFIs");
  });
  it("retains the selected project when the initial project list request fails", async () => {
    mocks.listProjects.mockRejectedValueOnce(new Error("Network unavailable"));
    const client = renderDashboard();
    await screen.findByText("Couldn’t load dashboard data");
    await waitFor(() => expect(client.getQueryState(["projects", "dashboard-all", "org-a"])?.status).toBe("error"));
    expect(mocks.setActiveProject).not.toHaveBeenCalled();
  });

  it("clears the selected project when a successful list excludes it", async () => {
    mocks.listProjects.mockResolvedValueOnce([{ id: "project-2", org_id: "org-a", name: "Other project" }]);
    renderDashboard();
    await waitFor(() => expect(mocks.setActiveProject).toHaveBeenCalledWith(null));
  });

  it("retains the selected project when the successful list includes it", async () => {
    mocks.listProjects.mockResolvedValueOnce([{ id: "project-1", org_id: "org-a", name: "Selected project" }]);
    renderDashboard();
    await screen.findByText("Project dashboard");
    expect(mocks.setActiveProject).not.toHaveBeenCalled();
  });
});
