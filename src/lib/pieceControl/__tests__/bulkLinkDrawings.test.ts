import { describe, expect, it, vi } from "vitest";
import {
  linkPiecesToDrawingSet,
  replacePiecesDrawingSet,
} from "../bulkLinkDrawings";

describe("linkPiecesToDrawingSet", () => {
  it("links unique piece ids and collects per-piece errors", async () => {
    const link = vi.fn(async (pieceId: string) => {
      if (pieceId === "p2") throw new Error("boom");
    });
    const result = await linkPiecesToDrawingSet(
      ["p1", "p2", "p1", ""],
      "set-1",
      link,
    );
    expect(link).toHaveBeenCalledTimes(2);
    expect(link).toHaveBeenNthCalledWith(1, "p1", "set-1");
    expect(link).toHaveBeenNthCalledWith(2, "p2", "set-1");
    expect(result).toEqual({
      linked: 1,
      errors: [{ pieceId: "p2", message: "boom" }],
    });
  });
});

describe("replacePiecesDrawingSet", () => {
  it("assigns each leaf in one atomic server call rather than unlinking first", async () => {
    const replace = vi.fn(async (pieceId: string, drawingSetId: string) => ({
      piece_id: pieceId,
      drawing_set_id: drawingSetId,
      linked: pieceId !== "p2",
      unlinked_count: pieceId === "p1" ? 2 : pieceId === "p3" ? 1 : 0,
    }));
    const result = await replacePiecesDrawingSet(
      ["p1", "p2", "p3", "p1"],
      "set-1",
      replace,
    );
    expect(replace).toHaveBeenCalledTimes(3);
    expect(replace).toHaveBeenCalledWith("p1", "set-1");
    expect(replace).toHaveBeenCalledWith("p2", "set-1");
    expect(replace).toHaveBeenCalledWith("p3", "set-1");
    expect(result).toEqual({ linked: 3, unlinked: 3, errors: [] });
  });

  it("collects errors per piece without aborting the batch", async () => {
    const replace = vi.fn(async (pieceId: string, drawingSetId: string) => {
      if (pieceId === "p2") throw new Error("replace failed");
      return { piece_id: pieceId, drawing_set_id: drawingSetId, linked: true, unlinked_count: 0 };
    });
    const result = await replacePiecesDrawingSet(
      ["p1", "p2"],
      "set-1",
      replace,
    );
    expect(result.linked).toBe(1);
    expect(result.errors).toEqual([{ pieceId: "p2", message: "replace failed" }]);
  });

  it("does not count an incomplete server response as a successful assignment", async () => {
    const result = await replacePiecesDrawingSet(
      ["p1"], "set-1", async () => ({ linked: true, unlinked_count: 0 }),
    );
    expect(result).toEqual({
      linked: 0,
      unlinked: 0,
      errors: [{ pieceId: "p1", message: "Drawing-set replacement returned incomplete evidence" }],
    });
  });
});
