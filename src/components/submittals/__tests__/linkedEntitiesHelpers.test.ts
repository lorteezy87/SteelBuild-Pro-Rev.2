import { describe, expect, it } from "vitest";
import { filterUnlinkedItems } from "../linkedEntitiesHelpers";

describe("filterUnlinkedItems", () => {
  it("excludes already linked ids", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(filterUnlinkedItems(items, ["b"]).map((i) => i.id)).toEqual(["a", "c"]);
  });
});
