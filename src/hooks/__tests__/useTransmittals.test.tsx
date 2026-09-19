// @vitest-environment jsdom
/**
 * useTransmittals' row-cap flag. The log's transmittals and items reads are
 * single filter() calls, cut off at EFFECTIVE_LIST_CAP rows newest first, so a
 * cap drops the OLDEST rows and leaves no trace. The flag is what keeps the
 * Approval Matrix from calling a set that was only sent on those rows
 * "Not sent yet".
 *
 * The revisions read is NOT one of the two the flag covers: it is paged with
 * filterAll, so it cannot be short.
 */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  transmittals: vi.fn(),
  items: vi.fn(),
  revisions: vi.fn(),
  gcDrawings: vi.fn(),
}));
vi.mock("@/api/supabaseClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/supabaseClient")>()),
  entities: {
    DrawingTransmittal: { filter: reads.transmittals },
    DrawingTransmittalItem: { filter: reads.items },
    // Revisions are read with filterAll (paged past the 1000-row server cap):
    // they are a LOOKUP keyed by revision id, and a truncated one made an item
    // whose revision sat past the cap indistinguishable from an unmatched item.
    DrawingRevision: { filterAll: reads.revisions },
    // Paged for the same reason as revisions: a LOOKUP keyed by id. A capped
    // read would resolve a GC attachment to a blank number, indistinguishable
    // from one whose GC drawing was deleted.
    GcDrawing: { filterAll: reads.gcDrawings },
  },
}));

import { EFFECTIVE_LIST_CAP } from "@/api/supabaseClient";
import { TRANSMITTAL_LOG_READ_CAP, useTransmittals } from "@/hooks/useTransmittals";
import type { TransmittalLog } from "@/hooks/useTransmittals";

const CAP = TRANSMITTAL_LOG_READ_CAP;

const header = (i: number, overrides: Record<string, unknown> = {}) => ({
  id: `t-${i}`,
  project_id: "p1",
  transmittal_number: `T-${i}`,
  direction: "outgoing",
  date_sent: "2026-08-01",
  created_at: "2026-08-01T09:00:00Z",
  is_deleted: false,
  ...overrides,
});
const item = (i: number) => ({ id: `i-${i}`, transmittal_id: "t-0", drawing_revision_id: "r1" });
const REVISIONS = [{ id: "r1", drawing_id: "d1", sheet_number: "S1", sheet_title: null as string | null, revision_code: "0" }];
const GC_DRAWINGS = [{ id: "g1", drawing_number: "A-101", title: "Level 1 plan", revision: "3" }];
const itemsAtCap = () => Array.from({ length: CAP }, (_, i) => item(i));

function serve({
  transmittals = [header(0)],
  items = [item(0)],
  gcDrawings = GC_DRAWINGS,
}: { transmittals?: unknown[]; items?: unknown[]; gcDrawings?: unknown[] } = {}) {
  reads.transmittals.mockResolvedValue(transmittals);
  reads.items.mockResolvedValue(items);
  reads.revisions.mockResolvedValue(REVISIONS);
  reads.gcDrawings.mockResolvedValue(gcDrawings);
}

function renderLog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTransmittals("p1"), { wrapper });
}

async function loadedLog(hook: ReturnType<typeof renderLog>): Promise<TransmittalLog> {
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  const log = hook.result.current.data;
  if (!log) throw new Error("the log never loaded");
  return log;
}

describe("useTransmittals — the row-cap flag", () => {
  it("compares against EFFECTIVE_LIST_CAP, the row count a default read is actually cut off at", () => {
    expect(TRANSMITTAL_LOG_READ_CAP).toBe(EFFECTIVE_LIST_CAP);
  });

  it("flags a log whose items read came back at the cap", async () => {
    serve({ items: itemsAtCap() });
    const log = await loadedLog(renderLog());
    expect(log.possiblyTruncated).toBe(true);
    expect(log).toHaveLength(1);
    expect(log[0]?.item_count).toBe(CAP);
  });

  it("flags a log whose transmittals read came back at the cap, soft-deleted headers included", async () => {
    // Half are deleted, so fewer rows are shown, but the READ hit the cap.
    serve({ transmittals: Array.from({ length: CAP }, (_, i) => header(i, { is_deleted: i % 2 === 0 })) });
    const log = await loadedLog(renderLog());
    expect(log).toHaveLength(CAP / 2);
    expect(log.possiblyTruncated).toBe(true);
  });

  it("doesn't flag reads that stop one row short of the cap", async () => {
    serve({
      transmittals: Array.from({ length: CAP - 1 }, (_, i) => header(i)),
      items: Array.from({ length: CAP - 1 }, (_, i) => item(i)),
    });
    const log = await loadedLog(renderLog());
    expect(log.possiblyTruncated).toBe(false);
  });

  it("keeps the flag out of the rows' shape, so the Transmittals tab gets the array it always did", async () => {
    serve({ items: itemsAtCap() });
    const log = await loadedLog(renderLog());
    expect(Array.isArray(log)).toBe(true);
    expect(Object.keys(log)).toEqual(["0"]);
    expect(log).toEqual([...log]);
    expect(JSON.stringify(log)).not.toContain("possiblyTruncated");
  });

  it("keeps the flag through a refetch that changes the rows", async () => {
    serve({ items: itemsAtCap() });
    const hook = renderLog();
    expect((await loadedLog(hook)).possiblyTruncated).toBe(true);

    serve({ transmittals: [header(0), header(1)], items: itemsAtCap() });
    await act(async () => {
      await hook.result.current.refetch();
    });
    // The observer hands the new rows to React on a later tick.
    await waitFor(() => expect(hook.result.current.data).toHaveLength(2));
    expect(hook.result.current.data?.possiblyTruncated).toBe(true);
  });
});

