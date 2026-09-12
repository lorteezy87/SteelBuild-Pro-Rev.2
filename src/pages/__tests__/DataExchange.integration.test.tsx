// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  filter: vi.fn(),
  bulkCreate: vi.fn(),
  create: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    RFI: {
      filter: mocks.filter,
      bulkCreate: mocks.bulkCreate,
      create: mocks.create,
    },
  },
}));
vi.mock("@/components/shared/ProjectContext", () => ({
  useProjectContext: () => ({
    activeProject: { id: "project-1", name: "Main Steel", project_number: "SB-100" },
    activeProjects: [{ id: "project-1", name: "Main Steel", project_number: "SB-100" }],
    loading: false,
  }),
}));
vi.mock("@/hooks/useProjectId", () => ({ useProjectId: () => "project-1" }));
vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import DataExchange from "../DataExchange";

describe("DataExchange page integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filter.mockResolvedValue([]);
    mocks.bulkCreate.mockImplementation(async (records: Array<Record<string, unknown>>) =>
      records.map((record, index: number) => ({ id: `rfi-${index}`, ...record })),
    );
  });

  it("keeps reads and imported records scoped to the selected project", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <DataExchange />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mocks.filter).toHaveBeenCalledWith({ project_id: "project-1" }, "-created_at");
    });

    fireEvent.change(screen.getByPlaceholderText("Paste CSV or TSV rows here..."), {
      target: { value: "RFI #,Title\n7,Column base plate conflict" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Commit 1 rows" }));

    await waitFor(() => {
      expect(mocks.bulkCreate).toHaveBeenCalledWith([{
        project_id: "project-1",
        project_name: "Main Steel",
        status: "Open",
        priority: "Medium",
        ball_in_court: "Contractor",
        rfi_number: "RFI #007",
        title: "Column base plate conflict",
        metadata: {
          import_target: "rfis",
          data_exchange_import: true,
          import_source_name: "Manual paste",
        },
      }]);
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported 1 rfis");
  });
});
