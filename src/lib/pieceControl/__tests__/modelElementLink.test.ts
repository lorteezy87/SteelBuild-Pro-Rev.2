import { describe, expect, it } from "vitest";
import {
  matchElementToPiece,
  summarizeModelLinkHealth,
  buildModelGuidCsv,
  type LinkCandidatePiece,
} from "../modelElementLink";

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

describe("summarizeModelLinkHealth", () => {
  it("counts linked vs unlinked marks and GUIDs", () => {
    const health = summarizeModelLinkHealth([
      { element_guid: "g1", piece_mark: "B1", piece_id: "p1" },
      { element_guid: "g2", piece_mark: "C1", piece_id: null },
      { element_guid: "", piece_mark: "D1", piece_id: null },
      { element_guid: "g3", piece_mark: "", piece_id: null },
      { element_guid: "g4", piece_mark: "E1", piece_id: "p9", is_deleted: true },
    ]);
    expect(health).toEqual({ linked: 1, unlinked: 2, withMark: 3, withGuid: 3 });
  });

  it("handles empty input", () => {
    expect(summarizeModelLinkHealth(null)).toEqual({
      linked: 0,
      unlinked: 0,
      withMark: 0,
      withGuid: 0,
    });
  });
});

describe("buildModelGuidCsv", () => {
  it("exports only rows with GUIDs", () => {
    const csv = buildModelGuidCsv([
      { element_guid: "g1", piece_mark: "B1", piece_id: "p1", fab_status: "fabricated" },
      { element_guid: null, piece_mark: "C1", piece_id: null },
      { element_guid: "g2", piece_mark: 'Mark "X"', piece_id: null, fab_status: null },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("element_guid,piece_mark,piece_id,fab_status,is_linked");
    expect(lines[1]).toBe("g1,B1,p1,fabricated,yes");
    expect(lines[2]).toBe('g2,"Mark ""X""",,,no');
    expect(lines).toHaveLength(3);
  });
});
