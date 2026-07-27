import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  matchElementToPiece,
  planModelElementLinks,
  linkModelElementsToPieces,
  type LinkCandidatePiece,
} from "../modelElementLink";

const leaves: LinkCandidatePiece[] = [
  {
    id: "p1",
    normalized_piece_mark: "B1",
    lot_code: "ALL",
    work_package_id: "wp-1",
    lifecycle_status: "fabricated",
  },
  {
    id: "p2a",
    normalized_piece_mark: "C1",
    lot_code: "A",
  },
  {
    id: "p2b",
    normalized_piece_mark: "C1",
    lot_code: "B",
    work_package_id: "wp-2",
    lifecycle_status: "released",
  },
];

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

describe("matchElementToPiece", () => {
  it("links exact unique mark", () => {
    expect(
      matchElementToPiece({ id: "e1", piece_mark: "b1" }, leaves),
    ).toEqual({ kind: "linked", pieceId: "p1" });
  });

  it("links lot-aware when metadata.lot_code present", () => {
    expect(
      matchElementToPiece(
        { id: "e2", piece_mark: "C1", metadata: { lot_code: "B" } },
        leaves,
      ),
    ).toEqual({ kind: "linked", pieceId: "p2b" });
  });

  it("marks multi-lot without lot as ambiguous", () => {
    expect(
      matchElementToPiece({ id: "e3", piece_mark: "C1" }, leaves),
    ).toEqual({ kind: "ambiguous", count: 2 });
  });

  it("returns unmatched when no piece", () => {
    expect(
      matchElementToPiece({ id: "e4", piece_mark: "ZZ" }, leaves),
    ).toEqual({ kind: "unmatched" });
  });

  it("returns unchanged when already linked", () => {
    expect(
      matchElementToPiece(
        { id: "e5", piece_mark: "B1", piece_id: "p1" },
        leaves,
      ),
    ).toEqual({ kind: "unchanged", pieceId: "p1" });
  });
});

describe("planModelElementLinks", () => {
  it("counts linked / unmatched / ambiguous and builds updates", () => {
    const { summary, updates } = planModelElementLinks(
      "project-1",
      [
        { id: "e1", piece_mark: "B1" },
        { id: "e2", piece_mark: "C1", metadata: { lot_code: "B" }, piece_id: "p2b" },
        { id: "e3", piece_mark: "C1" },
        { id: "e4", piece_mark: "ZZ" },
        { id: "e5", piece_mark: "   " },
      ],
      leaves,
    );

    expect(summary).toEqual({
      project_id: "project-1",
      linked: 1,
      unchanged: 1,
      unmatched: 1,
      ambiguous: 1,
      used_client_fallback: true,
    });
    expect(updates).toEqual([
      {
        elementId: "e1",
        pieceId: "p1",
        workPackageId: "wp-1",
        fabStatus: "fabricated",
        kind: "linked",
      },
      {
        elementId: "e2",
        pieceId: "p2b",
        workPackageId: "wp-2",
        fabStatus: "released",
        kind: "unchanged",
      },
    ]);
  });
});

describe("linkModelElementsToPieces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns RPC payload when the function exists", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        project_id: "project-1",
        linked: 2,
        unchanged: 1,
        unmatched: 0,
        ambiguous: 0,
      },
      error: null,
    });

    await expect(linkModelElementsToPieces("project-1")).resolves.toEqual({
      project_id: "project-1",
      linked: 2,
      unchanged: 1,
      unmatched: 0,
      ambiguous: 0,
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("falls back to client linking when the RPC is missing from schema cache", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: "PGRST202",
        message:
          "Could not find the function public.link_model_elements_to_pieces(p_project_id) in the schema cache",
      },
    });

    function selectChain(result: { data: unknown; error: unknown }) {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.range = vi.fn(async () => result);
      return chain;
    }

    const updateEqProject = vi.fn(async () => ({ data: null, error: null }));
    const updateEqId = vi.fn(() => ({ eq: updateEqProject }));
    const updateFn = vi.fn(() => ({ eq: updateEqId }));

    fromMock.mockImplementation((table: string) => {
      if (table === "pieces") {
        return selectChain({
          data: [
            {
              id: "p1",
              normalized_piece_mark: "B1",
              lot_code: "ALL",
              is_container: false,
              parent_piece_id: null,
              is_deleted: false,
              deleted_at: null,
              work_package_id: "wp-1",
              lifecycle_status: "fabricated",
            },
          ],
          error: null,
        });
      }
      if (table === "model_elements") {
        // select pages use .select().eq().range(); updates use .update().eq().eq()
        return {
          select: vi.fn(() => {
            const chain: Record<string, unknown> = {};
            chain.eq = vi.fn(() => chain);
            chain.range = vi.fn(async () => ({
              data: [{ id: "e1", piece_mark: "B1", metadata: null, piece_id: null }],
              error: null,
            }));
            return chain;
          }),
          update: updateFn,
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const summary = await linkModelElementsToPieces("project-1");
    expect(summary.linked).toBe(1);
    expect(summary.used_client_fallback).toBe(true);
    expect(updateFn).toHaveBeenCalledWith({
      piece_id: "p1",
      work_package_id: "wp-1",
      fab_status: "fabricated",
    });
  });
});
