// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import Projects from "../../Projects";

/**
 * The shell decides WHETHER a project can be created; the Control Center only
 * shows it. These pin the shell's half: a null `onCreate` always arrives with
 * a reason, and the two blocking conditions are told apart.
 *
 * They matter because the conditions read alike in code and nothing alike to a
 * user: the plan limit is permanent and needs an upgrade, a refetch clears in
 * a second. Collapsed into one absent button, both looked like the product
 * refusing to create projects.
 */
const mocks = vi.hoisted(() => ({
  projects: vi.fn(),
  rows: vi.fn(),
  projectLimit: 100 as number | null,
  planName: "Pro" as string | undefined,
}));

vi.mock("@/components/shared/OrgContext", () => ({
  useOrg: () => ({ currentOrg: { id: "org-a" }, isLoadingOrgs: false }),
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: null as null, removeProject: vi.fn() }),
}));
vi.mock("../projectQueries", () => ({ fetchProjectRegister: mocks.projects }));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: { listAll: mocks.projects, filterAll: mocks.projects, create: vi.fn() },
    ...Object.fromEntries(
      ["WorkPackage", "RFI", "ChangeOrder", "ScheduleTask", "Alert"].map((name) => [
        name,
        { listAll: mocks.rows, filter: mocks.rows, filterAll: mocks.rows, create: vi.fn() },
      ]),
    ),
  },
  auth: {},
  integrations: {},
}));
vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({ plan: { name: mocks.planName, limits: { projects: mocks.projectLimit } } }),
}));
vi.mock("@/hooks/useProjectRole", () => ({
  useProjectRole: () => ({ role: "admin", isLoading: false }),
  roleAtLeast: () => true,
}));
vi.mock("@/lib/projectTemplates", () => ({ applyProjectTemplate: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/shared/SecureDeleteDialog", () => ({ default: (): null => null }));
vi.mock("@/components/projects/ProjectDetailView", () => ({ default: (): null => null }));
vi.mock("@/components/projects/ProjectFormModal", () => ({ default: (): null => null }));
vi.mock("../ProjectsControlCenter", () => ({
  default: ({ onCreate, createBlockedReason }: { onCreate?: (() => void) | null; createBlockedReason?: string | null }) => (
    <div data-testid="gate" data-can-create={String(Boolean(onCreate))}>
      {createBlockedReason ?? ""}
    </div>
  ),
}));

const live = [
  { id: "a", org_id: "org-a", name: "Alpha" },
  { id: "b", org_id: "org-a", name: "Bravo" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectLimit = 100;
  mocks.planName = "Pro";
  mocks.projects.mockResolvedValue(live);
  mocks.rows.mockResolvedValue([]);
});
afterEach(cleanup);

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Projects />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Projects shell — the create gate", () => {
  it("allows creation and states no reason when under the limit", async () => {
    mount();
    const gate = await screen.findByTestId("gate");
    await waitFor(() => expect(gate.dataset.canCreate).toBe("true"));
    expect(gate.textContent).toBe("");
  });

  it("names the plan, the count and the limit when the workspace is full", async () => {
    mocks.projectLimit = 2;
    mount();
    const gate = await screen.findByTestId("gate");
    await waitFor(() => expect(gate.dataset.canCreate).toBe("false"));
    expect(gate.textContent).toBe("2 of 2 projects used on Pro plan. Upgrade to add another.");
  });

  // A blocked create with nothing to read is the bug this file exists for.
  it("never withholds creation without a reason", async () => {
    mocks.projectLimit = 1;
    mount();
    const gate = await screen.findByTestId("gate");
    await waitFor(() => expect(gate.dataset.canCreate).toBe("false"));
    expect(gate.textContent?.trim()).not.toBe("");
  });

  it("says 'your plan' rather than 'undefined plan' when the plan has no name", async () => {
    mocks.projectLimit = 2;
    mocks.planName = undefined;
    mount();
    const gate = await screen.findByTestId("gate");
    await waitFor(() => expect(gate.dataset.canCreate).toBe("false"));
    expect(gate.textContent).toBe("2 of 2 projects used on your plan. Upgrade to add another.");
    expect(gate.textContent).not.toContain("undefined");
  });

  it("keeps creation open on an unlimited plan", async () => {
    mocks.projectLimit = null;
    mount();
    const gate = await screen.findByTestId("gate");
    await waitFor(() => expect(gate.dataset.canCreate).toBe("true"));
    expect(gate.textContent).toBe("");
  });
});
