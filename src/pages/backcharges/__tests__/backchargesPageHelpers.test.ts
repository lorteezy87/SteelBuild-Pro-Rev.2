import { describe, expect, it } from "vitest";
import { buildIdMap } from "../backchargesPageHelpers";

describe("backchargesPageHelpers", () => {
  it("builds id map skipping null ids", () => {
    const map = buildIdMap([
      { id: "a", title: "A" },
      { id: null, title: "skip" } as any,
      { id: "b", title: "B" },
    ]);
    expect([...map.keys()]).toEqual(["a", "b"]);
    expect(map.get("a")?.title).toBe("A");
  });
});
