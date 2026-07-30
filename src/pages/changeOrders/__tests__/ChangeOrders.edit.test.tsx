// @vitest-environment jsdom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeOrderFilter: vi.fn(),
  changeOrderUpdate: vi.fn(),
  changeOrderDelete: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    ChangeOrder: {
      filter: mocks.changeOrderFilter,
      update: mocks.changeOrderUpdate,
      delete: mocks.changeOrderDelete,
    },
    Project: {
      list: vi.fn().mockResolvedValue([
        { id: "project-1", name: "Test Project", original_contract_value: 100000 },
      ]),
    },
    SOVItem: { filter: vi.fn().mockResolvedValue([]) },
    RFI: { filter: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/hooks/useProjectId", () => ({
  useProjectId: () => "project-1",
}));

vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject: { id: "project-1", name: "Test Project" },
  }),
}));

vi.mock("@/hooks/useRealtimeInvalidation", () => ({
  useRealtimeInvalidation: (): undefined => undefined,
}));

vi.mock("@/hooks/useAutoOpenCreate", () => ({
  useAutoOpenCreate: (): undefined => undefined,
}));

vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock("@/components/changeorders/COFormModal", () => ({
  default: ({ open, onSave, onDelete, co, isSaving }: any) => (
    open ? (
      <div data-testid="co-form">
        <span>{co?.title}</span>
        <button
          disabled={isSaving}
          onClick={() => onSave({
            ...co,
            title: "Updated title",
            co_amount: 25000,
          })}
        >
          {isSaving ? "Saving…" : "Update"}
        </button>
        {onDelete ? <button onClick={() => onDelete(co)}>Delete change order</button> : null}
      </div>
    ) : null
  ),
}));

vi.mock("@/components/changeorders/ChangeOrderImportModal", () => ({
  default: (): null => null,
}));

vi.mock("@/components/shared/DeleteDialog", () => ({
  default: ({ open, onConfirm, busy, isDeleting }: any) => {
    const pending = busy || isDeleting;
    return open ? (
      <div data-testid="delete-dialog">
        <button disabled={pending} onClick={onConfirm}>
          {pending ? "Deleting..." : "Confirm delete"}
        </button>
      </div>
    ) : null;
  },
}));

vi.mock("@/components/shared/LoadingSkeleton", () => ({
  default: (): null => null,
}));

vi.mock("@/components/shared/ListTruncationNotice", () => ({
  default: (): null => null,
}));

vi.mock("@/components/design-system", () => ({
  BulkActionBar: (): null => null,
}));

vi.mock("@/pages/changeOrders/CoControlCenter", () => ({
  default: ({ cos, onOpenCo, onDeleteCo }: any) => (
    <>
      <button onClick={() => onOpenCo(cos[0])}>Open change order</button>
      {onDeleteCo ? (
        <button
          aria-label={`Delete ${cos[0]?.co_number || "change order"}`}
          onClick={() => onDeleteCo(cos[0])}
        >
          Delete change order
        </button>
      ) : null}
    </>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import ChangeOrders from "@/pages/ChangeOrders";

describe("ChangeOrders edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the selected row id and keeps the form open until update succeeds", async () => {
    const user = userEvent.setup();
    const existing = {
      id: "co-1",
      project_id: "project-1",
      co_number: "CO #001",
      title: "Original title",
      status: "Draft",
      co_amount: 10000,
    };
    mocks.changeOrderFilter.mockResolvedValue([existing]);

    let resolveUpdate: (value: unknown) => void;
    mocks.changeOrderUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChangeOrders />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Open change order" }));
    expect(screen.getByText("Original title")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(mocks.changeOrderUpdate).toHaveBeenCalledWith("co-1", {
      ...existing,
      title: "Updated title",
      co_amount: 25000,
    });
    expect(screen.getByTestId("co-form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();

    resolveUpdate!({
      ...existing,
      title: "Updated title",
      co_amount: 25000,
    });

    await waitFor(() => {
      expect(screen.queryByTestId("co-form")).not.toBeInTheDocument();
    });
  });

  it("opens archive confirmation from the control center and clears it after delete succeeds", async () => {
    const user = userEvent.setup();
    const existing = {
      id: "co-1",
      project_id: "project-1",
      co_number: "CO #001",
      title: "Delete this CO",
      status: "Draft",
      co_amount: 10000,
    };
    mocks.changeOrderFilter.mockResolvedValue([existing]);

    let resolveDelete: (value: unknown) => void;
    mocks.changeOrderDelete.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChangeOrders />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Delete CO #001" }));
    expect(screen.getByTestId("delete-dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(mocks.changeOrderDelete).toHaveBeenCalledWith("co-1");
    expect(screen.getByTestId("delete-dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();

    resolveDelete!({ success: true });

    await waitFor(() => {
      expect(screen.queryByTestId("delete-dialog")).not.toBeInTheDocument();
    });
  });
});
