// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import React from "react";

// entities.Drawing.filter() applies no ORDER BY, so the hook must impose the
// order itself. Return rows deliberately shuffled to prove it does.
const filter = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  entities: { Drawing: { filter: (...a: unknown[]) => filter(...a) } },
}));

import { useDrawingsList } from "../useDrawingsList";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function sheet(id: string, sheet_number: string, pdf_page: number) {
  return { id, sheet_number, pdf_page, file_url: "projects/p/set.pdf", title: `Sheet ${sheet_number}` };
}

describe("useDrawingsList sheet ordering", () => {
  it("returns sheets in natural sheet-number order, not database order", async () => {
    // Database order: shuffled, and S-10/S-100 placed so a naive lexicographic
    // sort would put S-100 before S-11.
    filter.mockResolvedValue([
      sheet("d4", "S-100", 4),
      sheet("d2", "S-2", 2),
      sheet("d5", "S-11", 5),
      sheet("d1", "S-1", 1),
      sheet("d3", "S-10", 3),
    ]);

    const { result } = renderHook(
      () => useDrawingsList({ projectId: "p1", activeId: "d1", search: "" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.drawings).toHaveLength(5));

    expect(result.current.drawings.map((d) => d.sheet_number)).toEqual([
      "S-1", "S-2", "S-10", "S-11", "S-100",
    ]);
  });

  it("gives Prev/Next an index that walks the set in sheet order", async () => {
    filter.mockResolvedValue([
      sheet("d3", "S-3", 3),
      sheet("d1", "S-1", 1),
      sheet("d2", "S-2", 2),
    ]);

    const { result } = renderHook(
      // Active sheet is S-2, which arrives LAST from the database.
      () => useDrawingsList({ projectId: "p1", activeId: "d2", search: "" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.filtered).toHaveLength(3));

    // Sorted, S-2 sits in the middle — so Prev is S-1 and Next is S-3.
    // In raw database order activeIndex would have been 2 (the end), and the
    // Next arrow would have been disabled on the middle sheet of the set.
    const { filtered, activeIndex } = result.current;
    expect(activeIndex).toBe(1);
    expect(filtered[activeIndex - 1].sheet_number).toBe("S-1");
    expect(filtered[activeIndex + 1].sheet_number).toBe("S-3");
  });

  it("keeps the search filter in sheet order too", async () => {
    filter.mockResolvedValue([
      sheet("a3", "A-20", 3),
      sheet("s1", "S-1", 1),
      sheet("a1", "A-3", 2),
    ]);

    const { result } = renderHook(
      () => useDrawingsList({ projectId: "p1", activeId: "a1", search: "A-" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.filtered).toHaveLength(2));
    expect(result.current.filtered.map((d) => d.sheet_number)).toEqual(["A-3", "A-20"]);
  });
});
