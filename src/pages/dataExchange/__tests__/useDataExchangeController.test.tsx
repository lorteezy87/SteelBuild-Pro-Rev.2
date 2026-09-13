// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    activeProject: {
      id: "project-1",
      name: "Main Steel",
      project_number: "SB-100",
    },
    activeProjects: [{
      id: "project-1",
      name: "Main Steel",
      project_number: "SB-100",
    }],
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

import { useDataExchangeController } from "../useDataExchangeController";

describe("useDataExchangeController integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filter.mockResolvedValue([]);
    mocks.bulkCreate.mockImplementation(
      async (records: Array<Record<string, unknown>>) => records,
    );
  });

  it("preserves mutation ordering, project scope, and both invalidation keys", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDataExchangeController(), { wrapper });

    await waitFor(() => {
      expect(result.current.recordsQuery.isSuccess).toBe(true);
    });

    act(() => {
      result.current.handleImportTextChange(
        "RFI #,Title\n7,Column base plate conflict",
      );
    });
    await waitFor(() => {
      expect(result.current.stagedImport.validRecords).toHaveLength(1);
    });

    act(() => {
      result.current.handleImportApprovalChange(true);
    });
    await waitFor(() => {
      expect(result.current.importApproved).toBe(true);
    });

    act(() => {
      result.current.commitImport();
    });

    await waitFor(() => {
      expect(mocks.bulkCreate).toHaveBeenCalledTimes(1);
    });
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
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["data-exchange", "RFI", "project-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["RFI"] });
    expect(result.current.importApproved).toBe(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Imported 1 rfis");
  });
});
