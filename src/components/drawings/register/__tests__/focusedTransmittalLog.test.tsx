// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ headers: vi.fn(), items: vi.fn(), exactItems: vi.fn(), revisions: vi.fn(), gc: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DrawingTransmittal: { filter: reads.headers },
    DrawingTransmittalItem: { filter: reads.items, filterAll: reads.exactItems },
    DrawingRevision: { filterAll: reads.revisions },
    GcDrawing: { filterAll: reads.gc },
  },
}));

import { useTransmittals } from "@/hooks/useTransmittals";

const oldHeader = {
  id: "old-header", project_id: "project-1", transmittal_number: "T-OLD",
  direction: "outgoing", date_sent: "2025-01-01", created_at: "2025-01-01T08:00:00Z",
  status: "sent", is_deleted: false,
};

beforeEach(() => {
  for (const read of Object.values(reads)) read.mockReset();
  reads.headers.mockImplementation(async (conditions: { id?: string }) =>
    conditions.id ? [oldHeader] : Array.from({ length: 1_000 }, (_, index) => ({
      ...oldHeader, id: `recent-${index}`, transmittal_number: `T-${index}`,
      created_at: "2026-01-01T08:00:00Z",
    })));
  reads.items.mockResolvedValue(Array.from({ length: 1_000 }, (_, index) => ({
    id: `recent-item-${index}`, project_id: "project-1", transmittal_id: `recent-${index}`,
    drawing_id: `sheet-${index}`, drawing_revision_id: null as string | null,
  })));
  reads.exactItems.mockResolvedValue(Array.from({ length: 1_205 }, (_, index) => ({
    id: `old-item-${index}`, project_id: "project-1", transmittal_id: "old-header",
    drawing_id: `shop-${index}`, gc_drawing_id: null as string | null, drawing_revision_id: null as string | null,
    number_at_send: `S-${index}`, revision_at_send: "A",
  })));
  reads.revisions.mockResolvedValue([]);
  reads.gc.mockResolvedValue([]);
});

function renderFocusedLog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useTransmittals("project-1", { focusTransmittalId: "old-header" }), { wrapper });
}

describe("focused transmittal deep-link read", () => {
  it("retrieves an older header outside the capped log and all its attachments", async () => {
    const hook = renderFocusedLog();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    expect(reads.headers).toHaveBeenCalledWith({ project_id: "project-1", id: "old-header" }, "id", 1);
    expect(reads.exactItems).toHaveBeenCalledWith({ project_id: "project-1", transmittal_id: "old-header" }, "id");
    const log = hook.result.current.data!;
    expect(log.possiblyTruncated).toBe(true);
    expect(log.find((row) => row.id === "old-header")).toMatchObject({ item_count: 1_205, transmittal_number: "T-OLD" });
    expect(log.find((row) => row.id === "old-header")?.items[1_204]).toMatchObject({
      kind: "shop", drawing_id: "shop-1204", sheet_number: "S-1204",
    });
  });

  it("fails closed if a focused header is returned from the wrong project", async () => {
    reads.headers.mockImplementation(async (conditions: { id?: string }) =>
      conditions.id ? [{ ...oldHeader, project_id: "foreign-project" }] : []);
    const hook = renderFocusedLog();
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.error).toMatchObject({ message: "Focused transmittal header scope could not be verified." });
  });
});
