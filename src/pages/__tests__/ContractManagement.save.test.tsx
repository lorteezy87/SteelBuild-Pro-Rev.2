// @vitest-environment jsdom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectList: vi.fn(),
  projectUpdate: vi.fn(),
  activeProjectId: "project-1",
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Project: {
      list: mocks.projectList,
      update: mocks.projectUpdate,
    },
    ChangeOrder: { filter: vi.fn().mockResolvedValue([]) },
    SOVItem: { filter: vi.fn().mockResolvedValue([]) },
    Expense: { filter: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({ activeProject: { id: mocks.activeProjectId } }),
}));

vi.mock("@/hooks/useRealtimeInvalidation", () => ({
  useRealtimeInvalidation: (): undefined => undefined,
}));

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock("@/components/design-system", () => ({
  CommandBar: (): null => null,
}));

vi.mock("@/components/shared/DeleteDialog", () => ({
  default: (): null => null,
}));

vi.mock("@/components/sov/SOVFormModal", () => ({
  default: (): null => null,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import ContractManagement from "@/pages/ContractManagement";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const page = (
    <QueryClientProvider client={queryClient}>
      <ContractManagement />
    </QueryClientProvider>
  );
  const view = render(page);
  return {
    ...view,
    selectProject(projectId: string) {
      mocks.activeProjectId = projectId;
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <ContractManagement />
        </QueryClientProvider>,
      );
    },
  };
}

describe("ContractManagement contract save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeProjectId = "project-1";
    mocks.projectList.mockResolvedValue([
      {
        id: "project-1",
        name: "Test Project",
        original_contract_value: 100000,
        contract_type: "Lump Sum",
      },
      {
        id: "project-2",
        name: "Second Project",
        original_contract_value: 200000,
        contract_type: "Unit Price",
      },
    ]);
  });

  it("discards the first project's contract draft before editing the selected project", async () => {
    const user = userEvent.setup();
    mocks.projectUpdate.mockResolvedValue({ id: "project-2" });
    const page = renderPage();

    await user.click(await screen.findByRole("button", { name: /edit/i }));
    await user.clear(screen.getByRole("spinbutton"));
    await user.type(screen.getByRole("spinbutton"), "125000");
    await user.selectOptions(screen.getByRole("combobox"), "GMP");

    page.selectProject("project-2");

    await screen.findByRole("button", { name: /edit/i });
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
    expect(mocks.projectUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("spinbutton")).toHaveValue(200000);
    expect(screen.getByRole("combobox")).toHaveValue("Unit Price");
    await user.clear(screen.getByRole("spinbutton"));
    await user.type(screen.getByRole("spinbutton"), "225000");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.projectUpdate).toHaveBeenCalledWith("project-2", {
      original_contract_value: 225000,
      contract_type: "Unit Price",
    }));
    expect(mocks.projectUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps contract edit mode open until the project update succeeds", async () => {
    const user = userEvent.setup();
    let resolveSave: (value: unknown) => void;
    mocks.projectUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );

    renderPage();

    await user.click(await screen.findByRole("button", { name: /edit/i }));
    const valueInput = screen.getByRole("spinbutton");
    await user.clear(valueInput);
    await user.type(valueInput, "125000");
    await user.selectOptions(screen.getByRole("combobox"), "GMP");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(mocks.projectUpdate).toHaveBeenCalledWith("project-1", {
      original_contract_value: 125000,
      contract_type: "GMP",
    });
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();

    resolveSave!({
      id: "project-1",
      original_contract_value: 125000,
      contract_type: "GMP",
    });

    await waitFor(() => {
      expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    });
  });
});
