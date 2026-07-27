import { describe, expect, it } from "vitest";
import {
  applyOptimisticBulkPatch,
  applyOptimisticRowPatch,
  shouldRollbackOptimistic,
} from "../optimisticCache";

type Row = { id: string; stage?: string; title?: string };

describe("applyOptimisticRowPatch", () => {
  it("patches the matching row and leaves others intact", () => {
    const list: Row[] = [
      { id: "a", stage: "Draft" },
      { id: "b", stage: "Issued" },
    ];
    expect(applyOptimisticRowPatch(list, "b", { stage: "Approved" })).toEqual([
      { id: "a", stage: "Draft" },
      { id: "b", stage: "Approved" },
    ]);
  });

  it("returns empty array when cache is undefined", () => {
    expect(applyOptimisticRowPatch(undefined, "a", { stage: "X" })).toEqual([]);
  });
});

describe("applyOptimisticBulkPatch", () => {
  it("patches every id in the set", () => {
    const list: Row[] = [
      { id: "a", stage: "Draft" },
      { id: "b", stage: "Draft" },
      { id: "c", stage: "Draft" },
    ];
    expect(applyOptimisticBulkPatch(list, ["a", "c"], { stage: "Shop" })).toEqual([
      { id: "a", stage: "Shop" },
      { id: "b", stage: "Draft" },
      { id: "c", stage: "Shop" },
    ]);
  });
});

describe("shouldRollbackOptimistic", () => {
  it("rolls back when a previous snapshot exists", () => {
    expect(shouldRollbackOptimistic([{ id: "a" }])).toBe(true);
  });

  it("skips rollback when previous is missing", () => {
    expect(shouldRollbackOptimistic(undefined)).toBe(false);
    expect(shouldRollbackOptimistic(null)).toBe(false);
  });
});

describe("optimistic rollback contract (drawings / submittals)", () => {
  it("restores the pre-mutation list after a failed single update", () => {
    const previous: Row[] = [
      { id: "d1", title: "S-101", stage: "Draft" },
      { id: "d2", title: "S-102", stage: "Issued" },
    ];
    const optimistic = applyOptimisticRowPatch(previous, "d1", { stage: "Approved" });
    expect(optimistic[0].stage).toBe("Approved");

    // onError path: restore previous when present
    const restored = shouldRollbackOptimistic(previous) ? previous : optimistic;
    expect(restored).toBe(previous);
    expect(restored[0].stage).toBe("Draft");
  });

  it("restores after a failed bulk stage update", () => {
    const previous: Row[] = [
      { id: "d1", stage: "Draft" },
      { id: "d2", stage: "Draft" },
    ];
    const optimistic = applyOptimisticBulkPatch(previous, ["d1", "d2"], { stage: "Shop" });
    expect(optimistic.every((r) => r.stage === "Shop")).toBe(true);

    const restored = shouldRollbackOptimistic(previous) ? previous : optimistic;
    expect(restored.every((r) => r.stage === "Draft")).toBe(true);
  });
});
