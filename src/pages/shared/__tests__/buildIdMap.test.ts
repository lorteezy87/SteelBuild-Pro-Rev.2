import { describe, expect, it } from "vitest";
import { buildIdMap } from "../buildIdMap";

describe("buildIdMap", () => {
  it("indexes by id and skips missing ids", () => {
    const map = buildIdMap([{ id: "a", n: 1 }, { id: null }, { id: "b", n: 2 }]);
    expect(map.get("a")?.n).toBe(1);
    expect(map.get("b")?.n).toBe(2);
    expect(map.size).toBe(2);
  });
});
