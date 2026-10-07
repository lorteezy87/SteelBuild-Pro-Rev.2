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
  toastWarning: vi.fn(),
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
    warning: mocks.toastWarning,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { useDataExchangeController } from "../useDataExchangeController";
import { setActiveOrgId } from "@/lib/activeOrg";

describe("useDataExchangeController integration", () => {
  beforeEach(() => {
    setActiveOrgId(null);
    setActiveOrgId("exchange-org-a");
    vi.clearAllMocks();
    mocks.filter.mockResolvedValue([]);
    mocks.bulkCreate.mockImplementation(
      async (records: Array<Record<string, unknown>>) => records,
    );
  });

  it("retains partial receipts across remounts and clears them at a workspace boundary", async () => {
    mocks.bulkCreate.mockRejectedValue(Object.assign(new Error("partial save"), {
      created: [{ id: "rfi-7", rfi_number: "RFI #007", title: "Confirmed" }],
      failedIndex: 1,
      cause: new TypeError("reply lost"),
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const submit = async (view: ReturnType<typeof renderHook<ReturnType<typeof useDataExchangeController>, unknown>>) => {
      await waitFor(() => expect(view.result.current.recordsQuery.isSuccess).toBe(true));
      act(() => view.result.current.handleImportTextChange("RFI #,Title\n7,Confirmed\n8,Unknown"));
      act(() => view.result.current.handleImportApprovalChange(true));
      await act(async () => { await view.result.current.importMutation.mutateAsync(); });
    };
    const first = renderHook(() => useDataExchangeController(), { wrapper });
    await submit(first);
    first.unmount();
    const reopened = renderHook(() => useDataExchangeController(), { wrapper });
    await submit(reopened);
    expect(mocks.bulkCreate).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    act(() => reopened.result.current.handleImportTextChange("RFI #,Title\n8,Edited unknown"));
    act(() => reopened.result.current.handleImportApprovalChange(true));
    await act(async () => { await expect(reopened.result.current.importMutation.mutateAsync()).rejects.toThrow(/unconfirmed.*reconcile/i); });
    reopened.unmount();
    act(() => setActiveOrgId("exchange-org-b"));
    const nextWorkspace = renderHook(() => useDataExchangeController(), { wrapper });
    await submit(nextWorkspace);
    expect(mocks.bulkCreate).toHaveBeenCalledTimes(2);
  });

  it("rejects a reviewed draft after switching away and back to the same workspace", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useDataExchangeController(), { wrapper });
    await waitFor(() => expect(result.current.recordsQuery.isSuccess).toBe(true));
    act(() => result.current.handleImportTextChange("RFI #,Title\n7,Reviewed draft"));
    act(() => result.current.handleImportApprovalChange(true));
    act(() => { setActiveOrgId("exchange-org-b"); setActiveOrgId("exchange-org-a"); });
    await act(async () => { await expect(result.current.importMutation.mutateAsync()).rejects.toThrow(/workspace changed/i); });
    expect(mocks.bulkCreate).not.toHaveBeenCalled();
    expect(result.current.importApproved).toBe(false);
  });

  it("warns about an unknown outcome and does not replay it on another commit click", async () => {
    mocks.bulkCreate.mockRejectedValue(new TypeError("reply lost"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useDataExchangeController(), { wrapper });
    await waitFor(() => expect(result.current.recordsQuery.isSuccess).toBe(true));
    act(() => result.current.handleImportTextChange("RFI #,Title\n7,Column base plate conflict"));
    act(() => result.current.handleImportApprovalChange(true));
    await act(async () => { await result.current.importMutation.mutateAsync(); });
    expect(mocks.toastWarning).toHaveBeenCalledWith(expect.stringMatching(/1.*unconfirmed/i));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    act(() => result.current.handleImportApprovalChange(true));
    await act(async () => { await result.current.importMutation.mutateAsync(); });
    expect(mocks.bulkCreate).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps a newer draft approval when an earlier import finishes", async () => {
    let finish!: (records: Array<Record<string, unknown>>) => void;
    mocks.bulkCreate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useDataExchangeController(), { wrapper });
    await waitFor(() => expect(result.current.recordsQuery.isSuccess).toBe(true));
    act(() => result.current.handleImportTextChange("RFI #,Title\n7,Earlier import"));
    act(() => result.current.handleImportApprovalChange(true));
    act(() => result.current.commitImport());
    await waitFor(() => expect(mocks.bulkCreate).toHaveBeenCalledTimes(1));
    act(() => result.current.handleImportTextChange("RFI #,Title\n8,Newer draft"));
    act(() => result.current.handleImportApprovalChange(true));
    await act(async () => finish([{ id: "saved", title: "Earlier import" }]));
    await waitFor(() => expect(result.current.importMutation.isSuccess).toBe(true));
    expect(result.current.importApproved).toBe(true);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["data-exchange", "RFI", "project-1"] });
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
