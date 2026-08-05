import { describe, expect, it } from "vitest";
import {buildIdMap, formatUsd} from "../backchargesPageHelpers";

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

describe("formatUsd", () => {
  it("formats numbers as currency without forced cents", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(null)).toBe("$0");
    expect(formatUsd(1234.5)).toMatch(/^\$1,234\.5/);
  });
});
