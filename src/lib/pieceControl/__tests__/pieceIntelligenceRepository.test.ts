import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import { fetchPieceIntelligenceSnapshot } from "../pieceIntelligenceRepository";
import { derivePieceIntelligence } from "../pieceIntelligenceDerive";
import type {
  PieceIntelligenceEvent,
  PieceIntelligenceRfi,
} from "../pieceIntelligenceTypes";
import {
  fetchPieceRelationshipSnapshot,
  type PieceRelationshipSnapshot,
  type RelationshipSourceAvailability,
} from "../relationshipsRepository";

vi.mock("../relationshipsRepository", () => ({ fetchPieceRelationshipSnapshot: vi.fn() }));

const databaseSources = vi.hoisted(() => ({
  errors: {} as Record<string, unknown>,
  rows: {} as Record<string, unknown[]>,
  orders: [] as Array<{ table: string; column: string; ascending: boolean }>,
  filters: [] as Array<{ table: string; method: "eq" | "is"; column: string; value: unknown }>,
  ranges: [] as Array<{ table: string; from: number; to: number }>,
  selects: [] as Array<{ table: string; columns: string }>,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn((columns: string) => {
        databaseSources.selects.push({ table, columns });
        return chain;
      });
      chain.eq = vi.fn((column: string, value: unknown) => {
        databaseSources.filters.push({ table, method: "eq", column, value });
        return chain;
      });
      chain.is = vi.fn((column: string, value: unknown) => {
        databaseSources.filters.push({ table, method: "is", column, value });
        return chain;
      });
      chain.order = vi.fn((column: string, options?: { ascending?: boolean }) => {
        databaseSources.orders.push({ table, column, ascending: options?.ascending ?? true });
        return chain;
      });
      chain.range = vi.fn(async (from: number, to: number) => {
        databaseSources.ranges.push({ table, from, to });
        const error = databaseSources.errors[table] ?? null;
        return {
          data: error ? null : (databaseSources.rows[table] ?? []).slice(from, to + 1),
          error,
        };
      });
      return chain;
    }),
  },
}));

const available: RelationshipSourceAvailability = {
  pieceDrawings: "available",
  pieceDrawingSets: "available",
  drawings: "available",
  drawingSets: "available",
  revisions: "available",
  approvals: "available",
};

const baseRelationshipSnapshot: PieceRelationshipSnapshot = {
  pieces: [], pieceDrawings: [], pieceDrawingSets: [], drawings: [],
  workPackages: [], drawingSets: [], submittals: [], sheetResponses: [],
  drawingRevisions: [], drawingReviews: [], drawingSignoffs: [],
  commentDispositions: [], sourceAvailability: available,
};

type PersistedDrawingImpact = Omit<
  DrawingImpactRow,
  "sheet_number" | "sheet_title" | "revision_code"
>;

function impactRow(index: number): PersistedDrawingImpact {
  return {
    id: `impact-${String(index).padStart(4, "0")}`,
    project_id: "prj",
    drawing_revision_id: "revision-1",
    impact_type: "fabrication",
    status: "open",
    priority: "high",
    title: `Impact ${index}`,
    notes: null,
    assigned_to: null,
    due_date: null,
    resolved_at: null,
    created_at: "2026-08-09T12:00:00Z",
  };
}

function rfiRow(index: number): PieceIntelligenceRfi {
  return {
    id: `rfi-${String(index).padStart(4, "0")}`,
    project_id: "prj",
    rfi_number: `RFI-${String(index).padStart(4, "0")}`,
    status: "Open",
    work_package_id: "wp-1",
  };
}

function pieceEventRow(index: number): PieceIntelligenceEvent {
  return {
    id: `event-${String(index).padStart(4, "0")}`,
    project_id: "prj",
    piece_id: "piece-1",
    event_type: "station_advanced",
    previous_state: { station: "fit" },
    next_state: { station: "weld" },
    reason: null,
    created_at: "2026-08-09T12:00:00Z",
  };
}

