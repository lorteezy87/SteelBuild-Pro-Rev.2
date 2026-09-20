/**
 * The two reads behind "Export Markup PDF".
 *
 * Both feed a document that goes to a GC, an EOR or the shop, so both failure
 * modes these tests pin are the same defect wearing different clothes: a PDF
 * that looks finished and is missing content.
 *
 *  - Truncation. Audit batch 1 (#435) flagged the modal's reads as genuinely
 *    unbounded. A whole-set export covers every sheet in the set, so the markup
 *    read passes PostgREST's 1000-row ceiling on a real job, and a truncated
 *    read is indistinguishable from a sheet with no redlines.
 *  - The sign-off select named three columns that do not exist
 *    (`signed_by` / `signed_at` / `status`; the table has `stamped_by_name` /
 *    `stamped_at` / `stamp_type`, verified against production). PostgREST
 *    rejected the request and the caller swallowed it, so the sign-off section
 *    has been empty in every exported PDF since the feature was written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { from } }));

import { PAGE_SIZE } from "@/lib/pagedQuery";
import {
  EXPORT_ID_CHUNK_SIZE,
  fetchMarkupRows,
  fetchSignoffRows,
} from "@/lib/exports/markupExportData";

const PAGE = PAGE_SIZE;

interface Recorded {
  table: string;
  columns: string;
  ids: string[];
  orders: string[];
  ranges: { from: number; to: number }[];
  filters: Record<string, unknown>;
}

/**
 * Chainable fake. `rowsFor` decides what each table returns so a test can put
 * more rows behind one `.in()` chunk than a single page holds.
 */
function serve(rowsFor: (table: string, ids: string[]) => Record<string, unknown>[], error?: unknown) {
  const calls: Recorded[] = [];
  from.mockImplementation((table: string) => {
    const rec: Recorded = { table, columns: "", ids: [], orders: [], ranges: [], filters: {} };
    calls.push(rec);
    const chain = {
      select: (columns: string) => { rec.columns = columns; return chain; },
      in: (_c: string, ids: string[]) => { rec.ids = ids; return chain; },
      eq: (column: string, value: unknown) => { rec.filters[column] = value; return chain; },
      order: (column: string) => { rec.orders.push(column); return chain; },
      range: (start: number, end: number) => {
        rec.ranges.push({ from: start, to: end });
        if (error) return Promise.resolve({ data: null, error });
        return Promise.resolve({ data: rowsFor(table, rec.ids).slice(start, end + 1), error: null });
      },
    };
    return chain;
  });
  return calls;
}

const markup = (i: number) => ({
  id: `m-${i}`, drawing_id: "d-1", markup_type: "cloud", page_number: 1,
  status: "open", comment: `note ${i}`, color: null as string | null, payload: {},
  author_name: "Nick", author_email: null as string | null,
  created_at: "2026-09-01T00:00:00Z",
});

const signoff = (i: number) => ({
  id: `s-${i}`, drawing_id: "d-1", stamped_by_name: `Approver ${i}`,
  stamped_at: "2026-09-02T00:00:00Z", stamp_type: "approved",
});

beforeEach(() => from.mockReset());

describe("markup rows — the export's redlines", () => {
  it("returns every row past the page boundary rather than a truncated set", async () => {
    serve(() => Array.from({ length: PAGE + 40 }, (_, i) => markup(i)));
    const rows = await fetchMarkupRows(["d-1"]);
    expect(rows).toHaveLength(PAGE + 40);
  });

  it("keeps paging past the 1000-row server ceiling a whole-set export hits", async () => {
    serve(() => Array.from({ length: PAGE * 2 + 1 }, (_, i) => markup(i)));
    const rows = await fetchMarkupRows(["d-1"]);
    expect(rows).toHaveLength(PAGE * 2 + 1);
  });

  it("orders by created_at with id as the unique tiebreaker paging needs", async () => {
    const calls = serve(() => [markup(0)]);
    await fetchMarkupRows(["d-1"]);
    expect(calls[0].orders).toEqual(["created_at", "id"]);
  });

  it("throws instead of returning a partial set the PDF would look complete without", async () => {
    serve(() => [markup(0)], { message: "read failed" });
    await expect(fetchMarkupRows(["d-1"])).rejects.toThrow(/markup rows/);
  });

  it("makes no request when there are no sheets", async () => {
    const calls = serve(() => []);
    expect(await fetchMarkupRows([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("splits the id filter into chunks instead of one oversized .in()", async () => {
    const ids = Array.from({ length: EXPORT_ID_CHUNK_SIZE + 3 }, (_, i) => `d-${i}`);
    const calls = serve(() => []);
    await fetchMarkupRows(ids);
    const chunkSizes = calls.map((c) => c.ids.length);
    expect(chunkSizes).toEqual([EXPORT_ID_CHUNK_SIZE, 3]);
  });

  it("drops blank ids rather than sending them to the server", async () => {
    const calls = serve(() => []);
    await fetchMarkupRows(["d-1", "", "d-2"]);
    expect(calls[0].ids).toEqual(["d-1", "d-2"]);
  });
});

describe("sign-off rows — columns that never existed", () => {
  it("selects the columns the table actually has", async () => {
    const calls = serve(() => [signoff(0)]);
    await fetchSignoffRows(["d-1"]);
    expect(calls[0].columns).toContain("stamped_by_name");
    expect(calls[0].columns).toContain("stamped_at");
    expect(calls[0].columns).toContain("stamp_type");
  });

  it("never asks for signed_by / signed_at / status, which PostgREST rejects", async () => {
    const calls = serve(() => [signoff(0)]);
    await fetchSignoffRows(["d-1"]);
    expect(calls[0].columns).not.toMatch(/\bsigned_by\b/);
    expect(calls[0].columns).not.toMatch(/\bsigned_at\b/);
    expect(calls[0].columns).not.toMatch(/\bstatus\b/);
  });

  it("maps the real columns onto the shape the PDF helper renders", async () => {
    serve(() => [signoff(7)]);
    const [row] = await fetchSignoffRows(["d-1"]);
    expect(row).toEqual({
      drawing_id: "d-1",
      signed_by: "Approver 7",
      signed_at: "2026-09-02T00:00:00Z",
      status: "approved",
    });
  });

  it("excludes voided stamps — a retracted stamp must not print as a sign-off", async () => {
    const calls = serve(() => [signoff(0)]);
    await fetchSignoffRows(["d-1"]);
    expect(calls[0].filters.is_voided).toBe(false);
  });

  it("pages past one page of sign-offs", async () => {
    serve(() => Array.from({ length: PAGE + 5 }, (_, i) => signoff(i)));
    expect(await fetchSignoffRows(["d-1"])).toHaveLength(PAGE + 5);
  });

  it("throws rather than silently exporting a PDF with an empty sign-off block", async () => {
    serve(() => [signoff(0)], { message: "read failed" });
    await expect(fetchSignoffRows(["d-1"])).rejects.toThrow(/sign-off rows/);
  });
});
