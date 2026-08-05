import { describe, expect, it } from "vitest";
import { filterUnattemptedWbsBackfill } from "../wbs";

describe("filterUnattemptedWbsBackfill", () => {
  it("drops attempted ids", () => {
    const todo = filterUnattemptedWbsBackfill(
      [
        { id: "a", wbs: "1.1" },
        { id: "b", wbs: "1.2" },
      ],
      new Set(["a"]),
    );
    expect(todo.map((r) => r.id)).toEqual(["b"]);
  });
});
