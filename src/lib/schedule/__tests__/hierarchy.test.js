import { describe, it, expect } from "vitest";
import {
  wouldCreateCycle,
  validReparentTargets,
  computeSiblingSortOrder,
} from "../hierarchy";

// a → b → c (c child of b, b child of a)
const tasks = [
  { id: "a", parent_task_id: null, sort_order: 1000 },
  { id: "b", parent_task_id: "a", sort_order: 1000 },
  { id: "c", parent_task_id: "b", sort_order: 2000 },
  { id: "d", parent_task_id: "a", sort_order: 3000 },
];

describe("wouldCreateCycle", () => {
  it("rejects self-parent", () => {
    expect(wouldCreateCycle(tasks, "a", "a")).toBe(true);
  });
  it("rejects making a node a child of its own descendant", () => {
    expect(wouldCreateCycle(tasks, "a", "c")).toBe(true);
  });
  it("allows a legal reparent", () => {
    expect(wouldCreateCycle(tasks, "d", "c")).toBe(false);
  });
  it("allows reparent to root (null)", () => {
    expect(wouldCreateCycle(tasks, "c", null)).toBe(false);
  });
  it("does not infinite-loop on pre-existing corrupt cycle data", () => {
    const corrupt = [
      { id: "x", parent_task_id: "y" },
      { id: "y", parent_task_id: "x" },
    ];
    expect(wouldCreateCycle(corrupt, "z", "x")).toBe(false);
  });
});

describe("validReparentTargets", () => {
  it("excludes self and all descendants", () => {
    const targets = validReparentTargets(tasks, "a");
    expect(targets.has("a")).toBe(false);
    expect(targets.has("b")).toBe(false);
    expect(targets.has("c")).toBe(false);
    expect(targets.has("d")).toBe(false);
  });
  it("includes legal parents", () => {
    const targets = validReparentTargets(tasks, "d");
    expect(targets.has("b")).toBe(true);
    expect(targets.has("c")).toBe(true);
    expect(targets.has("d")).toBe(false);
  });
});

describe("computeSiblingSortOrder", () => {
  it("appends after last sibling on a nest drop (dropIndex null)", () => {
    expect(computeSiblingSortOrder(tasks, "a", null)).toBe(4000);
  });
  it("returns 1000 when the new parent has no children", () => {
    expect(computeSiblingSortOrder(tasks, "c", null)).toBe(1000);
  });
  it("returns a midpoint between neighbors on a gap drop", () => {
    const roots = [
      { id: "a", parent_task_id: null, sort_order: 1000 },
      { id: "e", parent_task_id: null, sort_order: 3000 },
    ];
    expect(computeSiblingSortOrder(roots, null, 1)).toBe(2000);
  });
  it("prepends before the first sibling on a dropIndex 0 drop", () => {
    // children of "a" are b=1000, d=3000; prepend before sort_order 1000
    // yields 0 — a known, acceptable behavior of the integer-midpoint scheme.
    expect(computeSiblingSortOrder(tasks, "a", 0)).toBe(0);
  });
});