// The shared production DB runs SteelBuild-Pro-2026's m4_1: items carry
// drawing_id (or gc_drawing_id) plus number/title/revision_at_send snapshots,
// and drawing_revision_id is NULL when the sheet had no current revision at send.
describe("useTransmittals — items as the shared DB (m4_1) stores them", () => {
  it("keeps an item with a drawing_id and no revision, its snapshots standing in for the revision's fields", async () => {
    serve({
      transmittals: [header(0, { status: "sent" })],
      items: [{
        id: "i-n", transmittal_id: "t-0", drawing_revision_id: null, drawing_id: "d7",
        number_at_send: "S7", title_at_send: "Framing", revision_at_send: "2",
      }],
    });
    const log = await loadedLog(renderLog());
    expect(log[0]?.status).toBe("sent");
    expect(log[0]?.item_count).toBe(1);
    expect(log[0]?.items[0]).toEqual({
      id: "i-n", kind: "shop", gc_drawing_id: null,
      drawing_revision_id: null, drawing_id: "d7", sheet_number: "S7", sheet_title: "Framing", revision_code: "2",
    });
  });

  it("takes drawing_id from the item itself, falling back to its revision's", async () => {
    serve({
      items: [
        { id: "own", transmittal_id: "t-0", drawing_revision_id: "r1", drawing_id: "d9" },
        { id: "legacy", transmittal_id: "t-0", drawing_revision_id: "r1" },
      ],
    });
    const log = await loadedLog(renderLog());
    const byId = new Map((log[0]?.items ?? []).map((it) => [it.id, it]));
    expect(byId.get("own")).toMatchObject({ drawing_id: "d9", drawing_revision_id: "r1", sheet_number: "S1" });
    expect(byId.get("legacy")).toMatchObject({ drawing_id: "d1", drawing_revision_id: "r1", sheet_number: "S1" });
  });

  it("skips items with no transmittal", async () => {
    serve({
      items: [
        { id: "orphan", transmittal_id: null, drawing_revision_id: "r1", drawing_id: "d1" },
        item(0),
      ],
    });
    const log = await loadedLog(renderLog());
    expect(log[0]?.items.map((it) => it.id)).toEqual(["i-0"]);
  });

  it("keeps a GC-drawing item and resolves it against the GC register", async () => {
    // These used to be dropped, so a transmittal carrying only GC sheets
    // rendered as an empty one — which reads as "nothing was sent".
    serve({
      items: [{
        id: "gc", transmittal_id: "t-0", drawing_revision_id: null, drawing_id: null,
        gc_drawing_id: "g1", number_at_send: "A-101",
      }],
    });
    const log = await loadedLog(renderLog());
    expect(log[0]?.item_count).toBe(1);
    expect(log[0]?.items[0]).toEqual({
      id: "gc",
      kind: "gc",
      gc_drawing_id: "g1",
      // Not a Rev.2 sheet: it borrows neither a drawing_id nor a revision id.
      drawing_id: null,
      drawing_revision_id: null,
      sheet_number: "A-101",
      sheet_title: "Level 1 plan",
      revision_code: "3",
    });
  });

  it("falls back to a GC item's send-time snapshot when the GC drawing is gone", async () => {
    serve({
      gcDrawings: [],
      items: [{
        id: "gc", transmittal_id: "t-0", drawing_revision_id: null, drawing_id: null,
        gc_drawing_id: "g1", number_at_send: "A-101", title_at_send: "Level 1 plan",
        revision_at_send: "2",
      }],
    });
    const log = await loadedLog(renderLog());
    expect(log[0]?.items[0]).toMatchObject({
      kind: "gc", sheet_number: "A-101", sheet_title: "Level 1 plan", revision_code: "2",
    });
  });

  it("tags shop items so the two id spaces can never be confused", async () => {
    // A sheet number can exist in BOTH registers and mean different drawings,
    // so anything resolving an attachment back to a record branches on `kind`.
    serve({
      items: [
        item(0),
        { id: "gc", transmittal_id: "t-0", drawing_revision_id: null, drawing_id: null, gc_drawing_id: "g1" },
      ],
    });
    const log = await loadedLog(renderLog());
    const byId = new Map((log[0]?.items ?? []).map((it) => [it.id, it]));
    expect(byId.get("i-0")).toMatchObject({ kind: "shop", gc_drawing_id: null, drawing_id: "d1" });
    expect(byId.get("gc")).toMatchObject({ kind: "gc", gc_drawing_id: "g1", drawing_id: null });
  });
});
