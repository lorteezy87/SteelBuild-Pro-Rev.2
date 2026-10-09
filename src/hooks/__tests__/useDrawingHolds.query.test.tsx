// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";

const holdClient = vi.hoisted(() => ({
  filter: vi.fn(),
  filterAll: vi.fn(),
}));
vi.mock("@/api/supabaseClient", () => ({ entities: { DrawingHold: holdClient } }));

import { useDrawingHolds } from "@/hooks/useDrawingHolds";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  holdClient.filter.mockReset();
  holdClient.filterAll.mockReset();
});

describe("useDrawingHolds project evidence", () => {
  it("reads every project hold past the first 1000-row server page", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `hold-${index}`,
      project_id: "p1",
      placed_at: `2026-09-01T00:00:00Z`,
      is_active: false,
    })) as DrawingHoldRow[];
    const finalHold = {
      id: "hold-1000",
      project_id: "p1",
      placed_at: "2026-10-01T00:00:00Z",
      is_active: true,
    } as DrawingHoldRow;
    holdClient.filter.mockResolvedValue(firstPage);
    holdClient.filterAll.mockResolvedValue([...firstPage, finalHold]);

    const { result } = renderHook(() => useDrawingHolds("p1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1001);
    expect(result.current.data?.[0]?.id).toBe("hold-1000");
    expect(holdClient.filterAll).toHaveBeenCalledWith({ project_id: "p1" });
    expect(holdClient.filter).not.toHaveBeenCalled();
  });
});
