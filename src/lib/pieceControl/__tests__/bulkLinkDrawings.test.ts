import { describe, expect, it, vi } from "vitest";
import { linkPiecesToDrawingSet } from "../bulkLinkDrawings";

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
