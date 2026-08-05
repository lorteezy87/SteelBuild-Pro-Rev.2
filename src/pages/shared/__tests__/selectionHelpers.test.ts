import { describe, expect, it } from "vitest";
import {
  toggleSelectionId,
  selectAllOrNone,
  pruneSelectionToAllowed,
  selectionFromIds,
  removeIdFromSelection,
  toggleIdInList,
  applySelectionChecked,
  toggleSelectAllVisible,
} from "../selectionHelpers";

describe("selectionHelpers", () => {
  it("toggles set membership", () => {
    const a = toggleSelectionId(new Set(["a"]), "b");
    expect([...a].sort()).toEqual(["a", "b"]);
    expect([...toggleSelectionId(a, "a")]).toEqual(["b"]);
  });

  it("select all / none and prune", () => {
    expect([...selectAllOrNone(true, ["x", "y"])].sort()).toEqual(["x", "y"]);
    expect([...selectAllOrNone(false, ["x"])]).toEqual([]);
    const pruned = pruneSelectionToAllowed(new Set(["a", "b"]), new Set(["b"]));
    expect([...pruned]).toEqual(["b"]);
  });

  it("selectionFromIds / remove / list toggle", () => {
    expect([...selectionFromIds([{ id: "1" }, { id: null }, {}])]).toEqual(["1"]);
    expect([...removeIdFromSelection(new Set(["a", "b"]), "a")]).toEqual(["b"]);
    expect(removeIdFromSelection(new Set(["a"]), "z")).toEqual(new Set(["a"]));
    expect(toggleIdInList(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIdInList(["a"], "a")).toEqual([]);
  });
});


describe("applySelectionChecked", () => {
  it("adds and removes", () => {
    const a = applySelectionChecked(new Set(["x"]), "y", true);
    expect([...a].sort()).toEqual(["x", "y"]);
    const b = applySelectionChecked(a, "x", false);
    expect([...b]).toEqual(["y"]);
  });
});


describe("toggleSelectAllVisible", () => {
  it("clears when all visible selected; else adds visible", () => {
    expect(toggleSelectAllVisible(new Set(["a", "b"]), ["a", "b"]).size).toBe(0);
    expect([...toggleSelectAllVisible(new Set(["z"]), ["a", "b"])].sort()).toEqual([
      "a",
      "b",
      "z",
    ]);
  });
});
