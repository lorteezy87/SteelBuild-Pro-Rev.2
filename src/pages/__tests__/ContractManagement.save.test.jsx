// @vitest-environment jsdom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectList: vi.fn(),
  projectUpdate: vi.fn(),
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
  useProjectContext: () => ({ activeProject: { id: "project-1" } }),
}));

vi.mock("@/hooks/useRealtimeInvalidation", () => ({
  useRealtimeInvalidation: () => undefined,
}));

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock("@/components/design-system", () => ({
  CommandBar: () => null,
}));

vi.mock("@/components/shared/DeleteDialog", () => ({
  default: () => null,
}));

vi.mock("@/components/sov/SOVFormModal", () => ({
  default: () => null,
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

  return render(
    <QueryClientProvider client={queryClient}>
      <ContractManagement />
    </QueryClientProvider>,
  );
}

describe("ContractManagement contract save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectList.mockResolvedValue([
      {
        id: "project-1",
        name: "Test Project",
        original_contract_value: 100000,
        contract_type: "Lump Sum",
      },
    ]);
  });

  it("keeps contract edit mode open until the project update succeeds", async () => {
    const user = userEvent.setup();
    let resolveSave;
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

    resolveSave({
      id: "project-1",
      original_contract_value: 125000,
      contract_type: "GMP",
    });

    await waitFor(() => {
      expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    });
  });
});
