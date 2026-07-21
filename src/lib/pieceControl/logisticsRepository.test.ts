import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockPiece {
  id: string;
  normalized_piece_mark: string;
  lot_code: string;
}

interface MockEvent {
  id: string;
  piece_id: string;
  created_at: string;
}

const mocks = vi.hoisted(() => {
  const pieces: MockPiece[] = [];
  const eventsByPieceId = new Map<string, MockEvent[]>();
  const eventPieceIdBatches: string[][] = [];

  const makeChain = (table: string) => {
    let selectedPieceIds: string[] = [];
    let orderColumn: string | null = null;
    let orderAscending = true;
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      in: vi.fn((column: string, values: string[]) => {
        if (table === "piece_events" && column === "piece_id") {
          selectedPieceIds = [...values];
          eventPieceIdBatches.push([...values]);
        }
        return chain;
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderColumn = column;
        orderAscending = options?.ascending ?? true;
        return chain;
      }),
      then: (resolve: (result: { data: unknown[]; error: null }) => void) => {
        if (table === "pieces") {
          resolve({ data: [...pieces], error: null });
          return;
        }

        const events = selectedPieceIds.flatMap(
          (pieceId) => eventsByPieceId.get(pieceId) ?? [],
        );
        if (orderColumn === "created_at") {
          events.sort((left, right) => {
            const comparison = left.created_at.localeCompare(right.created_at);
            return orderAscending ? comparison : -comparison;
          });
        }
        resolve({ data: events, error: null });
      },
    };
    return chain;
  };

  return {
    pieces,
    eventsByPieceId,
    eventPieceIdBatches,
    from: vi.fn((table: string) => makeChain(table)),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

import { fetchLogisticsSnapshot } from "./logisticsRepository";

describe("fetchLogisticsSnapshot", () => {
  beforeEach(() => {
    mocks.pieces.length = 0;
    mocks.eventsByPieceId.clear();
    mocks.eventPieceIdBatches.length = 0;
    mocks.from.mockClear();
  });

  it("bounds piece event filters for projects with many canonical pieces", async () => {
    mocks.pieces.push(
      ...Array.from({ length: 205 }, (_, index) => ({
        id: `piece-${index}`,
        normalized_piece_mark: `P${index}`,
        lot_code: "ALL",
      })),
    );

    await fetchLogisticsSnapshot("project-1");

    expect(mocks.eventPieceIdBatches.map((batch) => batch.length)).toEqual([
      100,
      100,
      5,
    ]);
  });

  it("keeps logistics events newest-first across query batches", async () => {
    mocks.pieces.push(
      ...Array.from({ length: 101 }, (_, index) => ({
        id: `piece-${index}`,
        normalized_piece_mark: `P${index}`,
        lot_code: "ALL",
      })),
    );
    mocks.eventsByPieceId.set("piece-0", [
      { id: "older", piece_id: "piece-0", created_at: "2026-07-01T00:00:00Z" },
    ]);
    mocks.eventsByPieceId.set("piece-100", [
      { id: "newer", piece_id: "piece-100", created_at: "2026-07-20T00:00:00Z" },
    ]);

    const snapshot = await fetchLogisticsSnapshot("project-1");

    expect(snapshot.events.map((event) => event.id)).toEqual(["newer", "older"]);
  });
});
