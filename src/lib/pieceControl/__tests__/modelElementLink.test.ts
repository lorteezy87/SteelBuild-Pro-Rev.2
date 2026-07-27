import { describe, expect, it } from "vitest";
import { matchElementToPiece, type LinkCandidatePiece } from "../modelElementLink";

const leaves: LinkCandidatePiece[] = [
  {
    id: "p1",
    normalized_piece_mark: "B1",
    lot_code: "ALL",
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
  },
];

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
