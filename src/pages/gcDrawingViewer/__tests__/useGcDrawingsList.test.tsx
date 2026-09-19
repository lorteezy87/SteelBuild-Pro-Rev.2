// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import React from "react";

const filter = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  entities: { GcDrawing: { filter: (...a: unknown[]) => filter(...a) } },
}));

import { useGcDrawingsList } from "../useGcDrawingsList";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function gcSheet(id: string, drawing_number: string, pdf_page: number, extra = {}) {
  return {
    id,
    drawing_number,
    pdf_page,
    file_url: "projects/p/asi-012.pdf",
    title: `Sheet ${drawing_number}`,
    ...extra,
  };
}

describe("useGcDrawingsList", () => {
  it("orders by drawing_number naturally, not lexicographically", async () => {
    // A naive string sort puts ASI-100 before ASI-11. Feed shuffled rows so
    // the hook has to impose the order itself -- .filter() applies no ORDER BY.
    filter.mockResolvedValue([
      gcSheet("g4", "ASI-100", 4),
      gcSheet("g2", "ASI-2", 2),
      gcSheet("g5", "ASI-11", 5),
      gcSheet("g1", "ASI-1", 1),
      gcSheet("g3", "ASI-10", 3),
    ]);

    const { result } = renderHook(
      () => useGcDrawingsList({ projectId: "p1", activeId: "g1", search: "" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.drawings).toHaveLength(5));
    expect(result.current.drawings.map((d) => d.drawing_number)).toEqual([
      "ASI-1",
      "ASI-2",
      "ASI-10",
      "ASI-11",
      "ASI-100",
    ]);
  });

  it("searches drawing_number and title, case-insensitively", async () => {
    filter.mockResolvedValue([
      gcSheet("g1", "ASI-1", 1, { title: "Foundation plan" }),
      gcSheet("g2", "ADD-3", 2, { title: "Roof framing" }),
    ]);

    const { result } = renderHook(
      () => useGcDrawingsList({ projectId: "p1", activeId: null, search: "roof" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.drawings).toHaveLength(2));
    expect(result.current.filtered.map((d) => d.id)).toEqual(["g2"]);

    const { result: byNumber } = renderHook(
      () => useGcDrawingsList({ projectId: "p1", activeId: null, search: "asi" }),
      { wrapper },
    );
    await waitFor(() => expect(byNumber.current.filtered).toHaveLength(1));
    expect(byNumber.current.filtered[0].id).toBe("g1");
  });

  // A GC issuance is uploaded as one PDF split into N rows keyed by pdf_page,
  // exactly like a shop drawing set, so it inherits the same bad-extraction
  // collision. Without the shared fix every sheet in the set renders page 1.
  it("reuses the shop-drawing pdf_page collision fix", async () => {
    filter.mockResolvedValue([
      gcSheet("g1", "ASI-1", 1),
      gcSheet("g2", "ASI-2", 1),
      gcSheet("g3", "ASI-3", 1),
    ]);

    const { result } = renderHook(
      () => useGcDrawingsList({ projectId: "p1", activeId: null, search: "" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.drawings).toHaveLength(3));
    const pages = result.current.drawings.map((d) => d.pdf_page);
    expect(new Set(pages).size).toBe(3);
  });

  // activeIndex indexes into `filtered`, which is what any prev/next control
  // walks. Resolving it against the unfiltered list would jump to the wrong
  // sheet as soon as a search is active.
  it("resolves activeIndex against the filtered list", async () => {
    filter.mockResolvedValue([
      gcSheet("g1", "ASI-1", 1, { title: "Foundation plan" }),
      gcSheet("g2", "ADD-3", 2, { title: "Roof framing" }),
      gcSheet("g3", "ASI-4", 3, { title: "Roof details" }),
    ]);

    const { result } = renderHook(
      () => useGcDrawingsList({ projectId: "p1", activeId: "g3", search: "roof" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.filtered).toHaveLength(2));
    // filtered is [ADD-3, ASI-4]; g3 is ASI-4, so index 1 -- not 2, its
    // position in the full list.
    expect(result.current.activeIndex).toBe(1);
    expect(result.current.activeDrawing?.id).toBe("g3");
  });

  it("does not query without a project", async () => {
    filter.mockClear();
    const { result } = renderHook(
      () => useGcDrawingsList({ projectId: null, activeId: null, search: "" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(filter).not.toHaveBeenCalled();
    expect(result.current.drawings).toEqual([]);
  });
});
