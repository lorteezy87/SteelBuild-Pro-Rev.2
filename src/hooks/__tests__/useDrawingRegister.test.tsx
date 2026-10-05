// @vitest-environment jsdom
/**
 * useDrawingRegister pages `drawing_register_view` to completeness.
 *
 * It used to be one unbounded `.select()`, which PostgREST silently cuts off at
 * db-max-rows (1000). Audit batch 1 (#435) flagged it as a real finding — the
 * most exposed of the seven — because the register backs the Drawing Register
 * grid, the Holds picker, the Transmittal log, the Impact board and the Review
 * queue, and several of those state CLAIMS ("Every sheet already has an active
 * hold", released counts). A short read made those claims wrong with no notice.
 *
 * The register is read to completeness rather than capped-with-a-notice, so
 * these tests pin paging behaviour, not a truncation flag.
 */
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { from } }));

import { SERVER_MAX_ROWS } from "@/api/supabaseClient";
import { PAGE_SIZE } from "@/lib/pagedQuery";
import { useDrawingRegister } from "@/hooks/useDrawingRegister";

interface ViewRow {
  drawing_id: string;
  project_id: string;
  sheet_number: string | null;
}
interface RangeCall {
  from: number;
  to: number;
}

const PAGE = PAGE_SIZE;

const viewRow = (i: number): ViewRow => ({
  drawing_id: `d-${i}`,
  project_id: "p1",
  sheet_number: `S-${String(i).padStart(4, "0")}`,
});

/**
 * Serves `total` view rows through a `.range()`-aware chain, plus the
 * drawing_set_id lookup. Records every range window and order column so the
 * tests can assert the paging contract rather than just the final row count.
 */
function serve(total: number, options: { viewError?: Error } = {}) {
  const ranges: RangeCall[] = [];
  const orders: string[] = [];
  const rows = Array.from({ length: total }, (_, i) => viewRow(i));
  const inBatches: string[][] = [];

  from.mockImplementation((table: string) => {
    if (table === "drawing_register_view") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: (column: string) => {
          orders.push(column);
          return chain;
        },
        range: (start: number, end: number) => {
          ranges.push({ from: start, to: end });
          if (options.viewError) return Promise.resolve({ data: null, error: options.viewError });
          return Promise.resolve({ data: rows.slice(start, end + 1), error: null });
        },
      };
      return chain;
    }
    // drawings: id -> drawing_set_id
    const drawingsChain = {
      select: () => drawingsChain,
      eq: () => drawingsChain,
      in: (_column: string, ids: string[]) => {
        inBatches.push(ids);
        return {
          ...drawingsChain,
          range: (start: number, end: number) =>
            Promise.resolve({
              data: ids
                .map((id) => ({ id, drawing_set_id: `set-for-${id}` }))
                .slice(start, end + 1),
              error: null,
            }),
        };
      },
    };
    return drawingsChain;
  });

  return { ranges, orders, inBatches };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderRegister = () => renderHook(() => useDrawingRegister("p1"), { wrapper });

beforeEach(() => from.mockReset());

describe("page size", () => {
  it("stays under PostgREST's server row cap, which is what silently truncates", () => {
    // fetchAllRows pages at 500; the ceiling that cut this read short is 1000.
    // A page at or above the ceiling can come back full because it was
    // truncated, which is indistinguishable from "there is more".
    expect(PAGE_SIZE).toBeLessThan(SERVER_MAX_ROWS);
  });
});

describe("paging to completeness", () => {
  it("returns every row of a register larger than one page", async () => {
    serve(PAGE + 37);
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(PAGE + 37);
  });

  it("does not stop at the server cap — the exact size that used to truncate", async () => {
    serve(PAGE * 2 + 1);
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(PAGE * 2 + 1);
    expect(result.current.data?.at(-1)?.drawing_id).toBe(`d-${PAGE * 2}`);
  });

  it("requests consecutive, non-overlapping windows", async () => {
    const { ranges } = serve(PAGE + 5);
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ranges).toEqual([
      { from: 0, to: PAGE - 1 },
      { from: PAGE, to: PAGE * 2 - 1 },
    ]);
  });

  it("stops after a short page instead of requesting another", async () => {
    const { ranges } = serve(PAGE - 1);
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ranges).toHaveLength(1);
  });

  it("requests a second page when the first comes back exactly full", async () => {
    // A page that is exactly PAGE long is indistinguishable from a truncated
    // one, so the read may not assume it was the last.
    const { ranges } = serve(PAGE);
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ranges).toHaveLength(2);
    expect(result.current.data).toHaveLength(PAGE);
  });

  it("reads an empty register in one request", async () => {
    const { ranges } = serve(0);
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(ranges).toHaveLength(1);
  });
});

describe("ordering", () => {
  it("breaks sheet_number ties on drawing_id so windows cannot skip or repeat", async () => {
    // sheet_number is nullable and not unique, so it is not a total order on
    // its own; without the tiebreaker, .range() paging is not well-defined.
    const { orders } = serve(PAGE + 1);
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(orders.slice(0, 2)).toEqual(["sheet_number", "drawing_id"]);
  });
});

describe("failures surface rather than shortening the register", () => {
  it("propagates a view read error instead of returning a partial register", async () => {
    serve(PAGE + 1, { viewError: new Error("view read failed") });
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe("drawing_set_id resolution still covers every paged row", () => {
  it("looks up sets for rows past the first page", async () => {
    const { inBatches } = serve(PAGE + 3);
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(inBatches.flat()).toHaveLength(PAGE + 3);
    expect(result.current.data?.at(-1)?.drawing_set_id).toBe(`set-for-d-${PAGE + 2}`);
  });
});
