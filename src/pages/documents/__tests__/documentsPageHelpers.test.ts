import { describe, expect, it } from "vitest";
import {
  nextActiveFilters,
  nextCategoryFilters,
  categoryFilterFromActive,
  pruneSelectionToAllowed,
  toggleSelectionId,
  selectionFromDocs,
  removeIdFromSelection,
} from "../documentsPageHelpers";

describe("documentsPageHelpers", () => {
  it("filter mutators", () => {
    expect(nextActiveFilters({ a: 1 }, "b", 2)).toEqual({ a: 1, b: 2 });
    expect(nextCategoryFilters({}, "All").category).toEqual([]);
    expect(nextCategoryFilters({}, "Shop").category).toEqual(["Shop"]);
    expect(categoryFilterFromActive({ category: ["Shop"] })).toBe("Shop");
    expect(categoryFilterFromActive({})).toBe("All");
  });

  it("selection mutators", () => {
    const prev = new Set(["a", "b"]);
    const pruned = pruneSelectionToAllowed(prev, new Set(["a"]));
    expect([...pruned]).toEqual(["a"]);
    expect(pruneSelectionToAllowed(prev, new Set(["a", "b"]))).toBe(prev);
    expect([...toggleSelectionId(new Set(["a"]), "b")].sort()).toEqual(["a", "b"]);
    expect([...selectionFromDocs([{ id: "x" }, { id: "y" }])]).toEqual(["x", "y"]);
    expect(removeIdFromSelection(new Set(["a"]), "z")).toEqual(new Set(["a"]));
    expect([...removeIdFromSelection(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });
});
