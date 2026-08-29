import { describe, expect, it } from "vitest";
import { findLoadSequenceClashes } from "../loadSequence";

describe("findLoadSequenceClashes", () => {
  it("flags ship finish after erect start in the same area", () => {
    const clashes = findLoadSequenceClashes([
      { id: "s", task_name: "Ship L1", phase: "Delivery", area: "Grid A", end_date: "2026-07-10" },
      { id: "e", task_name: "Erect L1", phase: "Erection", area: "Grid A", start_date: "2026-07-05" },
    ]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].shipTaskId).toBe("s");
  });

  it("does not flag when areas differ", () => {
    const clashes = findLoadSequenceClashes([
      { id: "s", task_name: "Ship L1", phase: "Delivery", area: "Grid A", end_date: "2026-07-10" },
      { id: "e", task_name: "Erect L2", phase: "Erection", area: "Grid B", start_date: "2026-07-05" },
    ]);
    expect(clashes).toHaveLength(0);
  });

  it("does not flag when ship finishes before erect", () => {
    const clashes = findLoadSequenceClashes([
      { id: "s", task_name: "Ship L1", phase: "Delivery", area: "Grid A", end_date: "2026-07-01" },
      { id: "e", task_name: "Erect L1", phase: "Erection", area: "Grid A", start_date: "2026-07-05" },
    ]);
    expect(clashes).toHaveLength(0);
  });
});