describe("fetchPieceIntelligenceSnapshot", () => {
  beforeEach(() => {
    databaseSources.errors = {};
    databaseSources.rows = {};
    databaseSources.orders = [];
    databaseSources.filters = [];
    databaseSources.ranges = [];
    databaseSources.selects = [];
  });

  it("fails closed when the relationship snapshot fails", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockRejectedValue(new Error("pieces unavailable"));
    await expect(fetchPieceIntelligenceSnapshot("prj")).rejects.toThrow("pieces unavailable");
  });

  it("keeps exact relationships and labels optional event failure unavailable", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue(baseRelationshipSnapshot);
    databaseSources.errors.piece_events = { code: "42501", message: "denied" };
    const result = await fetchPieceIntelligenceSnapshot("prj");
    expect(result.pieces).toEqual(baseRelationshipSnapshot.pieces);
    expect(result.pieceEvents).toEqual([]);
    expect(result.availability.events).toBe("unavailable");
  });

  it("labels a failed Drawing Impact read unavailable instead of empty and available", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue(baseRelationshipSnapshot);
    databaseSources.errors.drawing_impacts = { code: "42501", message: "denied" };

    const result = await fetchPieceIntelligenceSnapshot("prj");

    expect(result.drawingImpacts).toEqual([]);
    expect(result.availability.impacts).toBe("unavailable");
  });

  it("labels a failed RFI read unavailable instead of empty and available", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue(baseRelationshipSnapshot);
    databaseSources.errors.rfis = { code: "42501", message: "denied" };

    const result = await fetchPieceIntelligenceSnapshot("prj");

    expect(result.rfis).toEqual([]);
    expect(result.availability.rfis).toBe("unavailable");
  });

  it("normalizes canonical RFI metadata fab hold into blocked piece intelligence", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue({
      ...baseRelationshipSnapshot,
      pieces: [
        {
          id: "piece-1",
          project_id: "prj",
          piece_mark: "B1",
          normalized_piece_mark: "B1",
          lot_code: "A",
          parent_piece_id: null,
          quantity: 2,
          profile: "W12x26",
          material_grade: "A992",
          weight_each_lbs: 500,
          weight_total_lbs: 1000,
          work_package_id: null,
          lifecycle_status: "released",
          current_station: null,
          on_hold: false,
          on_hold_reason: null,
          is_container: false,
          is_deleted: false,
          source_system: "manual",
          external_ref: null,
          metadata: null,
          updated_at: "2026-08-09T12:00:00Z",
          deleted_at: null,
        },
      ],
      pieceDrawingSets: [
        { project_id: "prj", piece_id: "piece-1", drawing_set_id: "set-1" },
      ],
      drawings: [
        {
          id: "drawing-1",
          project_id: "prj",
          drawing_set_id: "set-1",
          sheet_number: "E502",
          linked_rfi_ids: "RFI-22",
        },
      ],
      drawingSets: [{ id: "set-1", set_name: "Main framing" }],
    });
    databaseSources.rows.rfis = [
      {
        id: "rfi-22",
        project_id: "prj",
        rfi_number: "RFI-22",
        status: "Open",
        work_package_id: null,
        metadata: { fab_hold: true },
      },
    ];

    const snapshot = await fetchPieceIntelligenceSnapshot("prj");
    const model = derivePieceIntelligence(
      snapshot,
      new Date("2026-08-09T12:00:00Z"),
    );

    expect(databaseSources.selects).toContainEqual({
      table: "rfis",
      columns: "id, project_id, rfi_number, status, work_package_id, metadata",
    });
    expect(snapshot.rfis[0]).toEqual(expect.objectContaining({
      metadata: { fab_hold: true },
      fab_hold: true,
    }));
    expect(model.metrics.blockedPieces).toBe(2);
    expect(model.attention).toContainEqual(expect.objectContaining({
      pieceId: "piece-1",
      fabBlocked: true,
      reason: "Linked RFI fabrication hold is active",
    }));
  });

  it("loads complete deterministically ordered Drawing Impact and RFI sources beyond one page", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue(baseRelationshipSnapshot);
    databaseSources.rows.drawing_impacts = Array.from({ length: 1001 }, (_, index) => impactRow(index));
    databaseSources.rows.rfis = Array.from({ length: 1001 }, (_, index) => rfiRow(index));

    const result = await fetchPieceIntelligenceSnapshot("prj");

    expect(result.drawingImpacts).toHaveLength(1001);
    expect(result.rfis).toHaveLength(1001);
    expect(databaseSources.ranges.filter(({ table }) => table === "drawing_impacts")).toEqual([
      { table: "drawing_impacts", from: 0, to: 999 },
      { table: "drawing_impacts", from: 1000, to: 1999 },
    ]);
    expect(databaseSources.ranges.filter(({ table }) => table === "rfis")).toEqual([
      { table: "rfis", from: 0, to: 999 },
      { table: "rfis", from: 1000, to: 1999 },
    ]);
    expect(databaseSources.orders.filter(({ table }) => table === "drawing_impacts")).toEqual([
      { table: "drawing_impacts", column: "created_at", ascending: false },
      { table: "drawing_impacts", column: "id", ascending: false },
      { table: "drawing_impacts", column: "created_at", ascending: false },
      { table: "drawing_impacts", column: "id", ascending: false },
    ]);
    expect(databaseSources.orders.filter(({ table }) => table === "rfis")).toEqual([
      { table: "rfis", column: "created_at", ascending: false },
      { table: "rfis", column: "id", ascending: false },
      { table: "rfis", column: "created_at", ascending: false },
      { table: "rfis", column: "id", ascending: false },
    ]);
    expect(databaseSources.filters.filter(({ table }) => table === "drawing_impacts")).toEqual([
      { table: "drawing_impacts", method: "eq", column: "project_id", value: "prj" },
      { table: "drawing_impacts", method: "eq", column: "project_id", value: "prj" },
    ]);
    expect(databaseSources.filters.filter(({ table }) => table === "rfis")).toEqual([
      { table: "rfis", method: "eq", column: "project_id", value: "prj" },
      { table: "rfis", method: "eq", column: "is_deleted", value: false },
      { table: "rfis", method: "is", column: "deleted_at", value: null },
      { table: "rfis", method: "eq", column: "project_id", value: "prj" },
      { table: "rfis", method: "eq", column: "is_deleted", value: false },
      { table: "rfis", method: "is", column: "deleted_at", value: null },
    ]);
  });

  it("uses a stable id tie-breaker while paging same-timestamp piece events", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue(baseRelationshipSnapshot);
    databaseSources.rows.piece_events = Array.from(
      { length: 1001 },
      (_, index) => pieceEventRow(index),
    );

    const result = await fetchPieceIntelligenceSnapshot("prj");

    expect(result.pieceEvents).toHaveLength(1001);
    expect(new Set(result.pieceEvents.map(({ id }) => id)).size).toBe(1001);
    expect(databaseSources.ranges.filter(({ table }) => table === "piece_events")).toEqual([
      { table: "piece_events", from: 0, to: 999 },
      { table: "piece_events", from: 1000, to: 1999 },
    ]);
    expect(databaseSources.orders.filter(({ table }) => table === "piece_events")).toEqual([
      { table: "piece_events", column: "created_at", ascending: false },
      { table: "piece_events", column: "id", ascending: false },
      { table: "piece_events", column: "created_at", ascending: false },
      { table: "piece_events", column: "id", ascending: false },
    ]);
  });

  it("marks relationship evidence unavailable instead of reporting link required", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue({
      ...baseRelationshipSnapshot,
      sourceAvailability: { ...baseRelationshipSnapshot.sourceAvailability, pieceDrawingSets: "unavailable" },
    });
    const result = await fetchPieceIntelligenceSnapshot("prj");
    expect(result.availability.relationships).toBe("unavailable");
  });
});
