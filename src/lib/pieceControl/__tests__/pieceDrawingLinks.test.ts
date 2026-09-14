import { describe, expect, it } from "vitest";
import {
  expandLinkedDrawingIdsForPieces,
  pieceHasDrawingLink,
} from "../pieceDrawingLinks";

describe("expandLinkedDrawingIdsForPieces", () => {
  const drawings = [
    { id: "d1", drawing_set_id: "set-1" },
    { id: "d2", drawing_set_id: "set-1" },
    { id: "d3", drawing_set_id: "set-2", is_superseded: true },
    { id: "d4", drawing_set_id: "set-2" },
  ];

  it("expands set links to active sheets and keeps legacy sheet links", () => {
    const linked = expandLinkedDrawingIdsForPieces(
      ["p1", "p2"],
      [{ piece_id: "p1", drawing_set_id: "set-1" }],
      [{ piece_id: "p2", drawing_id: "d4" }],
      drawings,
    );
    expect([...linked].sort()).toEqual(["d1", "d2", "d4"]);
  });
});

describe("pieceHasDrawingLink", () => {
  it("treats either set or sheet links as mapped", () => {
    expect(
      pieceHasDrawingLink(
        "p1",
        [{ piece_id: "p1", drawing_set_id: "set-1" }],
        [],
      ),
    ).toBe(true);
    expect(
      pieceHasDrawingLink(
        "p2",
        [],
        [{ piece_id: "p2", drawing_id: "d1" }],
      ),
    ).toBe(true);
    expect(pieceHasDrawingLink("p3", [], [])).toBe(false);
  });
});
