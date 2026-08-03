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
  it("unlinks other sets then links the target", async () => {
    const link = vi.fn(async () => undefined);
    const unlink = vi.fn(async () => undefined);
    const existing = [
      { piece_id: "p1", drawing_set_id: "old-a" },
      { piece_id: "p1", drawing_set_id: "old-b" },
      { piece_id: "p2", drawing_set_id: "set-1" },
      { piece_id: "p3", drawing_set_id: "wrong" },
    ];
    const result = await replacePiecesDrawingSet(
      ["p1", "p2", "p3"],
      "set-1",
      existing,
      link,
      unlink,
    );
    expect(unlink).toHaveBeenCalledTimes(3);
    expect(unlink).toHaveBeenCalledWith("p1", "old-a");
    expect(unlink).toHaveBeenCalledWith("p1", "old-b");
    expect(unlink).toHaveBeenCalledWith("p3", "wrong");
    expect(link).toHaveBeenCalledTimes(3);
    expect(link).toHaveBeenCalledWith("p1", "set-1");
    expect(link).toHaveBeenCalledWith("p2", "set-1");
    expect(link).toHaveBeenCalledWith("p3", "set-1");
    expect(result).toEqual({ linked: 3, unlinked: 3, errors: [] });
  });

  it("collects errors per piece without aborting the batch", async () => {
    const link = vi.fn(async (pieceId: string) => {
      if (pieceId === "p2") throw new Error("link failed");
    });
    const unlink = vi.fn(async () => undefined);
    const result = await replacePiecesDrawingSet(
      ["p1", "p2"],
      "set-1",
      [{ piece_id: "p2", drawing_set_id: "old" }],
      link,
      unlink,
    );
    expect(result.linked).toBe(1);
    expect(result.errors).toEqual([{ pieceId: "p2", message: "link failed" }]);
  });
});
