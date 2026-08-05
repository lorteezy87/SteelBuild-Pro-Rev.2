import { describe, expect, it } from "vitest";
import { asIdArray, filterTasksLinkedToTarget } from "../relatedScheduleTasksHelpers";

describe("asIdArray", () => {
  it("coerces arrays and JSON strings", () => {
    expect(asIdArray(["a", "b"])).toEqual(["a", "b"]);
    expect(asIdArray('["x"]')).toEqual(["x"]);
    expect(asIdArray(null)).toEqual([]);
  });
});

describe("filterTasksLinkedToTarget", () => {
  it("finds tasks pointing at target", () => {
    const tasks = [
      { id: "1", related_rfi_ids: ["r1"] },
      { id: "2", related_rfi_ids: '["r2"]' },
      { id: "3", related_rfi_ids: [] },
    ];
    expect(filterTasksLinkedToTarget(tasks as any, "related_rfi_ids", "r1").map((t) => t.id)).toEqual(["1"]);
    expect(filterTasksLinkedToTarget(tasks as any, "related_rfi_ids", null)).toEqual([]);
  });
});
