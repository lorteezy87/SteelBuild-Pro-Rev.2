// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submittalFilter: vi.fn(),
  roundFilter: vi.fn(),
  submittalCreate: vi.fn(),
  submittalUpdate: vi.fn(),
  submittalDelete: vi.fn(),
  roundCreate: vi.fn(),
  roundUpdate: vi.fn(),
  roundDelete: vi.fn(),
  invalidateEntities: vi.fn(),
  statusTriggers: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    Submittal: {
      filter: mocks.submittalFilter,
      create: mocks.submittalCreate,
      update: mocks.submittalUpdate,
      delete: mocks.submittalDelete,
    },
    SubmittalRound: {
      filter: mocks.roundFilter,
      create: mocks.roundCreate,
      update: mocks.roundUpdate,
      delete: mocks.roundDelete,
    },
    SubmittalCommentDisposition: { filter: vi.fn() },
  },
}));
vi.mock("@/services/cacheRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/cacheRegistry")>()),
  invalidateEntities: mocks.invalidateEntities,
}));
vi.mock("@/services/validation", () => ({ validate: vi.fn(() => []) }));
vi.mock("@/lib/submittalSmartTriggers", () => ({
  runSubmittalStatusTriggers: mocks.statusTriggers,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })) },
}));
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

import { getQueryKey } from "@/services/cacheRegistry";
import { useSubmittals } from "../../useSubmittals";

function renderSubmittals(projectId: string | null = "project-1") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => useSubmittals(projectId), { wrapper }),
  };
}

describe("useSubmittals facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submittalFilter.mockResolvedValue([
      {
        id: "sub-1",
        project_id: "project-1",
        status: "Submitted",
        drawing_set_ids: ["set-1"],
      },
    ]);
    mocks.roundFilter.mockResolvedValue([
      {
        id: "round-1",
        project_id: "project-1",
        submittal_id: "sub-1",
        round_number: 1,
      },
    ]);
    mocks.submittalUpdate.mockResolvedValue({
      id: "sub-1",
      project_id: "project-1",
      status: "Under Review",
    });
    mocks.invalidateEntities.mockResolvedValue(undefined);
    mocks.statusTriggers.mockResolvedValue(undefined);
  });

  it("keeps query keys, stale times, scoped reads, and the public shape", async () => {
    const hook = renderSubmittals();
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    expect(mocks.submittalFilter).toHaveBeenCalledWith(
      { project_id: "project-1" },
      "-submitted_date",
      2000,
    );
    expect(mocks.roundFilter).toHaveBeenCalledWith(
      { project_id: "project-1" },
      "-round_number",
      2000,
    );
    expect(hook.result.current.roundsBySubmittal["sub-1"]).toHaveLength(1);
    expect(hook.result.current.kpis.pending).toBe(1);
    expect(hook.result.current).toMatchObject({
      createSubmittal: expect.any(Object),
      updateSubmittal: expect.any(Object),
      deleteSubmittal: expect.any(Object),
      createRound: expect.any(Object),
      updateRound: expect.any(Object),
      bulkUpdate: expect.any(Object),
      bulkDelete: expect.any(Object),
      invalidateAll: expect.any(Function),
    });

    const submittalQuery = hook.client.getQueryCache().find({
      queryKey: getQueryKey("submittal", "project-1"),
    });
    const roundQuery = hook.client.getQueryCache().find({
      queryKey: getQueryKey("submittal_round", "project-1"),
    });
    expect(
      (submittalQuery?.options as { staleTime?: number }).staleTime,
    ).toBe(60_000);
    expect(
      (roundQuery?.options as { staleTime?: number }).staleTime,
    ).toBe(60_000);
  });

  it("keeps status triggers and the complete invalidation fan-out", async () => {
    const hook = renderSubmittals();
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    await act(async () => {
      await hook.result.current.updateSubmittal.mutateAsync({
        id: "sub-1",
        status: "Under Review",
      });
    });

    expect(mocks.statusTriggers).toHaveBeenCalledWith({
      submittal: expect.objectContaining({ id: "sub-1" }),
      prevStatus: "Submitted",
      nextStatus: "Under Review",
    });
    expect(mocks.invalidateEntities).toHaveBeenCalledWith(
      hook.client,
      [
        "submittal",
        "submittal_round",
        "submittal_activity",
        "drawing",
        "action_item",
      ],
      "project-1",
    );
  });

  it("does not execute data reads without a selected project", async () => {
    const hook = renderSubmittals(null);

    expect(hook.result.current.submittals).toEqual([]);
    expect(hook.result.current.rounds).toEqual([]);
    expect(mocks.submittalFilter).not.toHaveBeenCalled();
    expect(mocks.roundFilter).not.toHaveBeenCalled();
  });
});
