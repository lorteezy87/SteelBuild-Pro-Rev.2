// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGcDocumentsPageData } from "../useGcDocumentsPageData";

const entitiesMock = vi.hoisted(() => ({
  setsFilter: vi.fn(),
  setsFilterAll: vi.fn(),
  sheetsFilterAll: vi.fn(),
  shopSetsFilterAll: vi.fn(),
  impactLinksRead: vi.fn(),
}));

vi.mock("@/lib/gcDocuments/gcShopImpactLinks", () => ({
  fetchGcShopImpactLinks: entitiesMock.impactLinksRead,
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    GcDrawingSet: { filter: entitiesMock.setsFilter, filterAll: entitiesMock.setsFilterAll },
    GcDrawing: { filterAll: entitiesMock.sheetsFilterAll },
    DrawingSet: { filterAll: entitiesMock.shopSetsFilterAll },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  entitiesMock.setsFilterAll.mockResolvedValue([]);
  entitiesMock.sheetsFilterAll.mockResolvedValue([]);
  entitiesMock.shopSetsFilterAll.mockResolvedValue([]);
  entitiesMock.impactLinksRead.mockResolvedValue([]);
});

describe("GC issuance project reads", () => {
  it("counts every issuance beyond the single-request cap", async () => {
    const sets = Array.from({ length: 1001 }, (_, index) => ({
      id: `gc-set-${index}`,
      project_id: "project-1",
      set_name: `ASI ${index}`,
      doc_type: "ASI",
    }));
    entitiesMock.setsFilter.mockResolvedValue(sets.slice(0, 1000));
    entitiesMock.setsFilterAll.mockResolvedValue(sets);
    entitiesMock.sheetsFilterAll.mockResolvedValue([]);
    entitiesMock.shopSetsFilterAll.mockResolvedValue([]);
    entitiesMock.impactLinksRead.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(
      () => useGcDocumentsPageData({ projectId: "project-1", filters: { search: "", docType: "ALL", impact: "ALL" } }),
      { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    );

    await waitFor(() => expect(result.current.stats.total).toBe(1001));
    expect(entitiesMock.setsFilterAll).toHaveBeenCalledWith({ project_id: "project-1" });
    expect(entitiesMock.setsFilter).not.toHaveBeenCalled();
    client.clear();
  });

  it("offers the 1,001st active shop set and only exact GC-set-ID links", async () => {
    entitiesMock.setsFilterAll.mockResolvedValue([{ id: "gc-1", project_id: "project-1", set_name: "S-301 GC change" }]);
    entitiesMock.sheetsFilterAll.mockResolvedValue([{ id: "gc-sheet", project_id: "project-1", gc_drawing_set_id: "gc-1", drawing_number: "S-301" }]);
    entitiesMock.shopSetsFilterAll.mockResolvedValue(Array.from({ length: 1001 }, (_, index) => ({
      id: `shop-${index}`, project_id: "project-1", set_name: index === 1000 ? "S-301 shop set" : `Set ${index}`,
      is_deleted: false, deleted_at: null as string | null,
    })));
    entitiesMock.impactLinksRead.mockResolvedValue([{ id: "link-1", project_id: "project-1", gc_drawing_set_id: "gc-1", drawing_set_id: "shop-1000" }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useGcDocumentsPageData({ projectId: "project-1", filters: { search: "", docType: "ALL", impact: "ALL" } }),
      { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    );
    await waitFor(() => expect(result.current.impactLinksStatus).toBe("available"));
    await waitFor(() => expect(result.current.shopSets).toHaveLength(1001));
    expect(result.current.linksByIssuance.get("gc-1")?.map((link) => link.drawing_set_id)).toEqual(["shop-1000"]);
    expect(entitiesMock.shopSetsFilterAll).toHaveBeenCalledWith({ project_id: "project-1" });
    client.clear();
  });

  it("keeps the GC register available when the new link table is absent", async () => {
    entitiesMock.setsFilterAll.mockResolvedValue([{ id: "gc-1", project_id: "project-1", set_name: "ASI 012" }]);
    entitiesMock.impactLinksRead.mockRejectedValue(new Error("relation missing"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useGcDocumentsPageData({ projectId: "project-1", filters: { search: "", docType: "ALL", impact: "ALL" } }),
      { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> },
    );
    await waitFor(() => expect(result.current.impactLinksStatus).toBe("unavailable"));
    expect(result.current.stats.total).toBe(1);
    expect(result.current.queryError).toBeNull();
    client.clear();
  });
});
