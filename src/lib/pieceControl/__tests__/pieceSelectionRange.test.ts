import { describe, expect, it } from "vitest";
import { addIdsToSelection, selectIdRange } from "../pieceSelectionRange";

describe("selectIdRange", () => {
  const ids = ["a", "b", "c", "d", "e"];

  it("returns inclusive range in either direction", () => {
    expect(selectIdRange(ids, "b", "d")).toEqual(["b", "c", "d"]);
    expect(selectIdRange(ids, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("returns a single id when anchor and target match", () => {
    expect(selectIdRange(ids, "c", "c")).toEqual(["c"]);
  });

  it("falls back when anchor is missing", () => {
    expect(selectIdRange(ids, "missing", "c")).toEqual(["c"]);
  });
});

describe("addIdsToSelection", () => {
  it("merges range ids into the current set", () => {
    expect([...addIdsToSelection(new Set(["a"]), ["c", "d"])].sort()).toEqual([
      "a",
      "c",
      "d",
    ]);
  });
});
