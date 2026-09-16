// @vitest-environment jsdom
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  expenses: vi.fn(),
  costCodes: vi.fn(),
  projects: vi.fn(),
  members: vi.fn(),
  invites: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => {
  const empty = vi.fn().mockResolvedValue([]);
  const reads: Record<string, typeof empty> = {
    Expense: mocks.expenses,
    CostCode: mocks.costCodes,
    Project: mocks.projects,
  };
  return {
    entities: new Proxy({}, {
      get: (_target, entity: string) => ({ list: reads[entity] || empty, filter: reads[entity] || empty }),
    }),
  };
});

vi.mock("@/lib/AuthContext", async () => ({
  AuthContext: (await import("react")).createContext(null),
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/components/shared/OrgContext", () => ({
  useOrg: () => ({ currentOrg: { id: "org-1", name: "Test Workspace" }, currentRole: "owner", refetchOrgs: vi.fn() }),
}));
vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({ plan: { name: "Test", limits: { members: 10 } } }),
}));
vi.mock("@/lib/native/platform", () => ({ isNativePlatform: () => false }));
vi.mock("@/components/settings/DangerZone.jsx", () => ({ default: (): null => null }));
vi.mock("@/lib/org/repository", () => ({
  listOrgMembers: mocks.members,
  listInvitations: mocks.invites,
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  inviteLink: vi.fn(),
  updateOrgDefaultProjectRole: vi.fn(),
}));

import Expenses from "@/pages/Expenses";
import OrgMembers from "@/pages/OrgMembers";
import PortfolioOverview from "@/pages/reports/PortfolioOverview";
import { ProjectContext } from "@/components/shared/ProjectContext";

const project = { id: "project-1", name: "Test Project", project_name: "Test Project", original_contract_value: 1000 };
const costCodes = [{ id: "cost-1", project_id: project.id, cost_code_number: "05", budget_amount: 1000 }];
const expenses = [{ id: "expense-1", project_id: project.id, description: "Steel", expense_number: "EXP-001", expense_date: "2026-09-10", cost_code: "05", amount: 1200, payment_status: "Paid", expense_type: "Materials" }];
const members = [{ id: "member-1", user_id: "user-1", email: "owner@example.test", full_name: "Test Owner", role: "owner", created_at: "2026-09-01T00:00:00Z" }];
const invites = [{ id: "invite-1", email: "invite@example.test", role: "member", token: "test-token", created_at: "2026-09-01T00:00:00Z", expires_at: "2026-09-30T00:00:00Z" }];
type ProjectContextFixture = Omit<React.ContextType<typeof ProjectContext>, "activeProject" | "projects" | "activeProjects"> & {
  activeProject: typeof project | null;
  projects: (typeof project)[];
  activeProjects: (typeof project)[];
};
const projectContext: ProjectContextFixture = {
  activeProject: project,
  setActiveProject: () => {},
  updateActiveProject: () => null,
  patchProject: () => null,
  removeProject: () => {},
  projects: [project],
  activeProjects: [project],
  activeProjectIds: new Set([project.id]),
  loading: false,
  projectLoadError: null,
};
// The JS context's empty defaults infer null/never under strictNullChecks;
// its runtime provider supplies project records. Keep that boundary typed here.
const TestProjectProvider = ProjectContext.Provider as React.Provider<ProjectContextFixture>;

function renderPage(page: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Match the shared project list already loaded by the authenticated shell.
  queryClient.setQueryData(["projects"], [project]);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TestProjectProvider value={projectContext}>
          {page}
        </TestProjectProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects.mockResolvedValue([project]);
  mocks.costCodes.mockResolvedValue(costCodes);
  mocks.expenses.mockResolvedValue(expenses);
  mocks.members.mockResolvedValue(members);
  mocks.invites.mockResolvedValue(invites);
});

describe("commercial and team evidence gates", () => {
  it("withholds team seats and invitation controls while an initial offline read is paused", async () => {
    onlineManager.setOnline(false);
    try {
      renderPage(<OrgMembers />);
      expect(screen.queryByText("Seats Used")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Invite Member" })).not.toBeInTheDocument();
      expect(mocks.members).not.toHaveBeenCalled();
      expect(mocks.invites).not.toHaveBeenCalled();
    } finally {
      await act(async () => { onlineManager.setOnline(true); });
    }
    expect(await screen.findByText("Seats Used")).toBeInTheDocument();
  });

  it.each(["expenses", "costCodes"] as const)("hides expense summaries and actions when %s fails, then recovers", async (source) => {
    const user = userEvent.setup();
    mocks[source].mockRejectedValue(new Error("Read failed"));
    renderPage(<Expenses />);

    expect(await screen.findByRole("alert", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.queryAllByText("Total Committed")).toHaveLength(0);
    expect(screen.queryByText("No expenses pending approval.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add Expense/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Export/i })).not.toBeInTheDocument();

    mocks[source].mockResolvedValue(source === "expenses" ? expenses : costCodes);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findAllByText("Total Committed")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert", { name: "Expenses" })).not.toBeInTheDocument();
  });

  it("waits for expense budget evidence before rendering monetary summaries", async () => {
    let resolveBudget!: (rows: typeof costCodes) => void;
    mocks.costCodes.mockReturnValue(new Promise((resolve) => { resolveBudget = resolve; }));
    renderPage(<Expenses />);
    expect(await screen.findByRole("status", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.queryAllByText("Total Committed")).toHaveLength(0);
    await act(async () => { resolveBudget(costCodes); });
    expect((await screen.findAllByText("Total Committed")).length).toBeGreaterThan(0);
  });

  it.each(["expenses", "costCodes"] as const)("withholds portfolio health and exports when %s fails, then recovers", async (source) => {
    const user = userEvent.setup();
    mocks[source].mockRejectedValue(new Error("Read failed"));
    renderPage(<PortfolioOverview />);

    expect(await screen.findByRole("alert", { name: "Portfolio overview" })).toBeInTheDocument();
    expect(screen.queryAllByText("Healthy")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /CSV/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Print/ })).not.toBeInTheDocument();

    mocks[source].mockResolvedValue(source === "expenses" ? expenses : costCodes);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: /CSV/ })).toBeInTheDocument();
    expect(screen.getAllByText("At Risk").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert", { name: "Portfolio overview" })).not.toBeInTheDocument();
  });

  it("waits for portfolio cost evidence before offering a report export", async () => {
    let resolveBudget!: (rows: typeof costCodes) => void;
    mocks.costCodes.mockReturnValue(new Promise((resolve) => { resolveBudget = resolve; }));
    renderPage(<PortfolioOverview />);
    expect(await screen.findByRole("status", { name: "Portfolio overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CSV/ })).not.toBeInTheDocument();
    await act(async () => { resolveBudget(costCodes); });
    expect(await screen.findByRole("button", { name: /CSV/ })).toBeInTheDocument();
  });

  it.each(["members", "invites"] as const)("withholds team seat counts and invite controls when %s fails, then recovers", async (source) => {
    const user = userEvent.setup();
    mocks[source].mockRejectedValue(new Error("Read failed"));
    renderPage(<OrgMembers />);

    expect(await screen.findByRole("alert", { name: "Team" })).toBeInTheDocument();
    expect(screen.queryByText("Seats Used")).not.toBeInTheDocument();
    expect(screen.queryByText("No members yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("No pending invites.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite Member" })).not.toBeInTheDocument();

    mocks[source].mockResolvedValue(source === "members" ? members : invites);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Seats Used")).toBeInTheDocument();
    expect(screen.getByText("2 / 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite Member" })).toBeInTheDocument();
  });
});
