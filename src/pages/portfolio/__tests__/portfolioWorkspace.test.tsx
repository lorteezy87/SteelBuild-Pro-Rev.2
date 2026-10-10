// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../../Dashboard";
import ExecutiveView from "../../ExecutiveView";
import PortfolioHub from "../../PortfolioHub";
import { formatCurrency } from "@/components/shared/formatters";

const mocks = vi.hoisted(() => ({
  orgId: "org-a" as string | null,
  projects: vi.fn(),
  rows: vi.fn(),
}));
vi.mock("@/components/shared/OrgContext", () => ({
  useOrg: () => ({ currentOrg: mocks.orgId ? { id: mocks.orgId } : null }),
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: null as null, setActiveProject: vi.fn() }),
}));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: null as null }) }));
vi.mock("@/hooks/useUserPrefs", () => ({
  useUserPrefs: () => ({ auto_refresh_secs: 0 }),
  refetchIntervalFromPref: () => false,
}));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: { filterAll: mocks.projects },
    ...Object.fromEntries([
      "RFI", "ChangeOrder", "CostCode", "WorkPackage", "ScheduleTask", "Expense",
      "Delivery", "ActionItem", "Submittal", "Drawing", "SOVItem", "DrawingActivity",
      "PunchlistItem", "Inspection", "SafetyIncident", "QualityControlRecord",
    ].map((name) => [name, { filterAll: mocks.rows }])),
  },
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/components/dashboard/GettingStartedChecklist", () => ({ default: (): null => null }));
vi.mock("@/components/shared/ErrorBoundary", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/shared/LoadingSkeleton", () => ({ default: () => <div>Loading workspace</div> }));
vi.mock("../PortfolioControlCenter", () => ({
  default: ({ projects, related }: { projects: unknown; related: unknown }) =>
    <pre data-testid="summary">{JSON.stringify({ projects, related })}</pre>,
}));
vi.mock("@/components/shared/KPIStrip", () => ({
  default: ({ items }: { items: Array<{ label: string; value: string | number }> }) =>
    <pre data-testid="summary">{JSON.stringify(items)}</pre>,
}));
vi.mock("@/components/shared/StatusBadge", () => ({ default: (): null => null }));
vi.mock("@/components/dashboard/TrueHealthChart", () => ({ default: (): null => null }));
vi.mock("@/components/design-system", () => ({
  CommandBar: (): null => null,
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) =>
    <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock("recharts", () => Object.fromEntries([
  "BarChart", "Bar", "XAxis", "YAxis", "CartesianGrid", "Tooltip",
  "ResponsiveContainer", "PieChart", "Pie", "Cell", "Legend",
].map((name) => [name, (): null => null])));

const projectFixtures = [
  { id: "project-a", org_id: "org-a", name: "Alpha", original_contract_value: 100 },
  { id: "project-b", org_id: "org-b", name: "Beta", original_contract_value: 50000 },
  { id: "paused", org_id: "org-a", name: "Paused", on_hold: true, original_contract_value: 70000 },
];
const rowFixtures = [
  { project_id: "project-a", status: "Approved", co_amount: 10 },
  { project_id: "project-b", status: "Approved", co_amount: 9000 },
  { project_id: "paused", status: "Approved", co_amount: 20000 },
  { project_id: null, status: "Approved", co_amount: 100000 },
];
const clients: QueryClient[] = [];
beforeEach(() => {
  mocks.orgId = "org-a";
  mocks.projects.mockReset().mockResolvedValue(projectFixtures);
  mocks.rows.mockReset().mockResolvedValue(rowFixtures);
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
});
function renderSurface(Surface: ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter><Surface /></MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(tree());
  return { ...result, refresh: () => result.rerender(tree()) };
}

describe.each([
  { name: "Dashboard", Surface: Dashboard, executive: false },
  { name: "PortfolioHub", Surface: PortfolioHub, executive: false },
  { name: "ExecutiveView", Surface: ExecutiveView, executive: true },
])("$name workspace boundary", ({ Surface, executive }) => {
  it("restricts project reads, child queries, and aggregates to the active workspace", async () => {
    renderSurface(Surface);
    const summary = await screen.findByTestId("summary");
    expect(mocks.projects).toHaveBeenCalledWith({ org_id: "org-a" });
    expect(mocks.rows).toHaveBeenCalled();
    for (const [conditions] of mocks.rows.mock.calls) {
      expect(conditions).toEqual({ project_id: ["project-a"] });
    }
    if (executive) {
      expect(summary.textContent).toContain(formatCurrency(10));
      expect(summary.textContent).not.toContain(formatCurrency(9000));
    } else {
      expect(summary.textContent).toContain("project-a");
      expect(summary.textContent).not.toContain("project-b");
      expect(summary.textContent).not.toContain("paused");
    }
  });

  it("does not reuse the previous workspace cache after switching", async () => {
    const view = renderSurface(Surface);
    await screen.findByTestId("summary");
    mocks.rows.mockClear();
    mocks.orgId = "org-b";
    view.refresh();
    await waitFor(() => expect(mocks.projects).toHaveBeenCalledWith({ org_id: "org-b" }));
    await waitFor(() => {
      const text = screen.getByTestId("summary").textContent;
      if (executive) {
        expect(text).toContain(formatCurrency(9000));
        expect(text).not.toContain(formatCurrency(10));
      } else {
        expect(text).toContain("project-b");
        expect(text).not.toContain("project-a");
      }
    });
    for (const [conditions] of mocks.rows.mock.calls) {
      expect(conditions).toEqual({ project_id: ["project-b"] });
    }
  });

  it("never starts an unscoped read when there is no active workspace", async () => {
    mocks.orgId = null;
    renderSurface(Surface);
    expect(screen.getByRole("status").textContent).toContain("Choose a workspace");
    expect(mocks.projects).not.toHaveBeenCalled();
    expect(mocks.rows).not.toHaveBeenCalled();
    expect(screen.queryByTestId("summary")).toBeNull();
  });

  it("does not publish financial totals after a dependent read fails", async () => {
    mocks.rows.mockRejectedValue(new Error("Financial read failed"));
    renderSurface(Surface);
    await screen.findByText(/Couldn’t load (portfolio|dashboard) data/);
    expect(screen.queryByTestId("summary")).toBeNull();
  });

  it("withholds financial totals while the initial workspace read is paused offline", async () => {
    onlineManager.setOnline(false);
    try {
      renderSurface(Surface);
      expect(screen.queryByTestId("summary")).toBeNull();
      expect(screen.getByText("Loading workspace")).toBeInTheDocument();
      expect(mocks.projects).not.toHaveBeenCalled();
      expect(mocks.rows).not.toHaveBeenCalled();
    } finally {
      await act(async () => { onlineManager.setOnline(true); });
    }
    await screen.findByTestId("summary");
  });

  it("does not fetch child rows until the workspace project request resolves", async () => {
    mocks.projects.mockReturnValue(new Promise(() => {}));
    renderSurface(Surface);
    await waitFor(() => expect(mocks.projects).toHaveBeenCalled());
    expect(mocks.rows).not.toHaveBeenCalled();
    expect(screen.queryByTestId("summary")).toBeNull();
  });
});
