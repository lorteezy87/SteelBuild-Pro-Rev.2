// @vitest-environment jsdom

import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  filter: vi.fn(),
  useRealtimeInvalidation: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    ScheduleTask: {
      filter: mocks.filter,
    },
  },
}));

vi.mock("@/hooks/useRealtimeInvalidation", () => ({
  useRealtimeInvalidation: mocks.useRealtimeInvalidation,
}));

import { useScheduleTasks } from "@/hooks/useScheduleTasks";
import { invalidateEntity } from "@/services/cacheRegistry";

afterEach(() => {
  vi.clearAllMocks();
});

describe("useScheduleTasks persistence refresh", () => {
  it("keeps a newly persisted task visible after the schedule cache refetches", async () => {
    const projectId = "project-1";
    let persistedRows = [];
    mocks.filter.mockImplementation(async () => [...persistedRows]);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useScheduleTasks(projectId), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.scheduleTasks).toEqual([]);
    });

    persistedRows = [
      {
        id: "task-1",
        project_id: projectId,
        task_name: "Release embeds",
        status: "Not Started",
      },
    ];

    await act(async () => {
      await invalidateEntity(queryClient, "schedule_task", projectId);
    });

    await waitFor(() => {
      expect(result.current.scheduleTasks).toEqual(persistedRows);
    });
    expect(mocks.filter).toHaveBeenLastCalledWith(
      { project_id: projectId },
      "start_date",
    );
  });
});
