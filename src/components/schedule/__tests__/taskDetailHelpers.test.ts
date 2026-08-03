import { describe, expect, it } from "vitest";
import { asIdArray, sameIdSet } from "../taskDetailHelpers";

describe("asIdArray", () => {
  it("keeps string ids from arrays", () => {
    expect(asIdArray(["a", "", 1, "b"])).toEqual(["a", "b"]);
  });

  it("parses JSON string arrays", () => {
    expect(asIdArray('["x","y"]')).toEqual(["x", "y"]);
    expect(asIdArray("not-json")).toEqual([]);
  });

  it("returns [] for nullish / other", () => {
    expect(asIdArray(null)).toEqual([]);
    expect(asIdArray(undefined)).toEqual([]);
    expect(asIdArray(12)).toEqual([]);
  });
});

describe("sameIdSet", () => {
  it("compares order-insensitively", () => {
    expect(sameIdSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIdSet(["a"], ["a", "b"])).toBe(false);
    expect(sameIdSet(null, [])).toBe(true);
  });
});
