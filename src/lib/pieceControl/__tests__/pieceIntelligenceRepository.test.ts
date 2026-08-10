import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPieceIntelligenceSnapshot } from "../pieceIntelligenceRepository";
import { fetchPieceRelationshipSnapshot } from "../relationshipsRepository";

vi.mock("../relationshipsRepository", () => ({ fetchPieceRelationshipSnapshot: vi.fn() }));

const entityMocks = vi.hoisted(() => ({
  impacts: vi.fn().mockResolvedValue([]),
  rfis: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DrawingImpact: { filter: entityMocks.impacts },
    RFI: { filter: entityMocks.rfis },
  },
}));

const eventSource = vi.hoisted(() => ({ error: null as unknown }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.range = vi.fn(async () => ({ data: eventSource.error ? null : [], error: eventSource.error }));
      return chain;
    }),
  },
}));

const available = {
  pieceDrawings: "available",
  pieceDrawingSets: "available",
  drawings: "available",
  drawingSets: "available",
  revisions: "available",
  approvals: "available",
} as const;

const baseRelationshipSnapshot = {
  pieces: [], pieceDrawings: [], pieceDrawingSets: [], drawings: [],
  workPackages: [], drawingSets: [], submittals: [], sheetResponses: [],
  drawingRevisions: [], drawingReviews: [], drawingSignoffs: [],
  commentDispositions: [], sourceAvailability: available,
};

describe("fetchPieceIntelligenceSnapshot", () => {
  beforeEach(() => {
    eventSource.error = null;
    entityMocks.impacts.mockResolvedValue([]);
    entityMocks.rfis.mockResolvedValue([]);
  });

  it("fails closed when the relationship snapshot fails", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockRejectedValue(new Error("pieces unavailable"));
    await expect(fetchPieceIntelligenceSnapshot("prj")).rejects.toThrow("pieces unavailable");
  });

  it("keeps exact relationships and labels optional event failure unavailable", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue(baseRelationshipSnapshot);
    eventSource.error = { code: "42501", message: "denied" };
    const result = await fetchPieceIntelligenceSnapshot("prj");
    expect(result.pieces).toEqual(baseRelationshipSnapshot.pieces);
    expect(result.pieceEvents).toEqual([]);
    expect(result.availability.events).toBe("unavailable");
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
