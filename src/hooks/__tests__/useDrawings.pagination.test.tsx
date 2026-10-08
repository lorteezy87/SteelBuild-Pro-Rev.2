// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const drawingReads = vi.hoisted(() => ({
  filterAll: vi.fn(),
  filter: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: { Drawing: drawingReads },
}));
vi.mock("@/lib/autoScheduleDetailing", () => ({ autoCreateDetailingTasks: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { useDrawings } from "../useDrawings";

function renderDrawings(projectId: string | null = "project-1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useDrawings(projectId), { wrapper });
}

describe("useDrawings complete project reads", () => {
  beforeEach(() => {
    drawingReads.filterAll.mockReset();
    drawingReads.filter.mockReset();
  });

  it("includes sheets past the server's 1000-row cap in set grouping", async () => {
    drawingReads.filterAll.mockResolvedValue(Array.from({ length: 1002 }, (_, index) => ({
      id: `sheet-${index}`,
      project_id: "project-1",
      drawing_set_name: index === 1001 ? "Last Set" : "First Set",
    })));

    const hook = renderDrawings();
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    expect(drawingReads.filterAll).toHaveBeenCalledWith({ project_id: "project-1" });
    expect(drawingReads.filter).not.toHaveBeenCalled();
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.drawings).toHaveLength(1002);
    expect(hook.result.current.drawingSets["Last Set"]).toHaveLength(1);
  });

  it("exposes an incomplete-page error instead of claiming a clear drawing register", async () => {
    drawingReads.filterAll.mockRejectedValue(new Error("Later drawing page failed"));

    const hook = renderDrawings();
    await waitFor(() => expect(hook.result.current.error).toBeTruthy());

    expect(hook.result.current.error?.message).toBe("Later drawing page failed");
    expect(hook.result.current.drawings).toEqual([]);
  });

  it("does not read without a selected project", () => {
    const hook = renderDrawings(null);
    expect(hook.result.current.drawings).toEqual([]);
    expect(drawingReads.filterAll).not.toHaveBeenCalled();
  });
});
